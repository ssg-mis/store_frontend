import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState, useRef, useCallback } from 'react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    DialogHeader,
    DialogFooter,
    DialogClose,
} from '../ui/dialog';
import { postToSheet, uploadFile, fetchVendors, fetchFromSupabasePaginated, fetchIndentMasterData } from '@/lib/fetchers';
import { z } from 'zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { UserCheck, PenSquare } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import ExcelEditorDialog from '../element/ExcelEditorDialog';
import { Pill } from '../ui/pill';
import { formatDate, debounce } from '@/lib/utils';



interface VendorUpdateData {
    id: number;
    indentId: number;
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    uom: string;
    vendorType: 'Three Party' | 'Regular';
    vendorName?: string;
    requestDate: string;
    approvalDate: string;
}
interface HistoryData {
    id: number;
    source?: 'rate_update' | 'three_party';
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    uom: string;
    placeholder?: string;
    rate: number;
    vendorType: 'Three Party' | 'Regular';
    date: string;
    lastUpdated?: string;
    vendorName?: string;
    requestDate: string;
    approvalDate: string;
    comparisonSheet?: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();

    const [selectedIndent, setSelectedIndent] = useState<VendorUpdateData | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<HistoryData | null>(null);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [tableData, setTableData] = useState<VendorUpdateData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [uploadingFileId, setUploadingFileId] = useState<number | null>(null);
    const [excelEditorConfig, setExcelEditorConfig] = useState<{ open: boolean; historyItemId: number | null; indentNo: string; fileUrl: string | null; }>({ open: false, historyItemId: null, indentNo: '', fileUrl: null });
    const [editValues, setEditValues] = useState<Partial<HistoryData>>({});
    const [vendorSearch, setVendorSearch] = useState('');
    const [vendors, setVendors] = useState<any[]>([]);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    const [paymentTerms, setPaymentTerms] = useState<string[]>([]);
    const [paymentTermsLoading, setPaymentTermsLoading] = useState(true);

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

    // Filter states
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

    const refreshVendors = async () => {
        const vendorsList = await fetchVendors();
        setVendors(vendorsList);
    };

    useEffect(() => {
        const loadVendors = async () => {
            setVendorsLoading(true);
            const v = await fetchVendors();
            setVendors(v || []);
            setVendorsLoading(false);
        };
        loadVendors();
    }, []);

