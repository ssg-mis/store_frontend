import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import DataTable from '../element/DataTable';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DownloadOutlined } from "@ant-design/icons";
import * as XLSX from 'xlsx';
import { uploadFile, fetchFromSupabasePaginated, postToSheet } from '@/lib/fetchers';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Truck, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent } from '../ui/tabs';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { formatDate, debounce } from '@/lib/utils';
import { useSheets } from '@/context/SheetsContext';
import { Pill } from '../ui/pill';

interface RecieveItemsData {
    id: number;
    poDate: string;
    poNumber: string;
    vendor: string;
    indentNumber: string;
    firm: string;
    product: string;
    productCode: string;
    uom: string;
    quantity: number;
    rate?: number;
    receivedQty?: number;
    remainingQty?: number;
    poCopy: string;
    totalAmount?: number;
    quotationNo?: string;
    quotationDate?: string;
    transportType?: string;
    approvedActualTime?: number | null;
    leadTime?: string | null;
}

interface HistoryData {
    indentNumber: string;
    productCode: string;
    firm: string;
    poNumber: string;
    vendor: string;
    product: string;
    uom: string;
    orderQuantity: number;
    receivedDate: string;
    receivedQuantity: number;
    purchaseReturn: number;
    damagedQuantity: number;
    remainingQty?: number;
    createdAtRaw?: string;
    grnNumber?: string;
    photoOfProduct: string;
    billStatus: string;
    billNumber: string;
    billAmount: number;
    typeOfBill?: string;
    paymentType?: string;
    discountAmount?: number;
    advanceAmount?: number;
    leadTimeToLiftMaterial?: string;
    photoOfBill: string;
}

