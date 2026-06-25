import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
} from '../ui/dialog';
import { postToSheet, uploadFile, fetchVendors, fetchFromSupabasePaginated, fetchIndentMasterData, fetchPaymentTerms } from '@/lib/fetchers';
import { z } from 'zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { UserCheck, PenSquare, Search, FileDown, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import ExcelEditorDialog from '../element/ExcelEditorDialog';
import { Pill } from '../ui/pill';
import { formatDate, debounce } from '@/lib/utils';
import { pdf } from '@react-pdf/renderer';
import ComparisonPdf from '../element/ComparisonPdf';



interface VendorUpdateData {
    id: number;
    indentId: number;
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    areaOfUse?: string;
    departmentHead?: string;
    indentApprovedBy?: string;
    product: string;
    productCode: string | null;
    productCategory: string;
    quantity: number;
    uom: string;
    specifications: string;
    attachment: string;
    vendorType: 'Three Party' | 'Regular';
    vendorName?: string;
    requestDate: string;
    approvalDate: string;
    date: string;
    validityDate: string;
}
interface HistoryData {
    id: number;
    source?: 'rate_update' | 'three_party';
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    productCode?: string;
    quantity: number;
    uom: string;
    placeholder?: string;
    rate1: number;
    vendorType: 'Three Party' | 'Regular';
    date: string;
    lastUpdated?: string;
    vendorName1?: string;
    vendorName2?: string;
    rate2?: number;
    paymentTerm1?: string;
    paymentTerm2?: string;
    vendorName3?: string;
    rate3?: number;
    paymentTerm3?: string;
    requestDate: string;
    approvalDate: string;
    comparisonSheet?: string;
    rate?: number;
    vendorName?: string;
    deliveryTime1?: number;
    deliveryTime2?: number;
    deliveryTime3?: number;
    quotes?: { slot: number; vendorName: string | null; vendorId: number | null; rate: number | null; paymentTerm: string | null; deliveryTime: number | null; comparisonSheet: string | null }[];
}

interface PendingGroup {
    groupKey: string;
    indentNo: string;
    vendorType: 'Three Party' | 'Regular';
    firm: string;
    indenter: string;
    department: string;
    areaOfUse?: string;
    departmentHead?: string;
    indentApprovedBy?: string;
    requestDate: string;
    approvalDate: string;
    date: string;
    validityDate: string;
    items: (VendorUpdateData & { displayCode: string; baseIndentNo: string })[];
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();

    const [selectedGroup, setSelectedGroup] = useState<PendingGroup | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<HistoryData | null>(null);
    const [viewingHistoryGroup, setViewingHistoryGroup] = useState<any>(null);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [tableData, setTableData] = useState<VendorUpdateData[]>([]);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [uploadingFileId, setUploadingFileId] = useState<number | null>(null);
    const [excelEditorConfig, setExcelEditorConfig] = useState<{ open: boolean; historyItemId: number | null; indentNo: string; fileUrl: string | null; }>({ open: false, historyItemId: null, indentNo: '', fileUrl: null });
    const [editValues, setEditValues] = useState<Partial<HistoryData>>({});
    const [vendors, setVendors] = useState<any[]>([]);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    // Payment terms now come from the Payment Term master tab (not a hardcoded list).
    const [PAYMENT_TERMS, setPaymentTerms] = useState<string[]>([]);

    useEffect(() => {
        fetchPaymentTerms().then((data: any[]) =>
            setPaymentTerms((data || []).filter((t: any) => t.isActive !== false).map((t: any) => t.name))
        );
    }, []);

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
    const [selectedIndents, setSelectedIndents] = useState<Set<string>>(new Set());
    const [isReviewOpen, setIsReviewOpen] = useState(false);
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

    // Look up a vendor's master price by name (null if not set)
    const getVendorPrice = useCallback((vendorName: string): number | null => {
        const v = vendors.find(x => x.vendorName === vendorName);
        return v && v.price != null ? Number(v.price) : null;
    }, [vendors]);

