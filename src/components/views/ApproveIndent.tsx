
import { type ColumnDef } from '@tanstack/react-table';
import DataTable from '../element/DataTable';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { DownloadOutlined } from "@ant-design/icons";
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { fetchIndentMasterData, fetchFromSupabasePaginated, postToSheet, approveIndent } from '@/lib/fetchers';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { Tabs, TabsContent } from '../ui/tabs';
import { ClipboardCheck, PenSquare, Search, Send } from 'lucide-react';
import { formatDate, debounce } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import { usePageViewOnly } from '@/components/element/ViewOnlyGuard';
import Heading from '../element/Heading';
import { Pill } from '../ui/pill';
import { Input } from '../ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const statuses = ['Select', 'Reject', 'Three Party', 'Regular'];

interface ApproveTableData {
    id: number;
    indentNo: string;
    indentType: string;
    firm: string;
    indenter: string;
    department: string;
    areaOfUse: string;
    departmentHead: string;
    indentApprovedBy: string;
    product: string;
    productCode: string | null;
    productCategory: string;
    quantity: number;
    uom: string;
    vendorType: 'Reject' | 'Three Party' | 'Regular' | 'Select';
    date: string;
    validityDate: string;
    attachment: string;
    specifications: string;
    status: 'Pending' | 'Approved';
    plannedDate: string | null;
}

interface HistoryData {
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    productCode: string | null;
    uom: string;
    approvedQuantity: number;
    vendorType: 'Reject' | 'Three Party' | 'Regular' | 'Select';
    date: string;
    approvedDate: string;
    delay?: string;
    specifications: string;
    attachment: string;
    lastUpdated?: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();
    const isViewOnly = usePageViewOnly();

