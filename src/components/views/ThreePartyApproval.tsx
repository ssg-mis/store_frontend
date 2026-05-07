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
import { useEffect, useState, useRef, useCallback } from 'react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postToSheet, uploadFile, fetchFromSupabasePaginated } from '@/lib/fetchers';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Users, FileDown, Eye } from 'lucide-react';
import { Tabs, TabsContent } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { formatDate, debounce } from '@/lib/utils';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { pdf } from '@react-pdf/renderer';
import ComparisonPdf from '../element/ComparisonPdf';

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

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();

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

                    const productVendors: [string, string, string, number?][] = [
                        [r.vendorName1 || '', String(r.rate1 || 0), r.paymentTerm1 || '', r.deliveryTime1 ?? undefined],
                        [r.vendorName2 || '', String(r.rate2 || 0), r.paymentTerm2 || '', r.deliveryTime2 ?? undefined],
                        [r.vendorName3 || '', String(r.rate3 || 0), r.paymentTerm3 || '', r.deliveryTime3 ?? undefined],
                    ];

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
                <SelectTrigger className="h-7 w-[150px] text-[11px] shadow-sm px-2">
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
                <SelectTrigger className="h-7 w-[150px] text-[11px] shadow-sm px-2">
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
        { accessorKey: 'firm', header: 'Firm' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        {
            header: 'Products',
            accessorKey: 'products',
            cell: ({ row }) => <span className="font-medium">{row.original.products.length} Items</span>
        },
        { accessorKey: 'date', header: 'Date' },
        {
            accessorKey: 'vendorTotals',
            header: 'Vendor Totals',
            enableSorting: false,
            cell: ({ row }) => {
                const totals = row.original.vendorTotals;
                return (
                    <div className="flex flex-col gap-1">
                        {Object.entries(totals).map(([vendor, total], index) => (
                            <span key={index} className="rounded-full text-[10px] px-2 py-0.5 bg-accent text-accent-foreground border border-accent-foreground whitespace-nowrap">
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

                const handleViewPdf = async () => {
                    try {
                        const vendorNames = Object.keys(indent.vendorTotals);
                        const pdfProducts = indent.products.map(p => ({
                            name: p.product,
                            quantity: p.quantity,
                            uom: p.uom,
                            offers: p.vendors.map(v => ({
                                vendorName: v[0],
                                rate: parseFloat(v[1]),
                                paymentTerm: v[2],
                                deliveryTime: v[3],
                            })).filter(v => v.vendorName)
                        }));

                        const blob = await pdf(
                            <ComparisonPdf
                                companyName="Shri Shyam Oil Extractions Pvt Ltd"
                                companyAddress="Banari, Janjgir Champa-495668, Chhattisgarh"
                                companyPhone="+919993023243"
                                indentNo={indent.indentNo}
                                department={indent.department}
                                indenter={indent.indenter}
                                date={indent.date}
                                products={pdfProducts}
                                vendorNames={vendorNames}
                            />
                        ).toBlob();

                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                    } catch (err: any) {
                        console.error('PDF generation error:', err);
                        toast.error('Failed to generate PDF');
                    }
                };

                return (
                    <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={handleViewPdf}
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
        { accessorKey: 'firm', header: 'Firm' },
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

                const handleView = async () => {
                    try {
                        const vendorNames = Object.keys(indent.vendorTotals);
                        const pdfProducts = indent.products.map(p => ({
                            name: p.product,
                            quantity: p.quantity,
                            uom: p.uom,
                            offers: [{
                                vendorName: p.approvedVendor,
                                rate: p.approvedRate,
                                paymentTerm: p.approvedPaymentTerm || '',
                                deliveryTime: p.approvedActualTime,
                            }]
                        }));

                        const blob = await pdf(
                            <ComparisonPdf
                                companyName="Shri Shyam Oil Extractions Pvt Ltd"
                                companyAddress="Banari, Janjgir Champa-495668, Chhattisgarh"
                                companyPhone="+919993023243"
                                indentNo={indent.indentNo}
                                department={indent.department}
                                indenter={indent.indenter}
                                date={indent.date}
                                products={pdfProducts}
                                vendorNames={vendorNames}
                                recommendedVendor={vendorNames[0]}
                            />
                        ).toBlob();

                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (err: any) {
                        console.error('PDF generation error:', err);
                        toast.error('Failed to generate PDF');
                    }
                };

                return (
                    <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={handleView}
                    >
                        <Eye className="h-3 w-3" />
                        View PDF
                    </Button>
                );
            },
        },
    ];

    const scrollRef = useRef<HTMLDivElement>(null);

    // Creating approval form
    const schema = z.object({
        vendorName: z.string(),
        remarks: z.string().optional(),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            vendorName: '',
            remarks: '',
        },
    });

    const watchedVendorName = form.watch('vendorName');

    useEffect(() => {
        if (watchedVendorName && selectedIndent) {
            const total = selectedIndent.vendorTotals[watchedVendorName];
            const minTotal = Math.min(...Object.values(selectedIndent.vendorTotals));
            const isLowest = total === minTotal;

            if (!isLowest) {
                // Smooth scroll to bottom to reveal remarks
                setTimeout(() => {
                    if (scrollRef.current) {
                        scrollRef.current.scrollTo({
                            top: scrollRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            }
        }
    }, [watchedVendorName, selectedIndent]);

    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            if (!selectedIndent) return;

            const selectedVendorName = values.vendorName;
            const selectedTotal = selectedIndent.vendorTotals[selectedVendorName];
            const allTotals = Object.values(selectedIndent.vendorTotals);
            const minTotal = Math.min(...allTotals);
            const isLowest = selectedTotal === minTotal;

            if (!isLowest && !values.remarks?.trim()) {
                form.setError('remarks', { message: 'Remarks are required when selecting a higher priced vendor' });
                return;
            }

            // Prepare multiple approval records
            const approvals = selectedIndent.products.map(product => {
                const vendorOffer = product.vendors.find(v => v[0] === selectedVendorName);
                return {
                    indent_number: selectedIndent.indentNo,
                    indent_id: product.indentId,
                    approvedVendorName: selectedVendorName,
                    approvedRate: vendorOffer ? vendorOffer[1] : 0,
                    approvedPaymentTerm: vendorOffer ? vendorOffer[2] : '',
                    approvedActualTime: vendorOffer?.[3] ?? null,
                    remarks: !isLowest ? values.remarks : undefined,
                };
            });

            // Save approved vendor to three_party_approval table
            const result = await postToSheet(approvals as any, 'insert', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Approved vendor ${selectedVendorName} for ${selectedIndent.indentNo}`);
            updateIndentSheet();
            updateRelatedSheets();
            setOpenDialog(false);
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
                    form.reset();
                }
            }}>
                <Tabs defaultValue="pending">
                    <Heading
                        heading="Three Party Rate Approval"
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
                                                    {selectedIndent.products.map((p, idx) => (
                                                        <tr key={idx} className="border-b hover:bg-muted/20">
                                                            <td className="px-4 py-2 border-r">
                                                                <div className="font-medium">{p.product}</div>
                                                                <div className="text-[10px] text-muted-foreground">{p.quantity} {p.uom}</div>
                                                            </td>
                                                            {Object.keys(selectedIndent.vendorTotals).map(vendorName => {
                                                                const offer = p.vendors.find(v => v[0] === vendorName);
                                                                return (
                                                                    <td key={vendorName} className="px-4 py-2 border-r text-center">
                                                                        {offer ? (
                                                                            <div>
                                                                                <div className="font-semibold">₹{parseFloat(offer[1]).toLocaleString()}</div>
                                                                                <div className="text-[9px] text-muted-foreground truncate" title={offer[2]}>{offer[2]}</div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-muted-foreground">-</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-muted/50 font-bold">
                                                    <tr>
                                                        <td className="px-4 py-3 border-r text-right">GROSS TOTAL OFFER</td>
                                                        {Object.entries(selectedIndent.vendorTotals).map(([vendor, total]) => {
                                                            const isMin = total === Math.min(...Object.values(selectedIndent.vendorTotals));
                                                            return (
                                                                <td key={vendor} className={`px-4 py-3 border-r text-center ${isMin ? 'text-green-600 bg-green-50' : ''}`}>
                                                                    <div className="text-sm">₹{total.toLocaleString()}</div>
                                                                    {isMin && <div className="text-[9px] uppercase tracking-tighter">L1 Lowest</div>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="grid gap-3">
                                        <FormField
                                            control={form.control}
                                            name="vendorName"
                                            render={({ field }) => {
                                                const minTotal = Math.min(...Object.values(selectedIndent.vendorTotals));
                                                
                                                return (
                                                    <FormItem>
                                                        <FormLabel className="text-base font-bold">Select Approved Vendor (Final L1 Decision)</FormLabel>
                                                        <FormControl>
                                                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                {Object.entries(selectedIndent.vendorTotals).map(
                                                                    ([vendorName, total]) => {
                                                                        const isLowest = total === minTotal;
                                                                        const deliveryTime = selectedIndent.products[0]?.vendors.find(v => v[0] === vendorName)?.[3];

                                                                        return (
                                                                            <FormItem key={vendorName}>
                                                                                <FormLabel className={`flex flex-col items-center gap-2 border hover:bg-accent p-4 rounded-lg cursor-pointer transition-all ${isLowest ? 'border-green-500 bg-green-50/30 ring-1 ring-green-500' : ''} ${field.value === vendorName ? 'border-primary ring-2 ring-primary bg-primary/5' : ''}`}>
                                                                                    <FormControl>
                                                                                        <RadioGroupItem
                                                                                            value={vendorName}
                                                                                            className="sr-only"
                                                                                        />
                                                                                    </FormControl>
                                                                                    <div className="text-center">
                                                                                        <p className="font-bold text-sm truncate w-full">{vendorName}</p>
                                                                                        <p className={`text-lg font-black mt-1 ${isLowest ? 'text-green-700' : 'text-primary'}`}>
                                                                                            ₹{total.toLocaleString()}
                                                                                        </p>
                                                                                        {deliveryTime != null && (
                                                                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                                                                {deliveryTime} day{deliveryTime !== 1 ? 's' : ''} delivery
                                                                                            </p>
                                                                                        )}
                                                                                        {isLowest && (
                                                                                            <span className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-widest mt-2 block">
                                                                                                L1 Decision
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </FormLabel>
                                                                            </FormItem>
                                                                        );
                                                                    }
                                                                )}
                                                            </RadioGroup>
                                                        </FormControl>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    </div>

                                    {(() => {
                                        const vendorName = form.watch('vendorName');
                                        if (!vendorName) return null;
                                        const total = selectedIndent.vendorTotals[vendorName];
                                        const minTotal = Math.min(...Object.values(selectedIndent.vendorTotals));
                                        const isLowest = total === minTotal;
                                        
                                        if (isLowest) return null;
                                        
                                        return (
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
                                                                placeholder="Why are you choosing this vendor instead of L1? (e.g. Quality, Delivery Time, Payment Terms...)"
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
                                        );
                                    })()}
                                </div>

                                <DialogFooter className="p-6 pt-2 border-t bg-background">
                                    <DialogClose asChild>
                                        <Button variant="outline">Cancel</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-[120px]">
                                        {form.formState.isSubmitting ? (
                                            <Loader size={18} color="white" />
                                        ) : (
                                            "Submit Approval"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
};
