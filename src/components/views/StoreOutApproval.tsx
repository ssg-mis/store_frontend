import { useEffect, useState, useRef, useCallback } from 'react';
import { useSheets } from '@/context/SheetsContext';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Button } from '../ui/button';
import DataTable from '../element/DataTable';
import { fetchFromSupabasePaginated } from '@/lib/fetchers';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '../ui/input';
import { PuffLoader as Loader } from 'react-spinners';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { PackageCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { formatDate, debounce } from '@/lib/utils';
import { Pill } from '../ui/pill';
import { DownloadOutlined } from "@ant-design/icons";
import * as XLSX from 'xlsx';
import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import { postToSheet } from '@/lib/fetchers';

interface StoreOutTableData {
    id: number;
    indentNo: string;
    firm: string;
    department: string;
    product: string;
    date: string;
    planned: string;
    indenter: string;
    areaOfUse: string;
    quantity: number;
    uom: string;
    specifications: string;
    attachment: string;
    validityDate: string;
    indentType: string;
}
interface HistoryData {
    approvalDate: string;
    indentNo: string;
    firm: string;
    department: string;
    product: string;
    date: string;
    indenter: string;
    areaOfUse: string;
    quantity: number;
    uom: string;
    issuedStatus: string;
    requestedQuantity: number;
    issueApprovedBy: string;
    validityDate: string;
    indentType: string;
}

export default ({ mode = 'store-out' }: { mode?: 'store-out' | 'loan' }) => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();
    const [openDialog, setOpenDialog] = useState(false);
    const [tableData, setTableData] = useState<StoreOutTableData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [selectedIndent, setSelectedIndent] = useState<StoreOutTableData | null>(null);
    const [rejecting, setRejecting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mainTab, setMainTab] = useState(mode === 'loan' ? 'loan-out' : 'store-out');

    useEffect(() => {
        setMainTab(mode === 'loan' ? 'loan-out' : 'store-out');
    }, [mode]);

    // Filter states (kept for FilterBar options)
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

    const getIndentTypeQuery = useCallback(() => {
        if (mainTab === 'store-out') return ['Store Out'];
        if (mainTab === 'store-out-return') return ['Store Out Return'];
        if (mainTab === 'loan-out') return ['Loan Out'];
        if (mainTab === 'loan-out-return') return ['Loan Out Return'];
        return ['Store Out'];
    }, [mainTab]);

    const getDisplayValidityDate = (record: any) => {
        const indentType = record.indentType || record.indent_type || (mainTab === 'loan-out' ? 'Loan Out' : '');
        const validitySource = indentType === 'Loan Out'
            ? (record.coolOffPeriod || record.cool_off_period || record.validityDate)
            : record.validityDate;

        return validitySource ? formatDate(new Date(validitySource)) : '—';
    };

    const fetchPendingData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (pendingAbortRef.current) pendingAbortRef.current.abort();
        const controller = new AbortController();
        pendingAbortRef.current = controller;

        if (!append) setPendingSearching(true);
        else setPendingLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                {
                    page: pageValue,
                    limit: 50,
                    search: searchQuery,
                    status: 'StoreOutPending',
                    indentType: getIndentTypeQuery(),
                    abortSignal: controller.signal
                }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    planned: record.planned || '',
                    areaOfUse: record.areaOfUse || '',
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || 'Not specified',
                    attachment: record.attachment || 'N/A',
                    validityDate: getDisplayValidityDate(record),
                    indentType: record.indentType || (
                        mainTab === 'store-out' ? 'Store Out'
                        : mainTab === 'store-out-return' ? 'Store Out Return'
                        : mainTab === 'loan-out' ? 'Loan Out'
                        : 'Loan Out Return'
                    ),
                }));
                const normalizedData = mappedData;
                setTableData(prev => append ? [...prev, ...normalizedData] : normalizedData);
                setPendingTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching Store Out Pending:', error);
        } finally {
            if (!controller.signal.aborted) {
                setPendingInitialLoading(false);
                setPendingSearching(false);
                setPendingLoadingMore(false);
            }
        }
    }, [getIndentTypeQuery, mainTab]);

    const fetchHistoryData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (historyAbortRef.current) historyAbortRef.current.abort();
        const controller = new AbortController();
        historyAbortRef.current = controller;

        if (!append) setHistorySearching(true);
        else setHistoryLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                {
                    page: pageValue,
                    limit: 50,
                    search: searchQuery,
                    status: 'StoreOutHistory',
                    indentType: getIndentTypeQuery(),
                    abortSignal: controller.signal
                }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    approvalDate: record.actual_6 ? formatDate(new Date(record.actual_6)) : '',
                    indentNo: record.indentNumber || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    planned: record.planned || '',
                    areaOfUse: record.areaOfUse || '',
                    quantity: record.issued_quantity || 0,
                    requestedQuantity: record.quantity || 0,
                    uom: record.uom || '',
                    issuedStatus: record.issue_status || '',
                    issueApprovedBy: record.issue_approved_by || '',
                    validityDate: getDisplayValidityDate(record),
                    indentType: record.indentType || (
                        mainTab === 'store-out' ? 'Store Out'
                        : mainTab === 'store-out-return' ? 'Store Out Return'
                        : mainTab === 'loan-out' ? 'Loan Out'
                        : 'Loan Out Return'
                    ),
                }));
                const normalizedData = mappedData;
                setHistoryData(prev => append ? [...prev, ...normalizedData] : normalizedData);
                setHistoryTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching Store Out History:', error);
        } finally {
            if (!controller.signal.aborted) {
                setHistoryInitialLoading(false);
                setHistorySearching(false);
                setHistoryLoadingMore(false);
            }
        }
    }, [getIndentTypeQuery, mainTab]);

    const fetchData = useCallback(async () => {
        await Promise.all([fetchPendingData(1, ''), fetchHistoryData(1, '')]);
    }, [fetchPendingData, fetchHistoryData]);

    useEffect(() => {
        // Clear data and set initial loading on tab switch
        setTableData([]);
        setHistoryData([]);
        setPendingInitialLoading(true);
        setHistoryInitialLoading(true);
        setPendingPage(1);
        setHistoryPage(1);

        fetchData();
        return () => {
            pendingAbortRef.current?.abort();
            historyAbortRef.current?.abort();
        };
    }, [mainTab, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const onDownloadClick = async () => {
        setLoading(true);
        try {
            const workbook = XLSX.utils.book_new();

            const worksheetData = tableData.map(item => ({
                'Indent No.': item.indentNo,
                'Indenter': item.indenter,
                'Department': item.department,
                'Item': item.product,
                'Date': item.date,
                'Area of Use': item.areaOfUse,
                'Quantity': item.quantity,
                'UOM': item.uom,
                'Validity Date': item.validityDate,
                'Specifications': item.specifications,
                'Attachment': item.attachment || 'No attachment'
            }));

            const worksheet = XLSX.utils.json_to_sheet(worksheetData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Store Out Pending');

            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `Store_Out_Pending_${currentDate}.xlsx`;

            XLSX.writeFile(workbook, filename);
            toast.success('Excel file downloaded successfully!');
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Failed to download Excel file');
        } finally {
            setLoading(false);
        }
    };

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

    const displayPendingData = filteredTableData.filter(item => {
        if (mainTab === 'store-out') return item.indentType === 'Store Out';
        if (mainTab === 'store-out-return') return item.indentType === 'Store Out Return';
        if (mainTab === 'loan-out') return item.indentType === 'Loan Out';
        if (mainTab === 'loan-out-return') return item.indentType === 'Loan Out Return';
        return false;
    });

    const displayHistoryData = filteredHistoryData.filter(item => {
        if (mainTab === 'store-out') return item.indentType === 'Store Out';
        if (mainTab === 'store-out-return') return item.indentType === 'Store Out Return';
        if (mainTab === 'loan-out') return item.indentType === 'Loan Out';
        if (mainTab === 'loan-out-return') return item.indentType === 'Loan Out Return';
        return false;
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
                        <span className="font-semibold text-muted-foreground mr-1">Product:</span>
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
    const columns: ColumnDef<StoreOutTableData>[] = [
        ...(user.storeOutApprovalAction
            ? [
                {
                    header: 'Actions',
                    id: 'actions',
                    cell: ({ row }: { row: Row<StoreOutTableData> }) => {
                        const indent = row.original;

                        return (
                            <div className="flex justify-center">
                                <Button
                                    variant="outline"
                                    disabled={rejecting}
                                    onClick={() => {
                                        setSelectedIndent(indent);
                                        setOpenDialog(true);
                                    }}
                                >
                                    {rejecting && (
                                        <Loader
                                            size={20}
                                            color="white"
                                            aria-label="Loading Spinner"
                                        />
                                    )}
                                    Update
                                </Button>
                            </div>
                        );
                    },
                },
            ]
            : []),
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'firm', header: 'Firm' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'quantity', header: 'Quantity' },
        { accessorKey: 'date', header: 'Date' },
        { accessorKey: 'specifications', header: 'Specifications' },
        {
            accessorKey: 'attachment',
            header: 'Attachment',
            cell: ({ row }) => {
                const attachment = row.original.attachment;
                return attachment && attachment !== 'N/A' ? (
                    <a href={attachment} target="_blank">
                        Attachment
                    </a>
                ) : (
                    <span>N/A</span>
                );
            },
        },
    ];


    const historyColumns: ColumnDef<HistoryData>[] = [
        { accessorKey: "indentNo", header: "Indent No." },
        { accessorKey: "firm", header: "Firm" },
        { accessorKey: "indenter", header: "Indenter" },
        { accessorKey: "department", header: "Department" },
        { accessorKey: "product", header: "Product" },
        { accessorKey: "uom", header: "UOM" },
        { accessorKey: "quantity", header: "Issued Quantity" },
        { accessorKey: "requestedQuantity", header: "Requested Quantity" },
        { accessorKey: "issueApprovedBy", header: "Issue Approved By" },
        { accessorKey: "date", header: "Request Date" },
        { accessorKey: "approvalDate", header: "Approval Date" },
        {
            accessorKey: "issuedStatus",
            header: "Issued Status",
            cell: ({ row }) => {
                const status = row.original.issuedStatus;
                const variant = status === "Rejected" ? "reject" : "secondary";
                return <Pill variant={variant}>{status}</Pill>;
            },
        },
    ];


    // Create approval form
    const schema = z.object({
        issueApprovedBy: z.string().nonempty('Approved By is required'),
        issueStatus: z.enum(['Done', 'Not done']),
        issuedQuantity: z.number().min(0, 'Quantity must be positive'),
    }).refine(
        (values) => !selectedIndent || values.issuedQuantity <= selectedIndent.quantity,
        {
            path: ['issuedQuantity'],
            message: `Issued quantity cannot exceed requested quantity (${selectedIndent?.quantity ?? 0})`,
        }
    );

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: {
            issueApprovedBy: '',
            issueStatus: 'Done',
            issuedQuantity: 0,
        },
    });

    useEffect(() => {
        if (selectedIndent) {
            form.reset({
                issueApprovedBy: '',
                issueStatus: 'Done',
                issuedQuantity: selectedIndent.quantity,
            });
        }
    }, [selectedIndent, form]);

    const calculateStoreOutDelay = (plannedDateStr: string | null) => {
        if (!plannedDateStr) return "00:00:00";
        try {
            const now = new Date();
            const planned = new Date(plannedDateStr);
            if (isNaN(planned.getTime())) return "00:00:00";

            const diffMs = now.getTime() - planned.getTime();
            if (diffMs <= 0) return "00:00:00";

            const totalSeconds = Math.floor(diffMs / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } catch (e) {
            return "00:00:00";
        }
    };

    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            const now = new Date();
            const timestamp = now.toISOString();

            const updateData = {
                id: selectedIndent?.id,
                indentNumber: selectedIndent?.indentNo,
                actual_6: timestamp,
                issueApprovedBy: values.issueApprovedBy,
                issueStatus: values.issueStatus,
                issuedQuantity: values.issuedQuantity,
            };

            const result = await postToSheet([updateData], 'update', 'INDENT');

            if (result.success) {
                const delay = calculateStoreOutDelay(selectedIndent?.planned || null);
                const plannedDate = selectedIndent?.planned ? new Date(selectedIndent.planned) : null;

                const approvalData = {
                    indent_id: selectedIndent?.id,
                    issueApprovedBy: values.issueApprovedBy,
                    issueStatus: values.issueStatus,
                    issuedQuantity: values.issuedQuantity,
                    delay: delay,
                    planned: plannedDate,
                };
                const sheetName = selectedIndent?.indentType === 'Loan Out' ? 'LOAN' : 'STORE OUT APPROVAL';
                const approvalResult = await postToSheet([approvalData], 'insert', sheetName);

                if (!approvalResult.success) {
                    toast.error(`Inventory update failed: ${(approvalResult.error as any)?.message || 'Could not save approval record'}`);
                    return;
                }

                toast.success(`Updated ${
                    mainTab === 'loan-out' ? 'loan out'
                    : mainTab === 'loan-out-return' ? 'loan out return'
                    : mainTab === 'store-out-return' ? 'store out return'
                    : 'store out'
                } approval status of ${selectedIndent?.indentNo}`);
                updateIndentSheet();
                updateRelatedSheets();
                setOpenDialog(false);
                form.reset();
                fetchData();
            } else {
                toast.error((result.error as any)?.message || 'Failed to update status');
            }
        } catch (error) {
            console.error('Update error:', error);
            toast.error('An error occurred');
        }
    }

    function onError(errors: any) {
        console.log(errors);
        const firstError = Object.values(errors)[0] as any;
        toast.error(firstError?.message || 'Please fill all required fields');
    }

    return (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
                <div className="px-5 pt-4">
                    <TabsList className="grid w-full grid-cols-2 shadow-sm border">
                        {mode === 'store-out' ? (
                            <>
                                <TabsTrigger value="store-out">Store Out</TabsTrigger>
                                <TabsTrigger value="store-out-return">Store Out Return</TabsTrigger>
                            </>
                        ) : (
                            <>
                                <TabsTrigger value="loan-out">Loan Out</TabsTrigger>
                                <TabsTrigger value="loan-out-return">Loan Out Return</TabsTrigger>
                            </>
                        )}
                    </TabsList>
                </div>

                <TabsContent value="store-out">
                    <Tabs defaultValue="pending">
                        <Heading heading="Store Out Approval" subtext="Approve store out requests" tabs>
                            <PackageCheck size={50} className="text-primary" />
                        </Heading>
                        <TabsContent value="pending">
                            <DataTable
                                data={displayPendingData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'uom', 'specifications']}
                                dataLoading={pendingInitialLoading}
                                isSearching={pendingSearching}
                                totalCount={pendingTotal}
                                currentPage={pendingPage}
                                onPageChange={(page) => { setPendingPage(page); fetchPendingData(page, pendingSearch, false); }}
                                onSearchChange={debouncedPendingSearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                        <Button variant="default" onClick={onDownloadClick} className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8">
                                            <DownloadOutlined />
                                            {loading ? "Downloading..." : "Download"}
                                        </Button>
                                    </div>
                                }
                            />
                        </TabsContent>
                        <TabsContent value="history">
                            <DataTable
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={historyInitialLoading}
                                isSearching={historySearching}
                                totalCount={historyTotal}
                                currentPage={historyPage}
                                onPageChange={(page) => { setHistoryPage(page); fetchHistoryData(page, historySearch, false); }}
                                onSearchChange={debouncedHistorySearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={<FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />}
                            />
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="store-out-return">
                    <Tabs defaultValue="pending">
                        <Heading heading="Store Out Return" subtext="Manage returned items" tabs>
                            <PackageCheck size={50} className="text-primary" />
                        </Heading>
                        <TabsContent value="pending">
                            <DataTable
                                data={displayPendingData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'uom', 'specifications']}
                                dataLoading={pendingInitialLoading}
                                isSearching={pendingSearching}
                                totalCount={pendingTotal}
                                currentPage={pendingPage}
                                onPageChange={(page) => { setPendingPage(page); fetchPendingData(page, pendingSearch, false); }}
                                onSearchChange={debouncedPendingSearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                        <Button variant="default" onClick={onDownloadClick} className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8">
                                            <DownloadOutlined />
                                            {loading ? "Downloading..." : "Download"}
                                        </Button>
                                    </div>
                                }
                            />
                        </TabsContent>
                        <TabsContent value="history">
                            <DataTable
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={historyInitialLoading}
                                isSearching={historySearching}
                                totalCount={historyTotal}
                                currentPage={historyPage}
                                onPageChange={(page) => { setHistoryPage(page); fetchHistoryData(page, historySearch, false); }}
                                onSearchChange={debouncedHistorySearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={<FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />}
                            />
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="loan-out">
                    <Tabs defaultValue="pending">
                        <Heading heading="Loan Out" subtext="Manage loan out requests" tabs>
                            <PackageCheck size={50} className="text-primary" />
                        </Heading>
                        <TabsContent value="pending">
                            <DataTable
                                data={displayPendingData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'uom', 'specifications']}
                                dataLoading={pendingInitialLoading}
                                isSearching={pendingSearching}
                                totalCount={pendingTotal}
                                currentPage={pendingPage}
                                onPageChange={(page) => { setPendingPage(page); fetchPendingData(page, pendingSearch, false); }}
                                onSearchChange={debouncedPendingSearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                        <Button variant="default" onClick={onDownloadClick} className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8">
                                            <DownloadOutlined />
                                            {loading ? "Downloading..." : "Download"}
                                        </Button>
                                    </div>
                                }
                            />
                        </TabsContent>
                        <TabsContent value="history">
                            <DataTable
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={historyInitialLoading}
                                isSearching={historySearching}
                                totalCount={historyTotal}
                                currentPage={historyPage}
                                onPageChange={(page) => { setHistoryPage(page); fetchHistoryData(page, historySearch, false); }}
                                onSearchChange={debouncedHistorySearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={<FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />}
                            />
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="loan-out-return">
                    <Tabs defaultValue="pending">
                        <Heading heading="Loan Out Return" subtext="Manage loan out returns" tabs>
                            <PackageCheck size={50} className="text-primary" />
                        </Heading>
                        <TabsContent value="pending">
                            <DataTable
                                data={displayPendingData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'uom', 'specifications']}
                                dataLoading={pendingInitialLoading}
                                isSearching={pendingSearching}
                                totalCount={pendingTotal}
                                currentPage={pendingPage}
                                onPageChange={(page) => { setPendingPage(page); fetchPendingData(page, pendingSearch, false); }}
                                onSearchChange={debouncedPendingSearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                        <Button variant="default" onClick={onDownloadClick} className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8">
                                            <DownloadOutlined />
                                            {loading ? "Downloading..." : "Download"}
                                        </Button>
                                    </div>
                                }
                            />
                        </TabsContent>
                        <TabsContent value="history">
                            <DataTable
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={historyInitialLoading}
                                isSearching={historySearching}
                                totalCount={historyTotal}
                                currentPage={historyPage}
                                onPageChange={(page) => { setHistoryPage(page); fetchHistoryData(page, historySearch, false); }}
                                onSearchChange={debouncedHistorySearch}
                                pagination={true}
                                pageSize={50}
                                extraActions={<FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />}
                            />
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>
            {selectedIndent && (
                <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-5">
                            <DialogHeader className="space-y-1">
                                <DialogTitle>
                                    {mainTab === 'loan-out'
                                        ? 'Loan Out Request'
                                        : mainTab === 'loan-out-return'
                                            ? 'Loan Out Return Request'
                                            : mainTab === 'store-out-return'
                                                ? 'Store Out Return Request'
                                                : 'Approve Store Out Request'}
                                </DialogTitle>
                                <DialogDescription>
                                    {mainTab === 'loan-out'
                                        ? 'Approve Loan Out Request'
                                        : mainTab === 'loan-out-return'
                                            ? 'Approve Loan Out Return Request'
                                            : mainTab === 'store-out-return'
                                                ? 'Approve Store Out Return Request'
                                                : 'Approve Store Out Request'}{' '}
                                    <span className="font-medium">{selectedIndent.indentNo}</span>
                                </DialogDescription>
                            </DialogHeader>
                            <div className="rounded-lg border overflow-hidden">
                                <div className="bg-primary px-4 py-2 flex items-center justify-between">
                                    <span className="text-sm font-bold text-primary-foreground tracking-wide">{selectedIndent.indentNo}</span>
                                    {selectedIndent.indentType && (
                                        <span className="text-[11px] bg-primary-foreground/20 text-primary-foreground rounded-full px-2 py-0.5 font-medium">
                                            {selectedIndent.indentType}
                                        </span>
                                    )}
                                </div>
                                <div className="bg-muted/30 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                                    {[
                                        { label: 'Indenter',      value: selectedIndent.indenter },
                                        { label: 'Department',    value: selectedIndent.department },
                                        { label: 'Area of Use',   value: selectedIndent.areaOfUse },
                                        { label: 'Date',          value: selectedIndent.date },
                                        { label: 'Item',          value: selectedIndent.product },
                                        { label: 'Quantity',      value: String(selectedIndent.quantity) },
                                        { label: 'UOM',           value: selectedIndent.uom },
                                        { label: 'Validity Date', value: selectedIndent.validityDate },
                                        { label: 'Specifications',value: selectedIndent.specifications },
                                    ].map(({ label, value }) =>
                                        value ? (
                                            <div key={label} className="flex flex-col">
                                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                                <span className="text-xs font-medium text-foreground mt-0.5">{value}</span>
                                            </div>
                                        ) : null
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="issueApprovedBy"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Issue Approved By</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter approved by" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="issueStatus"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Issue Status</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select status" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="Done">Done</SelectItem>
                                                    <SelectItem value="Not done">Not done</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="issuedQuantity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Issued Quantity</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    placeholder="Enter quantity"
                                                    max={selectedIndent?.quantity}
                                                    {...field}
                                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
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
                                    Approve
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            )}
        </Dialog>
    );
};