    const [pendingItems, setPendingItems] = useState<ApproveTableData[]>([]);
    const [historyItems, setHistoryItems] = useState<HistoryData[]>([]);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [pendingPage, setPendingPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [pendingSearch, setPendingSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [pendingLoadingMore, setPendingLoadingMore] = useState(false);
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<HistoryData>>({});
    const [loading, setLoading] = useState(false);
    const [selectedIndents, setSelectedIndents] = useState<Set<string>>(new Set());
    const [bulkUpdates, setBulkUpdates] = useState<Map<number, { vendorType?: string; quantity?: number; product?: string; plannedDate?: string; firm?: string }>>(new Map());
    const [submitting, setSubmitting] = useState(false);
    // Separate initial loading (shows skeleton) from background searching (shows progress bar)
    const [pendingInitialLoading, setPendingInitialLoading] = useState(true);
    const [historyInitialLoading, setHistoryInitialLoading] = useState(true);
    const [pendingSearching, setPendingSearching] = useState(false);
    const [historySearching, setHistorySearching] = useState(false);
    const [master, setMaster] = useState<any>(null);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [historyViewGroup, setHistoryViewGroup] = useState<{
        indentNo: string; firm: string; indenter: string; department: string;
        date: string; approvedDate: string; delay?: string; items: HistoryData[];
    } | null>(null);

    const [pendingFilters, setPendingFilters] = useState({ indenter: 'All', department: 'All', product: 'All' });
    const [historyFilters, setHistoryFilters] = useState({ indenter: 'All', department: 'All', product: 'All' });

    // AbortController refs to cancel stale requests on rapid search
    const pendingAbortRef = useRef<AbortController | null>(null);
    const historyAbortRef = useRef<AbortController | null>(null);

    const fetchPendingData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        // Cancel any in-flight request
        if (pendingAbortRef.current) pendingAbortRef.current.abort();
        const controller = new AbortController();
        pendingAbortRef.current = controller;

        if (!append && pendingItems.length === 0) setPendingInitialLoading(true);
        else if (!append) setPendingSearching(true);
        else setPendingLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*', { column: 'created_at', options: { ascending: true } }, undefined, undefined, {
                page: pageValue,
                limit: 50,
                search: searchQuery,
                status: 'Pending'
            });

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber,
                    indentType: record.indentType || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    areaOfUse: record.areaOfUse || '',
                    departmentHead: record.departmentHead || '',
                    indentApprovedBy: record.indentApprovedBy || '',
                    product: record.productName || '',
                    productCode: record.productCode || null,
                    productCategory: record.productCategory || '',
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    vendorType: 'Select',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    validityDate: record.validityDate ? formatDate(new Date(record.validityDate)) : '',
                    attachment: record.attachment || '',
                    status: 'Pending',
                    plannedDate: record.plannedDate,
                    approvedQuantity: record.approvedQuantity,
                    delay: record.delay
                }));

                setPendingItems(prev => append ? [...prev, ...mappedData] : mappedData);
                setPendingTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching pending data:', error);
            toast.error('Failed to fetch data');
        } finally {
            if (!controller.signal.aborted) {
                setPendingInitialLoading(false);
                setPendingSearching(false);
                setPendingLoadingMore(false);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchHistoryData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        // Cancel any in-flight request
        if (historyAbortRef.current) historyAbortRef.current.abort();
        const controller = new AbortController();
        historyAbortRef.current = controller;

        if (!append && historyItems.length === 0) setHistoryInitialLoading(true);
        else if (!append) setHistorySearching(true);
        else setHistoryLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*', { column: 'created_at', options: { ascending: true } }, undefined, undefined, {
                page: pageValue,
                limit: 50,
                search: searchQuery,
                status: 'Approved'
            });

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    indentNo: record.indentNumber,
                    id: record.id,
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName,
                    department: record.department || '',
                    product: record.productName,
                    productCode: record.productCode || null,
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    vendorType: record.vendorType || record.vendor_type || 'Regular',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    approvedDate: record.plannedDate ? formatDate(new Date(record.plannedDate)) : (record.createdAt ? formatDate(new Date(record.createdAt)) : ''),
                    attachment: record.attachment || '',
                    approvedQuantity: record.approvedQuantity || record.quantity,
                    delay: (record.delay && !record.delay.includes('NaN')) ? record.delay : 'No delay'
                }));

                setHistoryItems(prev => append ? [...prev, ...mappedData] : mappedData);
                setHistoryTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching history data:', error);
            toast.error('Failed to fetch history');
        } finally {
            if (!controller.signal.aborted) {
                setHistoryInitialLoading(false);
                setHistorySearching(false);
                setHistoryLoadingMore(false);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Initial Load — run once
    useEffect(() => {
        fetchPendingData(1, '');
        fetchHistoryData(1, '');
        fetchIndentMasterData().then(setMaster);

        return () => {
            // Cancel in-flight requests on unmount
            pendingAbortRef.current?.abort();
            historyAbortRef.current?.abort();
        };
    }, [fetchPendingData, fetchHistoryData]);

    // Stable debounced search handlers using useCallback
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

    const handleIndentSelect = (indentNo: string, checked: boolean) => {
        const indentItems = pendingItems.filter(item => item.indentNo === indentNo);
        setSelectedIndents(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(indentNo);
                setBulkUpdates(prevUpdates => {
                    const newUpdates = new Map(prevUpdates);
                    indentItems.forEach(item => {
                        newUpdates.set(item.id, {
                            vendorType: item.indentType === 'Purchase' ? 'Select' : 'N/A',
                            quantity: item.quantity,
                            product: item.product,
                            plannedDate: new Date().toISOString().split('T')[0],
                            firm: item.firm
                        });
                    });
                    return newUpdates;
                });
            } else {
                newSet.delete(indentNo);
                setBulkUpdates(prevUpdates => {
                    const newUpdates = new Map(prevUpdates);
                    indentItems.forEach(item => newUpdates.delete(item.id));
                    return newUpdates;
                });
            }
            return newSet;
        });
    };

    const handleSelectAllIndents = (checked: boolean) => {
        if (checked) {
            const allIndentNos = [...new Set(pendingItems.map(item => item.indentNo))];
            setSelectedIndents(new Set(allIndentNos));
            const newUpdates = new Map<number, any>();
            pendingItems.forEach(item => {
                newUpdates.set(item.id, {
                    vendorType: item.indentType === 'Purchase' ? 'Select' : 'N/A',
                    quantity: item.quantity,
                    product: item.product,
                    plannedDate: new Date().toISOString().split('T')[0],
                    firm: item.firm
                });
            });
            setBulkUpdates(newUpdates);
        } else {
            setSelectedIndents(new Set());
            setBulkUpdates(new Map());
        }
    };

    const handleBulkUpdate = (
        id: number,
        field: 'vendorType' | 'quantity' | 'product' | 'plannedDate' | 'firm',
        value: string | number
    ) => {
        setBulkUpdates((prevUpdates) => {
            const newUpdates = new Map(prevUpdates);
            const currentUpdate = newUpdates.get(id) || {};
            newUpdates.set(id, {
                ...currentUpdate,
                [field]: value,
            });
            return newUpdates;
        });
    };

    const handleSubmitBulkUpdates = async () => {
        if (isViewOnly) {
            toast.info('View-only access: you cannot approve indents on this page.');
            return;
        }
        // Collect all product IDs across selected indents
        const selectedProductIds = pendingItems
            .filter(item => selectedIndents.has(item.indentNo))
            .map(item => item.id);

        // Validation: Purchase indents must have Regular or Three Party vendor type
        const invalidIndentNos: string[] = [];
        selectedProductIds.forEach(id => {
            const vendorType = bulkUpdates.get(id)?.vendorType;
            if (vendorType !== 'Regular' && vendorType !== 'Three Party') {
                const item = pendingItems.find(i => i.id === id);
                if (item && item.indentType === 'Purchase' && !invalidIndentNos.includes(item.indentNo)) {
                    invalidIndentNos.push(item.indentNo);
                }
            }
        });

        if (invalidIndentNos.length > 0) {
            toast.error(`Select 'Regular' or 'Three Party' for all products in: ${invalidIndentNos.join(', ')}`);
            return;
        }

        // Validation: check valid quantities
        let qtyError = false;
        selectedProductIds.forEach(id => {
            const update = bulkUpdates.get(id);
            const originalRecord = pendingItems.find(i => i.id === id);
            if (originalRecord) {
                const qty = update?.quantity !== undefined ? Number(update.quantity) : originalRecord.quantity;
                if (isNaN(qty) || qty <= 0 || qty > originalRecord.quantity) {
                    qtyError = true;
                }
            }
        });

        if (qtyError) {
            toast.error("Quantity must be greater than 0 and cannot exceed the originally indented quantity.");
            return;
        }

        setSubmitting(true);
        try {
            const updatesToProcess = selectedProductIds.map(id => {
                const update = bulkUpdates.get(id);
                const originalRecord = pendingItems.find(s => s.id === id);
                if (!originalRecord || !update) return null;

                return {
                    id: originalRecord.id,
                    updatePayload: {
                        indentNumber: originalRecord.indentNo, // Base number
                        productCode: originalRecord.productCode, // Specific code
                        quantity: update.quantity !== undefined ? Number(update.quantity) : originalRecord.quantity,
                        productName: update.product || originalRecord.product,
                        vendorType: update.vendorType || originalRecord.vendorType,
                        planned: update.plannedDate || new Date().toISOString().split('T')[0],
                        firm: update.firm || originalRecord.firm
                    }
                };
            }).filter((item): item is NonNullable<typeof item> => item !== null);

            const approvalResults = await Promise.all(
                updatesToProcess.map(item => approveIndent(item.id, item.updatePayload))
            );

            const errors = approvalResults.filter(r => !r.success);
            if (errors.length > 0) {
                const messages = [...new Set(errors.map((r: any) => r.error).filter(Boolean))];
                messages.forEach(msg => toast.error(msg));
                if (approvalResults.length - errors.length > 0) {
                    toast.warning(`${approvalResults.length - errors.length} approved, ${errors.length} failed.`);
                }
            } else {
                toast.success(`Approved ${updatesToProcess.length} products successfully`);
            }

            updateIndentSheet();
            updateRelatedSheets();
            setPendingPage(1);
            fetchPendingData(1, pendingSearch);
            fetchHistoryData(1, historySearch);

            setSelectedIndents(new Set());
            setBulkUpdates(new Map());
            setIsReviewOpen(false);
        } catch (error) {
            console.error('Error in bulk updates:', error);
            toast.error('Failed to submit');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditClick = (record: HistoryData) => {
        setEditingRow(record.indentNo);
        setEditValues(record);
    };

    const handleCancelEdit = () => {
        setEditingRow(null);
        setEditValues({});
    };

    const handleSaveEdit = async (indentNo: string) => {
        setLoading(true);
        try {
            const result = await postToSheet([editValues], 'update', 'INDENT');
            if (result.success) {
                toast.success('Record updated successfully');
                setHistoryPage(1);
                fetchHistoryData(1, historySearch);
                setEditingRow(null);
            } else {
                toast.error('Failed to update record');
            }
        } catch (err) {
            console.error('Error saving edit:', err);
            toast.error('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Removed onDownloadClick as per user request

    // Helper to get unique filter options
    const getFilterOptions = (data: any[], key: string) => {
        const options = [...new Set(data.map(item => item[key]).filter(Boolean))].sort();
        return ['All', ...options];
    };

    // Derived filtered data
    // Derived filtered data (local refinements on the 50 fetched items)
    const filteredTableData = pendingItems.filter(item => {
        return (pendingFilters.indenter === 'All' || item.indenter === pendingFilters.indenter) &&
            (pendingFilters.department === 'All' || item.department === pendingFilters.department) &&
            (pendingFilters.product === 'All' || item.product === pendingFilters.product);
    });

    const filteredHistoryData = historyItems.filter(item => {
        return (historyFilters.indenter === 'All' || item.indenter === historyFilters.indenter) &&
            (historyFilters.department === 'All' || item.department === historyFilters.department) &&
            (historyFilters.product === 'All' || item.product === historyFilters.product);
    });

    // Group pending items by indent number for indent-wise product display
    const groupedPendingData = useMemo(() => {
        const groups = new Map<string, ApproveTableData[]>();
        filteredTableData.forEach(item => {
            if (!groups.has(item.indentNo)) groups.set(item.indentNo, []);
            groups.get(item.indentNo)!.push(item);
        });
        return Array.from(groups.entries()).map(([indentNo, items]) => {
            const itemsWithCode = items.map(item => ({
                ...item,
                displayCode: item.productCode || '' // Show empty in UI if productCode is not in DB
            }));
            const first = items[0];
            return {
                indentNo,
                indentType: first.indentType,
                firm: first.firm,
                indenter: first.indenter,
                department: first.department,
                areaOfUse: first.areaOfUse,
                departmentHead: first.departmentHead,
                indentApprovedBy: first.indentApprovedBy,
                date: first.date,
                validityDate: first.validityDate,
                items: itemsWithCode,
            };
        });
    }, [filteredTableData]);

    const groupedHistoryData = useMemo(() => {
        const groups = new Map<string, HistoryData[]>();
        filteredHistoryData.forEach(item => {
            if (!groups.has(item.indentNo)) groups.set(item.indentNo, []);
            groups.get(item.indentNo)!.push(item);
        });
        return Array.from(groups.entries()).map(([indentNo, items]) => {
            const first = items[0];
            return { indentNo, firm: first.firm, indenter: first.indenter, department: first.department, date: first.date, approvedDate: first.approvedDate, delay: first.delay, vendorType: first.vendorType, items };
        });
    }, [filteredHistoryData]);

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

    const historyColumns: ColumnDef<any>[] = [
        {
            header: 'Action',
            cell: ({ row }) => (
                <Button variant="outline" size="sm" onClick={() => setHistoryViewGroup(row.original)}>
                    View
                </Button>
            ),
        },
        { accessorKey: 'indentNo', header: 'Indent No' },
        { accessorKey: 'firm', header: 'Firm' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        {
            header: 'Products',
            cell: ({ row }) => {
                const count = row.original.items.length;
                return `${count} ${count === 1 ? 'product' : 'products'}`;
            },
        },
        { accessorKey: 'date', header: 'Request Date' },
        { accessorKey: 'approvedDate', header: 'Approval Date' },
        {
            accessorKey: 'vendorType',
            header: 'Status',
            cell: ({ row }) => (
                <Pill variant={row.original.vendorType === 'Reject' ? 'reject' : row.original.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                    {row.original.vendorType}
                </Pill>
            )
        },
    ];

    return (
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Tabs defaultValue="pending" className="w-full">
                <Heading heading="Approve Indent" subtext="Update Indent status to Approve or Reject them" tabs>
                    <ClipboardCheck size={50} className="text-primary" />
                </Heading>
                <TabsContent value="pending" className="w-full max-w-full">
                    <div className="space-y-3">
                        {/* Top bar: search + filters + submit */}
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
                                <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={pendingItems} />
                            </div>
                            <Button
                                onClick={() => setIsReviewOpen(true)}
                                disabled={selectedIndents.size === 0}
                                className="h-8 text-xs bg-green-600 hover:bg-green-700 flex items-center gap-2"
                            >
                                <Send size={14} /> Submit {selectedIndents.size > 0 && `(${selectedIndents.size})`}
                            </Button>
                        </div>

                        {pendingSearching && (
                            <div className="w-full h-0.5 bg-primary/20 rounded-full overflow-hidden">
                                <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
                            </div>
                        )}

                        {/* One row per indent */}
                        {pendingInitialLoading ? (
                            <div className="space-y-2">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                                ))}
                            </div>
                        ) : groupedPendingData.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                                No pending indents found
                            </div>
                        ) : (
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300"
                                                    checked={groupedPendingData.length > 0 && selectedIndents.size === groupedPendingData.length}
                                                    onChange={(e) => handleSelectAllIndents(e.target.checked)}
                                                />
                                            </TableHead>
                                            <TableHead>Indent No</TableHead>
                                            <TableHead>Firm</TableHead>
                                            <TableHead>Indenter</TableHead>
                                            <TableHead>Department</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Products</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupedPendingData.map(group => (
                                            <TableRow
                                                key={group.indentNo}
                                                className={selectedIndents.has(group.indentNo) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}
                                            >
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300"
                                                        checked={selectedIndents.has(group.indentNo)}
                                                        onChange={(e) => handleIndentSelect(group.indentNo, e.target.checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.indentNo}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.firm}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.indenter}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.department}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.date}</TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                        {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {/* Pagination */}
                        {!pendingInitialLoading && pendingTotal > 0 && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                                <span>{filteredTableData.length} of {pendingTotal} items</span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                        disabled={pendingPage === 1}
                                        onClick={() => { const p = pendingPage - 1; setPendingPage(p); fetchPendingData(p, pendingSearch, false); }}
                                    >Previous</Button>
                                    <span>Page {pendingPage}</span>
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                        disabled={filteredTableData.length >= pendingTotal}
                                        onClick={() => { const p = pendingPage + 1; setPendingPage(p); fetchPendingData(p, pendingSearch, false); }}
                                    >Next</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>
                <TabsContent value="history" className="w-full">
                    <DataTable
                        data={groupedHistoryData}
                        columns={historyColumns}
                        searchFields={['indentNo', 'firm', 'department', 'indenter']}
                        dataLoading={historyInitialLoading}
                        isSearching={historySearching}
                        pagination={true}
                        pageSize={50}
                        extraActions={
                            <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyItems} />
                        }
                    />
                </TabsContent>
            </Tabs>

            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Review &amp; Approve Indents</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-8 py-2">
                        {groupedPendingData
                            .filter(group => selectedIndents.has(group.indentNo))
                            .map(group => (
                                <div key={group.indentNo} className="rounded-lg border overflow-hidden">

                                    {/* ── Indent title bar ── */}
                                    <div className="bg-primary px-4 py-2 flex items-center justify-between">
                                        <span className="text-sm font-bold text-primary-foreground tracking-wide">{group.indentNo}</span>
                                        {group.indentType && (
                                            <span className="text-[11px] bg-primary-foreground/20 text-primary-foreground rounded-full px-2 py-0.5 font-medium">
                                                {group.indentType}
                                            </span>
                                        )}
                                    </div>

                                    {/* ── Indent details grid ── */}
                                    <div className="bg-muted/30 px-4 py-3 border-b grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                                        {[
                                            { label: 'Firm',             value: group.firm },
                                            { label: 'Indenter',         value: group.indenter },
                                            { label: 'Department',       value: group.department },
                                            { label: 'Area of Use',      value: group.areaOfUse },
                                            { label: 'Department Head',       value: group.departmentHead },
                                            { label: 'Approved By',      value: group.indentApprovedBy },
                                            { label: 'Created Date',     value: group.date },
                                            { label: 'Validity Date',    value: group.validityDate },
                                        ].map(({ label, value }) =>
                                            value ? (
                                                <div key={label} className="flex flex-col">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                                    <span className="text-xs font-medium text-foreground mt-0.5">{value}</span>
                                                </div>
                                            ) : null
                                        )}
                                    </div>

                                    {/* ── Products table ── */}
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/20">
                                                    <TableHead className="w-28 text-xs">Product Code</TableHead>
                                                    <TableHead className="text-xs">Product</TableHead>
                                                    <TableHead className="text-xs">Category</TableHead>
                                                    <TableHead className="text-xs">Qty</TableHead>
                                                    <TableHead className="text-xs">UOM</TableHead>
                                                    <TableHead className="text-xs">Specifications</TableHead>
                                                    <TableHead className="text-xs">Attachment</TableHead>
                                                    {group.indentType === 'Purchase' && <TableHead className="text-xs">Vendor Type</TableHead>}
                                                    <TableHead className="text-xs">Firm</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {group.items.map(item => {
                                                    const currentQty = bulkUpdates.get(item.id)?.quantity ?? item.quantity;
                                                    const currentVendorType = bulkUpdates.get(item.id)?.vendorType || 'Select';
                                                    return (
                                                        <TableRow key={item.id}>
                                                            <TableCell>
                                                                {item.productCode
                                                                    ? <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">{item.productCode}</span>
                                                                    : <span className="text-muted-foreground text-xs">—</span>
                                                                }
                                                            </TableCell>
                                                            <TableCell className="text-xs font-medium max-w-[160px]">{item.product}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">{item.productCategory || '—'}</TableCell>
                                                            <TableCell>
                                                                <Input
                                                                    type="number"
                                                                    value={currentQty === undefined ? item.quantity : currentQty}
                                                                    min={1}
                                                                    max={item.quantity}
                                                                    onChange={(e) => handleBulkUpdate(item.id, 'quantity', e.target.value)}
                                                                    className="w-20 text-xs h-8"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-xs">{item.uom}</TableCell>
                                                            <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground" title={item.specifications}>
                                                                {item.specifications || '—'}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {item.attachment
                                                                    ? <a href={item.attachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                                                                    : <span className="text-muted-foreground">—</span>
                                                                }
                                                            </TableCell>
                                                            {group.indentType === 'Purchase' && (
                                                                <TableCell>
                                                                    <Select
                                                                        value={currentVendorType}
                                                                        onValueChange={(val) => handleBulkUpdate(item.id, 'vendorType', val)}
                                                                    >
                                                                        <SelectTrigger className="w-32 h-8 text-xs">
                                                                            <SelectValue placeholder="Select" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="Select">Select</SelectItem>
                                                                            <SelectItem value="Regular">Regular</SelectItem>
                                                                            <SelectItem value="Three Party">Multi-Party</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </TableCell>
                                                            )}
                                                            <TableCell>
                                                                <Select
                                                                    value={bulkUpdates.get(item.id)?.firm || item.firm || 'N/A'}
                                                                    onValueChange={(val) => handleBulkUpdate(item.id, 'firm', val)}
                                                                >
                                                                    <SelectTrigger className="w-32 h-8 text-xs">
                                                                        <SelectValue placeholder="Firm" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {master?.firms?.map((f: string) => (
                                                                            <SelectItem key={f} value={f}>{f}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>

                                </div>
                            ))
                        }
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsReviewOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitBulkUpdates} disabled={submitting} className="bg-green-600 hover:bg-green-700">
                            {submitting ? <Loader size={20} color="white" /> : 'Confirm & Approve All'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog 
                open={!!historyViewGroup} 
                onOpenChange={(open) => !open && setHistoryViewGroup(null)}
            >
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Indent Details - {historyViewGroup?.indentNo}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/30 p-4 rounded-lg">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Firm</p>
                                <p className="text-sm font-medium">{historyViewGroup?.firm}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Indenter</p>
                                <p className="text-sm font-medium">{historyViewGroup?.indenter}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Department</p>
                                <p className="text-sm font-medium">{historyViewGroup?.department}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Request Date</p>
                                <p className="text-sm font-medium">{historyViewGroup?.date}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Approval Date</p>
                                <p className="text-sm font-medium">{historyViewGroup?.approvedDate}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Delay</p>
                                <p className="text-sm font-medium">{historyViewGroup?.delay}</p>
                            </div>
                        </div>

                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/20">
                                        <TableHead className="text-xs">Product Code</TableHead>
                                        <TableHead className="text-xs">Product Name</TableHead>
                                        <TableHead className="text-xs">Quantity</TableHead>
                                        <TableHead className="text-xs">UOM</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                        <TableHead className="text-xs">Specifications</TableHead>
                                        <TableHead className="text-xs text-right">Attachment</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyViewGroup?.items.slice().sort((a: any, b: any) => (a.product || '').localeCompare(b.product || '')).map((item: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                {item.productCode 
                                                    ? <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">{item.productCode}</span>
                                                    : <span className="text-muted-foreground text-xs">—</span>
                                                }
                                            </TableCell>
                                            <TableCell className="text-xs font-medium">{item.product}</TableCell>
                                            <TableCell className="text-xs">{item.approvedQuantity}</TableCell>
                                            <TableCell className="text-xs">{item.uom}</TableCell>
                                            <TableCell>
                                                <Pill variant={item.vendorType === 'Reject' ? 'reject' : item.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                                                    {item.vendorType}
                                                </Pill>
                                            </TableCell>
                                            <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground" title={item.specifications}>
                                                {item.specifications || '—'}
                                            </TableCell>
                                            <TableCell className="text-xs text-right">
                                                {item.attachment 
                                                    ? <a href={item.attachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                                                    : <span className="text-muted-foreground">—</span>
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
