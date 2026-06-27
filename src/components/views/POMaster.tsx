import { ListTodo, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { formatDate, debounce } from '@/lib/utils';
import { fetchFromSupabasePaginated, fetchVendors, fetchFirms } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useSheets } from '@/context/SheetsContext';
import { pdf } from '@react-pdf/renderer';
import POPdf, { type POPdfProps } from '../element/POPdf';
import { toast } from 'sonner';

interface POMasterItem {
    id: number;
    timestamp: string;
    partyName: string;
    poNumber: string;
    quotationNumber: string;
    quotationDate: string;
    enquiryNumber: string;
    enquiryDate: string;
    internalCode: string;
    product: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    gstPercent: number;
    discountPercent: number;
    amount: number;
    totalPoAmount: number;
    preparedBy: string;
    approvedBy: string;
    firm: string;
    transportationType: string;
    terms: string[];
    pdf: string;
}

const parseGSTPercent = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const stringValue = String(value).trim();
    if (stringValue.includes('%')) return parseFloat(stringValue.replace('%', '').trim()) || 0;
    const numericValue = parseFloat(stringValue);
    if (isNaN(numericValue)) return 0;
    if (numericValue > 0 && numericValue < 1) return numericValue * 100;
    return numericValue;
};

const formatFirmAddress = (firm: any, fallback = '') => {
    if (!firm) return fallback;
    const lines = [
        firm.firm_address || '',
        [firm.state, firm.pin_code].filter(Boolean).join(' '),
    ].filter(Boolean);
    return lines.join('\n') || fallback;
};