    // Fetch payment terms from master_data
    useEffect(() => {
        const fetchPaymentTerms = async () => {
            setPaymentTermsLoading(true);
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/masters`);
                if (!response.ok) throw new Error('API error');
                const data = await response.json();
                const terms = [...new Set(
                    data.map((d: any) => d.paymentTerm || d.payment_term).filter(Boolean)
                )] as string[];
                setPaymentTerms(terms);
            } catch (err) {
                console.error('Error fetching payment terms:', err);
            } finally {
                setPaymentTermsLoading(false);
            }
        };
        fetchPaymentTerms();
    }, []);



    const fetchPendingData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (pendingAbortRef.current) pendingAbortRef.current.abort();
        const controller = new AbortController();
        pendingAbortRef.current = controller;

        if (!append && tableData.length === 0) setPendingInitialLoading(true);
        else if (!append) setPendingSearching(true);
        else setPendingLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated('approved_indent', '*',
                { column: 'createdAt', options: { ascending: false } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, status: 'Pending' }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    id: record.id,
                    indentId: record.indentId,
                    indentNo: record.indentNumber || record.indent_number || record.indentNo || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    quantity: record.approvedQuantity || 0,
                    uom: record.uom || '',
                    vendorType: record.vendorType as VendorUpdateData['vendorType'],
                    requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                }));
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setPendingTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching vendor pending data:', error);
            toast.error('Failed to fetch data: ' + error.message);
        } finally {
            if (!controller.signal.aborted) {
                setPendingInitialLoading(false);
                setPendingSearching(false);
                setPendingLoadingMore(false);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchHistoryData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (historyAbortRef.current) historyAbortRef.current.abort();
        const controller = new AbortController();
        historyAbortRef.current = controller;

        if (!append && historyData.length === 0) setHistoryInitialLoading(true);
        else if (!append) setHistorySearching(true);
        else setHistoryLoadingMore(true);

        try {
            // Fetch from vendor_rate_update (Pending = not yet three-party approved)
            const [rateData, threePartyData]: [any, any] = await Promise.all([
                fetchFromSupabasePaginated('vendor_rate_update', '*',
                    { column: 'createdAt', options: { ascending: false } },
                    undefined, undefined,
                    { page: pageValue, limit: 50, search: searchQuery }
                ),
                fetchFromSupabasePaginated('three_party_approval', '*',
                    { column: 'createdAt', options: { ascending: false } },
                    undefined, undefined,
                    { page: pageValue, limit: 50, search: searchQuery }
                )
            ]);

            if (controller.signal.aborted) return;

            const historyItems: HistoryData[] = [];

            if (rateData && rateData.items) {
                rateData.items.forEach((record: any) => {
                    historyItems.push({
                        id: record.id,
                        source: 'rate_update',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        indentNo: record.indentNumber || '',
                        firm: record.firm || 'N/A',
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate: record.rate1 || 0,
                        vendorType: 'Regular',
                        vendorName: record.vendorName1 || '',
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                        comparisonSheet: record.comparisonSheet || '',
                    });
                });
            }

            if (threePartyData && threePartyData.items) {
                threePartyData.items.forEach((record: any) => {
                    historyItems.push({
                        id: record.id,
                        source: 'three_party',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        indentNo: record.indentNumber || '',
                        firm: record.firm || 'N/A',
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate: record.approvedRate || 0,
                        vendorType: 'Three Party',
                        vendorName: record.approvedVendorName || '',
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                    });
                });
            }

            const sorted = historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistoryData(prev => append ? [...prev, ...sorted] : sorted);
            // Use the larger total as the combined total
            const combinedTotal = (rateData?.total || 0) + (threePartyData?.total || 0);
            setHistoryTotal(combinedTotal);
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching vendor history:', error);
            toast.error('Failed to fetch history: ' + error.message);
        } finally {
            if (!controller.signal.aborted) {
                setHistoryInitialLoading(false);
                setHistorySearching(false);
                setHistoryLoadingMore(false);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Wrapper to refresh both tabs (used after mutations)
    const fetchData = useCallback(async () => {
        await Promise.all([fetchPendingData(1, ''), fetchHistoryData(1, '')]);
    }, [fetchPendingData, fetchHistoryData]);

    // Initial load
    useEffect(() => {
        fetchPendingData(1, '');
        fetchHistoryData(1, '');
        return () => {
            pendingAbortRef.current?.abort();
            historyAbortRef.current?.abort();
        };
    }, [fetchPendingData, fetchHistoryData]);

    // Debounced search handlers
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
    const handleDirectFileUpload = async (historyItemId: number, indentNo: string, file: File) => {
        try {
            setUploadingFileId(historyItemId);
            
            const url = await uploadFile(file, import.meta.env.VITE_COMPARISON_SHEET_FOLDER);
            if (!url) throw new Error("File upload failed");

            const updatePayload = {
                id: historyItemId,
                indent_number: indentNo,
                comparisonSheet: url,
            };

            const result = await postToSheet([updatePayload], 'update', 'VENDOR_RATE_UPDATE');
            if (!result.success) throw new Error('API update failed');

            toast.success(`Comparison sheet updated for ${indentNo}`);
            await fetchData();
        } catch (error: any) {
            console.error('Direct file upload error:', error);
            toast.error('Failed to update file: ' + error.message);
        } finally {
            setUploadingFileId(null);
        }
    };

    const handleExcelEditorSave = async (newUrl: string) => {
        try {
            const updatePayload = {
                id: excelEditorConfig.historyItemId,
                indent_number: excelEditorConfig.indentNo,
                comparisonSheet: newUrl,
            };

            const result = await postToSheet([updatePayload], 'update', 'VENDOR_RATE_UPDATE');
            if (!result.success) throw new Error('API update failed');

            toast.success(`Comparison sheet updated for ${excelEditorConfig.indentNo}`);
            setExcelEditorConfig(prev => ({ ...prev, open: false }));
            await fetchData();
        } catch (error: any) {
            console.error('Direct file update error:', error);
            toast.error('Failed to update database record: ' + error.message);
        }
    };

    const handleEditClick = (row: HistoryData) => {
        setEditingRow(row.indentNo);
        setEditValues({
            quantity: row.quantity,
            uom: row.uom,
            vendorType: row.vendorType,
            rate: row.rate,
            product: row.product,
            vendorName: row.vendorName,
        });
    };


    const handleCancelEdit = () => {
        setEditingRow(null);
        setEditValues({});
    };

    const handleSaveEdit = async (indentNo: string) => {
        try {
            const row = historyData.find(d => d.indentNo === indentNo);
            if (!row) throw new Error('Row not found');

            const isThreePartySource = row.source === 'three_party';
            const table = isThreePartySource ? 'THREE_PARTY_APPROVAL' : 'VENDOR_RATE_UPDATE';

            const updatePayload: any = {
                id: row.id,
                indent_number: indentNo,
            };

            if (editValues.rate !== undefined) {
                if (isThreePartySource) {
                    updatePayload.approvedRate = editValues.rate;
                } else {
                    updatePayload.rate1 = editValues.rate;
                }
            }
            if (editValues.vendorName) {
                if (isThreePartySource) {
                    updatePayload.approvedVendorName = editValues.vendorName;
                } else {
                    updatePayload.vendorName1 = editValues.vendorName;
                }
            }

            const result = await postToSheet([updatePayload], 'update', table as any);

            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated rate for ${indentNo}`);

            await fetchData();
            setEditingRow(null);
            setEditValues({});
        } catch (error: any) {
            console.error('Error updating vendor rate:', error);
            toast.error('Failed to update: ' + error.message);
        }
    };


