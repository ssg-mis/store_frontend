
import { type ColumnDef, type Row } from '@tanstack/react-table';
import DataTable from '../element/DataTable';
import { useEffect, useState, useRef, useCallback } from 'react';
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
    firm: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    uom: string;
    vendorType: 'Reject' | 'Three Party' | 'Regular' | 'Select';
    date: string;
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
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [bulkUpdates, setBulkUpdates] = useState<Map<string, { vendorType?: string; quantity?: number; product?: string; plannedDate?: string }>>(new Map());
    const [submitting, setSubmitting] = useState(false);
    // Separate initial loading (shows skeleton) from background searching (shows progress bar)
    const [pendingInitialLoading, setPendingInitialLoading] = useState(true);
    const [historyInitialLoading, setHistoryInitialLoading] = useState(true);
    const [pendingSearching, setPendingSearching] = useState(false);
    const [historySearching, setHistorySearching] = useState(false);
    const [master, setMaster] = useState<any>(null);
    const [isReviewOpen, setIsReviewOpen] = useState(false);

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
            const data: any = await fetchFromSupabasePaginated('indent', '*', { column: 'created_at', options: { ascending: false } }, undefined, undefined, {
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
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName,
                    department: record.department || '',
                    product: record.productName,
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    vendorType: 'Select',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
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
            const data: any = await fetchFromSupabasePaginated('indent', '*', { column: 'created_at', options: { ascending: false } }, undefined, undefined, {
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
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    vendorType: record.vendorType || record.vendor_type || 'Regular',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    approvedDate: record.plannedDate ? formatDate(new Date(record.plannedDate)) : (record.createdAt ? formatDate(new Date(record.createdAt)) : ''),
                    attachment: record.attachment || '',
                    approvedQuantity: record.approvedQuantity || record.quantity,
                    delay: record.delay || 'No delay'
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

    const handleRowSelect = (indentNo: string, checked: boolean) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(indentNo);
                const currentRow = pendingItems.find(row => row.indentNo === indentNo);
                if (currentRow) {
                    setBulkUpdates(prevUpdates => {
                        const newUpdates = new Map(prevUpdates);
                        newUpdates.set(indentNo, {
                            vendorType: 'Select',
                            quantity: currentRow.quantity,
                            product: currentRow.product,
                            plannedDate: new Date().toISOString().split('T')[0] // Default to today
                        });
                        return newUpdates;
                    });
                }
            } else {
                newSet.delete(indentNo);
                setBulkUpdates(prevUpdates => {
                    const newUpdates = new Map(prevUpdates);
                    newUpdates.delete(indentNo);
                    return newUpdates;
                });
            }
            return newSet;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(pendingItems.map(row => row.indentNo)));
            const newUpdates = new Map();
            pendingItems.forEach(row => {
                newUpdates.set(row.indentNo, {
                    vendorType: 'Select',
                    quantity: row.quantity,
                    product: row.product,
                    plannedDate: new Date().toISOString().split('T')[0]
                });
            });
            setBulkUpdates(newUpdates);
        } else {
            setSelectedRows(new Set());
            setBulkUpdates(new Map());
        }
    };

    const handleBulkUpdate = (
        indentNo: string,
        field: 'vendorType' | 'quantity' | 'product' | 'plannedDate',
        value: string | number
    ) => {
        setBulkUpdates((prevUpdates) => {
            const newUpdates = new Map(prevUpdates);
            const currentUpdate = newUpdates.get(indentNo) || {};
            newUpdates.set(indentNo, {
                ...currentUpdate,
                [field]: value,
            });
            return newUpdates;
        });
    };

    const handleSubmitBulkUpdates = async () => {
        if (selectedRows.size === 0) {
            toast.error('Please select at least one row to update');
            return;
        }

        // Validation: Only allow 'Regular' or 'Three Party'
        const invalidIndents: string[] = [];
        selectedRows.forEach(indentNo => {
            const update = bulkUpdates.get(indentNo);
            const vendorType = update?.vendorType;
            if (vendorType !== 'Regular' && vendorType !== 'Three Party') {
                invalidIndents.push(indentNo);
            }
        });

        if (invalidIndents.length > 0) {
            toast.error(`Please select 'Regular' or 'Three Party' for: ${invalidIndents.join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const updatesToProcess = Array.from(selectedRows).map(indentNo => {
                const update = bulkUpdates.get(indentNo);
                const originalRecord = pendingItems.find(s => s.indentNo === indentNo);

                if (!originalRecord || !update) return null;

                const updatePayload: any = {
                    quantity: update.quantity !== undefined ? update.quantity : originalRecord.quantity,
                    productName: update.product || originalRecord.product,
                    vendorType: update.vendorType || originalRecord.vendorType,
                    planned: update.plannedDate || new Date().toISOString().split('T')[0]
                };

                return {
                    id: originalRecord.id,
                    updatePayload: {
                        indentNumber: originalRecord.indentNo,
                        ...updatePayload
                    }
                };
            }).filter((item): item is NonNullable<typeof item> => item !== null);

            const approvalResults = await Promise.all(
                updatesToProcess.map(async (item) => {
                    return approveIndent(item.id, item.updatePayload);
                })
            );

            const errors = approvalResults.filter(r => !r.success);
            if (errors.length > 0) {
                console.error('Some updates failed:', errors);
                toast.warning(`Updated ${approvalResults.length - errors.length} indents, but ${errors.length} failed.`);
            } else {
                toast.success(`Updated ${updatesToProcess.length} indents successfully`);
            }

            updateIndentSheet();
            updateRelatedSheets();
            
            // Refresh first page of data
            setPendingPage(1);
            fetchPendingData(1, pendingSearch);
            fetchHistoryData(1, historySearch);

            setSelectedRows(new Set());
            setBulkUpdates(new Map());
            setIsReviewOpen(false);
        } catch (error) {
            console.error('Error in bulk updates:', error);
            toast.error('Failed to submit bulk updates');
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

    const columns: ColumnDef<ApproveTableData>[] = [
        {
            id: 'select',
            header: ({ table }) => (
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={pendingItems.length > 0 && selectedRows.size === pendingItems.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={selectedRows.has(row.original.indentNo)}
                    onChange={(e) => handleRowSelect(row.original.indentNo, e.target.checked)}
                />
            ),
            size: 40,
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No',
            cell: ({ getValue }) => <div className="font-medium text-xs sm:text-sm">{getValue() as string}</div>,
            size: 100,
        },
        {
            accessorKey: 'firm',
            header: 'Firm',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 120,
        },
        {
            accessorKey: 'indenter',
            header: 'Indenter',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 120,
        },
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 120,
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 150,
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                const currentValue = bulkUpdates.get(indent.indentNo)?.quantity || indent.quantity;
                return (
                    <Input
                        type="number"
                        defaultValue={currentValue}
                        onBlur={(e) => handleBulkUpdate(indent.indentNo, 'quantity', Number(e.target.value) || 0)}
                        className="w-16 sm:w-20 text-xs sm:text-sm h-8"
                        disabled={!isSelected}
                    />
                );
            },
            size: 80,
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 60,
        },
        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                const currentValue = bulkUpdates.get(indent.indentNo)?.vendorType || indent.vendorType;
                return (
                    <Select
                        value={currentValue}
                        onValueChange={(val) => handleBulkUpdate(indent.indentNo, 'vendorType', val)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className="w-24 sm:w-32 h-8 text-xs sm:text-sm">
                            <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Select">Select</SelectItem>
                            <SelectItem value="Regular">Regular</SelectItem>
                            <SelectItem value="Three Party">Three Party</SelectItem>
                        </SelectContent>
                    </Select>
                );
            },
            size: 110,
        },
        {
            accessorKey: 'plannedDate',
            header: 'Planned Date',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                
                // Priority: 1. Manual selection/edit, 2. Existing database value, 3. Today (only if selected)
                const currentValue = bulkUpdates.get(indent.indentNo)?.plannedDate || indent.plannedDate || (isSelected ? new Date().toISOString().split('T')[0] : '');
                
                return (
                    <div className="flex justify-center w-full">
                        <Input
                            type="date"
                            value={currentValue}
                            onChange={(e) => handleBulkUpdate(indent.indentNo, 'plannedDate', e.target.value)}
                            className="w-[150px] h-9 text-[13px] pl-2 pr-1 cursor-pointer bg-background"
                            disabled={!isSelected}
                        />
                    </div>
                );
            },
            size: 190,
        },
        {
            accessorKey: 'date',
            header: 'Date',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm whitespace-nowrap">{getValue() as string}</div>,
            size: 100,
        },
        {
            accessorKey: 'specifications',
            header: 'Specifications',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm max-w-xs truncate">{getValue() as string}</div>,
            size: 150,
        },
        {
            accessorKey: 'attachment',
            header: 'Attachment',
            cell: ({ row }) => {
                const attachment = row.original.attachment;
                return attachment ? (
                    <a href={attachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs sm:text-sm">
                        View
                    </a>
                ) : (
                    <div className="text-xs sm:text-sm text-gray-500">-</div>
                );
            },
            size: 80,
        }
    ];

    const historyColumns: ColumnDef<HistoryData>[] = [
        { accessorKey: 'indentNo', header: 'Indent No', size: 100 },
        { accessorKey: 'firm', header: 'Firm', size: 120 },
        { accessorKey: 'indenter', header: 'Indenter', size: 120 },
        { accessorKey: 'product', header: 'Product', size: 150 },
        { accessorKey: 'approvedQuantity', header: 'Appr. Qty', size: 80 },
        {
            accessorKey: 'vendorType', header: 'Status', size: 110, cell: ({ row }) => (
                <Pill variant={row.original.vendorType === 'Reject' ? 'reject' : row.original.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                    {row.original.vendorType}
                </Pill>
            )
        },
        { accessorKey: 'date', header: 'Request Date', size: 100 },
        { accessorKey: 'approvedDate', header: 'Approval Date', size: 100 },
        { accessorKey: 'delay', header: 'Delay', size: 80 },
        {
            accessorKey: 'attachment',
            header: 'Attachment',
            cell: ({ row }) => {
                const attachment = row.original.attachment;
                return attachment ? (
                    <a href={attachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        View
                    </a>
                ) : (
                    <div className="text-gray-500">-</div>
                );
            },
            size: 80,
        }
    ];

    return (
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Tabs defaultValue="pending" className="w-full">
                <Heading heading="Approve Indent" subtext="Update Indent status to Approve or Reject them" tabs>
                    <ClipboardCheck size={50} className="text-primary" />
                </Heading>
                <TabsContent value="pending" className="w-full max-w-full">
                    <div className="space-y-4">
                        <DataTable
                            data={filteredTableData}
                            columns={columns}
                            searchFields={['indentNo', 'product', 'department', 'indenter']}
                            dataLoading={pendingInitialLoading}
                            isSearching={pendingSearching}
                            pagination={true}
                            pageSize={50}
                            totalCount={pendingTotal}
                            currentPage={pendingPage}
                            onSearchChange={debouncedPendingSearch}
                            onPageChange={(page) => {
                                setPendingPage(page);
                                fetchPendingData(page, pendingSearch, false);
                            }}
                            extraActions={
                                <div className="flex flex-wrap items-center gap-2">
                                    <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={pendingItems} />
                                    {selectedRows.size > 1 ? (
                                        <Button 
                                            onClick={() => setIsReviewOpen(true)} 
                                            className="h-8 text-xs bg-green-600 hover:bg-green-700 flex items-center gap-2"
                                            disabled={submitting}
                                        >
                                            <Send size={14} /> Submit ({selectedRows.size})
                                        </Button>
                                    ) : (
                                        <Button 
                                            onClick={handleSubmitBulkUpdates} 
                                            disabled={selectedRows.size === 0 || submitting} 
                                            className="h-8 text-xs flex items-center gap-2"
                                        >
                                            <Send size={14} /> Submit
                                        </Button>
                                    )}
                                </div>
                            }
                        />
                    </div>
                </TabsContent>
                <TabsContent value="history" className="w-full max-w-full">
                    <DataTable
                        data={filteredHistoryData}
                        columns={historyColumns}
                        searchFields={['indentNo', 'product', 'department', 'indenter']}
                        dataLoading={historyInitialLoading}
                        isSearching={historySearching}
                        pagination={true}
                        pageSize={50}
                        totalCount={historyTotal}
                        currentPage={historyPage}
                        onSearchChange={debouncedHistorySearch}
                        onPageChange={(page) => {
                            setHistoryPage(page);
                            fetchHistoryData(page, historySearch, false);
                        }}
                        extraActions={
                            <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyItems} />
                        }
                    />
                </TabsContent>
            </Tabs>

            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Review Bulk Approval</DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Indent No</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Appr. Qty</TableHead>
                                    <TableHead>Vendor Type</TableHead>
                                    <TableHead>Planned Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from(selectedRows).map(indentNo => {
                                    const indent = pendingItems.find(d => d.indentNo === indentNo);
                                    const updates = bulkUpdates.get(indentNo);
                                    if (!indent) return null;
                                    return (
                                        <TableRow key={indentNo}>
                                            <TableCell className="font-medium text-xs sm:text-sm">{indentNo}</TableCell>
                                            <TableCell className="text-xs sm:text-sm">{indent.product}</TableCell>
                                            <TableCell className="text-right text-xs sm:text-sm">
                                                {updates?.quantity ?? indent.quantity} {indent.uom}
                                            </TableCell>
                                            <TableCell className="text-xs sm:text-sm">
                                                <Pill variant={updates?.vendorType === 'Reject' ? 'reject' : updates?.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                                                    {updates?.vendorType || 'Select'}
                                                </Pill>
                                            </TableCell>
                                            <TableCell className="text-xs sm:text-sm">
                                                {updates?.plannedDate ? formatDate(new Date(updates.plannedDate)) : 'N/A'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsReviewOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSubmitBulkUpdates} 
                            disabled={submitting}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {submitting ? <Loader size={20} color="white" /> : 'Confirm & Approve All'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