export default () => {
    const { masterSheet: details } = useSheets();
    const [tableData, setTableData] = useState<POMasterItem[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [vendors, setVendors] = useState<any[]>([]);
    const [firms, setFirms] = useState<any[]>([]);
    const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setIsSearching(true);

        try {
            const data: any = await fetchFromSupabasePaginated(
                'po_master', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((sheet: any) => ({
                    id: sheet.id,
                    timestamp: sheet.createdAt ? formatDate(new Date(sheet.createdAt)) : '',
                    partyName: sheet.partyName || '',
                    poNumber: sheet.poNumber || '',
                    quotationNumber: sheet.quotationNumber || '',
                    quotationDate: sheet.quotationDate ? formatDate(new Date(sheet.quotationDate)) : '',
                    enquiryNumber: sheet.enquiryNumber || '',
                    enquiryDate: sheet.enquiryDate ? formatDate(new Date(sheet.enquiryDate)) : '',
                    internalCode: sheet.internalCode || '',
                    product: sheet.product || '',
                    description: sheet.description || '',
                    quantity: sheet.quantity || 0,
                    unit: sheet.unit || '',
                    rate: Number(sheet.rate) || 0,
                    gstPercent: parseGSTPercent(sheet.gstPercent),
                    discountPercent: sheet.discountPercent || 0,
                    amount: Number(sheet.amount) || 0,
                    totalPoAmount: Number(sheet.totalPOAmount || sheet.totalPoAmount) || 0,
                    preparedBy: sheet.preparedBy || '',
                    approvedBy: sheet.approvedBy || '',
                    firm: sheet.firm || sheet.indent?.firm || 'N/A',
                    transportationType: sheet.transportationType || '',
                    terms: [
                        sheet.term1, sheet.term2, sheet.term3, sheet.term4, sheet.term5,
                        sheet.term6, sheet.term7, sheet.term8, sheet.term9, sheet.term10,
                    ].filter(Boolean),
                    pdf: sheet.pdf || '',
                }));
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching PO Master:', error);
        } finally {
            if (!controller.signal.aborted) {
                setInitialLoading(false);
                setIsSearching(false);
            }
        }
    }, [tableData.length]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchData(1, '');
        return () => abortRef.current?.abort();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchVendors().then((v) => setVendors(Array.isArray(v) ? v : [])).catch(() => {});
        fetchFirms().then((f) => setFirms(Array.isArray(f) ? f : [])).catch(() => {});
    }, []);

    async function handleViewPdf(poNumber: string, items: POMasterItem[], storedPdf?: string) {
        // If a stored PDF exists (generated at approval time), open it directly.
        if (storedPdf) {
            window.open(storedPdf, '_blank', 'noopener,noreferrer');
            return;
        }
        // Otherwise generate on demand from live data (pending POs, or old POs before this change).
        setGeneratingPdf(poNumber);
        try {
            const first = items[0];
            const firmObj = firms.find((f: any) => f.firm_name === first.firm);
            const vendor = vendors.find((v: any) =>
                (v.vendorName || '').trim().toLowerCase() === (first.partyName || '').trim().toLowerCase()
            );

            const firmAddress = formatFirmAddress(firmObj, details?.companyAddress || '');
            const companyName = firmObj?.firm_name || details?.companyName || '';

            let logoBase64 = '';
            try {
                const logoBlob = await fetch('/logo.png').then(r => r.blob());
                logoBase64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(logoBlob);
                });
            } catch { /* logo is optional */ }

            const props: POPdfProps = {
                companyLogo: logoBase64,
                companyName,
                companyPhone: firmObj?.mobile || details?.companyPhone || '',
                companyGstin: firmObj?.firm_gstin || details?.companyGstin || '',
                companyPan: firmObj?.pan_number || details?.companyPan || '',
                companyAddress: firmAddress,
                billingAddress: firmAddress || details?.billingAddress || '',
                destinationAddress: details?.destinationAddress
                    ? [companyName, firmAddress, details.destinationAddress].filter(Boolean).join('\n')
                    : [companyName, firmAddress].filter(Boolean).join('\n'),
                supplierName: first.partyName,
                supplierAddress: vendor?.address || '',
                supplierGstin: vendor?.gstin || '',
                orderNumber: poNumber,
                orderDate: first.timestamp,
                quotationNumber: first.quotationNumber,
                quotationDate: first.quotationDate,
                enqNo: first.enquiryNumber,
                enqDate: first.enquiryDate,
                description: first.description,
                items: items.map(it => ({
                    internalCode: it.internalCode,
                    firm: it.firm,
                    product: it.product,
                    description: it.description,
                    quantity: it.quantity,
                    unit: it.unit,
                    rate: it.rate,
                    gst: it.gstPercent,
                    discount: it.discountPercent,
                    amount: it.amount,
                })),
                total: first.totalPoAmount,
                gstAmount: 0,
                grandTotal: first.totalPoAmount,
                terms: first.terms,
                preparedBy: first.preparedBy,
                approvedBy: first.approvedBy,
                transportationType: first.transportationType,
                firm: first.firm,
            };

            const blob = await pdf(<POPdf {...props} />).toBlob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err: any) {
            console.error('Error generating PO PDF:', err);
            toast.error('Failed to generate PDF');
        } finally {
            setGeneratingPdf(null);
        }
    }

    const debouncedSearch = useCallback(
        debounce((query: string) => {
            setPage(1);
            setSearch(query);
            fetchData(1, query);
        }, 500),
        [fetchData]
    );

    const getBasePo = (poNumber: string) => {
        const parts = poNumber.split('/');
        const lastSegment = parts[parts.length - 1];
        const mainSeq = lastSegment.split('-')[0];
        return [...parts.slice(0, -1), mainSeq].join('/');
    };

    const getRevision = (poNumber: string) => {
        const parts = poNumber.split('/');
        const lastSegment = parts[parts.length - 1];
        const segments = lastSegment.split('-');
        return segments.length > 1 ? parseInt(segments[segments.length - 1], 10) : 0;
    };

    const groupedData = useMemo(() => {
        // Group rows by exact poNumber first
        const poGroups = new Map<string, POMasterItem[]>();
        tableData.forEach(item => {
            if (!poGroups.has(item.poNumber)) poGroups.set(item.poNumber, []);
            poGroups.get(item.poNumber)!.push(item);
        });

        // Group PO versions by base number (strips revision suffix like -1, -2)
        const baseGroups = new Map<string, { poNumber: string; revision: number; items: POMasterItem[] }[]>();
        for (const [poNumber, items] of poGroups.entries()) {
            const base = getBasePo(poNumber);
            if (!baseGroups.has(base)) baseGroups.set(base, []);
            baseGroups.get(base)!.push({ poNumber, revision: getRevision(poNumber), items });
        }

        return Array.from(baseGroups.entries()).map(([, versions]) => {
            versions.sort((a, b) => b.revision - a.revision);
            const latest = versions[0];
            const first = latest.items[0];
            return {
                poNumber: latest.poNumber,
                partyName: first.partyName,
                timestamp: first.timestamp,
                preparedBy: first.preparedBy,
                approvedBy: first.approvedBy,
                totalPoAmount: first.totalPoAmount,
                pdf: first.pdf,
                items: latest.items,
                versions,
            };
        });
    }, [tableData]);

    const toggleGroup = (poNumber: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(poNumber) ? next.delete(poNumber) : next.add(poNumber);
            return next;
        });
    };

    return (
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Heading heading="PO Master" subtext="View purchase orders from PO Master">
                <ListTodo size={50} className="text-primary" />
            </Heading>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search POs..."
                            className="pl-8 h-8 text-xs w-[200px]"
                            onChange={(e) => debouncedSearch(e.target.value)}
                        />
                    </div>
                </div>

                {isSearching && (
                    <div className="w-full h-0.5 bg-primary/20 rounded-full overflow-hidden">
                        <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
                    </div>
                )}

                {initialLoading ? (
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                        ))}
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                        No POs found
                    </div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead className="w-20">PDF</TableHead>
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Party Name</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Prepared By</TableHead>
                                    <TableHead>Approved By</TableHead>
                                    <TableHead>Total PO Amount</TableHead>
                                    <TableHead>Indents</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedData.map(group => {
                                    const isExpanded = expandedGroups.has(group.poNumber);
                                    return (
                                        <>
                                            <TableRow
                                                key={group.poNumber}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => toggleGroup(group.poNumber)}
                                            >
                                                <TableCell className="w-8">
                                                    {isExpanded
                                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 gap-1 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                                                        disabled={generatingPdf === group.poNumber}
                                                        onClick={() => handleViewPdf(group.poNumber, group.items, group.pdf)}
                                                    >
                                                        <FileText size={13} />
                                                        {generatingPdf === group.poNumber ? '...' : 'View'}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.poNumber}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.partyName}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.timestamp}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.preparedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.approvedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm font-medium">&#8377;{group.totalPoAmount.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                        {group.items.length} {group.items.length === 1 ? 'indent' : 'indents'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                            {isExpanded && group.versions.length > 1 && group.versions.map((ver) => (
                                                <TableRow key={`rev-${ver.poNumber}`} className="bg-primary/5">
                                                    <TableCell />
                                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 px-2 gap-1 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                                                            disabled={generatingPdf === ver.poNumber}
                                                            onClick={() => handleViewPdf(ver.poNumber, ver.items, ver.items[0]?.pdf)}
                                                        >
                                                            <FileText size={13} />
                                                            {generatingPdf === ver.poNumber ? '...' : 'View'}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-medium text-primary">{ver.poNumber}</TableCell>
                                                    <TableCell colSpan={5} className="text-xs text-muted-foreground">
                                                        {ver.revision === group.versions[0].revision ? 'Latest' : ver.revision === 0 ? 'Original' : `Revision ${ver.revision}`}
                                                    </TableCell>
                                                    <TableCell />
                                                </TableRow>
                                            ))}
                                            {isExpanded && group.items.map((item, idx) => (
                                                <TableRow key={`${group.poNumber}-${idx}`} className="bg-muted/20">
                                                    <TableCell />
                                                    <TableCell className="text-xs text-muted-foreground pl-6">{item.internalCode || '-'}</TableCell>
                                                    <TableCell className="text-xs">{item.product}</TableCell>
                                                    <TableCell className="text-xs">{item.description || '-'}</TableCell>
                                                    <TableCell className="text-xs">{item.quantity} {item.unit}</TableCell>
                                                    <TableCell className="text-xs">&#8377;{item.rate.toLocaleString()}</TableCell>
                                                    <TableCell className="text-xs">{item.gstPercent}%</TableCell>
                                                    <TableCell className="text-xs">&#8377;{item.amount.toLocaleString()}</TableCell>
                                                    <TableCell />
                                                </TableRow>
                                            ))}
                                        </>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {!initialLoading && total > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                        <span>{tableData.length} of {total} items</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                disabled={page === 1}
                                onClick={() => { const p = page - 1; setPage(p); fetchData(p, search, false); }}
                            >Previous</Button>
                            <span>Page {page}</span>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                disabled={tableData.length >= total}
                                onClick={() => { const p = page + 1; setPage(p); fetchData(p, search, false); }}
                            >Next</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
