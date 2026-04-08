
import { useSheets } from '@/context/SheetsContext';
import { postToSheet, uploadFile, fetchFromSupabasePaginated } from '@/lib/fetchers';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { useRef } from 'react';
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
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ShoppingCart, SquarePen, Check, X, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { Pill } from '../ui/pill';
import { formatDate } from '@/lib/utils';

import { useCallback } from 'react';

interface EditedData {
    product?: string;
    quantity?: number;
    uom?: string;
    qty?: number;
    billNumber?: string;
    leadTime?: string;
    typeOfBill?: string;
    billAmount?: number;
    discountAmount?: number;
    paymentType?: string;
    advanceAmount?: number;
    rate?: number;
    photoOfBill?: string;
    photoOfBillFile?: File | null;
}

interface GetPurchaseData {
    id: number;
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    uom: string;
    poNumber: string;
    approvedRate: number;
    receivedQty?: number;
    billedQty?: number;
    remainingQty?: number;
    vendor?: string;
}


interface HistoryData {
    id: number;
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    billedQty: number;
    uom: string;
    poNumber: string;
    billStatus: string;
    date: string;
    billNumber: string;
    billAmount: number;
    photoOfBill: string;
}

interface ProductDetail {
    id: number | null;
    indentNo: string;
    product: string;
    quantity: number;
    uom: string;
    rate: number;
    qty?: number;
    receivedQty?: number;
    remainingQty?: number;
    vendor?: string;
    poNumber?: string;
}