    const handleInputChange = (field: keyof HistoryData, value: any) => {
        setEditValues(prev => ({ ...prev, [field]: value }));
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
    const columns: ColumnDef<VendorUpdateData>[] = [
        {
            header: 'Action',
            cell: ({ row }: { row: Row<VendorUpdateData> }) => {
                const indent = row.original;

                return (
                    <div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedIndent(indent);
                                setOpenDialog(true);
                            }}
                        >
                            Update
                        </Button>
                    </div>
                );
            },
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No.',
        },
        {
            accessorKey: 'firm',
            header: 'Firm',
        },
        {
            accessorKey: 'requestDate',
            header: 'Request Date',
        },
        {
            accessorKey: 'approvalDate',
            header: 'Approval Date',
        },
        {
            accessorKey: 'indenter',
            header: 'Indenter',
        },
        {
            accessorKey: 'department',
            header: 'Department',
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ getValue }) => (
                <div className="max-w-[150px] break-words whitespace-normal">
                    {getValue() as string}
                </div>
            ),
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
        },
        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ row }) => {
                const status = row.original.vendorType;
                const variant = status === 'Regular' ? 'primary' : 'secondary';
                return <Pill variant={variant}>{status}</Pill>;
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
                        <Button
                            variant="outline"
                            disabled={indent.vendorType === "Three Party"}
                            onClick={() => {
                                setSelectedHistory(indent);
                                setOpenDialog(true);
                            }}
                        >
                            Update
                        </Button>
                    </div>
                );
            },
        },
        {
            accessorKey: 'date',
            header: 'Date',
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No.',
        },
        {
            accessorKey: 'firm',
            header: 'Firm',
        },
        {
            accessorKey: 'requestDate',
            header: 'Request Date',
        },
        {
            accessorKey: 'approvalDate',
            header: 'Approval Date',
        },
        {
            accessorKey: 'indenter',
            header: 'Indenter',
        },
        {
            accessorKey: 'department',
            header: 'Department',
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <Input
                        value={editValues.product ?? row.original.product ?? ''}
                        onChange={(e) => handleInputChange('product', e.target.value)}
                        className="w-[150px]"
                    />
                ) : (
                    <div className="max-w-[150px] break-words whitespace-normal flex items-center gap-2">
                        {row.original.product}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => handleEditClick(row.original)}
                        >
                            <PenSquare className="h-3 w-3" />
                        </Button>
                    </div>
                );
            },
        },

        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <Input
                        type="number"
                        value={editValues.quantity ?? row.original.quantity ?? 0}
                        onChange={(e) => handleInputChange('quantity', Number(e.target.value))}
                        className="w-20"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        {row.original.quantity}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => handleEditClick(row.original)}
                        >
                            <PenSquare className="h-3 w-3" />
                        </Button>
                    </div>
                );
            },
        },
        {
            accessorKey: "rate",
            header: "Rate",
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                const rate = row.original.rate;
                const vendorType = row.original.vendorType;

                if (!rate && vendorType === "Three Party") {
                    return (
                        <span className="text-muted-foreground">Not Decided</span>
                    )
                }

                return isEditing ? (
                    <Input
                        type="number"
                        value={editValues.rate ?? rate ?? 0}
                        onChange={(e) => handleInputChange('rate', Number(e.target.value))}
                        className="w-20"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        &#8377;{rate}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => handleEditClick(row.original)}
                        >
                            <PenSquare className="h-3 w-3" />
                        </Button>
                    </div>
                );
            },
        },

        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <Input
                        value={editValues.uom ?? row.original.uom ?? ''}
                        onChange={(e) => handleInputChange('uom', e.target.value)}
                        className="w-20"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        {row.original.uom}
                        {editingRow !== row.original.indentNo && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4"
                                onClick={() => handleEditClick(row.original)}
                            >
                                <PenSquare className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'vendorName',
            header: 'Vendor Name',
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <Select
                        value={editValues.vendorName ?? row.original.vendorName ?? ''}
                        onValueChange={(value) => handleInputChange('vendorName', value)}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                            <div className="max-h-[200px] overflow-y-auto">
                                {vendorsLoading ? (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        Loading vendors...
                                    </div>
                                ) : vendors?.length > 0 ? (
                                    vendors.map((vendor, i) => (
                                        <SelectItem key={i} value={vendor.vendorName}>
                                            {vendor.vendorName}
                                        </SelectItem>
                                    ))
                                ) : (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        No vendors found
                                    </div>
                                )}
                            </div>
                        </SelectContent>
                    </Select>
                ) : (
                    <div className="flex items-center gap-2">
                        {row.original.vendorName}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => handleEditClick(row.original)}
                        >
                            <PenSquare className="h-3 w-3" />
                        </Button>
                    </div>
                );
            },
        },

        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <Select
                        value={editValues.vendorType ?? row.original.vendorType ?? ''}
                        onValueChange={(value) => handleInputChange('vendorType', value)}
                    >
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Regular">Regular</SelectItem>
                            <SelectItem value="Three Party">Three Party</SelectItem>
                        </SelectContent>
                    </Select>
                ) : (
                    <div className="flex items-center gap-2">
                        <Pill
                            variant={row.original.vendorType === 'Regular' ? 'primary' : 'secondary'}
                        >
                            {row.original.vendorType}
                        </Pill>
                        {editingRow !== row.original.indentNo && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4"
                                onClick={() => handleEditClick(row.original)}
                            >
                                <PenSquare className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'comparisonSheet',
            header: 'Sheet',
            cell: ({ row }) => {
                const indent = row.original;
                // Only Three Party items in history have a comparisonSheet capability in VENDOR_RATE_UPDATE
                if (indent.source !== 'rate_update') return <span className="text-muted-foreground">—</span>;

                const isUploading = uploadingFileId === indent.id;

                return (
                    <div className="flex items-center gap-2">
                        {indent.comparisonSheet ? (
                            <div className="flex gap-2 items-center">
                                <a 
                                    href={indent.comparisonSheet} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-blue-500 hover:underline text-xs"
                                >
                                    View
                                </a>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-6 text-[10px] px-2 py-0"
                                    onClick={() => setExcelEditorConfig({ open: true, historyItemId: indent.id, indentNo: indent.indentNo, fileUrl: indent.comparisonSheet || null })}
                                >
                                    Edit Sheet
                                </Button>
                            </div>
                        ) : (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-6 text-[10px] px-2 py-0"
                                onClick={() => setExcelEditorConfig({ open: true, historyItemId: indent.id, indentNo: indent.indentNo, fileUrl: null })}
                            >
                                Create Sheet
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'editActions',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={() => handleSaveEdit(row.original.indentNo)}
                        >
                            Save
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                        >
                            Cancel
                        </Button>
                    </div>
                ) : null;
            },
        },
    ];

    // Creating Regular Vendor form
    const regularSchema = z.object({
        vendorName: z.string().nonempty(),
        rate: z.coerce.number().gt(0),
        paymentTerm: z.string().nonempty(),
    });

    const regularForm = useForm<z.infer<typeof regularSchema>>({
        resolver: zodResolver(regularSchema),
        defaultValues: {
            vendorName: '',
            rate: 0,
            paymentTerm: '',
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



    async function onSubmitRegular(values: z.infer<typeof regularSchema>) {
        try {
            const result = await postToSheet([{
                indent_number: selectedIndent?.indentNo,
                approvedVendorName: values.vendorName,
                approvedRate: values.rate,
                approvedPaymentTerm: values.paymentTerm,
            } as any], 'insert', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API submission failed');

            toast.success(`Directly approved vendor rate for ${selectedIndent?.indentNo}`);

            // Still update the Indent tracking
            await postToSheet([{
                id: selectedIndent?.indentId,
                indentNumber: selectedIndent?.indentNo,
                actual_2: getCurrentFormattedDateOnly(),
                actual_3: getCurrentFormattedDateOnly(),
                planned_4: getCurrentFormattedDateOnly(),
            } as any], 'update', 'INDENT');

            setOpenDialog(false);
            regularForm.reset();

            await fetchData();
            updateRelatedSheets();
        } catch (error: any) {
            console.error('Error submitting regular vendor rate:', error);
            toast.error('Failed to submit: ' + error.message);
        }
    }


    // Creating Three Party Vendor form
    const threePartySchema = z.object({
        comparisonSheet: z.instanceof(File).optional(),
        vendors: z.array(
            z.object({
                vendorName: z.string().nonempty(),
                rate: z.coerce.number().gt(0),
                paymentTerm: z.string().nonempty(),
            })
        ).max(3).min(3),
    });

    const threePartyForm = useForm<z.infer<typeof threePartySchema>>({
        resolver: zodResolver(threePartySchema),
        defaultValues: {
            vendors: [
                {
                    vendorName: '',
                    rate: 0,
                    paymentTerm: '',
                },
                {
                    vendorName: '',
                    rate: 0,
                    paymentTerm: '',
                },
                {
                    vendorName: '',
                    rate: 0,
                    paymentTerm: '',
                },
            ],
        },
    });

    const { fields } = useFieldArray({
        control: threePartyForm.control,
        name: 'vendors',
    });

    async function onSubmitThreeParty(values: z.infer<typeof threePartySchema>) {
        try {
            let url: string = '';
            if (values.comparisonSheet) {
                url = await uploadFile(
                    values.comparisonSheet,
                    import.meta.env.VITE_COMPARISON_SHEET_FOLDER
                );
            }

            const updatePayload: any = {
                indent_number: selectedIndent?.indentNo,
                vendorName1: values.vendors[0].vendorName,
                rate1: values.vendors[0].rate,
                paymentTerm1: values.vendors[0].paymentTerm,
                vendorName2: values.vendors[1].vendorName,
                rate2: values.vendors[1].rate,
                paymentTerm2: values.vendors[1].paymentTerm,
                vendorName3: values.vendors[2].vendorName,
                rate3: values.vendors[2].rate,
                paymentTerm3: values.vendors[2].paymentTerm,
                planned: new Date().toISOString(),
            };

            if (url) {
                updatePayload.comparisonSheet = url;
            }

            const result = await postToSheet([updatePayload], 'insert', 'VENDOR_RATE_UPDATE');
            if (!result.success) throw new Error('API update failed');

            toast.success(`Submitted three-party rates for ${selectedIndent?.indentNo}`);

            // Still update the Indent tracking
            await postToSheet([{
                id: selectedIndent?.indentId,
                indentNumber: selectedIndent?.indentNo,
                actual_2: getCurrentFormattedDateOnly(),
                planned_3: getCurrentFormattedDateOnly(),
            } as any], 'update', 'INDENT');

            setOpenDialog(false);
            threePartyForm.reset();

            await fetchData();
            updateRelatedSheets();
        } catch (error: any) {
            console.error('Error submitting vendor rates:', error);
            toast.error('Failed to submit: ' + error.message);
        }
    }



    // History Update form
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
            historyUpdateForm.reset({ rate: selectedHistory.rate })
        }
    }, [selectedHistory])

    async function onSubmitHistoryUpdate(values: z.infer<typeof historyUpdateSchema>) {
        try {
            const isThreePartySource = selectedHistory?.source === 'three_party';
            const table = isThreePartySource ? 'THREE_PARTY_APPROVAL' : 'VENDOR_RATE_UPDATE';

            const payload: any = {
                id: selectedHistory?.id,
                indent_number: selectedHistory?.indentNo
            };

            if (isThreePartySource) {
                payload.approvedRate = values.rate;
            } else {
                payload.rate1 = values.rate;
            }

            const result = await postToSheet([payload], 'update', table as any);

            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated rate for ${selectedHistory?.indentNo}`);
            setOpenDialog(false);
            historyUpdateForm.reset({ rate: undefined });

            await fetchData();
        } catch (error: any) {
            console.error('Error updating history rate:', error);
            toast.error('Failed to update: ' + error.message);
        }
    }
    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div>
            <Dialog
                open={openDialog}
                onOpenChange={(open) => {
                    setOpenDialog(open);
                    if (!open) {
                        setSelectedIndent(null);
                        setSelectedHistory(null);
                    }
                }}
            >
                <Tabs defaultValue="pending">
                    <Heading
                        heading="Vendor Rate Update"
                        subtext="Update vendors for Regular and Three Party indents"
                        tabs
                    >
                        <UserCheck size={50} className="text-primary" />
                    </Heading>
                    <TabsContent value="pending" className="w-full">
                    <DataTable
                        data={tableData}
                        columns={columns}
                        searchFields={['indentNo', 'product', 'department', 'indenter']}
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
                </TabsContent>
                <TabsContent value="history" className="w-full">
                    <DataTable
                        data={historyData}
                        columns={historyColumns}
                        searchFields={['indentNo', 'product', 'department', 'indenter', 'vendorName']}
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
                {selectedIndent ? (
                    selectedIndent.vendorType === 'Three Party' ? (
                        <DialogContent>
                            <Form {...threePartyForm}>
                                <form
                                    onSubmit={threePartyForm.handleSubmit(
                                        onSubmitThreeParty,
                                        onError
                                    )}
                                    className="space-y-7"
                                >
                                    <DialogHeader className="space-y-1">
                                        <DialogTitle>Three Party Vendors</DialogTitle>
                                        <DialogDescription>
                                            Update vendors for{' '}
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
                                    <Tabs
                                        defaultValue="0"
                                        className="grid gap-5 p-4 border rounded-md"
                                    >
                                        <TabsList className="w-full p-1">
                                            <TabsTrigger value="0">Vendor 1</TabsTrigger>
                                            <TabsTrigger value="1">Vendor 2</TabsTrigger>
                                            <TabsTrigger value="2">Vendor 3</TabsTrigger>
                                        </TabsList>
                                        {fields.map((field, index) => (
                                            <TabsContent value={`${index}`} key={field.id}>
                                                <div className="grid gap-3">
                                                    <FormField
                                                        control={threePartyForm.control}
                                                        name={`vendors.${index}.vendorName`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Vendor Name</FormLabel>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue placeholder="Select vendor" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <div className="max-h-[300px] overflow-y-auto">
                                                                            {vendorsLoading ? (
                                                                                <div className="py-6 text-center text-sm text-muted-foreground">
                                                                                    Loading vendors...
                                                                                </div>
                                                                            ) : vendors?.length > 0 ? (
                                                                                vendors.map((vendor, i) => (
                                                                                    <SelectItem key={i} value={vendor.vendorName}>
                                                                                        {vendor.vendorName}
                                                                                    </SelectItem>
                                                                                ))
                                                                            ) : (
                                                                                <div className="py-6 text-center text-sm text-muted-foreground">
                                                                                    No vendors available
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={threePartyForm.control}
                                                        name={`vendors.${index}.rate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Rate</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        placeholder="Enter rate"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={threePartyForm.control}
                                                        name={`vendors.${index}.paymentTerm`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Payment Term</FormLabel>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue placeholder="Select payment term" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <div className="max-h-[200px] overflow-y-auto">
                                                                            {paymentTermsLoading ? (
                                                                                <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
                                                                            ) : paymentTerms.length > 0 ? (
                                                                                paymentTerms.map((term, i) => (
                                                                                    <SelectItem key={i} value={term}>{term}</SelectItem>
                                                                                ))
                                                                            ) : (
                                                                                <div className="py-6 text-center text-sm text-muted-foreground">No payment terms found</div>
                                                                            )}
                                                                        </div>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </TabsContent>
                                        ))}
                                    </Tabs>
                                    <FormField
                                        control={threePartyForm.control}
                                        name="comparisonSheet"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Comparison Sheet</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="file"
                                                        onChange={(e) =>
                                                            field.onChange(e.target.files?.[0])
                                                        }
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="outline">Close</Button>
                                        </DialogClose>

                                        <Button
                                            type="submit"
                                            disabled={threePartyForm.formState.isSubmitting}
                                        >
                                            {threePartyForm.formState.isSubmitting && (
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
                    ) : (
                        <DialogContent>
                            <Form {...regularForm}>
                                <form
                                    onSubmit={regularForm.handleSubmit(onSubmitRegular, onError)}
                                    className="space-y-5"
                                >
                                    <DialogHeader className="space-y-1">
                                        <DialogTitle>Regular Vendor</DialogTitle>
                                        <DialogDescription>
                                            Update vendor for{' '}
                                            <span className="font-medium">
                                                {selectedIndent.indentNo}
                                            </span>
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid grid-cols-3 bg-muted p-2 rounded-md ">
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
                                            control={regularForm.control}
                                            name="vendorName"
                                            render={({ field }) => {
                                                const filteredVendors = vendors?.filter(vendor =>
                                                    vendor.vendorName.toLowerCase().includes(vendorSearch.toLowerCase())
                                                );

                                                return (
                                                    <FormItem>
                                                        <FormLabel>Vendor Name</FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                            onOpenChange={(open) => {
                                                                if (!open) setVendorSearch("");
                                                            }}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select vendor" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                                    <SelectContent>
                                                                        <div className="p-2 border-b space-y-2">
                                                                            <div className="flex items-center border-b px-2 pb-1">
                                                                                <Input
                                                                                    placeholder="Search vendors..."
                                                                                    className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                                                                    value={vendorSearch}
                                                                                    onChange={(e) => setVendorSearch(e.target.value)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onKeyDown={(e) => e.stopPropagation()}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                <div className="max-h-[200px] overflow-y-auto">
                                                                    {vendorsLoading ? (
                                                                        <div className="py-6 text-center text-sm text-muted-foreground">
                                                                            Loading vendors...
                                                                        </div>
                                                                    ) : filteredVendors?.length > 0 ? (
                                                                        filteredVendors.map((vendor, i) => (
                                                                            <SelectItem key={i} value={vendor.vendorName}>
                                                                                {vendor.vendorName}
                                                                            </SelectItem>
                                                                        ))
                                                                    ) : (
                                                                        <div className="py-6 text-center text-sm text-muted-foreground">
                                                                            No vendors found
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                );
                                            }}
                                        />

                                        <FormField
                                            control={regularForm.control}
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
                                        <FormField
                                            control={regularForm.control}
                                            name="paymentTerm"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <FormLabel>Payment Term</FormLabel>
                                                        <FormControl>
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue placeholder="Select payment term" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <div className="max-h-[200px] overflow-y-auto">
                                                                {paymentTermsLoading ? (
                                                                    <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
                                                                ) : paymentTerms.length > 0 ? (
                                                                    paymentTerms.map((term, i) => (
                                                                        <SelectItem key={i} value={term}>{term}</SelectItem>
                                                                    ))
                                                                ) : (
                                                                    <div className="py-6 text-center text-sm text-muted-foreground">No payment terms found</div>
                                                                )}
                                                            </div>
                                                        </SelectContent>
                                                    </Select>
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
                                            disabled={regularForm.formState.isSubmitting}
                                        >
                                            {regularForm.formState.isSubmitting && (
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
                    )
                ) : selectedHistory && selectedHistory.vendorType === "Regular" ? (
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
                ) : null}
            </Dialog>

            <ExcelEditorDialog
                open={excelEditorConfig.open}
                fileUrl={excelEditorConfig.fileUrl}
                onClose={() => setExcelEditorConfig(prev => ({ ...prev, open: false }))}
                onSave={handleExcelEditorSave}
            />
        </div>
    )
};