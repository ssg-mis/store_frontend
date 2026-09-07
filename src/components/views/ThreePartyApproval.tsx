import type { ColumnDef, Row } from '@tanstack/react-table';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../ui/dialog';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postToSheet, uploadFile, fetchFromSupabasePaginated, fetchFirms } from '@/lib/fetchers';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Users, FileDown, Eye } from 'lucide-react';
import { Tabs, TabsContent } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { formatDate, debounce, formatFirmName } from '@/lib/utils';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { pdf } from '@react-pdf/renderer';
import POComparisonPdf, { type POComparisonPdfProps, type ComparisonItem, type ComparisonQuote } from '../element/POComparisonPdf';

interface RateApprovalProduct {
    id: number;
    indentId: number;
    product: string;
    quantity: number;
    uom: string;
    vendors: [string, string, string, number?][]; // [name, rate, term, deliveryTime?]
}

interface GroupedRateApprovalData {
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    products: RateApprovalProduct[];
    date: string;
    vendorTotals: Record<string, number>;
}

interface HistoryProduct {
    id: number;
    indentId: number;
    product: string;
    quantity: number;
    uom: string;
    approvedVendor: string;
    approvedRate: number;
    approvedPaymentTerm: string;
    approvedActualTime?: number;
}

interface GroupedHistoryData {
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    date: string;
    products: HistoryProduct[];
    vendorTotals: Record<string, number>;
}

