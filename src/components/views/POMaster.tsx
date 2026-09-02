import { ListTodo, Search, ChevronDown, ChevronRight, History, Building2, PackageCheck, LogOut, ExternalLink, Image as ImageIcon, CheckCircle2, IndianRupee } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { formatDate, debounce, formatFirmName } from '@/lib/utils';
import { fetchFromSupabasePaginated, fetchVendors, fetchFirms, uploadFile, updatePOMasterPdf, fetchPartyCompletedHistory, type PartyCompletedHistory } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useSheets } from '@/context/SheetsContext';
import { useAuth } from '@/context/AuthContext';
import { pdf } from '@react-pdf/renderer';
import POPdf, { type POPdfProps } from '../element/POPdf';
import { toast } from 'sonner';
import { ClipLoader as Loader } from 'react-spinners';

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
    destinationAddress: string;
    terms: string[];
    pdf: string;
    make: string;
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
    const { user } = useAuth();
    const isAdmin = (user as any)?.role === 'ADMIN';
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
    const [regenerating, setRegenerating] = useState(false);
    const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);
    const [selectedPartyForHistory, setSelectedPartyForHistory] = useState<string | null>(null);
    const [partyHistoryData, setPartyHistoryData] = useState<PartyCompletedHistory | null>(null);
    const [partyHistoryLoading, setPartyHistoryLoading] = useState(false);
    const [partyHistoryTab, setPartyHistoryTab] = useState<'received' | 'store-out'>('received');
    const [partyHistorySearch, setPartyHistorySearch] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const handleOpenPartyHistory = async (partyName: string) => {
        if (!partyName) return;
        setSelectedPartyForHistory(partyName);
        setPartyHistoryLoading(true);
        setPartyHistoryTab('received');
        setPartyHistorySearch('');
        try {
            const data = await fetchPartyCompletedHistory(partyName);
            setPartyHistoryData(data);
        } catch (err) {
            console.error('Error fetching party history:', err);
            toast.error('Failed to load party completed history');
        } finally {
            setPartyHistoryLoading(false);
        }
    };

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
                    destinationAddress: sheet.destinationAddress || '',
                    terms: [
                        sheet.term1, sheet.term2, sheet.term3, sheet.term4, sheet.term5,
                        sheet.term6, sheet.term7, sheet.term8, sheet.term9, sheet.term10,
                    ].filter(Boolean),
                    pdf: sheet.pdf || '',
                    make: sheet.make || '',
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

    async function buildPOPdfProps(poNumber: string, items: POMasterItem[]): Promise<POPdfProps> {
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

        return {
            companyLogo: logoBase64,
            companyName,
            companyPhone: firmObj?.mobile || details?.companyPhone || '',
            companyGstin: firmObj?.firm_gstin || details?.companyGstin || '',
            companyPan: firmObj?.pan_number || details?.companyPan || '',
            companyAddress: firmAddress,
            billingAddress: firmAddress || details?.billingAddress || '',
            // The user-edited destination address is saved per-PO (POMaster.destinationAddress).
            // Fall back to the firm's own address for POs created before this field existed.
            destinationAddress: first.destinationAddress || [companyName, firmAddress].filter(Boolean).join('\n'),
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
                make: it.make,
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
    }

    async function handleViewPdf(poNumber: string, items: POMasterItem[], storedPdf?: string) {
        // If a stored PDF exists (generated at approval time), open it directly.
        if (storedPdf) {
            window.open(storedPdf, '_blank', 'noopener,noreferrer');
            return;
        }
        // Otherwise generate on demand from live data (pending POs, or old POs before this change).
        setGeneratingPdf(poNumber);
        try {
            const props = await buildPOPdfProps(poNumber, items);
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

    async function handleRegenerateAllPdfs() {
        if (!window.confirm(
            'Regenerate PDFs for every PO that already has a stored PDF?\n\n' +
            'This re-renders each one with the current template (including the Discount column) ' +
            'and replaces the stored PDF link. Old PDF files are left in place, only unused.'
        )) return;

        setRegenerating(true);
        setRegenProgress(null);
        try {
            const raw: any = await fetchFromSupabasePaginated(
                'po_master', '*', undefined, undefined, undefined, { limit: 5000 }
            );
            const rows: POMasterItem[] = (Array.isArray(raw) ? raw : []).map((sheet: any) => ({
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
                destinationAddress: sheet.destinationAddress || '',
                terms: [
                    sheet.term1, sheet.term2, sheet.term3, sheet.term4, sheet.term5,
                    sheet.term6, sheet.term7, sheet.term8, sheet.term9, sheet.term10,
                ].filter(Boolean),
                pdf: sheet.pdf || '',
                make: sheet.make || '',
            }));

            const groups = new Map<string, POMasterItem[]>();
            rows.forEach(item => {
                if (!item.poNumber) return;
                if (!groups.has(item.poNumber)) groups.set(item.poNumber, []);
                groups.get(item.poNumber)!.push(item);
            });

            const targets = Array.from(groups.entries()).filter(([, items]) => items[0]?.pdf);
            if (!targets.length) {
                toast.info('No stored PDFs found to regenerate.');
                return;
            }

            setRegenProgress({ done: 0, total: targets.length });
            const failed: string[] = [];

            for (const [poNumber, items] of targets) {
                try {
                    const props = await buildPOPdfProps(poNumber, items);
                    const blob = await pdf(<POPdf {...props} />).toBlob();
                    const file = new File([blob], `PO-${poNumber}.pdf`, { type: 'application/pdf' });
                    const url = await uploadFile(file, import.meta.env.VITE_PURCHASE_ORDERS_FOLDER || '');
                    const result = await updatePOMasterPdf(poNumber, url);
                    if (!result.success) throw new Error(result.error || 'update failed');
                } catch (err) {
                    console.error(`Failed to regenerate PDF for ${poNumber}:`, err);
                    failed.push(poNumber);
                }
                setRegenProgress(prev => prev ? { ...prev, done: prev.done + 1 } : prev);
            }

            if (failed.length) {
                toast.warning(`Regenerated ${targets.length - failed.length}/${targets.length} PDFs. Failed: ${failed.join(', ')}`);
            } else {
                toast.success(`Regenerated ${targets.length} PDF${targets.length > 1 ? 's' : ''}.`);
            }
            fetchData(page, search);
        } catch (err: any) {
            console.error('Error regenerating PDFs:', err);
            toast.error('Failed to regenerate PDFs');
        } finally {
            setRegenerating(false);
            setRegenProgress(null);
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

    const filteredReceived = useMemo(() => {
        if (!partyHistoryData?.receivedItems) return [];
        const q = partyHistorySearch.toLowerCase().trim();
        if (!q) return partyHistoryData.receivedItems;
        return partyHistoryData.receivedItems.filter(item =>
            item.product?.toLowerCase().includes(q) ||
            item.poNumber?.toLowerCase().includes(q) ||
            item.grnNumber?.toLowerCase().includes(q) ||
            item.billNumber?.toLowerCase().includes(q) ||
            item.indentNumber?.toLowerCase().includes(q) ||
            item.firm?.toLowerCase().includes(q)
        );
    }, [partyHistoryData, partyHistorySearch]);

    const filteredStoreOut = useMemo(() => {
        if (!partyHistoryData?.storeOutItems) return [];
        const q = partyHistorySearch.toLowerCase().trim();
        if (!q) return partyHistoryData.storeOutItems;
        return partyHistoryData.storeOutItems.filter(item =>
            item.product?.toLowerCase().includes(q) ||
            item.indentNumber?.toLowerCase().includes(q) ||
            item.areaOfUse?.toLowerCase().includes(q) ||
            item.department?.toLowerCase().includes(q) ||
            item.indenterName?.toLowerCase().includes(q) ||
            item.firm?.toLowerCase().includes(q)
        );
    }, [partyHistoryData, partyHistorySearch]);

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

            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search POs, vendors, products..."
                            className="pl-8 text-xs sm:text-sm h-9"
                            defaultValue={search}
                            onChange={(e) => debouncedSearch(e.target.value)}
                        />
                    </div>
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={regenerating}
                            onClick={handleRegenerateAllPdfs}
                            className="text-xs flex items-center gap-2"
                        >
                            {regenerating ? (
                                <>
                                    <Loader color="currentColor" size={14} />
                                    <span>
                                        {regenProgress
                                            ? `Regenerating (${regenProgress.done}/${regenProgress.total})...`
                                            : 'Regenerating PDFs...'}
                                    </span>
                                </>
                            ) : (
                                'Regenerate Stored PDFs'
                            )}
                        </Button>
                    )}
                </div>

                {initialLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <Loader color="#2563eb" size={36} />
                        <span className="text-xs text-muted-foreground">Loading purchase orders...</span>
                    </div>
                ) : isSearching ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <Loader color="#2563eb" size={30} />
                        <span className="text-xs text-muted-foreground">Searching...</span>
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 border rounded-md text-muted-foreground gap-2">
                        <ListTodo className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm font-medium">No purchase orders found</p>
                    </div>
                ) : (
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Party Name</TableHead>
                                    <TableHead>PO Date</TableHead>
                                    <TableHead>Prepared By</TableHead>
                                    <TableHead>Approved By</TableHead>
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
                                                <TableCell className="font-medium text-xs sm:text-sm">
                                                    <button
                                                        type="button"
                                                        className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                                                        disabled={generatingPdf === group.poNumber}
                                                        onClick={(e) => { e.stopPropagation(); handleViewPdf(group.poNumber, group.items, group.pdf); }}
                                                    >
                                                        {group.poNumber}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors group inline-flex items-center gap-1.5 cursor-pointer py-1 px-1.5 -mx-1.5 rounded hover:bg-muted/70"
                                                        onClick={() => handleOpenPartyHistory(group.partyName)}
                                                        title="Click to view all completed Received & Store Out items for this party"
                                                    >
                                                        <span>{group.partyName}</span>
                                                        <History className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                                    </button>
                                                </TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.timestamp}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.preparedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.approvedBy}</TableCell>
                                            </TableRow>
                                            {isExpanded && group.versions.length > 1 && group.versions.map((ver) => (
                                                <TableRow key={`rev-${ver.poNumber}`} className="bg-primary/5">
                                                    <TableCell />
                                                    <TableCell className="text-xs font-medium">
                                                        <button
                                                            type="button"
                                                            className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                                                            disabled={generatingPdf === ver.poNumber}
                                                            onClick={(e) => { e.stopPropagation(); handleViewPdf(ver.poNumber, ver.items, ver.items[0]?.pdf); }}
                                                        >
                                                            {ver.poNumber}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell colSpan={4} className="text-xs text-muted-foreground">
                                                        {ver.revision === group.versions[0].revision ? 'Latest' : ver.revision === 0 ? 'Original' : `Revision ${ver.revision}`}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {isExpanded && group.items.map((item, idx) => (
                                                <TableRow key={`${group.poNumber}-${idx}`} className="bg-muted/20">
                                                    <TableCell className="text-xs text-muted-foreground pl-6">{item.internalCode || '-'}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {item.product}
                                                        {item.make ? <span className="ml-1 text-muted-foreground">(Make: {item.make})</span> : null}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{item.description || '-'}</TableCell>
                                                    <TableCell className="text-xs">{item.quantity} {item.unit}</TableCell>
                                                    <TableCell className="text-xs">&#8377;{item.rate.toLocaleString()}</TableCell>
                                                    <TableCell className="text-xs">{item.gstPercent}%</TableCell>
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

            {/* ── Party Completed History Dialog (Received & Store Out) ── */}
            <Dialog open={!!selectedPartyForHistory} onOpenChange={(open) => { if (!open) { setSelectedPartyForHistory(null); setPartyHistoryData(null); } }}>
                <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="shrink-0 pb-2 border-b">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-primary" />
                                    <span>Party Completed History</span>
                                </DialogTitle>
                                <DialogDescription className="text-xs mt-1">
                                    All completed items (Received & Store Out) for <strong className="text-foreground">{selectedPartyForHistory}</strong>
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Top KPI Cards */}
                        {partyHistoryData && !partyHistoryLoading && (
                            <div className="grid grid-cols-4 gap-2 mt-3">
                                <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-2 flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-md text-blue-600 dark:text-blue-400 shrink-0">
                                        <Building2 className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] uppercase font-semibold text-muted-foreground leading-tight">Total POs</p>
                                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{partyHistoryData.totalPOs}</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/20 p-2 flex items-center gap-2">
                                    <div className="p-1.5 bg-green-100 dark:bg-green-900/40 rounded-md text-green-600 dark:text-green-400 shrink-0">
                                        <PackageCheck className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] uppercase font-semibold text-muted-foreground leading-tight">Received Done</p>
                                        <p className="text-sm font-bold text-green-700 dark:text-green-300">{partyHistoryData.totalReceived}</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 p-2 flex items-center gap-2">
                                    <div className="p-1.5 bg-purple-100 dark:bg-purple-900/40 rounded-md text-purple-600 dark:text-purple-400 shrink-0">
                                        <LogOut className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] uppercase font-semibold text-muted-foreground leading-tight">Store Out Done</p>
                                        <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{partyHistoryData.totalStoreOut}</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-2 flex items-center gap-2">
                                    <div className="p-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-md text-amber-600 dark:text-amber-400 shrink-0">
                                        <IndianRupee className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] uppercase font-semibold text-muted-foreground leading-tight">Total Amount</p>
                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300 truncate">
                                            ₹{partyHistoryData.receivedItems
                                                .reduce((sum, item) => sum + (Number(item.billAmount) || 0), 0)
                                                .toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </DialogHeader>

                    {partyHistoryLoading ? (
                        <div className="flex flex-col items-center justify-center h-72 gap-3">
                            <Loader color="#2563eb" size={36} />
                            <span className="text-xs text-muted-foreground">Loading party completed history...</span>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 pt-3">
                            {/* Tabs & Search */}
                            <Tabs value={partyHistoryTab} onValueChange={(v) => setPartyHistoryTab(v as 'received' | 'store-out')} className="flex-1 flex flex-col min-h-0">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 pb-3 border-b">
                                    <TabsList className="grid w-full sm:w-auto grid-cols-2">
                                        <TabsTrigger value="received" className="text-xs px-4 flex items-center gap-1.5">
                                            <PackageCheck className="h-3.5 w-3.5" />
                                            <span>Received Items</span>
                                            <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-semibold">
                                                {partyHistoryData?.receivedItems.length || 0}
                                            </span>
                                        </TabsTrigger>
                                        <TabsTrigger value="store-out" className="text-xs px-4 flex items-center gap-1.5">
                                            <LogOut className="h-3.5 w-3.5" />
                                            <span>Store Out Items</span>
                                            <span className="ml-1 rounded-full bg-purple-500/10 text-purple-600 px-1.5 py-0.2 text-[10px] font-semibold">
                                                {partyHistoryData?.storeOutItems.length || 0}
                                            </span>
                                        </TabsTrigger>
                                    </TabsList>

                                    <div className="relative flex-1 sm:max-w-xs">
                                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search items, PO, Indent, GRN..."
                                            value={partyHistorySearch}
                                            onChange={(e) => setPartyHistorySearch(e.target.value)}
                                            className="pl-8 h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Tab 1: Received Items */}
                                <TabsContent value="received" className="flex-1 overflow-auto mt-2 outline-none">
                                    {filteredReceived.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs gap-2 border rounded-md my-2">
                                            <PackageCheck className="h-7 w-7 text-muted-foreground/40" />
                                            <p>{partyHistorySearch ? 'No received items match your filter.' : 'No completed received items found for this party.'}</p>
                                        </div>
                                    ) : (
                                        <div className="border rounded-md overflow-x-auto w-full">
                                            <Table className="min-w-[1100px] w-full text-left">
                                                <TableHeader>
                                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                                        <TableHead className="text-xs w-10 text-center">#</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[160px]">PO Number</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[260px]">Product</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[110px]">Indent #</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[160px]">Firm</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[120px]">Received Qty</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[140px]">GRN #</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[160px]">Bill No & Amount</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[110px]">Received Date</TableHead>
                                                        <TableHead className="text-xs text-center min-w-[130px]">Photos</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredReceived.map((item, idx) => (
                                                        <TableRow key={`rcv-${item.id}-${idx}`} className="hover:bg-muted/40">
                                                            <TableCell className="text-xs text-muted-foreground text-center">{idx + 1}</TableCell>
                                                            <TableCell className="text-xs font-semibold text-primary text-left whitespace-nowrap">{item.poNumber || '—'}</TableCell>
                                                            <TableCell className="text-xs font-medium text-left max-w-[280px] whitespace-normal break-words">
                                                                <div className="font-semibold text-foreground">{item.product}</div>
                                                                {item.department && item.department !== 'N/A' && (
                                                                    <div className="text-[10px] text-muted-foreground mt-0.5">{item.department}</div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left whitespace-nowrap">{item.indentNumber || '—'}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left max-w-[180px] whitespace-normal break-words" title={item.firm}>{formatFirmName(item.firm)}</TableCell>
                                                            <TableCell className="text-xs text-left whitespace-nowrap">
                                                                <span className="font-bold text-green-600 dark:text-green-400">
                                                                    {item.receivedQuantity} {item.uom}
                                                                </span>
                                                                {item.damagedQuantity ? (
                                                                    <div className="text-[10px] text-red-500 font-medium">Damaged: {item.damagedQuantity}</div>
                                                                ) : null}
                                                            </TableCell>
                                                            <TableCell className="text-xs font-mono font-medium text-left whitespace-nowrap">{item.grnNumber || '—'}</TableCell>
                                                            <TableCell className="text-xs text-left whitespace-nowrap">
                                                                {item.billNumber ? (
                                                                    <div>
                                                                        <span className="font-medium">{item.billNumber}</span>
                                                                        {item.billAmount !== null && item.billAmount !== undefined && (
                                                                            <span className="text-muted-foreground ml-1">(₹{Number(item.billAmount).toLocaleString()})</span>
                                                                        )}
                                                                    </div>
                                                                ) : '—'}
                                                            </TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground text-left">
                                                                {item.createdAt ? formatDate(new Date(item.createdAt)) : '—'}
                                                            </TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap text-center">
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    {item.photoOfProduct && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPreviewImage(item.photoOfProduct || null)}
                                                                            className="text-xs text-blue-600 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800"
                                                                            title="View Product Photo"
                                                                        >
                                                                            <ImageIcon className="h-3 w-3" /> Product
                                                                        </button>
                                                                    )}
                                                                    {item.photoOfBill && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPreviewImage(item.photoOfBill || null)}
                                                                            className="text-xs text-emerald-600 hover:underline flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                                                                            title="View Bill Photo"
                                                                        >
                                                                            <ImageIcon className="h-3 w-3" /> Bill
                                                                        </button>
                                                                    )}
                                                                    {!item.photoOfProduct && !item.photoOfBill && '—'}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </TabsContent>

                                {/* Tab 2: Store Out Items */}
                                <TabsContent value="store-out" className="flex-1 overflow-auto mt-2 outline-none">
                                    {filteredStoreOut.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs gap-2 border rounded-md my-2">
                                            <LogOut className="h-7 w-7 text-muted-foreground/40" />
                                            <p>{partyHistorySearch ? 'No store out items match your filter.' : 'No completed store out items found for this party.'}</p>
                                        </div>
                                    ) : (
                                        <div className="border rounded-md overflow-x-auto w-full">
                                            <Table className="min-w-[1100px] w-full text-left">
                                                <TableHeader>
                                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                                        <TableHead className="text-xs w-10 text-center">#</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[110px]">Indent #</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[260px]">Product</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[120px]">Issued Qty</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[140px]">Area of Use</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[130px]">Department</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[120px]">Indenter</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[120px]">Approved By</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[160px]">Firm</TableHead>
                                                        <TableHead className="text-xs text-left min-w-[110px]">Issue Date</TableHead>
                                                        <TableHead className="text-xs text-center min-w-[100px]">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredStoreOut.map((item, idx) => (
                                                        <TableRow key={`so-${item.id}-${idx}`} className="hover:bg-muted/40">
                                                            <TableCell className="text-xs text-muted-foreground text-center">{idx + 1}</TableCell>
                                                            <TableCell className="text-xs font-semibold text-primary text-left whitespace-nowrap">{item.indentNumber || '—'}</TableCell>
                                                            <TableCell className="text-xs font-medium text-left max-w-[280px] whitespace-normal break-words">
                                                                <span className="font-semibold text-foreground">{item.product}</span>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-left whitespace-nowrap">
                                                                <span className="font-bold text-purple-600 dark:text-purple-400">
                                                                    {item.issuedQuantity} {item.uom}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left max-w-[160px] whitespace-normal break-words">{item.areaOfUse || '—'}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left whitespace-nowrap">{item.department || '—'}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left whitespace-nowrap">{item.indenterName || '—'}</TableCell>
                                                            <TableCell className="text-xs font-medium text-left whitespace-nowrap">{item.issueApprovedBy || '—'}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground text-left max-w-[180px] whitespace-normal break-words" title={item.firm}>{formatFirmName(item.firm)}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground text-left">
                                                                {item.createdAt ? formatDate(new Date(item.createdAt)) : '—'}
                                                            </TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap text-center">
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    {item.issueStatus || 'Done'}
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Photo Preview Dialog ── */}
            <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
                <DialogContent className="max-w-xl p-3 flex flex-col items-center">
                    <DialogHeader className="w-full pb-2">
                        <DialogTitle className="text-sm">Attachment Photo Preview</DialogTitle>
                    </DialogHeader>
                    {previewImage && (
                        <div className="max-h-[75vh] overflow-auto rounded-md border flex items-center justify-center p-1 bg-black/5">
                            <img src={previewImage} alt="Attachment" className="max-h-[70vh] object-contain rounded" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};