    useEffect(() => {
        const loadVendors = async () => {
            setVendorsLoading(true);
            const v = await fetchVendors();
            setVendors(v || []);
            setVendorsLoading(false);
        };
        loadVendors();
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
                { column: 'createdAt', options: { ascending: true } },
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
                    areaOfUse: record.areaOfUse || '',
                    departmentHead: record.departmentHead || '',
                    indentApprovedBy: record.indentApprovedBy || '',
                    product: record.productName || '',
                    productCode: record.productCode || null,
                    productCategory: record.productCategory || '',
                    quantity: record.approvedQuantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    attachment: record.attachment || '',
                    vendorType: record.vendorType as VendorUpdateData['vendorType'],
                    requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    validityDate: record.validityDate ? formatDate(new Date(record.validityDate)) : '',
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
                    { column: 'createdAt', options: { ascending: true } },
                    undefined, undefined,
                    { page: pageValue, limit: 50, search: searchQuery }
                ),
                fetchFromSupabasePaginated('three_party_approval', '*',
                    { column: 'createdAt', options: { ascending: true } },
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
                        productCode: record.productCode || record.product_code || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate1: record.rate1 || 0,
                        vendorType: record.vendorType || (record.vendorName2 ? 'Three Party' : 'Regular'),
                        vendorName1: record.vendorName1 || '',
                        vendorName2: record.vendorName2 || '',
                        rate2: record.rate2 || 0,
                        paymentTerm1: record.paymentTerm1 || '',
                        paymentTerm2: record.paymentTerm2 || '',
                        vendorName3: record.vendorName3 || '',
                        rate3: record.rate3 || 0,
                        paymentTerm3: record.paymentTerm3 || '',
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                        comparisonSheet: record.comparisonSheet || '',
                        deliveryTime1: record.deliveryTime1 || 0,
                        deliveryTime2: record.deliveryTime2 || 0,
                        deliveryTime3: record.deliveryTime3 || 0,
                        quotes: record.quotes || [],
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
                        productCode: record.productCode || record.product_code || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate1: record.approvedRate || 0,
                        vendorType: record.vendorType || (record.approvedVendorName ? 'Regular' : 'Three Party'),
                        vendorName1: record.approvedVendorName || '',
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
            rate: row.rate1 || row.rate,
            product: row.product,
            vendorName: row.vendorName1 || row.vendorName,
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

    // Group pending items by indent number and vendor type so mixed approvals
    // under one indent follow their own Regular / Three Party flows.
    const groupedPendingData = useMemo(() => {
        const groups = new Map<string, VendorUpdateData[]>();
        filteredTableData.forEach(item => {
            const baseIndentNo = item.indentNo.replace(/-[A-Z]+$/, '');
            const groupKey = `${baseIndentNo}::${item.vendorType}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(item);
        });

        return Array.from(groups.entries())
            .map(([groupKey, items]) => {
                const [baseIndentNo] = groupKey.split('::');
                // Sort items within group by date ascending
                const sortedItems = [...items].sort((a, b) => 
                    new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
                );

                const itemsWithCode = sortedItems.map(item => {
                    return {
                        ...item,
                        displayCode: item.productCode || '', // Show empty in UI if productCode is not in DB
                        baseIndentNo
                    };
                });
                const first = sortedItems[0];
                return {
                    groupKey,
                    indentNo: baseIndentNo,
                    vendorType: first.vendorType,
                    firm: first.firm,
                    indenter: first.indenter,
                    department: first.department,
                    areaOfUse: first.areaOfUse,
                    departmentHead: first.departmentHead,
                    indentApprovedBy: first.indentApprovedBy,
                    requestDate: first.requestDate,
                    approvalDate: first.approvalDate,
                    date: first.date,
                    validityDate: first.validityDate,
                    items: itemsWithCode,
                };
            })
            // Sort groups by date ascending
            .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    }, [filteredTableData]);

    const groupedHistoryData = useMemo(() => {
        const groups = new Map<string, HistoryData[]>();
        filteredHistoryData.forEach(item => {
            const baseIndentNo = item.indentNo.replace(/-[A-Z]+$/, '');
            const groupKey = `${baseIndentNo}::${item.vendorType}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(item);
        });

        return Array.from(groups.entries())
            .map(([groupKey, items]) => {
                const [baseIndentNo] = groupKey.split('::');
                // Deduplicate by product: same indent+product can appear in both
                // vendor_rate_update and three_party_approval — keep three_party if present
                const seenProducts = new Map<string, HistoryData>();
                for (const item of items) {
                    const key = item.productCode || item.product || item.indentNo;
                    const existing = seenProducts.get(key);
                    if (!existing) {
                        seenProducts.set(key, item);
                    } else if (item.source === 'three_party') {
                        // Merge: take three_party data but preserve vendor names from rate_update if missing
                        seenProducts.set(key, {
                            ...item,
                            rate1: item.rate1 || existing.rate1,
                            rate2: item.rate2 || existing.rate2,
                            rate3: item.rate3 || existing.rate3,
                            vendorName1: item.vendorName1 || existing.vendorName1,
                            vendorName2: item.vendorName2 || existing.vendorName2,
                            vendorName3: item.vendorName3 || existing.vendorName3,
                            deliveryTime1: item.deliveryTime1 || existing.deliveryTime1,
                            deliveryTime2: item.deliveryTime2 || existing.deliveryTime2,
                            deliveryTime3: item.deliveryTime3 || existing.deliveryTime3,
                        });
                    } else if (existing.source === 'three_party') {
                        // Current is rate_update, existing is three_party: update existing with our vendor names
                        seenProducts.set(key, {
                            ...existing,
                            vendorName1: existing.vendorName1 || item.vendorName1,
                            vendorName2: existing.vendorName2 || item.vendorName2,
                            vendorName3: existing.vendorName3 || item.vendorName3,
                            deliveryTime1: existing.deliveryTime1 || item.deliveryTime1,
                            deliveryTime2: existing.deliveryTime2 || item.deliveryTime2,
                            deliveryTime3: existing.deliveryTime3 || item.deliveryTime3,
                        });
                    }
                }
                // Sort deduplicated items by date ascending
                const deduplicatedItems = Array.from(seenProducts.values()).sort((a, b) => 
                    new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
                );

                const first = deduplicatedItems[0];
                return {
                    groupKey,
                    indentNo: baseIndentNo,
                    firm: first.firm,
                    indenter: first.indenter,
                    department: first.department,
                    vendorName1: first.vendorName1,
                    vendorName2: first.vendorName2,
                    vendorName3: first.vendorName3,
                    rate1: first.rate1,
                    rate2: first.rate2,
                    rate3: first.rate3,
                    deliveryTime1: first.deliveryTime1,
                    deliveryTime2: first.deliveryTime2,
                    deliveryTime3: first.deliveryTime3,
                    quotes: first.quotes || [],
                    vendorType: first.vendorType,
                    date: first.date,
                    requestDate: first.requestDate,
                    approvalDate: first.approvalDate,
                    items: deduplicatedItems,
                };
            })
            // Sort groups by date ascending
            .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    }, [filteredHistoryData]);

    const handleIndentSelect = (groupKey: string, checked: boolean) => {
        setSelectedIndents(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(groupKey);
            else newSet.delete(groupKey);
            return newSet;
        });
    };

    const handleSelectAllIndents = (checked: boolean) => {
        if (checked) {
            setSelectedIndents(new Set(groupedPendingData.map(item => item.groupKey)));
        } else {
            setSelectedIndents(new Set());
        }
    };

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
            <Select value={filters.product} onValueChange={(val) => setFilters({ ...filters, product: val })}>
                <SelectTrigger size="xxs" className="h-7 w-[150px] text-[11px] shadow-sm px-2">
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
                <Button variant="outline" size="sm" onClick={() => setViewingHistoryGroup(row.original)}>
                    View
                </Button>
            ),
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
            accessorKey: 'indenter',
            header: 'Indenter',
        },
        {
            accessorKey: 'department',
            header: 'Department',
        },
        {
            header: 'Products',
            cell: ({ row }) => {
                const count = row.original.items.length;
                return `${count} ${count === 1 ? 'product' : 'products'}`;
            },
        },
        {
            accessorKey: 'vendorName1',
            header: 'Vendor Name',
            cell: ({ row }) => {
                const type = row.original.vendorType;
                if (type === 'Three Party') return '3';
                return row.original.vendorName1 || '—';
            }
        },
        {
            accessorKey: 'date',
            header: 'Date',
        },
        {
            header: 'Delivery Time',
            cell: ({ row }) => {
                if (row.original.vendorType !== 'Three Party') return '—';
                const { deliveryTime1, deliveryTime2, deliveryTime3 } = row.original;
                const parts = [deliveryTime1, deliveryTime2, deliveryTime3].map(t => t ? `${t}d` : '—');
                return parts.join(' / ');
            },
        },
        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ getValue }) => {
                const val = getValue() as string;
                return (
                    <Pill variant={val === 'Three Party' ? 'secondary' : 'default'}>
                        {val === 'Three Party' ? 'Multi-Party' : val}
                    </Pill>
                );
            },
        },
    ];

    // Creating Regular Vendor form (multi-product, per-product vendor/rate/payment term)
    const regularSchema = z.object({
        products: z.array(z.object({
            vendorName: z.string().nonempty('Vendor is required'),
            rate: z.coerce.number().gt(0, 'Rate must be > 0'),
            paymentTerm: z.string().nonempty('Payment term required'),
        })).min(1),
    });

    const regularForm = useForm<z.infer<typeof regularSchema>>({
        resolver: zodResolver(regularSchema),
        defaultValues: {
            products: [],
        },
    });

    const { fields: regularProductFields } = useFieldArray({
        control: regularForm.control,
        name: 'products',
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
        if (!selectedGroup) return;
        try {
            const results = await Promise.all(selectedGroup.items.map((item, i) =>
                postToSheet([{
                    indent_id: item.indentId,
                    indent_number: item.indentNo,
                    product_code: item.productCode,
                    approvedVendorName: values.products[i].vendorName,
                    approvedRate: values.products[i].rate,
                    approvedPaymentTerm: values.products[i].paymentTerm,
                } as any], 'insert', 'THREE_PARTY_APPROVAL')
            ));

            if (results.some(r => !r.success)) throw new Error('API submission failed');

            toast.success(`Approved vendor for ${selectedGroup.indentNo}`);

            await Promise.all(selectedGroup.items.map(item =>
                postToSheet([{
                    id: item.indentId,
                    indentNumber: item.indentNo,
                    actual_2: getCurrentFormattedDateOnly(),
                    actual_3: getCurrentFormattedDateOnly(),
                    planned_4: getCurrentFormattedDateOnly(),
                } as any], 'update', 'INDENT')
            ));

            setSelectedGroup(null);
            setIsReviewOpen(false);
            regularForm.reset();
            await fetchData();
            updateRelatedSheets();
        } catch (error: any) {
            console.error('Error submitting regular vendor rate:', error);
            toast.error('Failed to submit: ' + error.message);
        }
    }


    // Multi-Party Vendor form (multi-product, dynamic 1..10 vendor columns).
    // Vendors are a field array; each vendor carries its own per-product rates,
    // so adding/removing a vendor is a single append/remove with no nested shuffling.
    const MAX_VENDORS = 10;
    const threePartySchema = z.object({
        vendors: z.array(z.object({
            vendorName: z.string().nonempty('Vendor is required'),
            paymentTerm: z.string().nonempty('Payment term required'),
            deliveryTime: z.coerce.number().int().min(1, 'Required'),
            comparisonSheet: z.instanceof(File, { message: 'Comparison sheet is required' }),
            rates: z.array(z.coerce.number().gt(0, 'Rate must be > 0')).min(1),
        })).min(1, 'At least one vendor is required').max(MAX_VENDORS),
    });

    const makeDefaultVendors = (vendorCount: number, productCount: number) =>
        Array.from({ length: vendorCount }, () => ({
            vendorName: '',
            paymentTerm: '',
            deliveryTime: 0,
            comparisonSheet: undefined as unknown as File,
            rates: Array.from({ length: productCount }, () => 0),
        }));

    const threePartyForm = useForm<z.infer<typeof threePartySchema>>({
        resolver: zodResolver(threePartySchema),
        defaultValues: { vendors: [] },
    });

    const { fields: vendorFields, append: appendVendor, remove: removeVendor } = useFieldArray({
        control: threePartyForm.control,
        name: 'vendors',
    });

    useEffect(() => {
        if (selectedGroup) {
            // Default to 3 vendor columns (common case); user can add up to 10 or remove down to 1.
            threePartyForm.reset({ vendors: makeDefaultVendors(3, selectedGroup.items.length) });
            regularForm.reset({
                products: selectedGroup.items.map(() => ({ vendorName: '', rate: 0, paymentTerm: '' })),
            });
        }
    }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleAddVendor() {
        if (!selectedGroup || vendorFields.length >= MAX_VENDORS) return;
        appendVendor(makeDefaultVendors(1, selectedGroup.items.length)[0]);
    }

    async function onSubmitThreeParty(values: z.infer<typeof threePartySchema>) {
        if (!selectedGroup) return;
        try {
            // Upload each vendor's comparison sheet in parallel.
            const sheetUrls = await Promise.all(
                values.vendors.map(v => v.comparisonSheet
                    ? uploadFile(v.comparisonSheet, import.meta.env.VITE_COMPARISON_SHEET_FOLDER)
                    : Promise.resolve(''))
            );

            await Promise.all(selectedGroup.items.map((item, i) => {
                const quotes = values.vendors.map((v, vIdx) => ({
                    slot: vIdx + 1,
                    vendorName: v.vendorName,
                    rate: v.rates[i],
                    paymentTerm: v.paymentTerm,
                    deliveryTime: v.deliveryTime,
                    comparisonSheet: sheetUrls[vIdx] || null,
                }));
                const payload: any = {
                    indent_id: item.indentId,
                    indent_number: item.indentNo,
                    product_code: item.productCode,
                    planned: new Date().toISOString(),
                    quotes,
                };
                return postToSheet([payload], 'insert', 'VENDOR_RATE_UPDATE');
            }));

            await Promise.all(selectedGroup.items.map(item =>
                postToSheet([{
                    id: item.indentId,
                    indentNumber: item.indentNo,
                    actual_2: getCurrentFormattedDateOnly(),
                    planned_3: getCurrentFormattedDateOnly(),
                } as any], 'update', 'INDENT')
            ));

            toast.success(`Submitted vendor rates for ${selectedGroup.indentNo}`);
            setSelectedGroup(null);
            setIsReviewOpen(false);
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
            historyUpdateForm.reset({ rate: selectedHistory.rate1 || selectedHistory.rate || 0 })
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
            setSelectedHistory(null);
            setIsReviewOpen(false);
            historyUpdateForm.reset({ rate: 0 });

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
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Tabs defaultValue="pending" className="w-full">
                <Heading
                    heading="Vendor Rate Update"
                    subtext="Update vendors for Regular and Multi-Party indents"
                    tabs
                >
                    <UserCheck size={50} className="text-primary" />
                </Heading>
                <TabsContent value="pending" className="w-full">
                    <div className="space-y-3 mt-2">
                        {/* Search + Filters + Submit */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
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
                                onClick={() => setIsReviewOpen(true)}
                                disabled={selectedIndents.size === 0}
                                className="h-8 text-xs bg-green-600 hover:bg-green-700 flex items-center gap-2"
                            >
                                Update {selectedIndents.size > 0 && `(${selectedIndents.size})`}
                            </Button>
                        </div>

                        {pendingSearching && (
                            <div className="w-full h-0.5 bg-primary/20 rounded-full overflow-hidden">
                                <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
                            </div>
                        )}

                        {pendingInitialLoading ? (
                            <div className="space-y-3">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
                                        <div className="h-4 bg-muted rounded w-1/3" />
                                        <div className="h-8 bg-muted rounded" />
                                        <div className="h-8 bg-muted rounded" />
                                    </div>
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
                                            <TableHead>Vendor Type</TableHead>
                                            <TableHead>Products</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupedPendingData.map(group => (
                                            <TableRow
                                                key={group.groupKey}
                                                className={selectedIndents.has(group.groupKey) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}
                                            >
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300"
                                                        checked={selectedIndents.has(group.groupKey)}
                                                        onChange={(e) => handleIndentSelect(group.groupKey, e.target.checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.indentNo}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.firm}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.indenter}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.department}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.requestDate}</TableCell>
                                                <TableCell>
                                                    <Pill variant={group.vendorType === 'Three Party' ? 'secondary' : 'primary'}>
                                                        {group.vendorType === 'Three Party' ? 'Multi-Party' : group.vendorType}
                                                    </Pill>
                                                </TableCell>
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
                        searchFields={['indentNo', 'firm', 'department', 'indenter', 'vendorName']}
                        dataLoading={historyInitialLoading}
                        isSearching={historySearching}
                        pagination={true}
                        pageSize={50}
                        extraActions={
                            <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />
                        }
                    />
                </TabsContent>
            </Tabs>

            <Dialog
                open={isReviewOpen}
                onOpenChange={(open) => {
                    setIsReviewOpen(open);
                    if (!open) {
                        setSelectedGroup(null);
                        setSelectedHistory(null);
                    }
                }}
            >
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    {!selectedGroup && !selectedHistory ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Review & Update Vendor Rates</DialogTitle>
                            </DialogHeader>

                            <div className="space-y-8 py-2">
                                {groupedPendingData
                                    .filter(group => selectedIndents.has(group.groupKey))
                                    .map(group => (
                                        <div key={group.groupKey} className="rounded-lg border overflow-hidden">

                                            {/* ── Indent title bar ── */}
                                            <div className="bg-primary px-4 py-2 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-primary-foreground tracking-wide">{group.indentNo}</span>
                                                    <Pill variant={group.vendorType === 'Three Party' ? 'secondary' : 'primary'}>
                                                        {group.vendorType === 'Three Party' ? 'Multi-Party' : group.vendorType}
                                                    </Pill>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-7 text-xs"
                                                    onClick={() => setSelectedGroup(group)}
                                                >
                                                    Update
                                                </Button>
                                            </div>

                                            {/* ── Indent details grid ── */}
                                            <div className="bg-muted/30 px-4 py-3 border-b grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                                                {[
                                                    { label: 'Firm', value: group.firm },
                                                    { label: 'Indenter', value: group.indenter },
                                                    { label: 'Department', value: group.department },
                                                    { label: 'Area of Use', value: group.areaOfUse },
                                                    { label: 'Department Head', value: group.departmentHead },
                                                    { label: 'Approved By', value: group.indentApprovedBy },
                                                    { label: 'Created Date', value: group.date },
                                                    { label: 'Validity Date', value: group.validityDate },
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
                                                            <TableHead className="text-xs">Vendor Type</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {group.items.map(item => (
                                                            <TableRow key={item.id}>
                                                                <TableCell>
                                                                    {item.productCode
                                                                        ? <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">{item.productCode}</span>
                                                                        : <span className="text-muted-foreground text-xs">—</span>
                                                                    }
                                                                </TableCell>
                                                                <TableCell className="text-xs font-medium max-w-[160px]">{item.product}</TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">{item.productCategory || '—'}</TableCell>
                                                                <TableCell className="text-xs">{item.quantity}</TableCell>
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
                                                                <TableCell>
                                                                    <Pill variant={item.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                                                                        {item.vendorType}
                                                                    </Pill>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </>
                    ) : selectedGroup ? (
                        <div>
                            {selectedGroup.vendorType === 'Three Party' ? (
                                <Form {...threePartyForm}>
                                    <form
                                        onSubmit={threePartyForm.handleSubmit(onSubmitThreeParty, onError)}
                                        className="space-y-7"
                                    >
                                        <DialogHeader className="space-y-1">
                                            <DialogTitle>Multi-Party Vendors</DialogTitle>
                                            <DialogDescription>
                                                Update vendors for{' '}
                                                <span className="font-medium">{selectedGroup.indentNo}</span>
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-muted py-2 px-5 rounded-md">
                                            <div className="space-y-1">
                                                <p className="font-medium text-xs">Indenter</p>
                                                <p className="text-sm font-light">{selectedGroup.indenter}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-medium text-xs">Department</p>
                                                <p className="text-sm font-light">{selectedGroup.department}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-medium text-xs">Products</p>
                                                <p className="text-sm font-light">{selectedGroup.items.length} item{selectedGroup.items.length > 1 ? 's' : ''}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground">
                                                {vendorFields.length} vendor{vendorFields.length > 1 ? 's' : ''} (max {MAX_VENDORS})
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs"
                                                disabled={vendorFields.length >= MAX_VENDORS}
                                                onClick={handleAddVendor}
                                            >
                                                + Add Vendor
                                            </Button>
                                        </div>

                                        <div className="border rounded-md overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/40">
                                                        <TableHead className="w-40 text-xs font-semibold">Product Name</TableHead>
                                                        {vendorFields.map((vf, v) => (
                                                            <TableHead key={vf.id} className="text-xs font-semibold min-w-[180px]">
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <span>Vendor {v + 1} <span className="text-red-500">*</span></span>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive disabled:opacity-30"
                                                                        title="Remove vendor"
                                                                        disabled={vendorFields.length <= 1}
                                                                        onClick={() => removeVendor(v)}
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {/* Vendor Name row */}
                                                    <TableRow>
                                                        <TableCell className="text-xs font-medium text-muted-foreground">Vendor</TableCell>
                                                        {vendorFields.map((vf, v) => (
                                                            <TableCell key={vf.id} className="min-w-[180px]">
                                                                <FormField
                                                                    control={threePartyForm.control}
                                                                    name={`vendors.${v}.vendorName`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <Select
                                                                                onValueChange={(val) => {
                                                                                    field.onChange(val);
                                                                                    const price = getVendorPrice(val);
                                                                                    selectedGroup.items.forEach((_, pi) => {
                                                                                        threePartyForm.setValue(
                                                                                            `vendors.${v}.rates.${pi}`,
                                                                                            price != null ? price : 0,
                                                                                            { shouldValidate: true }
                                                                                        );
                                                                                    });
                                                                                }}
                                                                                value={field.value}
                                                                            >
                                                                                <FormControl>
                                                                                    <SelectTrigger size="xs" className="w-full h-8 text-xs">
                                                                                        <SelectValue placeholder="Select vendor" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    <div className="max-h-[300px] overflow-y-auto">
                                                                                        {vendorsLoading ? (
                                                                                            <div className="py-6 text-center text-sm text-muted-foreground">Loading vendors...</div>
                                                                                        ) : vendors?.length > 0 ? (
                                                                                            vendors.map((vendor, i) => (
                                                                                                <SelectItem key={i} value={vendor.vendorName}>{vendor.vendorName}</SelectItem>
                                                                                            ))
                                                                                        ) : (
                                                                                            <div className="py-6 text-center text-sm text-muted-foreground">No vendors available</div>
                                                                                        )}
                                                                                    </div>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                    {/* One row per product */}
                                                    {selectedGroup.items.map((product, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="text-xs font-medium align-top pt-3">
                                                                <div className="space-y-1">
                                                                    {product?.productCode && (
                                                                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">
                                                                            {product.productCode}
                                                                        </span>
                                                                    )}
                                                                    <div>
                                                                        {product?.product} <span className="text-[10px] text-muted-foreground font-normal">(Rate)</span> <span className="text-red-500">*</span>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            {vendorFields.map((vf, v) => (
                                                                <TableCell key={vf.id} className="min-w-[180px] align-top">
                                                                    <FormField
                                                                        control={threePartyForm.control}
                                                                        name={`vendors.${v}.rates.${i}`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormControl>
                                                                                    <Input type="number" placeholder="Enter rate" className="w-full h-8 text-xs" {...field} />
                                                                                </FormControl>
                                                                                <FormMessage className="text-[10px]" />
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                    {/* Payment Term row */}
                                                    <TableRow>
                                                        <TableCell className="text-xs font-medium text-muted-foreground">Payment Term <span className="text-red-500">*</span></TableCell>
                                                        {vendorFields.map((vf, v) => (
                                                            <TableCell key={vf.id} className="min-w-[180px]">
                                                                <FormField
                                                                    control={threePartyForm.control}
                                                                    name={`vendors.${v}.paymentTerm`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <FormControl>
                                                                                    <SelectTrigger size="xs" className="w-full h-8 text-xs">
                                                                                        <SelectValue placeholder="Select term" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    {PAYMENT_TERMS.map((term) => (
                                                                                        <SelectItem key={term} value={term}>{term}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                    {/* Comparison Sheet upload row */}
                                                    <TableRow>
                                                        <TableCell className="text-xs font-medium text-muted-foreground">
                                                            Comparison Sheet <span className="text-red-500">*</span>
                                                        </TableCell>
                                                        {vendorFields.map((vf, v) => (
                                                            <TableCell key={vf.id} className="min-w-[180px]">
                                                                <FormField
                                                                    control={threePartyForm.control}
                                                                    name={`vendors.${v}.comparisonSheet`}
                                                                    render={({ field, fieldState }) => (
                                                                        <FormItem>
                                                                            <FormControl>
                                                                                <label className="flex flex-col gap-1 cursor-pointer w-fit">
                                                                                    <span className={`inline-flex items-center justify-center h-6 px-2 rounded border bg-background text-[10px] font-medium hover:bg-accent shrink-0 ${fieldState.error ? 'border-red-500' : 'border-input'}`}>
                                                                                        Upload
                                                                                    </span>
                                                                                    {field.value?.name && (
                                                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={field.value.name}>
                                                                                            {field.value.name}
                                                                                        </span>
                                                                                    )}
                                                                                    <input
                                                                                        type="file"
                                                                                        className="hidden"
                                                                                        onChange={(e) => field.onChange(e.target.files?.[0])}
                                                                                    />
                                                                                </label>
                                                                            </FormControl>
                                                                            {fieldState.error && (
                                                                                <p className="text-[10px] text-red-500 mt-0.5">{fieldState.error.message}</p>
                                                                            )}
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                    {/* Actual Time To Receive Material row */}
                                                    <TableRow>
                                                        <TableCell className="text-xs font-medium text-muted-foreground">
                                                            Actual Time To Receive Material <span className="text-red-500">*</span>
                                                        </TableCell>
                                                        {vendorFields.map((vf, v) => (
                                                            <TableCell key={vf.id} className="min-w-[180px]">
                                                                <FormField
                                                                    control={threePartyForm.control}
                                                                    name={`vendors.${v}.deliveryTime`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <FormControl>
                                                                                    <Input
                                                                                        type="number"
                                                                                        step="1"
                                                                                        min="1"
                                                                                        placeholder="e.g. 7"
                                                                                        className="h-8 text-xs w-24"
                                                                                        onFocus={(e) => e.target.select()}
                                                                                        {...field}
                                                                                    />
                                                                                </FormControl>
                                                                                <span className="text-[11px] text-muted-foreground">days</span>
                                                                            </div>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setSelectedGroup(null)}>Back to list</Button>
                                            <Button type="submit" disabled={threePartyForm.formState.isSubmitting}>
                                                {threePartyForm.formState.isSubmitting && <Loader size={20} color="white" aria-label="Loading Spinner" />}
                                                Update
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            ) : (
                                <Form {...regularForm}>
                                    <form
                                        onSubmit={regularForm.handleSubmit(onSubmitRegular, onError)}
                                        className="space-y-5"
                                    >
                                        <DialogHeader className="space-y-1">
                                            <DialogTitle>Regular Vendor</DialogTitle>
                                            <DialogDescription>
                                                Update vendor for{' '}
                                                <span className="font-medium">{selectedGroup.indentNo}</span>
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="grid grid-cols-2 bg-muted p-2 rounded-md">
                                            <div className="space-y-1">
                                                <p className="font-medium text-xs">Indenter</p>
                                                <p className="text-sm font-light">{selectedGroup.indenter}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-medium text-xs">Department</p>
                                                <p className="text-sm font-light">{selectedGroup.department}</p>
                                            </div>
                                        </div>
                                        <div className="border rounded-md overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/40">
                                                        <TableHead className="w-40 text-xs font-semibold">Product Name</TableHead>
                                                        <TableHead className="text-xs font-semibold">Vendor Name <span className="text-red-500">*</span></TableHead>
                                                        <TableHead className="text-xs font-semibold">Rate <span className="text-red-500">*</span></TableHead>
                                                        <TableHead className="text-xs font-semibold">Payment Term <span className="text-red-500">*</span></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {regularProductFields.map((field, i) => (
                                                        <TableRow key={field.id}>
                                                            <TableCell className="text-xs font-medium align-top pt-3">
                                                                <div className="space-y-1">
                                                                    {selectedGroup.items[i]?.productCode && (
                                                                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">
                                                                            {selectedGroup.items[i].productCode}
                                                                        </span>
                                                                    )}
                                                                    <div>{selectedGroup.items[i]?.product}</div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="min-w-[200px] align-top">
                                                                <FormField
                                                                    control={regularForm.control}
                                                                    name={`products.${i}.vendorName`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <Select
                                                                                onValueChange={(val) => {
                                                                                    field.onChange(val);
                                                                                    const price = getVendorPrice(val);
                                                                                    regularForm.setValue(
                                                                                        `products.${i}.rate`,
                                                                                        price != null ? price : 0,
                                                                                        { shouldValidate: true }
                                                                                    );
                                                                                }}
                                                                                value={field.value}
                                                                            >
                                                                                <FormControl>
                                                                                    <SelectTrigger size="xs" className="w-full h-8 text-xs">
                                                                                        <SelectValue placeholder="Select vendor" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    <div className="max-h-[300px] overflow-y-auto">
                                                                                        {vendorsLoading ? (
                                                                                            <div className="py-6 text-center text-sm text-muted-foreground">Loading vendors...</div>
                                                                                        ) : vendors?.length > 0 ? (
                                                                                            vendors.map((vendor, vi) => (
                                                                                                <SelectItem key={vi} value={vendor.vendorName}>{vendor.vendorName}</SelectItem>
                                                                                            ))
                                                                                        ) : (
                                                                                            <div className="py-6 text-center text-sm text-muted-foreground">No vendors available</div>
                                                                                        )}
                                                                                    </div>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="min-w-[140px] align-top">
                                                                <FormField
                                                                    control={regularForm.control}
                                                                    name={`products.${i}.rate`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormControl>
                                                                                <Input type="number" placeholder="Enter rate" className="w-full h-8 text-xs" {...field} />
                                                                            </FormControl>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="min-w-[160px] align-top">
                                                                <FormField
                                                                    control={regularForm.control}
                                                                    name={`products.${i}.paymentTerm`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <FormControl>
                                                                                    <SelectTrigger size="xs" className="w-full h-8 text-xs">
                                                                                        <SelectValue placeholder="Select term" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    {PAYMENT_TERMS.map((term) => (
                                                                                        <SelectItem key={term} value={term}>{term}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setSelectedGroup(null)}>Back to list</Button>
                                            <Button type="submit" disabled={regularForm.formState.isSubmitting}>
                                                {regularForm.formState.isSubmitting && <Loader size={20} color="white" aria-label="Loading Spinner" />}
                                                Update
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            )}
                        </div>
                    ) : selectedHistory ? (
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
                                    <Button variant="outline" onClick={() => setSelectedHistory(null)}>Back to list</Button>

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
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog 
                open={!!viewingHistoryGroup} 
                onOpenChange={(open) => !open && setViewingHistoryGroup(null)}
            >
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Indent Details - {viewingHistoryGroup?.indentNo}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/30 p-4 rounded-lg">
                            <div>
                                <p className="text-xs text-muted-foreground">Firm</p>
                                <p className="text-sm font-medium">{viewingHistoryGroup?.firm}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Indenter</p>
                                <p className="text-sm font-medium">{viewingHistoryGroup?.indenter}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Department</p>
                                <p className="text-sm font-medium">{viewingHistoryGroup?.department}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Vendor Name</p>
                                <div className="text-sm font-medium">
                                    {viewingHistoryGroup?.vendorType === 'Three Party' ? (
                                        <div className="space-y-1 mt-1">
                                            {(viewingHistoryGroup?.quotes || []).map((q: any, idx: number) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${idx === 0 ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted'}`}>V{idx + 1}</span>
                                                    {q.vendorName || '—'}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        viewingHistoryGroup?.vendorName1
                                    )}
                                </div>
                            </div>
                            {viewingHistoryGroup?.vendorType === 'Three Party' && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Actual Time To Receive Material</p>
                                    <div className="text-sm font-medium space-y-1 mt-1">
                                        {(viewingHistoryGroup?.quotes || []).map((q: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${idx === 0 ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted'}`}>V{idx + 1}</span>
                                                {q.deliveryTime ? `${q.deliveryTime} days` : '—'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-muted-foreground">Vendor Type</p>
                                <p className="text-sm font-medium">{viewingHistoryGroup?.vendorType}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Date</p>
                                <p className="text-sm font-medium">{viewingHistoryGroup?.date}</p>
                            </div>
                        </div>

                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product Code</TableHead>
                                        <TableHead>Product Name</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead>UOM</TableHead>
                                        {viewingHistoryGroup?.vendorType === 'Three Party' ? (
                                            (viewingHistoryGroup?.quotes || []).map((_q: any, idx: number) => (
                                                <TableHead key={idx} className={`text-[10px] ${idx === 0 ? 'text-primary font-bold' : ''}`}>Rate {idx + 1} (R{idx + 1})</TableHead>
                                            ))
                                        ) : (
                                            <TableHead>Rate</TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {viewingHistoryGroup?.items.slice().sort((a: any, b: any) => (a.product || '').localeCompare(b.product || '')).map((item: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-mono text-xs">{item.productCode || '—'}</TableCell>
                                            <TableCell className="text-sm">{item.product}</TableCell>
                                            <TableCell className="text-sm">{item.quantity}</TableCell>
                                            <TableCell className="text-sm">{item.uom}</TableCell>
                                            {viewingHistoryGroup?.vendorType === 'Three Party' ? (
                                                (viewingHistoryGroup?.quotes || []).map((_q: any, idx: number) => {
                                                    const rate = (item.quotes?.[idx]?.rate) ?? (item as any)[`rate${idx + 1}`];
                                                    return (
                                                        <TableCell key={idx} className={`text-sm ${idx === 0 ? 'font-bold text-primary' : ''}`}>
                                                            {rate != null && rate !== '' ? `₹${rate}` : '—'}
                                                        </TableCell>
                                                    );
                                                })
                                            ) : (
                                                <TableCell className="text-sm">₹{item.rate1}</TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </DialogContent>
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
