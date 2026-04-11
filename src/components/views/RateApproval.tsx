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
import { Users } from 'lucide-react';
import { Tabs, TabsContent } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { formatDate, debounce } from '@/lib/utils';
import { Input } from '../ui/input';

interface RateApprovalData {
    id: number;
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    comparisonSheet: string;
    vendors: [string, string, string][];
    date: string;
}
interface HistoryData {
    id: number;
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    vendor: [string, string];
    date: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();

    const [selectedIndent, setSelectedIndent] = useState<RateApprovalData | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<HistoryData | null>(null);
    const [tableData, setTableData] = useState<RateApprovalData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);

    // Filter states (kept for FilterBar, though search is now server-side)
    const [pendingFilters, setPendingFilters] = useState({
        indenter: 'All',
        department: 'All',
        product: 'All',
    });
    const [historyFilters, setHistoryFilters] = useState({
        indenter: 'All',
        department: 'All',
        product: 'All',
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
                { column: 'createdAt', options: { ascending: false } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, status: 'Pending' }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((r: any) => ({
                    id: r.id,
                    indentNo: r.indentNumber || '',
                    firm: r.firm || 'N/A',
                    indenter: r.indenterName || '',
                    department: r.department || '',
                    product: r.productName || '',
                    comparisonSheet: r.comparisonSheet || '',
                    vendors: [
                        [r.vendorName1 || '', String(r.rate1 || 0), r.paymentTerm1 || ''],
                        [r.vendorName2 || '', String(r.rate2 || 0), r.paymentTerm2 || ''],
                        [r.vendorName3 || '', String(r.rate3 || 0), r.paymentTerm3 || ''],
                    ],
                    date: r.createdAt ? formatDate(new Date(r.createdAt)) : '',
                }));
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setPendingTotal(data.total);
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
                { column: 'createdAt', options: { ascending: false } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((r: any) => ({
                    id: r.id,
                    indentNo: r.indentNumber || '',
                    firm: r.firm || 'N/A',
                    indenter: r.indenterName || '',
                    department: r.department || '',
                    product: r.productName || '',
                    vendor: [r.approvedVendorName, String(r.approvedRate)],
                    date: r.createdAt ? formatDate(new Date(r.createdAt)) : '',
                }));
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
               (pendingFilters.department === 'All' || item.department === pendingFilters.department) &&
               (pendingFilters.product === 'All' || item.product === pendingFilters.product);
    });

    const filteredHistoryData = historyData.filter(item => {
        return (historyFilters.indenter === 'All' || item.indenter === historyFilters.indenter) &&
               (historyFilters.department === 'All' || item.department === historyFilters.department) &&
               (historyFilters.product === 'All' || item.product === historyFilters.product);
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
            <Select value={filters.product} onValueChange={(val) => setFilters({ ...filters, product: val })}>
                <SelectTrigger className="h-7 w-[150px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Prod:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'product').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    // Creating table columns
    const columns: ColumnDef<RateApprovalData>[] = [
        {
            header: 'Action',
            id: 'action',
            cell: ({ row }: { row: Row<RateApprovalData> }) => {
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
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'date', header: 'Date' },
        {
            accessorKey: 'vendors',
            header: 'Vendors',
            enableSorting: false,   // <-- ADD THIS
            cell: ({ row }) => {
                const vendors = row.original.vendors;
                return (
                    <div className="grid place-items-center">
                        <div className="flex flex-col gap-1">
                            {vendors.map((vendor, index) => (
                                <span key={index} className="rounded-full text-xs px-3 py-1 bg-accent text-accent-foreground border border-accent-foreground">
                                    {vendor[0]} - ₹{vendor[1]}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            },
        },

        {
            accessorKey: 'comparisonSheet',
            header: 'Comparison Sheet',
            enableSorting: false,    // <-- ADD THIS
            cell: ({ row }) => {
                const sheet = row.original.comparisonSheet;
                return sheet ? (
                    <a href={sheet} target="_blank">Comparison Sheet</a>
                ) : <></>;
            },
        },

    ];

    const historyColumns: ColumnDef<HistoryData>[] = [
        {
            header: 'Action',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const indent = row.original;

                return (
                    <div>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedHistory(indent);
                                }}
                            >
                                Update
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
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'date', header: 'Date' },
    ];

    // Creating approval form
    const schema = z.object({
        vendor: z.coerce.number(),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            vendor: undefined,
        },
    });

    const getCurrentFormattedDateOnly = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            const selectedVendor = selectedIndent?.vendors[values.vendor];
            // Save approved vendor to three_party_approval table
            const result = await postToSheet([{
                indent_number: selectedIndent?.indentNo,
                approvedVendorName: selectedVendor?.[0],
                approvedRate: selectedVendor?.[1],
                approvedPaymentTerm: selectedVendor?.[2],
            } as any], 'insert', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Approved vendor for ${selectedIndent?.indentNo}`);
            updateIndentSheet();
            updateRelatedSheets();
            setOpenDialog(false);
            form.reset();

            // Refresh using new table-based logic
            const rateUpdates = await fetchFromSupabasePaginated('vendor_rate_update', '*', { column: 'createdAt', options: { ascending: false } });
            const threePartyApprovals = await fetchFromSupabasePaginated('three_party_approval', '*', { column: 'createdAt', options: { ascending: false } });
            const approvedIndentNumbers = new Set((threePartyApprovals || []).map((r: any) => r.indentNumber || r.indent_number || ''));

            setTableData((rateUpdates || [])
                .filter((record: any) => !approvedIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    comparisonSheet: record.comparisonSheet || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendors: [
                        [record.vendorName1 || '', record.rate1?.toString() || '0', record.paymentTerm1 || ''] as [string, string, string],
                        [record.vendorName2 || '', record.rate2?.toString() || '0', record.paymentTerm2 || ''] as [string, string, string],
                        [record.vendorName3 || '', record.rate3?.toString() || '0', record.paymentTerm3 || ''] as [string, string, string],
                    ],
                }))
            );
            // Only show Three Party flow approvals in history (cross-ref with vendor_rate_update)
            const threePartyIndentNumbers = new Set(
                (rateUpdates || []).map((r: any) => r.indentNumber || r.indent_number || '')
            );
            setHistoryData((threePartyApprovals || [])
                .filter((record: any) => threePartyIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendor: [record.approvedVendorName || '', record.approvedRate?.toString() || '0'] as [string, string],
                }))
            );
        } catch (error: any) {
            console.error('Error updating vendor:', error);
            toast.error('Failed to update vendor: ' + error.message);
        }
    }

    const historyUpdateSchema = z.object({
        rate: z.coerce.number(),
    })

    const historyUpdateForm = useForm({
        resolver: zodResolver(historyUpdateSchema),
        defaultValues: {
            rate: 0,
        },
    })

    useEffect(() => {
        if (selectedHistory) {
            historyUpdateForm.reset({ rate: parseInt(selectedHistory.vendor[1]) })
        }
    }, [selectedHistory])

    async function onSubmitHistoryUpdate(values: z.infer<typeof historyUpdateSchema>) {
        try {
            // Update approvedRate in three_party_approval table
            const result = await postToSheet([{
                id: selectedHistory?.id,
                indent_number: selectedHistory?.indentNo,
                approvedRate: values.rate
            } as any], 'update', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated rate of ${selectedHistory?.indentNo}`);
            updateIndentSheet();
            updateRelatedSheets();
            setOpenDialog(false);
            historyUpdateForm.reset({ rate: undefined });

            // Refresh history — only show Three Party flow approvals
            const [threePartyApprovals, rateUpdatesRefresh] = await Promise.all([
                fetchFromSupabasePaginated('three_party_approval', '*', { column: 'createdAt', options: { ascending: false } }),
                fetchFromSupabasePaginated('vendor_rate_update', '*', { column: 'createdAt', options: { ascending: false } })
            ]);
            const threePartyIndentNumbers = new Set(
                (rateUpdatesRefresh || []).map((r: any) => r.indentNumber || r.indent_number || '')
            );
            setHistoryData((threePartyApprovals || [])
                .filter((record: any) => threePartyIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendor: [record.approvedVendorName || '', record.approvedRate?.toString() || '0'] as [string, string],
                }))
            );
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
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
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
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date']}
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
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date']}
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
                    <DialogContent>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit, onError)}
                                className="space-y-5"
                            >
                                <DialogHeader className="space-y-1">
                                    <DialogTitle>Rate Approval</DialogTitle>
                                    <DialogDescription>
                                        Update vendor for{' '}
                                        <span className="font-medium">
                                            {selectedIndent.indentNo}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-muted py-2 px-5 rounded-md ">
                                    <div className="space-y-1">
                                        <p className="font-medium">Indenter</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.indenter}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium">Department</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.department}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium">Product</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.product}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    <FormField
                                        control={form.control}
                                        name="vendor"
                                        render={({ field }) => {
                                            // Calculate the lowest price among vendors with valid names and rates > 0
                                            const validVendors = selectedIndent.vendors.filter(v => v[0] && parseFloat(v[1]) > 0);
                                            const minRate = validVendors.length > 0 
                                                ? Math.min(...validVendors.map(v => parseFloat(v[1]))) 
                                                : null;

                                            return (
                                                <FormItem>
                                                    <FormLabel>Select a vendor</FormLabel>
                                                    <FormControl>
                                                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                                                            {selectedIndent.vendors.map(
                                                                (vendor, index) => {
                                                                    const isLowest = minRate !== null && vendor[0] && parseFloat(vendor[1]) === minRate;
                                                                    
                                                                    return (
                                                                        <FormItem key={index}>
                                                                            <FormLabel className={`flex items-center gap-4 border hover:bg-accent p-3 rounded-md cursor-pointer transition-all ${isLowest ? 'border-green-500 bg-green-50/30' : ''}`}>
                                                                                <FormControl>
                                                                                    <RadioGroupItem
                                                                                        value={`${index}`}
                                                                                    />
                                                                                </FormControl>
                                                                                <div className="font-normal w-full">
                                                                                    <div className="flex justify-between items-center w-full">
                                                                                        <div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <p className="font-medium text-base">
                                                                                                    {vendor[0]}
                                                                                                </p>
                                                                                                {isLowest && (
                                                                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200 uppercase tracking-wider">
                                                                                                        L1 (Lowest)
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <p className="text-xs text-muted-foreground">
                                                                                                Payment Term: {vendor[2]}
                                                                                            </p>
                                                                                        </div>
                                                                                        <p className={`text-base font-semibold ${isLowest ? 'text-green-700' : ''}`}>
                                                                                            ₹{vendor[1]}
                                                                                        </p>
                                                                                    </div>
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
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline">Close</Button>
                                    </DialogClose>

                                    <Button type="submit" disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting && (
                                            <Loader
                                                size={20}
                                                color="white"
                                                aria-label="Loading Spinner"
                                            />
                                        )}
                                        Update
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                )}

                {selectedHistory && (
                    <DialogContent>
                        <Form {...historyUpdateForm}>
                            <form onSubmit={historyUpdateForm.handleSubmit(onSubmitHistoryUpdate, onError)} className="space-y-7">
                                <DialogHeader className="space-y-1">
                                    <DialogTitle>Update Rate</DialogTitle>
                                    <DialogDescription>
                                        Update rate for{' '}
                                        <span className="font-medium">
                                            {selectedHistory.indentNo}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-3">
                                    <FormField
                                        control={historyUpdateForm.control}
                                        name="rate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Rate</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline">Close</Button>
                                    </DialogClose>

                                    <Button
                                        type="submit"
                                        disabled={historyUpdateForm.formState.isSubmitting}
                                    >
                                        {historyUpdateForm.formState.isSubmitting && (
                                            <Loader
                                                size={20}
                                                color="white"
                                                aria-label="Loading Spinner"
                                            />
                                        )}
                                        Update
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