export default () => {
    const { indentSheet, indentLoading, updateIndentSheet, updateRelatedSheets } = useSheets();
    const { user } = useAuth();


    const [selectedIndent, setSelectedIndent] = useState<GetPurchaseData | null>(null);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [tableData, setTableData] = useState<GetPurchaseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [rateOptions, setRateOptions] = useState<string[]>([]);
    const [relatedProducts, setRelatedProducts] = useState<ProductDetail[]>([]);
    const [productRates, setProductRates] = useState<{ [indentNo: string]: number }>({});
    const [productQty, setProductQty] = useState<{ [indentNo: string]: number }>({});

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
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editedData, setEditedData] = useState<{ [indentNo: string]: EditedData }>({});
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'product' | 'billedQty' | 'billAmount' } | null>(null);
    const [editCellValue, setEditCellValue] = useState<string | number>('');
    const [masterItems, setMasterItems] = useState<string[]>([]);
    const [productSearch, setProductSearch] = useState('');




    const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});


    // const [editedData, setEditedData] = useState<{ product?: string; quantity?: number; uom?: string }>({});
    // const [editedData, setEditedData] = useState<{ [indentNo: string]: { product?: string; quantity?: number; uom?: string; qty?: number; billNumber?: string; leadTime?: string; typeOfBill?: string; billAmount?: number; discountAmount?: number; paymentType?: string; advanceAmount?: number; rate?: number; photoOfBill?: string } }>({});
    // Fetching table data - updated
    // Fetching table data from Supabase
    const fetchTableData = async () => {
        try {
            setLoading(true);

            // Fetch already-billed indent numbers from get_purchase table to track quantity already billed
            const getPurchaseData = await fetchFromSupabasePaginated(
                'get_purchase',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );
            
            // Map billed quantities by indent number
            const billedQtysMap = new Map<string, number>();
            (getPurchaseData || []).forEach((g: any) => {
                const key = String(g.indent_number || g.indentNumber || '').trim();
                const qty = Number(g.quantity) || 0;
                if (key) {
                    billedQtysMap.set(key, (billedQtysMap.get(key) || 0) + qty);
                }
            });

            // Fetch PO Master Data - This is now our primary source for "Pending" bills
            const poMasterData = await fetchFromSupabasePaginated(
                'po_master',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Fetch Received Data for info/display (if any)
            const receivedData = await fetchFromSupabasePaginated(
                'received',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Fetch Indents for master data lookups
            const indentData = await fetchFromSupabasePaginated(
                'indent',
                'indent_number, indenter_name, department, product_name, approved_quantity, uom, qty, approved_rate, po_number',
                { column: 'indent_number', options: { ascending: false } }
            );

            if (poMasterData && poMasterData.length > 0) {
                // Build indent lookup map
                const indentMap = new Map<string, any>();
                indentData?.forEach((sheet: any) => {
                    const key = String(sheet.indentNumber || sheet.indent_number || '').trim();
                    if (key) indentMap.set(key, sheet);
                });

                // Build received stats map
                const receivedStats = new Map<string, number>();
                receivedData?.forEach((r: any) => {
                    const key = String(r.indent_number || r.indentNumber || '').trim();
                    if (key) {
                        receivedStats.set(key, (receivedStats.get(key) || 0) + (Number(r.receivedQuantity || r.received_quantity) || 0));
                    }
                });

                // Filter and Map PO Master Data to Table Format
                const seenIndents = new Set<string>();
                const uniqueTableData = poMasterData
                    .filter((po: any) => {
                        const indentNo = String(po.indentNumber || po.indent_number || po.internalCode || po.internal_code || '').trim();
                        if (!indentNo || seenIndents.has(indentNo)) return false;

                        // Calculate billing progress
                        const totalBilled = billedQtysMap.get(indentNo) || 0;
                        
                        // HIDE from pending list if ANY billing has been recorded (as per user request)
                        if (totalBilled > 0) return false;

                        seenIndents.add(indentNo);
                        return true;
                    })
                    .map((po: any) => {
                        const indentNo = String(po.indentNumber || po.indent_number || po.internalCode || po.internal_code || '').trim();
                        const indent = indentMap.get(indentNo) || {};
                        const totalBilled = billedQtysMap.get(indentNo) || 0;
                        const totalOrdered = Number(po.quantity) || 0;
                        const totalReceived = receivedStats.get(indentNo) || 0;

                        return {
                            id: indent.id || null,
                            indentNo: indentNo,
                            indenter: indent.indenterName || indent.indenter_name || '',
                            department: indent.department || '',
                            product: po.product || indent.productName || indent.product_name || '',
                            quantity: totalOrdered,
                            uom: po.unit || indent.uom || '',
                            poNumber: po.poNumber || po.po_number || '',
                            approvedRate: Number(po.rate || indent.approvedRate || indent.approved_rate) || 0,
                            receivedQty: totalReceived,
                            billedQty: totalBilled,
                            remainingQty: Math.max(0, totalOrdered - totalBilled)
                        };
                    });

                setTableData(uniqueTableData);
            } else {
                setTableData([]);
            }
        } catch (error) {
            console.error('Error fetching data from Supabase:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTableData();
    }, []);

    // History data - Fetch from RECEIVED table where bill_number is present
    useEffect(() => {
        const fetchHistoryData = async () => {
            try {
                // Fetch from GET PURCHASE table for History (formal billing records)
                const billingHistory = await fetchFromSupabasePaginated(
                    'get_purchase',
                    '*',
                    { column: 'createdAt', options: { ascending: false } }
                );

                if (billingHistory) {
                    const historyItems = billingHistory.map((b: any) => ({
                        id: b.id,
                        indentNo: b.indent_number || '',
                        poNumber: b.poNumber || '',
                        vendor: b.vendor || '',
                        product: b.product || '',
                        billNumber: b.billNumber || '',
                        billStatus: b.billStatus || '',
                        billedQty: b.quantity || 0,
                        billAmount: b.billAmount || 0,
                        billedDate: b.createdAt ? formatDate(new Date(b.createdAt)) : '',
                        photoOfBill: b.photoOfBill || ''
                    }));
                    setHistoryData(historyItems);
                } else {
                    setHistoryData([]);
                }
            } catch (error) {
                console.error('Error fetching history:', error);
                setHistoryData([]);
            }
        };

        fetchHistoryData();
    }, [openDialog]); // Refresh when dialog closes (which updates table)

    // Fetch master items for product dropdown in history tab
    useEffect(() => {
        const fetchMasterItems = async () => {
            try {
                const data = await fetchFromSupabasePaginated(
                    'master',
                    'item_name',
                    { column: 'item_name', options: { ascending: true } }
                );
                const items = data
                    .map((d: any) => d.item_name)
                    .filter(Boolean);
                setMasterItems([...new Set(items)] as string[]);
            } catch (error) {
                console.error('Error fetching master items:', error);
            }
        };
        fetchMasterItems();
    }, []);

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

    // Per-cell inline edit handlers for history tab
    const handleStartCellEdit = (rowId: string, field: 'product' | 'billedQty' | 'billAmount', currentValue: string | number) => {
        setEditingCell({ rowId, field });
        setEditCellValue(currentValue);
        setProductSearch('');
    };

    const handleCancelCellEdit = () => {
        setEditingCell(null);
        setEditCellValue('');
        setProductSearch('');
    };

    const handleSaveCellEdit = async () => {
        if (!editingCell) return;
        try {
            const updatePayload: any = {};
            const localUpdate: any = {};
            let updateTable = 'indent'; // default

            if (editingCell.field === 'product') {
                updatePayload.product_name = editCellValue;
                localUpdate.product = editCellValue;
                updateTable = 'indent';
            } else if (editingCell.field === 'billedQty') {
                updatePayload.received_quantity = Number(editCellValue) || 0;
                localUpdate.billedQty = Number(editCellValue) || 0;
                updateTable = 'received';
            } else if (editingCell.field === 'billAmount') {
                updatePayload.bill_amount = Number(editCellValue) || 0;
                localUpdate.billAmount = Number(editCellValue) || 0;
                updateTable = 'received';
            }

            if (updateTable === 'indent') {
                const result = await postToSheet([{ indentNumber: editingCell.rowId, ...updatePayload }], 'update', 'INDENT');
                if (!result.success) throw new Error('API update failed');
            } else {
                const historyRow = historyData.find(h => h.indentNo === editingCell.rowId);
                if (historyRow) {
                    // Update the specific record in 'received' (might need a way to target correct ID, for now we assume indentNo is unique for mapping here or update by field)
                    // In a real scenario, we'd use the ID from historyData (which we should add to HistoryData)
                    // For now, let's assume we update by indentNo and billNumber
                    const result = await postToSheet([{ indentNumber: editingCell.rowId, billNumber: historyRow.billNumber, ...updatePayload }], 'update', 'RECEIVED');
                    if (!result.success) throw new Error('API update failed');
                }
            }

            toast.success(`Updated ${editingCell.field} for ${editingCell.rowId}`);

            // Update local state
            setHistoryData(prev =>
                prev.map(item =>
                    item.indentNo === editingCell.rowId
                        ? { ...item, ...localUpdate }
                        : item
                )
            );

            setEditingCell(null);
            setEditCellValue('');
            setProductSearch('');
        } catch (error: any) {
            console.error('Error saving edit:', error);
            toast.error('Failed to save: ' + error.message);
        }
    };

    // Fetch related products when dialog opens
    useEffect(() => {
        const fetchRelatedProducts = async () => {
            if (selectedIndent && openDialog) {
                setRelatedProducts([]); // CLEAR OLD DATA IMMEDIATELY
                try {
                    console.log('Fetching Related Products for PO:', selectedIndent.poNumber);
                    
                    // 1. Fetch PO Masters for the product list (Source of Truth)
                    const poData = await fetchFromSupabasePaginated(
                        'po_master',
                        '*',
                        { column: 'id', options: { ascending: true } },
                        (q) => q.eq('poNumber', selectedIndent.poNumber) // po_master has poNumber (camelCase)
                    );

                    if (!poData || poData.length === 0) {
                        console.warn('No PO Master data found for PO:', selectedIndent.poNumber);
                        setTableData(prev => prev.filter(p => p.poNumber !== selectedIndent.poNumber));
                        setSelectedIndent(null);
                        setOpenDialog(false);
                        return;
                    }

                    // 2. Extract indent numbers from the PO
                    const indentNums = Array.from(new Set(poData.map((po: any) => String(po.indent_number || po.indentNumber || po.internalCode || '').trim()))).filter(Boolean);
                    console.log('Unique Indents in PO:', indentNums);

                    // 3. Fetch Received stats for these items
                    const receivedData = await fetchFromSupabasePaginated(
                        'received',
                        '*',
                        { column: 'createdAt', options: { ascending: true } },
                        (q) => q.eq('poNumber', selectedIndent.poNumber)
                    );

                    // 4. Fetch Indents for billing metadata (qty billed)
                    const indentData = await fetchFromSupabasePaginated(
                        'indent',
                        '*',
                        { column: 'id', options: { ascending: true } },
                        (q) => q.in('indentNumber', indentNums)
                    );

                    // Mapping strictly from po_master
                    const products = poData.map((po: any) => {
                        const indentNum = String(po.indent_number || po.indentNumber || po.internalCode || '').trim();
                        
                        // Find corresponding indent metadata
                        const indent = indentData?.find((i: any) =>
                            String(i.indentNumber || i.indent_number || '').trim() === indentNum
                        );

                        // Calculate received stats specifically for this indent
                        const totalReceived = receivedData
                            ? receivedData
                                .filter((r: any) => String(r.indent_number || r.indentNumber || '').trim() === indentNum)
                                .reduce((sum: number, r: any) => sum + (Number(r.receivedQuantity || r.received_quantity) || 0), 0)
                            : 0;

                        const totalOrdered = Number(po.quantity) || 0;
                        const totalBilled = Number(indent?.qty || 0); // qty field in indent table represents billed quantity
                        const remainingToBill = Math.max(0, totalOrdered - totalBilled);

                        return {
                            id: indent?.id || po.id || null, // fallback to PO id if indent id missing
                            indentNo: indentNum,
                            product: po.product || indent?.productName || indent?.product_name || '',
                            quantity: totalOrdered,
                            uom: po.unit || indent?.uom || '',
                            rate: Number(po.rate || indent?.approvedRate || indent?.approved_rate || 0),
                            qty: totalBilled,
                            receivedQty: totalReceived,
                            remainingQty: remainingToBill,
                            vendor: po.partyName || selectedIndent.vendor || '',
                            poNumber: selectedIndent.poNumber
                        };
                    });

                    setRelatedProducts(products);

                    // Initialize productRates & Qty
                    const ratesMap: { [indentNo: string]: number } = {};
                    const qtyMap: { [indentNo: string]: number } = {};

                    products.forEach(p => {
                        ratesMap[p.indentNo] = p.rate;
                        // Default Qty to Remaining
                        qtyMap[p.indentNo] = p.remainingQty || 0;
                    });
                    setProductRates(ratesMap);
                    setProductQty(qtyMap);
                } catch (error) {
                    console.error('Error fetching related products:', error);
                }
            }
        };

        fetchRelatedProducts();
    }, [selectedIndent, openDialog]);

    const handleQtyChange = (indentNo: string, value: string) => {
        const product = relatedProducts.find(p => p.indentNo === indentNo);
        const max = product?.remainingQty || 0;
        let val = parseFloat(value) || 0;

        if (val > max) {
            val = max;
        }
        if (val < 0) {
            val = 0;
        }

        setProductQty((prev) => ({
            ...prev,
            [indentNo]: val,
        }));
    };



    // Creating table columns
    const columns: ColumnDef<GetPurchaseData>[] = [
        {
            header: 'Action',
            cell: ({ row }: { row: Row<GetPurchaseData> }) => {
                const indent = row.original;

                return (
                    <div>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    // Clear data before opening to avoid seeing old data (stale "SI-0011" issue)
                                    setRelatedProducts([]);
                                    setProductQty({});
                                    setProductRates({});
                                    setSelectedIndent(indent);
                                }}
                            >
                                Update
                            </Button>
                        </DialogTrigger>
                    </div>
                );
            },
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No.',
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
            header: 'Ordered Qty', // Renamed for clarity
        },
        {
            accessorKey: 'receivedQty', // New Column
            header: 'Received Qty',
        },
        {
            accessorKey: 'remainingQty', // New Column
            header: 'Pending Bill',
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
        },
        {
            accessorKey: 'poNumber',
            header: 'PO Number',
        },
        {
            accessorKey: 'approvedRate', // ✅ Naya column add kiya
            header: 'Approved Rate',
            cell: ({ getValue }) => `₹${getValue()}`,
        },
    ];


    const historyColumns: ColumnDef<HistoryData>[] = [
        {
            accessorKey: 'billedDate',
            header: 'Date',
        },
        {
            accessorKey: 'poNumber',
            header: 'PO Number',
        },
        {
            accessorKey: 'billNumber',
            header: 'Bill Number',
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No.',
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const item = row.original;
                const isCellEditing = editingCell?.rowId === item.indentNo && editingCell?.field === 'product';

                if (isCellEditing) {
                    const filteredItems = masterItems.filter(p =>
                        p.toLowerCase().includes(productSearch.toLowerCase())
                    );
                    return (
                        <div className="flex items-center gap-1">
                            <Select
                                value={editCellValue as string}
                                onValueChange={(value) => setEditCellValue(value)}
                            >
                                <SelectTrigger className="w-[180px] text-xs sm:text-sm">
                                    <SelectValue placeholder="Select Product" />
                                </SelectTrigger>
                                <SelectContent className="w-[300px] sm:w-[400px]">
                                    <div className="sticky top-0 z-10 bg-popover p-2 border-b">
                                        <div className="flex items-center bg-muted rounded-md px-3 py-1">
                                            <Search className="h-4 w-4 shrink-0 opacity-50" />
                                            <input
                                                placeholder="Search product..."
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                                className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground ml-2"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto p-1">
                                        {filteredItems.map((p, i) => (
                                            <SelectItem key={i} value={p} className="cursor-pointer">
                                                {p}
                                            </SelectItem>
                                        ))}
                                    </div>
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:bg-green-50" onClick={handleSaveCellEdit}>
                                <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:bg-red-50" onClick={handleCancelCellEdit}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    );
                }

                return (
                    <div className="flex items-center gap-1 max-w-[150px] break-words whitespace-normal">
                        <span>{item.product}</span>
                        <button
                            className="ml-1 text-black hover:text-gray-700 shrink-0"
                            onClick={() => handleStartCellEdit(item.indentNo, 'product', item.product)}
                        >
                            <SquarePen className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            },
        },
        {
            accessorKey: 'billAmount',
            header: 'Bill Amount',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const item = row.original;
                const isCellEditing = editingCell?.rowId === item.indentNo && editingCell?.field === 'billAmount';

                if (isCellEditing) {
                    return (
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={editCellValue}
                                onChange={(e) => setEditCellValue(Number(e.target.value) || 0)}
                                className="w-24 text-xs sm:text-sm"
                                min="0"
                            />
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:bg-green-50" onClick={handleSaveCellEdit}>
                                <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:bg-red-50" onClick={handleCancelCellEdit}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    );
                }

                return (
                    <div className="flex items-center gap-1">
                        <span>₹{item.billAmount}</span>
                        <button
                            className="ml-1 text-black hover:text-gray-700 shrink-0"
                            onClick={() => handleStartCellEdit(item.indentNo, 'billAmount', item.billAmount)}
                        >
                            <SquarePen className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            },
        },
        {
            accessorKey: 'photoOfBill',
            header: 'Bill Photo',
            cell: ({ row }) => {
                const url = row.original.photoOfBill;
                return url ? (
                    <a href={url} target="_blank" className="text-blue-600 hover:underline">
                        View Bill
                    </a>
                ) : (
                    <span className="text-muted-foreground">N/A</span>
                );
            },
        },
    ];


    // Creating form schema
    const formSchema = z.object({
        billStatus: z.string().nonempty('Bill status is required'),

        billNo: z.string().optional(),
        // qty: z.coerce.number().optional(),
        leadTime: z.string().optional(),
        typeOfBill: z.string().optional(),
        billAmount: z.coerce.number().optional(),
        discountAmount: z.coerce.number().optional(),
        paymentType: z.string().optional(),
        advanceAmount: z.coerce.number().optional(),
        photoOfBill: z.instanceof(File).optional(),
    });


    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            billStatus: '',

            billNo: '',
            // qty: undefined,
            leadTime: '',
            typeOfBill: '',
            billAmount: 0,
            discountAmount: 0,
            paymentType: '',
            advanceAmount: 0,
        },
    });


    const billStatus = form.watch('billStatus');
    const typeOfBill = form.watch('typeOfBill');

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            console.log('Starting submission with values:', values);

            let photoUrl: string | undefined;
            if (values.photoOfBill) {
                console.log('Uploading photo...');
                photoUrl = await uploadFile(
                    values.photoOfBill,
                    'bill_photo',
                    'upload'
                );
                console.log('Photo uploaded successfully:', photoUrl);
            }

            // Iterate over each product and update RECEIVED table rows via API
            for (const product of relatedProducts) {
                const billQty = productQty[product.indentNo] || 0;

                // Allow updates if quantity is > 0 OR if any status is being updated
                if (billQty <= 0 && !values.billStatus) {
                    continue;
                }

                if (billQty > (product.remainingQty || 0)) {
                    toast.error(`Quantity for ${product.product} exceeds pending amount`);
                    return;
                }

                // Fetch unbilled received items for this indent from API
                const unbilledItems = await fetchFromSupabasePaginated(
                    'received',
                    'id, receivedQuantity, createdAt',
                    { column: 'createdAt', options: { ascending: true } },
                    (q) => q.eq('indent_number', product.indentNo).or('billNumber.is.null,billNumber.eq.""')
                );

                let remainingToAssign = billQty;
                const recUpdates = [];

                for (const item of unbilledItems) {
                    if (remainingToAssign <= 0) break;

                    recUpdates.push({
                        id: item.id,
                        billStatus: values.billStatus,
                        // billNumber removed as it doesn't exist in Received model
                        billAmount: values.billAmount || 0,
                        photoOfBill: photoUrl,
                    });

                    remainingToAssign -= Number(item.receivedQuantity || 0);
                }

                if (recUpdates.length > 0) {
                    const result = await postToSheet(recUpdates, 'update', 'RECEIVED');
                    if (!result.success) throw new Error(`Failed to update received records for ${product.indentNo}`);
                }

                // Update Indent Table via API
                const relatedProduct = relatedProducts.find(r => r.indentNo === product.indentNo);
                const totalBilled = (relatedProduct?.qty || 0) + billQty;
                const approvedQty = product.quantity;

                const updatePayload: any = {
                    id: product.id,
                    indentNumber: product.indentNo,
                    // Note: These fields are filtered by IndentController to match schema
                    qty: totalBilled,
                    bill_number: values.billNo,
                    bill_status: values.billStatus,
                    planned: formatDate(new Date()), // Generic update to trigger timestamp if needed
                };

                if (totalBilled >= approvedQty) {
                    updatePayload.actual_7 = formatDate(new Date());
                    updatePayload.planned_5 = formatDate(new Date());
                }

                const indResult = await postToSheet([updatePayload], 'update', 'INDENT');
                if (!indResult.success) throw new Error(`Failed to update indent ${product.indentNo}`);

                // Fetch planned from received table for this indent (to calculate delay)
                const receivedForIndent = await fetchFromSupabasePaginated(
                    'received',
                    '*',
                    { column: 'createdAt', options: { ascending: false } },
                    (q) => q.eq('indent_number', product.indentNo)
                );
                const plannedDate = receivedForIndent?.[0]?.planned
                    ? new Date(receivedForIndent[0].planned)
                    : null;

                // Calculate delay: get_purchase createdAt (now) - planned
                const now = new Date();
                let delayValue: string | null = null;
                if (plannedDate) {
                    const diffMs = now.getTime() - plannedDate.getTime();
                    const absDiffMs = Math.abs(diffMs);
                    const ddays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
                    const dhours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const dminutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                    const formatted = `${String(ddays).padStart(2, '0')}:${String(dhours).padStart(2, '0')}:${String(dminutes).padStart(2, '0')}`;
                    delayValue = diffMs >= 0 ? `+${formatted}` : `-${formatted}`;
                }

                // Insert into get_purchase table
                const getPurchasePayload: any = {
                    billStatus: values.billStatus,
                    billNumber: values.billNo || `BILL-${Date.now()}`,
                    quantity: billQty,
                    leadTimeToLiftMaterial: values.leadTime || '',
                    typeOfBill: values.typeOfBill || '',
                    billAmount: values.billAmount || 0,
                    discountAmount: values.discountAmount || 0,
                    paymentType: values.paymentType || '',
                    advanceAmount: values.advanceAmount || 0,
                    photoOfBill: photoUrl || '',
                    planned: plannedDate ? plannedDate.toISOString() : null,
                    delay: delayValue,
                    indent_number: product.indentNo,
                    // New fields from schema update
                    poNumber: product.poNumber || selectedIndent?.poNumber || '',
                    vendor: product.vendor || '',
                    product: product.product || '',
                };

                console.log('Inserting into GET PURCHASE:', getPurchasePayload);
                const getPurResult = await postToSheet([getPurchasePayload], 'insert', 'GET PURCHASE');
                if (!getPurResult.success) {
                    console.error('GET PURCHASE insert failed:', getPurResult.error);
                    throw new Error(`Failed to insert get_purchase record for ${product.indentNo}: ${getPurResult.error?.message || 'Unknown error'}`);
                }
            }

            toast.success(`Updated purchase details for PO ${selectedIndent?.poNumber}`);

            // Immediately remove the submitted indent from the pending list
            setTableData(prev => prev.filter(item => item.indentNo !== selectedIndent?.indentNo));

            // Close dialog and reset form first
            setOpenDialog(false);
            form.reset();
            setProductRates({});
            setProductQty({});

            // Refresh data after brief delay to allow DB operations to complete
            setTimeout(() => {
                fetchTableData();
                updateIndentSheet();
                updateRelatedSheets();
            }, 500);
        } catch (error: any) {
            console.error('Detailed submission error:', error);
            toast.error(`Failed to update: ${error.message || 'Unknown error'}`);
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
                    setRelatedProducts([]);
                }
            }}>
                <Tabs defaultValue="pending">
                    <Heading
                        heading="Get Purchase"
                        subtext="Manage purchase bill details and status"
                        tabs
                    >
                        <ShoppingCart size={50} className="text-primary" />
                    </Heading>


                    <TabsContent value="pending">
                        <DataTable
                            data={filteredTableData}
                            columns={columns}
                            searchFields={['indentNo', 'poNumber', 'product', 'department', 'indenter', 'date', 'billNumber']}
                            dataLoading={loading}
                            extraActions={
                                <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
                            }
                        />
                    </TabsContent>
                    <TabsContent value="history">
                        <DataTable
                            data={filteredHistoryData}
                            columns={historyColumns}
                            searchFields={['indentNo', 'poNumber', 'product', 'department', 'indenter', 'date', 'billNumber']}
                            dataLoading={indentLoading}
                            extraActions={
                                <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData} />
                            }
                        />
                    </TabsContent>
                </Tabs>


                {selectedIndent && (
                    <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
                        <Form {...form}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault(); // ✅ Enter key se submit block
                                }}
                                className="space-y-5"
                            >
                                <DialogHeader className="space-y-1">
                                    <DialogTitle>Update Purchase Details</DialogTitle>
                                    <DialogDescription>
                                        Update purchase details for PO Number:{' '}
                                        <span className="font-medium">
                                            {selectedIndent.poNumber}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-2 bg-muted p-4 rounded-md">
                                    <p className="font-semibold text-sm">Products in this PO</p>
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                        {relatedProducts.map((product, index) => (
                                            <div
                                                key={index}
                                                className="bg-background p-4 rounded-md space-y-3"
                                            >
                                                {/* Mobile: Stack vertically */}
                                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                                    <div className="space-y-1">
                                                        <p className="font-medium text-xs text-muted-foreground">Indent No.</p>
                                                        <p className="text-sm font-light break-all">{product.indentNo}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="font-medium text-xs text-muted-foreground">Quantity</p>
                                                        <p className="text-sm font-light">{product.quantity}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="font-medium text-xs text-muted-foreground">UOM</p>
                                                        <p className="text-sm font-light">{product.uom}</p>
                                                    </div>
                                                </div>

                                                {/* Product name - full width */}
                                                <div className="space-y-1">
                                                    <p className="font-medium text-xs text-muted-foreground">Product</p>
                                                    <p className="text-sm font-light break-words">{product.product}</p>
                                                </div>

                                                {/* Rate and Qty - side by side */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <p className="font-medium text-xs text-muted-foreground">Approved Rate</p>
                                                        <Input
                                                            type="text"
                                                            value={product.rate || 0}
                                                            readOnly
                                                            className="h-9 text-sm bg-gray-100 w-full font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between">
                                                            <p className="font-medium text-xs text-muted-foreground">Bill Qty</p>
                                                            <p className="text-xs text-blue-600">Pending: {product.remainingQty}</p>
                                                        </div>
                                                        <Input
                                                            type="number"
                                                            placeholder="Enter qty"
                                                            value={productQty[product.indentNo] || ''}
                                                            onChange={(e) => handleQtyChange(product.indentNo, e.target.value)}
                                                            className="h-9 text-sm w-full"
                                                            max={product.remainingQty}
                                                        />
                                                        {product.receivedQty !== undefined && (
                                                            <p className="text-[10px] text-muted-foreground">
                                                                Rec: {product.receivedQty} | max: {product.remainingQty}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>


                                <div className="grid gap-4">
                                    <FormField
                                        control={form.control}
                                        name="billStatus"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bill Status *</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select bill status" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Bill Received">
                                                            Bill Received
                                                        </SelectItem>
                                                        <SelectItem value="Bill Not Received">
                                                            Bill Not Received
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />

                                    {billStatus === 'Bill Received' && (
                                        <>
                                            <FormField
                                                control={form.control}
                                                name="billNo"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Bill No. *</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Enter bill number"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}

                                    {billStatus && (
                                        <>


                                            <FormField
                                                control={form.control}
                                                name="leadTime"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Lead Time To Lift Material *</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Enter lead time"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="typeOfBill"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Type Of Bill *</FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select type of bill" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="independent">
                                                                    Independent
                                                                </SelectItem>
                                                                <SelectItem value="common">
                                                                    Common
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />

                                            {typeOfBill === 'independent' && (
                                                <>
                                                    <FormField
                                                        control={form.control}
                                                        name="billAmount"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Bill Amount *</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        placeholder="Enter bill amount"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="discountAmount"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Discount Amount</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        placeholder="Enter discount amount"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="paymentType"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Payment Type</FormLabel>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select payment type" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="Advance">
                                                                            Advance
                                                                        </SelectItem>
                                                                        <SelectItem value="Credit">
                                                                            Credit
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="advanceAmount"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Advance Amount If Any</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        placeholder="Enter advance amount"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="photoOfBill"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Photo Of Bill</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={(e) =>
                                                                            field.onChange(e.target.files?.[0])
                                                                        }
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>

                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline" type="button">Close</Button>
                                    </DialogClose>
                                    <Button
                                        type="button" // ✅ type="button" karo
                                        onClick={form.handleSubmit(onSubmit, onError)} // ✅ onClick mein submit karo
                                        disabled={form.formState.isSubmitting}
                                    >
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
            </Dialog>
        </div>
    );
};