const ReceiveItems = () => {
    const [localIndentLoading, setLocalIndentLoading] = useState(false);
    const [localReceivedLoading, setLocalReceivedLoading] = useState(false);
    const { user } = useAuth();
    const { updateIndentSheet, updateReceivedSheet, updateRelatedSheets } = useSheets();
    const PAYMENT_TERMS = ['ADVANCE', 'CASH', 'BANK', 'ONLINE'];

    const [tableData, setTableData] = useState<RecieveItemsData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [selectedIndent, setSelectedIndent] = useState<RecieveItemsData | null>(null);
    const [matchingIndents, setMatchingIndents] = useState<RecieveItemsData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [historyViewGroup, setHistoryViewGroup] = useState<{
        poNumber: string; vendor: string; receivedDate: string; billStatus: string; items: HistoryData[];
    } | null>(null);

    // Filter states (kept for FilterBar options)
    const [pendingFilters, setPendingFilters] = useState({
        product: 'All',
        vendor: 'All',
    });
    const [historyFilters, setHistoryFilters] = useState({
        product: 'All',
        vendor: 'All',
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
            const indentData: any = await fetchFromSupabasePaginated('indent', '*',
                { column: 'planned_5', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, status: 'ReceivePending', abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (indentData && indentData.items) {
                const mappedData = indentData.items.map((indent: any) => {
                    const po = indent.poMasters?.[0] || {};
                    const poQty = Number(po.quantity) || 0;
                    const receivedRecords = indent.received || [];
                    const totalReceived = receivedRecords.reduce((sum: number, r: any) => sum + Number(r.receivedQuantity || 0) + Number(r.damagedQuantity || 0) + Number(r.purchaseReturn || 0), 0);
                    const remainingQty = poQty - totalReceived;

                    return {
                        id: indent.id,
                        indentNumber: indent.indentNumber || '',
                        poNumber: po.poNumber || '',
                        uom: po.unit || indent.uom || '',
                        poCopy: po.pdf || '',
                        vendor: po.partyName || indent.approvedVendorName || '',
                        productCode: indent.productCode || '',
                        quantity: poQty,
                        rate: Number(po.rate) || 0,
                        remainingQty: remainingQty > 0 ? remainingQty : 0,
                        poDate: po.createdAt || '',
                        product: indent.productName || po.product || '',
                        firm: indent.firm || 'N/A',
                        totalAmount: Number(po.totalPOAmount) || 0,
                        quotationNo: po.quotationNumber || 'N/A',
                        quotationDate: po.quotationDate || '',
                        transportType: po.transportationType || 'N/A',
                        approvedActualTime: indent.approvedActualTime ?? null,
                        leadTime: po.leadTime || po.lead_time || null,
                    };
                });

                const filteredData = mappedData.filter(item => item.remainingQty > 0);
                setTableData(prev => append ? [...prev, ...filteredData] : filteredData);
                setPendingTotal(indentData.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching pending items:', error);
        } finally {
            if (!controller.signal.aborted) {
                setPendingInitialLoading(false);
                setPendingSearching(false);
                setPendingLoadingMore(false);
            }
        }
    }, [tableData.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchHistoryData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (historyAbortRef.current) historyAbortRef.current.abort();
        const controller = new AbortController();
        historyAbortRef.current = controller;

        if (!append && historyData.length === 0) setHistoryInitialLoading(true);
        else if (!append) setHistorySearching(true);
        else setHistoryLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('received', '*',
                { column: 'createdAt', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 100, search: searchQuery, abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((receivedRecord: any) => {
                    const indentNum = receivedRecord.indentNumber || receivedRecord.indent_number || '';
                    return {
                        indentNumber: indentNum,
                        productCode: receivedRecord.indent?.productCode || '',
                        poNumber: receivedRecord.poNumber || receivedRecord.po_number || '',
                        vendor: receivedRecord.vendor || '',
                        product: receivedRecord.product || '',
                        uom: receivedRecord.uom || '',
                        firm: receivedRecord.indent?.firm || 'N/A',
                        orderQuantity: Number(receivedRecord.orderQuantity) || 0,
                        createdAtRaw: receivedRecord.createdAt || '',
                        receivedDate: receivedRecord.createdAt ? formatDate(new Date(receivedRecord.createdAt)) : '',
                        receivedQuantity: Number(receivedRecord.receivedQuantity) || 0,
                        purchaseReturn: Number(receivedRecord.purchaseReturn) || 0,
                        damagedQuantity: Number(receivedRecord.damagedQuantity) || 0,
                        grnNumber: receivedRecord.grnNumber || '',
                        photoOfProduct: receivedRecord.photoOfProduct || '',
                        billStatus: receivedRecord.billStatus || '',
                        billNumber: receivedRecord.billNumber || '',
                        billAmount: Number(receivedRecord.billAmount) || 0,
                        photoOfBill: receivedRecord.photoOfBill || '',
                    };
                });
                setHistoryData(prev => append ? [...prev, ...mappedData] : mappedData);
                setHistoryTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching history items:', error);
        } finally {
            if (!controller.signal.aborted) {
                setHistoryInitialLoading(false);
                setHistorySearching(false);
                setHistoryLoadingMore(false);
            }
        }
    }, [historyData.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        return (pendingFilters.product === 'All' || item.product === pendingFilters.product) &&
               (pendingFilters.vendor === 'All' || item.vendor === pendingFilters.vendor);
    });

    const filteredHistoryData = historyData.filter(item => {
        return (historyFilters.product === 'All' || item.product === historyFilters.product) &&
               (historyFilters.vendor === 'All' || item.vendor === historyFilters.vendor);
    });

    const groupedPendingData = useMemo(() => {
        const groups = new Map<string, RecieveItemsData[]>();
        filteredTableData.forEach(item => {
            if (!groups.has(item.indentNumber)) groups.set(item.indentNumber, []);
            groups.get(item.indentNumber)!.push(item);
        });
        return Array.from(groups.entries()).map(([indentNumber, items]) => {
            const first = items[0];
            return { indentNumber, vendor: first.vendor, firm: first.firm, poNumber: first.poNumber, date: first.poDate ? formatDate(new Date(first.poDate)) : '', items };
        });
    }, [filteredTableData]);


    const FilterBar = ({ filters, setFilters, data }: { filters: any, setFilters: any, data: any[] }) => (
        <div className="flex flex-wrap items-center gap-1.5">
            <Select value={filters.product} onValueChange={(val) => setFilters({ ...filters, product: val })}>
                <SelectTrigger className="h-7 w-[160px] text-[11px] shadow-sm px-2">
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
            <Select value={filters.vendor} onValueChange={(val) => setFilters({ ...filters, vendor: val })}>
                <SelectTrigger className="h-7 w-[160px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Vendor:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'vendor').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );


    const handleDownload = (data: (RecieveItemsData | HistoryData)[]) => {
        if (!data || data.length === 0) {
            toast.error("No data to download");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Receive Items");
        XLSX.writeFile(workbook, `receive-items-${Date.now()}.xlsx`);
    };

    const onDownloadClick = async () => {
        setLoading(true);
        try {
            await handleDownload(tableData);
            toast.success("File downloaded successfully");
        } catch {
            toast.error("Failed to download file");
        } finally {
            setLoading(false);
        }
    };

    const groupedHistoryData = useMemo(() => {
        const groups = new Map<string, HistoryData[]>();
        filteredHistoryData.forEach(item => {
            const key = item.poNumber || item.indentNumber;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        });
        return Array.from(groups.entries()).map(([, items]) => {
            const first = items[0];
            return { poNumber: first.poNumber, vendor: first.vendor, receivedDate: first.receivedDate, billStatus: first.billStatus, items };
        });
    }, [filteredHistoryData]);

    const historyColumns: ColumnDef<any>[] = [
        {
            header: 'Action',
            cell: ({ row }) => (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHistoryViewGroup(row.original)}>
                    View
                </Button>
            ),
        },
        { accessorKey: 'poNumber', header: 'PO Number' },
        {
            header: 'GRN Number',
            cell: ({ row }) => {
                const grn = row.original.items?.[0]?.grnNumber;
                return grn
                    ? <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">{grn}</span>
                    : <span className="text-muted-foreground text-xs">—</span>;
            }
        },
        { accessorKey: 'vendor', header: 'Vendor' },
        { accessorKey: 'receivedDate', header: 'Date' },
        {
            header: 'Items',
            cell: ({ row }) => {
                const count = row.original.items.length;
                return (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {count} {count === 1 ? 'item' : 'items'}
                    </span>
                );
            },
        },
        {
            accessorKey: 'billStatus',
            header: 'Bill Status',
            cell: ({ row }) => (
                <Pill variant={row.original.billStatus === 'Received' ? 'primary' : 'secondary'}>
                    {row.original.billStatus || '—'}
                </Pill>
            ),
        },
    ];

    // Updated Schema — items are managed in local state, not in the form
    const schema = z.object({
        billStatus: z.string().min(1, 'Required'),
        billNo: z.string().min(1, 'Required'),
        billAmount: z.coerce.number().optional(),
        typeOfBill: z.string().optional(),
        paymentType: z.string().min(1, 'Required'),
        discountAmount: z.coerce.number().min(0).optional(),
        advanceAmount: z.coerce.number().min(0).optional(),
        leadTime: z.string().min(1, 'Required'),
        photoOfItem: z.instanceof(File, { message: 'Required' }),
        photoOfBill: z.instanceof(File, { message: 'Required' }).optional(),
    }).superRefine((data, ctx) => {
        if (data.billStatus === 'Received') {
            if (!data.billAmount || data.billAmount <= 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['billAmount'] });
            }
            if (!data.typeOfBill) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['typeOfBill'] });
            }
            if (!data.photoOfBill) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['photoOfBill'] });
            }
        }
    });

    // Local state for item quantities — avoids RHF dynamic array registration issues
    const [itemRows, setItemRows] = useState<Array<{ indentId: number; indentNumber: string; quantity: number; purchaseReturn: number; damagedQuantity: number; error?: string }>>([]);

    const updateItemRow = (indentId: number, field: 'quantity' | 'purchaseReturn' | 'damagedQuantity', value: number) => {
        setItemRows(prev => prev.map((row) => {
            if (row.indentId !== indentId) return row;
            const updated = { ...row, [field]: value };
            const pendingQty = matchingIndents.find(i => i.id === indentId)?.remainingQty || 0;
            const usableQty = updated.quantity - updated.purchaseReturn;

            // Validate — each field is a subset of the one above it
            if (updated.quantity > pendingQty) {
                updated.error = `Received qty (${updated.quantity}) cannot exceed pending qty (${pendingQty})`;
            } else if (updated.purchaseReturn > updated.quantity) {
                updated.error = `Purchase return (${updated.purchaseReturn}) cannot exceed received qty (${updated.quantity})`;
            } else if (updated.damagedQuantity > usableQty) {
                updated.error = `Damaged qty (${updated.damagedQuantity}) cannot exceed usable qty after return (${usableQty})`;
            } else {
                updated.error = undefined;
            }

            return updated;
        }));
    };


    // Updated Form
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            billStatus: 'Received',
            billNo: '',
            billAmount: undefined,
            typeOfBill: '',
            paymentType: '',
            discountAmount: 0,
            advanceAmount: 0,
            leadTime: '',
            photoOfItem: undefined as unknown as File,
            photoOfBill: undefined as unknown as File,
        },
    });

    // Updated useEffect for matching indents
    useEffect(() => {
        if (selectedIndent && openDialog) {
            // Only initialize if we haven't already for this PO, or if poNumber changed
            const matching = tableData.filter(
                (item) => item.poNumber === selectedIndent.poNumber
            );
            
            setMatchingIndents(matching);

            // Pre-fill lead time from saved PO value
            if (selectedIndent.leadTime) {
                form.setValue('leadTime', selectedIndent.leadTime);
            }

            // Only set itemRows if they are empty or for a different PO to avoid resets while typing
            setItemRows(prev => {
                const firstRow = prev[0];
                const isSamePO = firstRow && matching.some(m => m.poNumber === selectedIndent.poNumber);
                if (isSamePO && prev.length === matching.length) return prev;
                
                return matching.map(indent => ({
                    indentId: indent.id,
                    indentNumber: indent.indentNumber,
                    quantity: indent.remainingQty || 0,
                    purchaseReturn: 0,
                    damagedQuantity: 0,
                }));
            });
        } else if (!openDialog) {
            setMatchingIndents([]);
            setItemRows([]);
            form.reset();
        }
    }, [selectedIndent, openDialog, tableData]);

    // Updated onSubmit
    async function onSubmit(values: z.infer<typeof schema>) {
        // Validate item rows (managed in local state, not form)
        const hasError = itemRows.some(r => r.error);
        if (hasError) {
            toast.error('Fix quantity errors before submitting');
            return;
        }
        const itemsToReceive = itemRows.filter(item => item.quantity > 0 || item.purchaseReturn > 0);

        if (itemsToReceive.length === 0) {
            toast.error('Please enter quantity for at least one item');
            return;
        }

        try {
            setLoading(true);

            // Photo uploads
            let itemPhotoUrl = '';
            if (values.photoOfItem) {
                itemPhotoUrl = await uploadFile(values.photoOfItem, 'received_item', 'upload');
            }

            let billPhotoUrl = '';
            if (values.photoOfBill) {
                billPhotoUrl = await uploadFile(values.photoOfBill, 'bill_photo', 'upload');
            }

            const nowIso = new Date().toISOString();

            // Insert received items — use index-based lookup so each product maps correctly
            const receivedRows = itemsToReceive.map((item) => {
                const originalItem = matchingIndents.find(i => i.id === item.indentId)
                    ?? matchingIndents[itemRows.indexOf(item)];
                const goodQuantity = item.quantity - (item.purchaseReturn || 0) - (item.damagedQuantity || 0);

                return {
                    indent_id: item.indentId,
                    poNumber: selectedIndent?.poNumber || '',
                    vendor: selectedIndent?.vendor || '',
                    product: originalItem?.product || '',
                    uom: originalItem?.uom || '',
                    receivedQuantity: goodQuantity,
                    purchaseReturn: item.purchaseReturn || 0,
                    damagedQuantity: item.damagedQuantity || 0,
                    photoOfProduct: itemPhotoUrl,
                    billStatus: values.billStatus,
                    billNumber: values.billNo,
                    billAmount: values.billAmount,
                    typeOfBill: values.typeOfBill,
                    paymentType: values.paymentType,
                    discountAmount: values.discountAmount,
                    advanceAmount: values.advanceAmount,
                    leadTimeToLiftMaterial: values.leadTime,
                    photoOfBill: billPhotoUrl,
                    planned: nowIso,
                };
            });

            const recResult = await postToSheet(receivedRows, 'insert', 'RECEIVED');
            if (!recResult.success) throw new Error('Failed to save received records');

            toast.success('Items received successfully');
            
            // Update context and local data
            updateIndentSheet(); 
            updateReceivedSheet();
            updateRelatedSheets();
            
            setOpenDialog(false);
            
            // Refresh local data
            await fetchData();

        } catch (error: any) {
            console.error('Error submitting received items:', error);
            toast.error('Error: ' + error.message);
        } finally {
            setLoading(false);
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
                        heading="Receive Items"
                        subtext="Receive items from purchase orders"
                        tabs
                    >
                        <Truck size={50} className="text-primary" />
                    </Heading>

                    <TabsContent value="pending">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            placeholder="Search indents..."
                                            className="pl-8 h-8 text-xs w-[200px]"
                                            onChange={(e) => debouncedPendingSearch(e.target.value)}
                                        />
                                    </div>
                                    <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                                </div>
                                <Button
                                    variant="default"
                                    onClick={onDownloadClick}
                                    style={{
                                        background: "linear-gradient(90deg, #4CAF50, #2E7D32)",
                                        border: "none",
                                        borderRadius: "8px",
                                        padding: "0 16px",
                                        fontWeight: "bold",
                                        boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                    }}
                                >
                                    <DownloadOutlined />
                                    {loading ? "Downloading..." : "Download"}
                                </Button>
                            </div>

                            {pendingSearching && (
                                <div className="w-full h-0.5 bg-primary/20 rounded-full overflow-hidden">
                                    <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
                                </div>
                            )}

                            {pendingInitialLoading ? (
                                <div className="space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                                    ))}
                                </div>
                            ) : groupedPendingData.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                                    No pending items found
                                </div>
                            ) : (
                                <div className="rounded-md border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                {user.receiveItemView && <TableHead>Action</TableHead>}
                                                <TableHead>Indent No</TableHead>
                                                <TableHead>PO Number</TableHead>
                                                <TableHead>Vendor</TableHead>
                                                <TableHead>Firm</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Items</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupedPendingData.map(group => (
                                                <TableRow key={group.indentNumber}>
                                                    {user.receiveItemView && (
                                                        <TableCell>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-xs"
                                                                onClick={() => {
                                                                    setSelectedIndent(group.items[0]);
                                                                    setOpenDialog(true);
                                                                }}
                                                            >
                                                                Store In
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.indentNumber}</TableCell>
                                                    <TableCell className="text-xs sm:text-sm">{group.poNumber}</TableCell>
                                                    <TableCell className="text-xs sm:text-sm">{group.vendor}</TableCell>
                                                    <TableCell className="text-xs sm:text-sm">{group.firm}</TableCell>
                                                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.date}</TableCell>
                                                    <TableCell>
                                                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {!pendingInitialLoading && pendingTotal > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                                    <span>{tableData.length} of {pendingTotal} items</span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                            disabled={pendingPage === 1}
                                            onClick={() => { const p = pendingPage - 1; setPendingPage(p); fetchPendingData(p, pendingSearch, false); }}
                                        >Previous</Button>
                                        <span>Page {pendingPage}</span>
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                            disabled={tableData.length >= pendingTotal}
                                            onClick={() => { const p = pendingPage + 1; setPendingPage(p); fetchPendingData(p, pendingSearch, false); }}
                                        >Next</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="history">
                        <DataTable
                            data={groupedHistoryData}
                            columns={historyColumns}
                            searchFields={['poNumber', 'vendor']}
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
                    </TabsContent>
                </Tabs>

                {selectedIndent && (
                    <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit, onError)}
                                className="space-y-5"
                            >
                                <DialogHeader className="space-y-1">
                                    <DialogTitle>Receive & Bill Items</DialogTitle>
                                    <div className="flex items-center">
                                        <DialogDescription>
                                            Process receiving and billing for PO Number{' '}
                                            <span className="font-medium text-primary">
                                                {selectedIndent.poNumber}
                                            </span>
                                        </DialogDescription>
                                        {selectedIndent.poCopy && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="ml-8 h-7 shrink-0 text-[11px] font-bold flex items-center gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 shadow-sm"
                                                onClick={() => window.open(selectedIndent.poCopy, '_blank')}
                                            >
                                                <DownloadOutlined style={{ fontSize: '11px' }} /> View PO Copy
                                            </Button>
                                        )}
                                    </div>
                                </DialogHeader>

                                {/* PO Info Summary */}
                                <div className="bg-[#f0f7ff]/50 border border-blue-100/50 p-6 rounded-xl shadow-sm">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Vendor</p>
                                            <p className="text-sm font-bold text-slate-800 truncate" title={selectedIndent.vendor}>{selectedIndent.vendor}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Firm</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedIndent.firm}</p>
                                        </div>
                                        {selectedIndent.approvedActualTime != null && (
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Approved Delivery Time</p>
                                                <p className="text-sm font-bold text-slate-800">{selectedIndent.approvedActualTime} days</p>
                                            </div>
                                        )}
                                        {selectedIndent.leadTime && (
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Lead Time To Receive</p>
                                                <p className="text-sm font-bold text-slate-800">{selectedIndent.leadTime}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Item Receiving Table */}
                                <div className="border rounded-lg overflow-hidden shadow-sm">
                                    <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <Truck size={16} /> Items to Receive
                                        </h3>
                                        <span className="text-xs text-muted-foreground">
                                            Indent: <span className="font-mono font-semibold text-primary">{matchingIndents[0]?.indentNumber}</span>
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Product Code</th>
                                                    <th className="px-4 py-2 text-left">Item Name</th>
                                                    <th className="px-4 py-2 text-center">UOM</th>
                                                    <th className="px-4 py-2 text-center">Pending</th>
                                                    <th className="px-4 py-2 text-center w-[110px]">Receive Qty</th>
                                                    <th className="px-4 py-2 text-center w-[120px]">Purchase Return</th>
                                                    <th className="px-4 py-2 text-center w-[110px]">Damaged Qty</th>
                                                    <th className="px-4 py-2 text-center w-[90px]">Okay Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {matchingIndents.map((indent) => {
                                                    const row = itemRows.find(r => r.indentId === indent.id) || { quantity: 0, purchaseReturn: 0, damagedQuantity: 0, error: undefined as string | undefined };
                                                    return (
                                                        <tr key={indent.id} className="hover:bg-muted/30 transition-colors">
                                                            <td className="px-4 py-3 text-xs text-muted-foreground">{indent.productCode || '-'}</td>
                                                            <td className="px-4 py-3 max-w-[180px] truncate">{indent.product}</td>
                                                            <td className="px-4 py-3 text-center text-xs">{indent.uom}</td>
                                                            <td className="px-4 py-3 text-center font-medium text-blue-600">{indent.remainingQty}</td>
                                                            <td className="px-3 py-3">
                                                                <Input
                                                                    type="number"
                                                                    className="h-8 w-full text-center font-semibold"
                                                                    max={indent.remainingQty}
                                                                    min={0}
                                                                    value={row.quantity}


                                                                    onChange={e => updateItemRow(indent.id, 'quantity', Number(e.target.value) || 0)}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                <Input
                                                                    type="number"
                                                                    className="h-8 w-full text-center text-orange-700"
                                                                    min={0}
                                                                    value={row.purchaseReturn}


                                                                    onChange={e => updateItemRow(indent.id, 'purchaseReturn', Number(e.target.value) || 0)}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                <Input
                                                                    type="number"
                                                                    className={`h-8 w-full text-center ${row.error ? 'border-red-500' : ''}`}
                                                                    min={0}
                                                                    value={row.damagedQuantity}


                                                                    onChange={e => updateItemRow(indent.id, 'damagedQuantity', Number(e.target.value) || 0)}
                                                                />
                                                                {row.error && <p className="text-[10px] text-red-500 text-center mt-0.5 leading-tight">{row.error}</p>}
                                                            </td>
                                                            <td className="px-4 py-3 text-center font-semibold text-green-700">
                                                                {Math.max(0, row.quantity - row.purchaseReturn - row.damagedQuantity)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Billing Details Section */}
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1 flex items-center gap-2">
                                            <Search size={14} className="text-primary" /> Billing Details
                                        </h4>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                                            {/* Bill Status — always shown */}
                                            <FormField
                                                control={form.control}
                                                name="billStatus"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Bill Status <span className="text-red-500">*</span></FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 text-sm shadow-sm">
                                                                    <SelectValue placeholder="Select status" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="Received">Received</SelectItem>
                                                                <SelectItem value="Not Received">Not Received</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Challan / Bill Number — always shown, label depends on status */}
                                            <FormField
                                                control={form.control}
                                                name="billNo"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">
                                                            {form.watch('billStatus') === 'Received' ? 'Bill Number' : 'Challan Number'}
                                                            {' '}<span className="text-red-500">*</span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                className="h-10 text-sm shadow-sm"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Bill Amount + Type of Bill — only when Received */}
                                            {form.watch('billStatus') === 'Received' && (
                                                <>
                                                    <FormField
                                                        control={form.control}
                                                        name="billAmount"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs font-semibold">Bill Amount <span className="text-red-500">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" step="0.01" className="h-10 text-sm shadow-sm" {...field} />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="typeOfBill"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs font-semibold">Type of Bill <span className="text-red-500">*</span></FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="h-10 text-sm shadow-sm">
                                                                            <SelectValue placeholder="Select type" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="Regular">Regular</SelectItem>
                                                                        <SelectItem value="Cash">Cash</SelectItem>
                                                                        <SelectItem value="Urgent">Urgent</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </>
                                            )}

                                            {/* Payment Type — always shown */}
                                            <FormField
                                                control={form.control}
                                                name="paymentType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Payment Type <span className="text-red-500">*</span></FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 text-sm shadow-sm">
                                                                    <SelectValue placeholder="Select type" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {PAYMENT_TERMS.map((term) => (
                                                                    <SelectItem key={term} value={term}>{term}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Lead Time — always shown */}
                                            <FormField
                                                control={form.control}
                                                name="leadTime"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Actual time to receive material <span className="text-red-500">*</span></FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="e.g. 5 Days" className="h-10 text-sm shadow-sm" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Discount & Advance — always shown, optional */}
                                            <FormField
                                                control={form.control}
                                                name="discountAmount"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Discount Amount</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" className="h-9 text-sm bg-muted/20 border-dashed" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="advanceAmount"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Advance Amount</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" className="h-9 text-sm bg-muted/20 border-dashed" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Photos Section (Bottom) */}
                                <div className="bg-muted/30 p-4 rounded-lg border border-dashed border-muted-foreground/20">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                        <Truck size={14} className="text-primary" /> Attachment Photos
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="photoOfItem"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Photo of Received Items <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            className="h-10 text-xs shadow-sm bg-background cursor-pointer"
                                                            onChange={(e) => field.onChange(e.target.files?.[0])}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />

                                        {form.watch('billStatus') === 'Received' && (
                                            <FormField
                                                control={form.control}
                                                name="photoOfBill"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs">Photo of Invoice / Bill <span className="text-red-500">*</span></FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="file"
                                                                className="h-10 text-xs shadow-sm bg-background cursor-pointer"
                                                                onChange={(e) => field.onChange(e.target.files?.[0])}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>

                                <DialogFooter className="border-t pt-4">
                                    <DialogClose asChild>
                                        <Button variant="ghost" type="button" className="text-xs h-9">
                                            Cancel
                                        </Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={loading} className="h-9 px-6 font-semibold shadow-lg hover:shadow-xl transition-all">
                                        {loading ? (
                                            <>
                                                <Loader size={18} color="#ffffff" className="mr-2" />
                                                Processing...
                                            </>
                                        ) : (
                                            'Submit & Process'
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                )}
            </Dialog>

            {/* History detail dialog */}
            <Dialog open={!!historyViewGroup} onOpenChange={(open) => !open && setHistoryViewGroup(null)}>
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Received Items — {historyViewGroup?.poNumber}</DialogTitle>
                    </DialogHeader>

                    {/* GRN Badge */}
                    <div className="space-y-6 py-2">
                    {historyViewGroup?.items[0]?.grnNumber && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">GRN Number</span>
                                <span className="font-mono text-base font-bold text-emerald-800">{historyViewGroup.items[0].grnNumber}</span>
                            </div>
                        </div>
                    )}
                        {(() => {
                            const first = historyViewGroup?.items[0];
                            return (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-lg">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">PO Number</p>
                                        <p className="text-sm font-medium">{historyViewGroup?.poNumber}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vendor</p>
                                        <p className="text-sm font-medium">{historyViewGroup?.vendor}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date</p>
                                        <p className="text-sm font-medium">{historyViewGroup?.receivedDate}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bill Status</p>
                                        <Pill variant={historyViewGroup?.billStatus === 'Received' ? 'primary' : 'secondary'}>
                                            {historyViewGroup?.billStatus || '—'}
                                        </Pill>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bill / Challan No.</p>
                                        <p className="text-sm font-medium">{first?.billNumber || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bill Amount</p>
                                        <p className="text-sm font-medium">{first?.billAmount ? `₹${first.billAmount.toLocaleString()}` : '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Item Photo</p>
                                        {first?.photoOfProduct
                                            ? <a href={first.photoOfProduct} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-medium">View</a>
                                            : <p className="text-sm text-muted-foreground">—</p>}
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bill Photo</p>
                                        {first?.photoOfBill
                                            ? <a href={first.photoOfBill} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-medium">View</a>
                                            : <p className="text-sm text-muted-foreground">—</p>}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/20">
                                        <TableHead className="text-xs">Product Code</TableHead>
                                        <TableHead className="text-xs">Product</TableHead>
                                        <TableHead className="text-xs text-right">PO Qty</TableHead>
                                        <TableHead className="text-xs">UOM</TableHead>
                                        <TableHead className="text-xs text-right">Received Qty</TableHead>
                                        <TableHead className="text-xs text-right text-orange-600">Purchase Return</TableHead>
                                        <TableHead className="text-xs text-right">Damaged Qty</TableHead>
                                        <TableHead className="text-xs text-right">Okay Qty</TableHead>
                                        <TableHead className="text-xs text-right text-orange-600 font-semibold">Remaining Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(() => {
                                        const runningTotals: Record<string, number> = {};
                                        const sortedItems = historyViewGroup?.items.slice().sort((a, b) => {
                                            const prodCompare = (a.product || '').localeCompare(b.product || '');
                                            if (prodCompare !== 0) return prodCompare;
                                            // Chronological order (oldest first) within the same product
                                            return new Date(a.createdAtRaw).getTime() - new Date(b.createdAtRaw).getTime();
                                        }) || [];

                                        return sortedItems.map((item, i) => {
                                            const code = item.productCode || item.product || 'unknown';
                                            
                                            // receivedQuantity stored in DB = okay qty (good only)
                                            const okayQty = item.receivedQuantity;
                                            const grossReceived = item.receivedQuantity + item.damagedQuantity;

                                            // Remaining = PO Qty − (gross received + purchase return), matching pending view formula
                                            runningTotals[code] = (runningTotals[code] || 0) + grossReceived + (item.purchaseReturn || 0);
                                            
                                            const remainingQty = Math.max(0, item.orderQuantity - runningTotals[code]);
                                            
                                            return (
                                                <TableRow key={i}>
                                                    <TableCell className="text-xs font-mono">{item.productCode || '—'}</TableCell>
                                                    <TableCell className="text-xs font-medium max-w-[200px]">{item.product}</TableCell>
                                                    <TableCell className="text-xs text-right font-medium">{item.orderQuantity || '—'}</TableCell>
                                                    <TableCell className="text-xs">{item.uom}</TableCell>
                                                    <TableCell className="text-xs text-right">{grossReceived}</TableCell>
                                                    <TableCell className="text-xs text-right font-medium text-orange-600">{item.purchaseReturn}</TableCell>
                                                    <TableCell className="text-xs text-right">{item.damagedQuantity}</TableCell>
                                                    <TableCell className="text-xs text-right font-semibold text-green-700">
                                                        {okayQty}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-right font-semibold text-orange-600">
                                                        {remainingQty}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        });
                                    })()}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ReceiveItems;