const formatFirmAddress = (firm: any, fallback = '') => {
    if (!firm) return fallback;
    const lines = [
        firm.firm_address || '',
        [firm.state, firm.pin_code].filter(Boolean).join(' '),
    ].filter(Boolean);
    return lines.join('\n') || fallback;
};

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();

    const [firms, setFirms] = useState<any[]>([]);
    useEffect(() => {
        fetchFirms().then((res: any) => setFirms(Array.isArray(res) ? res : [])).catch(console.error);
    }, []);

    const [selectedIndent, setSelectedIndent] = useState<GroupedRateApprovalData | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<GroupedHistoryData | null>(null);
    const [tableData, setTableData] = useState<GroupedRateApprovalData[]>([]);
    const [historyData, setHistoryData] = useState<GroupedHistoryData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);

    // Filter states (kept for FilterBar, though search is now server-side)
    const [pendingFilters, setPendingFilters] = useState({
        indenter: 'All',
        department: 'All',
    });
    const [historyFilters, setHistoryFilters] = useState({
        indenter: 'All',
        department: 'All',
    });

    // Server-side pagination states
    const [pendingInitialLoading, setPendingInitialLoading] = useState(true);
    const [historyInitialLoading, setHistoryInitialLoading] = useState(true);
    const [pendingSearching, setPendingSearching] = useState(false);
    const [historySearching, setHistorySearching] = useState(false);
    const [pendingLoadingMore, setPendingLoadingMore] = useState(false);
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [pendingPage, setPendingPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [pendingSearch, setPendingSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const pendingAbortRef = useRef<AbortController | null>(null);
    const historyAbortRef = useRef<AbortController | null>(null);

    const fetchPendingData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (pendingAbortRef.current) pendingAbortRef.current.abort();
        const controller = new AbortController();
        pendingAbortRef.current = controller;

        if (!append && tableData.length === 0) setPendingInitialLoading(true);
        else if (!append) setPendingSearching(true);
        else setPendingLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('vendor_rate_update', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 100, search: searchQuery, status: 'Pending' }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const grouped: Record<string, GroupedRateApprovalData> = {};
                const seenProductIds = new Set<number>();
                
                data.items.forEach((r: any) => {
                    const indentNo = r.indentNumber || '';
                    if (!grouped[indentNo]) {
                        grouped[indentNo] = {
                            indentNo,
                            firm: r.firm || 'N/A',
                            indenter: r.indenterName || '',
                            department: r.department || '',
                            date: r.createdAt ? formatDate(new Date(r.createdAt)) : '',
                            products: [],
                            vendorTotals: {}
                        };
                    }

                    // Only process the latest update for each unique product (indentId)
                    if (seenProductIds.has(r.indentId)) return;
                    seenProductIds.add(r.indentId);

                    // Build the vendor comparison list dynamically from quotes (1..N).
                    // Falls back to the legacy vendorName1/2/3 columns for older rows.
                    const productVendors: [string, string, string, number?][] = (
                        Array.isArray(r.quotes) && r.quotes.length
                            ? r.quotes.map((q: any) => [
                                q.vendorName || '',
                                String(q.rate || 0),
                                q.paymentTerm || '',
                                q.deliveryTime ?? undefined,
                            ] as [string, string, string, number?])
                            : [
                                [r.vendorName1 || '', String(r.rate1 || 0), r.paymentTerm1 || '', r.deliveryTime1 ?? undefined],
                                [r.vendorName2 || '', String(r.rate2 || 0), r.paymentTerm2 || '', r.deliveryTime2 ?? undefined],
                                [r.vendorName3 || '', String(r.rate3 || 0), r.paymentTerm3 || '', r.deliveryTime3 ?? undefined],
                            ]
                    ).filter((v: [string, string, string, number?]) => v[0]);

                    grouped[indentNo].products.push({
                        id: r.id,
                        indentId: r.indentId,
                        product: r.productName || '',
                        quantity: r.approvedQuantity || r.quantity || 0,
                        uom: r.uom || '',
                        vendors: productVendors
                    });

                    // Update totals
                    productVendors.forEach(v => {
                        if (v[0]) {
                            const rate = parseFloat(v[1]) || 0;
                            grouped[indentNo].vendorTotals[v[0]] = (grouped[indentNo].vendorTotals[v[0]] || 0) + rate;
                        }
                    });
                });

                const mappedData = Object.values(grouped);
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setPendingTotal(data.total); // This total might be slightly off due to grouping on server-side paginated items, but for now it's okay. 
                // Actually, if we group 100 items, we might get fewer rows. 
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching rate approval pending data:', error);
            toast.error('Failed to fetch data: ' + error.message);
        } finally {
            if (!controller.signal.aborted) {
                setPendingInitialLoading(false);
                setPendingSearching(false);
                setPendingLoadingMore(false);
            }
        }
    }, [tableData.length]);

    const fetchHistoryData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (historyAbortRef.current) historyAbortRef.current.abort();
        const controller = new AbortController();
        historyAbortRef.current = controller;

        if (!append && historyData.length === 0) setHistoryInitialLoading(true);
        else if (!append) setHistorySearching(true);
        else setHistoryLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('three_party_approval', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 100, search: searchQuery }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const grouped: Record<string, GroupedHistoryData> = {};
                const seenHistoryIds = new Set<number>();
                
                data.items.forEach((r: any) => {
                    if (r.vendorType === 'Regular') return; // Hide Regular vendors from Three Party history
                    const indentNo = r.indentNumber || '';
                    if (seenHistoryIds.has(r.indentId)) return;
                    seenHistoryIds.add(r.indentId);

                    if (!grouped[indentNo]) {
                        grouped[indentNo] = {
                            indentNo,
                            firm: r.firm || 'N/A',
                            indenter: r.indenterName || '',
                            department: r.department || '',
                            date: r.createdAt ? formatDate(new Date(r.createdAt)) : '',
                            products: [],
                            vendorTotals: {}
                        };
                    }

                    grouped[indentNo].products.push({
                        id: r.id,
                        indentId: r.indentId,
                        product: r.productName || '',
                        quantity: r.approvedQuantity || r.quantity || 0,
                        uom: r.uom || '',
                        approvedVendor: r.approvedVendorName,
                        approvedRate: r.approvedRate,
                        approvedPaymentTerm: r.approvedPaymentTerm || '',
                        approvedActualTime: r.approvedActualTime ?? undefined,
                    });

                    grouped[indentNo].vendorTotals[r.approvedVendorName] = (grouped[indentNo].vendorTotals[r.approvedVendorName] || 0) + (r.approvedRate || 0);
                });

                const mappedData = Object.values(grouped);
                setHistoryData(prev => append ? [...prev, ...mappedData] : mappedData);
                setHistoryTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching rate approval history:', error);
            toast.error('Failed to fetch history: ' + error.message);
        } finally {
            if (!controller.signal.aborted) {
                setHistoryInitialLoading(false);
                setHistorySearching(false);
                setHistoryLoadingMore(false);
            }
        }
    }, [historyData.length]);

    const fetchData = useCallback(async () => {
        await Promise.all([fetchPendingData(1, ''), fetchHistoryData(1, '')]);
    }, [fetchPendingData, fetchHistoryData]);

    useEffect(() => {
        fetchPendingData(1, '');
        fetchHistoryData(1, '');
        return () => {
            pendingAbortRef.current?.abort();
            historyAbortRef.current?.abort();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const debouncedPendingSearch = useCallback(
        debounce((query: string) => {
            setPendingPage(1);
            setPendingSearch(query);
            fetchPendingData(1, query);
        }, 500),
        [fetchPendingData]
    );

    const debouncedHistorySearch = useCallback(
        debounce((query: string) => {
            setHistoryPage(1);
            setHistorySearch(query);
            fetchHistoryData(1, query);
        }, 500),
        [fetchHistoryData]
    );

    // Helper to get unique filter options
    const getFilterOptions = (data: any[], key: string) => {
        const options = [...new Set(data.map(item => (item as any)[key]).filter(Boolean))].sort();
        return ['All', ...options];
    };

    // Derived filtered data
    const filteredTableData = tableData.filter(item => {
        return (pendingFilters.indenter === 'All' || item.indenter === pendingFilters.indenter) &&
               (pendingFilters.department === 'All' || item.department === pendingFilters.department);
    });

    const filteredHistoryData = historyData.filter(item => {
        return (historyFilters.indenter === 'All' || item.indenter === historyFilters.indenter) &&
               (historyFilters.department === 'All' || item.department === historyFilters.department);
    });

    const FilterBar = ({ filters, setFilters, data }: { filters: any, setFilters: any, data: any[] }) => (
        <div className="flex flex-wrap items-center gap-1.5">
            <Select value={filters.indenter} onValueChange={(val) => setFilters({ ...filters, indenter: val })}>
                <SelectTrigger size="xxs" className="h-7 w-[150px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Indenter:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'indenter').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={filters.department} onValueChange={(val) => setFilters({ ...filters, department: val })}>
                <SelectTrigger size="xxs" className="h-7 w-[150px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Dept:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'department').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    const renderPOComparisonPdf = async (
        indent: GroupedRateApprovalData | GroupedHistoryData,
        isHistory = false
    ) => {
        try {
            const firm = firms.find((f: any) => f.firm_name === indent.firm);
            const firmAddress = formatFirmAddress(firm, '');
            const companyName = firm?.firm_name || indent.firm || 'Shri Shyam Ethanol and Spirits Pvt Ltd';
            const companyGstin = firm?.firm_gstin || '';
            const companyPan = firm?.pan_number || '';
            const companyPhone = firm?.mobile || '';

            let logoBase64 = '';
            try {
                const logoResponse = await fetch('/logo.png');
                const logoBlob = await logoResponse.blob();
                logoBase64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(logoBlob);
                });
            } catch { /* logo optional */ }

            // Build items
            const items: ComparisonItem[] = indent.products.map(p => ({
                internalCode: indent.indentNo,
                product: p.product,
                description: null,
                quantity: Number(p.quantity || 0),
                unit: p.uom || '',
                rate: (p as any).approvedRate != null ? Number((p as any).approvedRate) : undefined,
                amount: (p as any).approvedRate != null ? (Number(p.quantity || 0) * Number((p as any).approvedRate)) : undefined,
                make: null,
            }));

            // Build quotes
            const quotes: ComparisonQuote[] = [];
            let approvedVendorName = '';

            if (isHistory) {
                const historyProducts = indent.products as HistoryProduct[];
                const approvedVendorsSet = new Set(historyProducts.map(p => p.approvedVendor).filter(Boolean));
                approvedVendorName = Array.from(approvedVendorsSet).join(', ');

                if (indent.vendorTotals && Object.keys(indent.vendorTotals).length > 0) {
                    Object.entries(indent.vendorTotals).forEach(([vName, total], idx) => {
                        const isApproved = approvedVendorsSet.has(vName);
                        const matchProd = historyProducts.find(p => p.approvedVendor === vName);
                        quotes.push({
                            slot: idx + 1,
                            vendorName: vName,
                            rate: total != null ? Number(total) : (matchProd?.approvedRate ?? null),
                            paymentTerm: isApproved ? (matchProd?.approvedPaymentTerm || null) : null,
                            deliveryTime: isApproved ? (matchProd?.approvedActualTime ?? null) : null,
                        });
                    });
                } else if (approvedVendorName) {
                    Array.from(approvedVendorsSet).forEach((vName, idx) => {
                        const matchProd = historyProducts.find(p => p.approvedVendor === vName);
                        quotes.push({
                            slot: idx + 1,
                            vendorName: vName,
                            rate: matchProd?.approvedRate ?? null,
                            paymentTerm: matchProd?.approvedPaymentTerm || null,
                            deliveryTime: matchProd?.approvedActualTime ?? null,
                        });
                    });
                }
            } else {
                const pendingProducts = indent.products as RateApprovalProduct[];
                if (pendingProducts.length === 1) {
                    const p = pendingProducts[0];
                    (p.vendors || []).forEach((v, idx) => {
                        if (v[0]) {
                            quotes.push({
                                slot: idx + 1,
                                vendorName: v[0],
                                rate: v[1] ? parseFloat(v[1]) : null,
                                paymentTerm: v[2] || null,
                                deliveryTime: v[3] != null ? Number(v[3]) : null,
                            });
                        }
                    });
                } else {
                    const vendorNames = Object.keys(indent.vendorTotals);
                    vendorNames.forEach((vName, idx) => {
                        const firstOffer = pendingProducts.flatMap(p => p.vendors || []).find(v => v[0] === vName);
                        quotes.push({
                            slot: idx + 1,
                            vendorName: vName,
                            rate: indent.vendorTotals[vName] ?? (firstOffer ? parseFloat(firstOffer[1]) : null),
                            paymentTerm: firstOffer ? firstOffer[2] : null,
                            deliveryTime: firstOffer && firstOffer[3] != null ? Number(firstOffer[3]) : null,
                        });
                    });
                }
            }

            const props: POComparisonPdfProps = {
                companyLogo: logoBase64,
                companyName,
                companyAddress: firmAddress,
                companyGstin,
                companyPan,
                companyPhone,
                poNumber: indent.indentNo,
                orderDate: indent.date,
                preparedBy: indent.indenter,
                approvedVendorName,
                firm: indent.firm,
                department: indent.department,
                items,
                quotes,
            };

            const blob = await pdf(<POComparisonPdf {...props} />).toBlob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err: any) {
            console.error('PDF generation error:', err);
            toast.error('Failed to generate PDF');
        }
    };

    // Creating table columns
    const columns: ColumnDef<GroupedRateApprovalData>[] = [
        {
            header: 'Action',
            id: 'action',
            cell: ({ row }: { row: Row<GroupedRateApprovalData> }) => {
                const indent = row.original;

                return (
                    <div>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedIndent(indent);
                                    setProductSelections({});
                                    form.reset();
                                }}
                            >
                                Approve
                            </Button>
                        </DialogTrigger>
                    </div>
                );
            },
        },
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'firm', header: 'Firm', cell: ({ getValue }: any) => <span title={getValue()}>{formatFirmName(getValue())}</span> },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        {
            header: 'Products',
            accessorKey: 'products',
            cell: ({ row }: { row: Row<GroupedRateApprovalData> }) => {
                const count = row.original.products.length;
                return <span>{count} Items</span>;
            },
        },
        { accessorKey: 'date', header: 'Date' },
        {
            header: 'Vendor Totals',
            accessorKey: 'vendorTotals',
            cell: ({ row }: { row: Row<GroupedRateApprovalData> }) => {
                const totals = row.original.vendorTotals;
                return (
                    <div className="flex flex-col gap-1">
                        {Object.entries(totals).map(([vendor, total], index) => (
                            <span key={index} className="rounded-full text-[10px] px-2 py-0.5 bg-green-100 text-green-800 border border-green-200 whitespace-nowrap">
                                {vendor}: ₹{total.toLocaleString()}
                            </span>
                        ))}
                    </div>
                );
            },
        },
        {
            id: 'comparisonPdf',
            header: 'Comparison PDF',
            enableSorting: false,
            cell: ({ row }) => {
                const indent = row.original;
                return (
                    <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                        onClick={() => renderPOComparisonPdf(indent, false)}
                    >
                        <FileDown className="h-3 w-3" />
                        View PDF
                    </Button>
                );
            },
        },
    ];

    const historyColumns: ColumnDef<GroupedHistoryData>[] = [
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'firm', header: 'Firm', cell: ({ getValue }: any) => <span title={getValue()}>{formatFirmName(getValue())}</span> },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        {
            header: 'Vendor Totals',
            accessorKey: 'vendorTotals',
            cell: ({ row }) => {
                const totals = row.original.vendorTotals;
                return (
                    <div className="flex flex-col gap-1">
                        {Object.entries(totals).map(([vendor, total], index) => (
                            <span key={index} className="rounded-full text-[10px] px-2 py-0.5 bg-green-100 text-green-800 border border-green-200 whitespace-nowrap">
                                {vendor}: ₹{total.toLocaleString()}
                            </span>
                        ))}
                    </div>
                );
            }
        },
        { accessorKey: 'date', header: 'Date' },
        {
            id: 'comparisonPdf',
            header: 'Comparison PDF',
            enableSorting: false,
            cell: ({ row }) => {
                const indent = row.original;
                return (
                    <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                        onClick={() => renderPOComparisonPdf(indent, true)}
                    >
                        <FileDown className="h-3 w-3" />
                        View PDF
                    </Button>
                );
            },
        },
    ];

    const scrollRef = useRef<HTMLDivElement>(null);

    // Track vendor selection per product: { [productId]: vendorName }
    const [productSelections, setProductSelections] = useState<Record<number, string>>({});

    // Creating approval form
    const schema = z.object({
        remarks: z.string().optional(),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            remarks: '',
        },
    });

    // Compute vendor assignment summary
    const selectedVendorsSummary = useMemo(() => {
        if (!selectedIndent) return {};
        const summary: Record<string, {
            products: { id: number; name: string; quantity: number; uom: string; rate: number; paymentTerm: string; deliveryTime?: number; isL1: boolean }[];
            totalAmount: number;
            deliveryTime?: number;
        }> = {};

        selectedIndent.products.forEach(p => {
            const chosenVendor = productSelections[p.id];
            if (!chosenVendor) return;

            const offer = p.vendors.find(v => v[0] === chosenVendor);
            if (!offer) return;

            if (!summary[chosenVendor]) {
                summary[chosenVendor] = {
                    products: [],
                    totalAmount: 0,
                    deliveryTime: offer[3] != null ? Number(offer[3]) : undefined,
                };
            }

            const rate = parseFloat(offer[1]) || 0;
            const validRates = p.vendors.map(v => parseFloat(v[1])).filter(r => !isNaN(r) && r > 0);
            const minRate = validRates.length > 0 ? Math.min(...validRates) : null;
            const isL1 = minRate !== null && rate === minRate;

            summary[chosenVendor].products.push({
                id: p.id,
                name: p.product,
                quantity: p.quantity,
                uom: p.uom,
                rate,
                paymentTerm: offer[2] || '',
                deliveryTime: offer[3] != null ? Number(offer[3]) : undefined,
                isL1,
            });
            summary[chosenVendor].totalAmount += rate * (p.quantity || 1);
        });

        return summary;
    }, [productSelections, selectedIndent]);

    const activeVendorNames = useMemo(() => Object.keys(selectedVendorsSummary), [selectedVendorsSummary]);

    // Check if any product has a non-L1 vendor selected
    const isAnyNonL1 = useMemo(() => {
        if (!selectedIndent) return false;
        return selectedIndent.products.some(p => {
            const chosenVendor = productSelections[p.id];
            if (!chosenVendor) return false;
            const offer = p.vendors.find(v => v[0] === chosenVendor);
            if (!offer) return false;
            const rate = parseFloat(offer[1]);
            const validRates = p.vendors.map(v => parseFloat(v[1])).filter(r => !isNaN(r) && r > 0);
            const minRate = validRates.length > 0 ? Math.min(...validRates) : null;
            return minRate !== null && rate > minRate;
        });
    }, [selectedIndent, productSelections]);

    useEffect(() => {
        if (isAnyNonL1) {
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({
                        top: scrollRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }, [isAnyNonL1]);

    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            if (!selectedIndent) return;

            const unassigned = selectedIndent.products.filter(p => !productSelections[p.id]);
            if (unassigned.length > 0) {
                toast.error(`Please select a vendor for all products: ${unassigned.map(p => p.product).join(', ')}`);
                return;
            }

            if (isAnyNonL1 && !values.remarks?.trim()) {
                form.setError('remarks', { message: 'Remarks are required when selecting a higher priced vendor' });
                return;
            }

            // Prepare multiple approval records
            const approvals = selectedIndent.products.map(product => {
                const chosenVendor = productSelections[product.id];
                const vendorOffer = product.vendors.find(v => v[0] === chosenVendor);
                return {
                    indent_number: selectedIndent.indentNo,
                    indent_id: product.indentId,
                    approvedVendorName: chosenVendor,
                    approvedRate: vendorOffer ? parseFloat(vendorOffer[1]) : 0,
                    approvedPaymentTerm: vendorOffer ? vendorOffer[2] : '',
                    approvedActualTime: vendorOffer?.[3] ?? null,
                    remarks: isAnyNonL1 ? values.remarks : undefined,
                };
            });

            // Save approved vendor to three_party_approval table
            const result = await postToSheet(approvals as any, 'insert', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            const distinctVendors = Array.from(new Set(Object.values(productSelections)));
            toast.success(`Approved vendor(s) ${distinctVendors.join(', ')} for ${selectedIndent.indentNo}`);
            updateIndentSheet();
            updateRelatedSheets();
            setOpenDialog(false);
            setProductSelections({});
            form.reset();
            fetchData(); // Refresh all data
        } catch (error: any) {
            console.error('Error updating vendor:', error);
            toast.error('Failed to update vendor: ' + error.message);
        }
    }

    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div>
            <Dialog open={openDialog} onOpenChange={(open) => {
                setOpenDialog(open);
                if (!open) {
                    setSelectedIndent(null);
                    setSelectedHistory(null);
                    setProductSelections({});
                    form.reset();
                }
            }}>
                <Tabs defaultValue="pending">
                    <Heading
                        heading="Multi-Party Rate Approval"
                        subtext="Approve rates for three party vendors"
                        tabs
                    >
                        <Users size={50} className="text-primary" />
                    </Heading>
                    <TabsContent value="pending" className="overflow-hidden w-full">
                        <div className="overflow-x-auto max-w-[calc(100vw-3rem)] md:max-w-full">
                            <DataTable
                                data={tableData}
                                columns={columns}
                                searchFields={['indentNo', 'department', 'indenter', 'date']}
                                dataLoading={pendingInitialLoading}
                                isSearching={pendingSearching}
                                totalCount={pendingTotal}
                                currentPage={pendingPage}
                                onPageChange={(page) => {
                                    setPendingPage(page);
                                    fetchPendingData(page, pendingSearch, false);
                                }}
                                onSearchChange={debouncedPendingSearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                }
                            />
                        </div>
                    </TabsContent>
                    <TabsContent value="history" className="overflow-hidden w-full">
                        <div className="overflow-x-auto max-w-[calc(100vw-3rem)] md:max-w-full">
                            <DataTable
                                data={historyData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'department', 'indenter', 'date']}
                                dataLoading={historyInitialLoading}
                                isSearching={historySearching}
                                totalCount={historyTotal}
                                currentPage={historyPage}
                                onPageChange={(page) => {
                                    setHistoryPage(page);
                                    fetchHistoryData(page, historySearch, false);
                                }}
                                onSearchChange={debouncedHistorySearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />
                                }
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                {selectedIndent && (
                    <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit, onError)}
                                className="flex flex-col h-full overflow-hidden"
                            >
                                <DialogHeader className="p-6 pb-2 space-y-1">
                                    <DialogTitle>Grouped Rate Approval</DialogTitle>
                                    <DialogDescription>
                                        Compare and approve vendors for indent{' '}
                                        <span className="font-medium text-foreground">
                                            {selectedIndent.indentNo}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>
                                
                                <div 
                                    ref={scrollRef}
                                    className="flex-1 overflow-y-auto px-6 py-2 space-y-5"
                                >
                                    <div className="rounded-lg border overflow-hidden">
                                        <div className="bg-primary px-4 py-2 flex items-center justify-between text-white">
                                            <span className="text-sm font-bold tracking-wide">{selectedIndent.indentNo}</span>
                                            <span className="text-[11px] bg-white/20 rounded-full px-2 py-0.5 font-medium">
                                                {selectedIndent.firm}
                                            </span>
                                        </div>
                                        <div className="bg-muted/30 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 border-b">
                                            {[
                                                { label: 'Indenter',   value: selectedIndent.indenter },
                                                { label: 'Department', value: selectedIndent.department },
                                            ].map(({ label, value }) =>
                                                value ? (
                                                    <div key={label} className="flex flex-col">
                                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                                        <span className="text-xs font-medium text-foreground mt-0.5">{value}</span>
                                                    </div>
                                                ) : null
                                            )}
                                        </div>

                                        {/* Comparison Matrix Table */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead className="bg-muted/50 border-b">
                                                    <tr>
                                                        <th className="px-4 py-2 border-r font-semibold w-1/3">Product / Item</th>
                                                        {Object.keys(selectedIndent.vendorTotals).map(vendor => (
                                                            <th key={vendor} className="px-4 py-2 border-r font-semibold text-center">{vendor}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedIndent.products.map((p, idx) => {
                                                        const validRates = p.vendors
                                                            .map(v => parseFloat(v[1]))
                                                            .filter(r => !isNaN(r) && r > 0);
                                                        const minRate = validRates.length > 0 ? Math.min(...validRates) : null;

                                                        return (
                                                            <tr key={p.id || idx} className="border-b hover:bg-muted/10">
                                                                <td className="px-4 py-2.5 border-r">
                                                                    <div className="font-medium text-xs">{p.product}</div>
                                                                    <div className="text-[10px] text-muted-foreground">{p.quantity} {p.uom}</div>
                                                                </td>
                                                                {Object.keys(selectedIndent.vendorTotals).map(vendorName => {
                                                                    const offer = p.vendors.find(v => v[0] === vendorName);
                                                                    const isSelected = productSelections[p.id] === vendorName;
                                                                    const offerRate = offer ? parseFloat(offer[1]) : null;
                                                                    const isItemL1 = offerRate !== null && minRate !== null && offerRate === minRate;

                                                                    return (
                                                                        <td
                                                                            key={vendorName}
                                                                            onClick={() => {
                                                                                if (offer) {
                                                                                    setProductSelections(prev => ({
                                                                                        ...prev,
                                                                                        [p.id]: vendorName,
                                                                                    }));
                                                                                }
                                                                            }}
                                                                            className={`px-3 py-2 border-r transition-all ${
                                                                                offer ? 'cursor-pointer hover:bg-muted/30 select-none' : 'text-center'
                                                                            } ${
                                                                                isSelected ? 'bg-green-50/80 ring-2 ring-inset ring-green-600' : ''
                                                                            }`}
                                                                        >
                                                                            {offer ? (
                                                                                <div className="flex items-center gap-2.5">
                                                                                    <div
                                                                                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                                                                            isSelected
                                                                                                ? 'border-green-600 bg-green-600 shadow-xs'
                                                                                                : 'border-muted-foreground/40 bg-background hover:border-green-600'
                                                                                        }`}
                                                                                    >
                                                                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0 text-left">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <span className={`text-xs ${isSelected ? 'font-bold text-green-900' : 'font-semibold'}`}>
                                                                                                ₹{offerRate?.toLocaleString()}
                                                                                            </span>
                                                                                            {isItemL1 && (
                                                                                                <span className="text-[8px] bg-green-100 text-green-800 font-bold px-1 py-0.5 rounded leading-none">
                                                                                                    L1
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="text-[9px] text-muted-foreground truncate max-w-[130px]" title={offer[2]}>
                                                                                            {offer[2] || 'No terms'}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-muted-foreground">-</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot className="bg-muted/50 font-bold">
                                                    <tr>
                                                        <td className="px-4 py-3 border-r text-right">GROSS TOTAL OFFER</td>
                                                        {Object.entries(selectedIndent.vendorTotals).map(([vendor, total]) => {
                                                            const isMin = total === Math.min(...Object.values(selectedIndent.vendorTotals));
                                                            return (
                                                                <td key={vendor} className={`px-4 py-3 border-r text-center ${isMin ? 'text-green-600 bg-green-50' : ''}`}>
                                                                    <div className="text-sm">₹{total.toLocaleString()}</div>
                                                                    {isMin && <div className="text-[9px] uppercase tracking-tighter">L1 Lowest (Total)</div>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Approved Vendors Dynamic Selection Summary */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                                    Select Approved Vendor(s)
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {Object.keys(productSelections).length} of {selectedIndent.products.length} product(s) selected
                                                </p>
                                            </div>
                                            {activeVendorNames.length > 0 && (
                                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
                                                    {activeVendorNames.length} Vendor{activeVendorNames.length > 1 ? 's' : ''} Selected
                                                </span>
                                            )}
                                        </div>

                                        {activeVendorNames.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center text-muted-foreground bg-muted/10">
                                                <p className="text-xs font-semibold text-foreground">No vendor selected yet</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    Click the selection circle in the price matrix above to assign an approved vendor for each product.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className={`grid gap-2 ${
                                                activeVendorNames.length === 1
                                                    ? 'grid-cols-1 sm:max-w-[240px]'
                                                    : activeVendorNames.length === 2
                                                    ? 'grid-cols-2'
                                                    : 'grid-cols-3'
                                            }`}>
                                                {Object.entries(selectedVendorsSummary).map(([vendorName, info]) => (
                                                    <div
                                                        key={vendorName}
                                                        className="rounded-lg border border-border/80 bg-card p-2.5 flex flex-col justify-between shadow-2xs hover:border-green-600/40 transition-all"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-[11px] uppercase tracking-tight text-foreground truncate" title={vendorName}>
                                                                {vendorName}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                                                                {info.deliveryTime != null && (
                                                                    <span>{info.deliveryTime}d delivery</span>
                                                                )}
                                                                <span>• {info.products.length} item{info.products.length > 1 ? 's' : ''}</span>
                                                            </div>

                                                            {/* Compact Price Box */}
                                                            <div className="my-2 py-1 px-2 rounded bg-green-50/70 border border-green-200/50 text-center">
                                                                <span className="text-sm font-black text-green-700">
                                                                    ₹{info.totalAmount.toLocaleString()}
                                                                </span>
                                                            </div>

                                                            {/* Compact Assigned Items */}
                                                            <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                                                                {info.products.map(item => (
                                                                    <div
                                                                        key={item.id}
                                                                        className="text-[10px] py-1 px-1.5 rounded bg-muted/40 flex items-center justify-between gap-1"
                                                                    >
                                                                        <div className="min-w-0 flex-1 truncate">
                                                                            <span className="font-medium text-foreground block truncate" title={item.name}>
                                                                                {item.name}
                                                                            </span>
                                                                            <span className="text-[9px] text-muted-foreground">
                                                                                {item.quantity} {item.uom} @ ₹{item.rate}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <span className="font-bold text-[10px] block">
                                                                                ₹{(item.rate * (item.quantity || 1)).toLocaleString()}
                                                                            </span>
                                                                            {item.isL1 ? (
                                                                                <span className="text-[8px] font-bold text-green-600 bg-green-100/80 px-1 py-0.2 rounded">
                                                                                    L1
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[8px] font-bold text-amber-600 bg-amber-100/80 px-1 py-0.2 rounded">
                                                                                    Above L1
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {isAnyNonL1 && (
                                        <FormField
                                            control={form.control}
                                            name="remarks"
                                            render={({ field, fieldState }) => (
                                                <FormItem className="animate-in slide-in-from-top-2 duration-300">
                                                    <FormLabel className="text-destructive font-bold flex items-center gap-2">
                                                        Remarks for selecting higher priced vendor <span className="text-destructive">*</span>
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Textarea
                                                            placeholder="Why are you choosing higher-priced vendor(s) instead of L1? (e.g. Quality, Delivery Time, Payment Terms...)"
                                                            className="resize-none border-destructive/50 focus-visible:ring-destructive"
                                                            rows={3}
                                                            autoFocus
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    {fieldState.error && (
                                                        <p className="text-xs text-destructive font-medium">{fieldState.error.message}</p>
                                                    )}
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>

                                <DialogFooter className="p-6 pt-2 border-t bg-background flex items-center justify-between">
                                    <div className="text-xs text-muted-foreground">
                                        {Object.keys(productSelections).length < selectedIndent.products.length ? (
                                            <span className="text-amber-600 font-medium">
                                                Select vendor for all {selectedIndent.products.length} products to submit ({Object.keys(productSelections).length}/{selectedIndent.products.length} selected)
                                            </span>
                                        ) : (
                                            <span className="text-green-600 font-medium">
                                                All {selectedIndent.products.length} products assigned
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <DialogClose asChild>
                                            <Button variant="outline">Cancel</Button>
                                        </DialogClose>
                                        <Button
                                            type="submit"
                                            disabled={form.formState.isSubmitting || Object.keys(productSelections).length !== selectedIndent.products.length}
                                            className="min-w-[120px]"
                                        >
                                            {form.formState.isSubmitting ? (
                                                <Loader size={18} color="white" />
                                            ) : (
                                                "Submit Approval"
                                            )}
                                        </Button>
                                    </div>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
};
