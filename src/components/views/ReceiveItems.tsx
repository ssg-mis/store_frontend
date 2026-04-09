
import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import DataTable from '../element/DataTable';
import { z } from 'zod';
import { useForm, type FieldErrors } from 'react-hook-form';
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
    DialogTrigger,
    DialogClose,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Truck, SquarePen, Check, X, Search } from 'lucide-react';
import { Tabs, TabsContent } from '../ui/tabs';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { formatDate } from '@/lib/utils';
import { useSheets } from '@/context/SheetsContext';
import { Pill } from '../ui/pill';

interface RecieveItemsData {
    poDate: string;
    poNumber: string;
    vendor: string;
    indentNumber: string;
    firm: string;
    product: string;
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
}

interface HistoryData {
    indentNumber: string;
    firm: string;
    poNumber: string;
    vendor: string;
    product: string;
    orderQuantity: number;
    receivedDate: string;
    receivedQuantity: number;
    remainingQty?: number;
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

    const [tableData, setTableData] = useState<RecieveItemsData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [selectedIndent, setSelectedIndent] = useState<RecieveItemsData | null>(null);
    const [matchingIndents, setMatchingIndents] = useState<RecieveItemsData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'product' | 'orderQuantity' | 'uom' } | null>(null);
    const [editCellValue, setEditCellValue] = useState<string | number>('');
    const [masterItems, setMasterItems] = useState<string[]>([]);
    const [productSearch, setProductSearch] = useState('');

    // Filter states
    const [pendingFilters, setPendingFilters] = useState({
        product: 'All',
        vendor: 'All',
    });
    const [historyFilters, setHistoryFilters] = useState({
        product: 'All',
        vendor: 'All',
    });

    const fetchPendingItems = async () => {
        setLocalIndentLoading(true);
        const poMasterData = await fetchFromSupabasePaginated(
            'po_master',
            '*',
            { column: 'createdAt', options: { ascending: false } }
        );
        const receivedData = await fetchFromSupabasePaginated(
            'received',
            'indent_number, received_quantity',
            { column: 'createdAt', options: { ascending: false } }
        );

        const mappedData = poMasterData
            .map((po: any) => {
                const indentNum = po.indentNumber || po.indent_number || po.internalCode || po.internal_code || '';
                const totalReceived = receivedData
                    .filter((r: any) => (r.indentNumber || r.indent_number) === indentNum)
                    .reduce((sum: number, r: any) => sum + (Number(r.receivedQuantity || r.received_quantity) || 0), 0);

                const poQty = Number(po.quantity) || 0;
                const remainingQty = Math.max(0, poQty - totalReceived);

                return {
                    indentNumber: indentNum,
                    poNumber: po.poNumber || po.po_number,
                    uom: po.unit,
                    poCopy: po.pdf,
                    vendor: po.partyName || po.party_name,
                    quantity: poQty,
                    rate: Number(po.rate) || 0,
                    receivedQty: totalReceived,
                    remainingQty: remainingQty,
                    poDate: po.createdAt || po.created_at,
                    product: po.product,
                    firm: po.firm || po.indent?.firm || 'N/A',
                    totalAmount: Number(po.totalPOAmount || po.total_po_amount) || 0,
                    quotationNo: po.quotationNumber || po.quotation_number || 'N/A',
                    quotationDate: po.quotationDate || po.quotation_date,
                    transportType: po.transportationType || po.transportation_type || 'N/A',
                };
            }).filter((item) => item.remainingQty > 0);

        setTableData(mappedData.reverse());
        setLocalIndentLoading(false);
    };

    const fetchHistoryItems = async () => {
        setLocalReceivedLoading(true);
        const poMasterData = await fetchFromSupabasePaginated(
            'po_master',
            '*',
            { column: 'createdAt', options: { ascending: false } }
        );
        const receivedData = await fetchFromSupabasePaginated(
            'received',
            '*',
            { column: 'createdAt', options: { ascending: false } }
        );

        const mappedData = receivedData.map((receivedRecord: any) => {
            const indentNum = receivedRecord.indentNumber || receivedRecord.indent_number || '';
            const po = poMasterData.find((p: any) => (p.indentNumber || p.indent_number || p.internalCode || p.internal_code) === indentNum);

            const totalReceivedForIndent = receivedData
                .filter((r: any) => (r.indentNumber || r.indent_number) === indentNum)
                .reduce((sum: number, r: any) => sum + (Number(r.receivedQuantity || r.received_quantity) || 0), 0);

            const poQty = po ? (Number(po.quantity) || 0) : 0;
            const remainingQty = Math.max(0, poQty - totalReceivedForIndent);
            const receivedRecordDate = receivedRecord.createdAt || receivedRecord.created_at || receivedRecord.timestamp;

            return {
                indentNumber: indentNum,
                poNumber: receivedRecord.poNumber || receivedRecord.po_number || po?.poNumber || po?.po_number || '',
                vendor: receivedRecord.vendor || po?.partyName || po?.party_name || '',
                product: receivedRecord.product || po?.product || '',
                firm: receivedRecord.indent?.firm || po?.indent?.firm || 'N/A',
                orderQuantity: poQty,
                receivedQuantity: Number(receivedRecord.receivedQuantity || receivedRecord.received_quantity) || 0,
                remainingQty: remainingQty,
                photoOfProduct: receivedRecord.photoOfProduct || receivedRecord.photo_of_product || '',
                receivedDate: receivedRecordDate ? formatDate(new Date(receivedRecordDate)) : '',
                billStatus: receivedRecord.billStatus || receivedRecord.bill_status || '',
                billNumber: receivedRecord.billNumber || receivedRecord.bill_number || '',
                billAmount: Number(receivedRecord.billAmount || receivedRecord.bill_amount) || 0,
                typeOfBill: receivedRecord.typeOfBill || '',
                paymentType: receivedRecord.paymentType || '',
                discountAmount: Number(receivedRecord.discountAmount) || 0,
                advanceAmount: Number(receivedRecord.advanceAmount) || 0,
                leadTimeToLiftMaterial: receivedRecord.leadTimeToLiftMaterial || '',
                photoOfBill: receivedRecord.photoOfBill || receivedRecord.photo_of_bill || '',
            };
        });

        setHistoryData(mappedData.reverse());
        setLocalReceivedLoading(false);
    };

    useEffect(() => {
        fetchPendingItems();
    }, []);

    useEffect(() => {
        fetchHistoryItems();
    }, []);

    // Fetch master items for product dropdown
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

    // Per-cell inline edit handlers for history tab
    const handleStartCellEdit = (rowId: string, field: 'product' | 'orderQuantity' | 'uom', currentValue: string | number | null | undefined) => {
        setEditingCell({ rowId, field });
        setEditCellValue(currentValue ?? '');
        setProductSearch('');
    };

    const handleCancelCellEdit = () => {
        setEditingCell(null);
        setEditCellValue('');
        setProductSearch('');
    };

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

    const handleSaveCellEdit = async () => {
        if (!editingCell) return;
        try {
            const updatePayload: any = {};
            const localUpdate: any = {};

            if (editingCell.field === 'product') {
                updatePayload.product_name = editCellValue;
                localUpdate.product = editCellValue;
            } else if (editingCell.field === 'orderQuantity') {
                updatePayload.approved_quantity = Number(editCellValue) || 0;
                localUpdate.orderQuantity = Number(editCellValue) || 0;
            } else if (editingCell.field === 'uom') {
                updatePayload.uom = editCellValue;
                localUpdate.uom = editCellValue;
            }

            // Update in backend using API
            const result = await postToSheet([{ indentNumber: editingCell.rowId, ...updatePayload }], 'update', 'INDENT');
            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated ${editingCell.field} for ${editingCell.rowId}`);

            // Update local state
            setHistoryData(prev =>
                prev.map(item =>
                    item.indentNumber === editingCell.rowId
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

    const columns: ColumnDef<RecieveItemsData>[] = [
        ...(user.receiveItemView
            ? [
                {
                    header: 'Action',
                    cell: ({ row }: { row: Row<RecieveItemsData> }) => {
                        const indent = row.original;

                        return (
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setSelectedIndent(indent);
                                    }}
                                >
                                    Store In
                                </Button>
                            </DialogTrigger>
                        );
                    },
                },
            ]
            : []),
        {
            accessorKey: 'poDate',
            header: 'PO Date',
            accessorFn: (x) => formatDate(new Date(x.poDate)),
        },
        { accessorKey: 'poNumber', header: 'PO Number' },
        {
            accessorKey: 'vendor',
            header: 'Vendor',
            cell: ({ row }) => (
                <div className="whitespace-normal break-words min-w-[150px] max-w-[250px]">
                    {row.original.vendor}
                </div>
            ),
        },
        { accessorKey: 'indentNumber', header: 'Indent No.' },
        {
            accessorKey: 'firm',
            header: 'Firm',
            cell: ({ getValue }) => (
                <div className="whitespace-normal break-words min-w-[120px]">
                    {getValue() as string}
                </div>
            ),
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }) => (
                <div className="whitespace-normal break-words min-w-[200px] max-w-[300px]">
                    {row.original.product}
                </div>
            ),
        },
        { accessorKey: 'uom', header: 'UOM' },
        { accessorKey: 'quantity', header: 'Purchase Qty' },
        { accessorKey: 'receivedQty', header: 'Received Qty' },
        { accessorKey: 'remainingQty', header: 'Remaining Qty' },
        {
            accessorKey: 'poCopy',
            header: 'PO Copy',
            cell: ({ row }) => {
                const poCopy = row.original.poCopy;
                return poCopy ? (
                    <a href={poCopy} target="_blank" className="text-blue-600 hover:underline">
                        PDF
                    </a>
                ) : (
                    <></>
                );
            },
        },
    ];

    const historyColumns: ColumnDef<HistoryData>[] = [
        {
            accessorKey: 'receivedDate',
            header: 'Date',
        },
        { accessorKey: 'poNumber', header: 'PO Number' },
        { accessorKey: 'indentNumber', header: 'Indent No.' },
        {
            accessorKey: 'vendor',
            header: 'Vendor',
            cell: ({ row }) => (
                <div className="whitespace-normal break-words min-w-[150px] max-w-[250px]">
                    {row.original.vendor}
                </div>
            ),
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const item = row.original;
                const isCellEditing = editingCell?.rowId === item.indentNumber && editingCell?.field === 'product';

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
                    <div className="flex items-center gap-1 whitespace-normal break-words min-w-[200px] max-w-[300px]">
                        <span>{item.product}</span>
                        <button
                            className="ml-1 text-black hover:text-gray-700 shrink-0"
                            onClick={() => handleStartCellEdit(item.indentNumber, 'product', item.product)}
                        >
                            <SquarePen className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            },
        },
        { accessorKey: 'receivedQuantity', header: 'Received Qty' },
        { accessorKey: 'billNumber', header: 'Bill No.' },
        { accessorKey: 'billAmount', header: 'Bill Amount' },
        {
            accessorKey: 'photoOfProduct',
            header: 'Item Photo',
            cell: ({ row }) => {
                const photo = row.original.photoOfProduct;
                return photo ? (
                    <a href={photo} target="_blank" className="text-blue-600 hover:underline">
                        View Item
                    </a>
                ) : (
                    <>-</>
                );
            },
        },
        {
            accessorKey: 'photoOfBill',
            header: 'Bill Photo',
            cell: ({ row }) => {
                const photo = row.original.photoOfBill;
                return photo ? (
                    <a href={photo} target="_blank" className="text-blue-600 hover:underline">
                        View Bill
                    </a>
                ) : (
                    <>-</>
                );
            },
        },
    ];

    // Updated Schema
    const schema = z.object({
        items: z.array(
            z.object({
                indentNumber: z.string(),
                quantity: z.coerce.number().min(0, 'Quantity must be 0 or more'),
            })
        ),
        billStatus: z.string().min(1, 'Bill status is required'),
        billNo: z.string().optional(),
        billAmount: z.coerce.number().min(0).optional(),
        typeOfBill: z.string().optional(),
        paymentType: z.string().optional(),
        discountAmount: z.coerce.number().min(0).optional(),
        advanceAmount: z.coerce.number().min(0).optional(),
        leadTime: z.string().optional(),
        photoOfItem: z.instanceof(File).optional(),
        photoOfBill: z.instanceof(File).optional(),
    });

    // Updated Form
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            items: [],
            billStatus: 'Received',
            billNo: '',
            billAmount: 0,
            typeOfBill: 'Regular',
            paymentType: 'Credit',
            discountAmount: 0,
            advanceAmount: 0,
            leadTime: '',
            photoOfItem: undefined,
            photoOfBill: undefined,
        },
    });

    // Updated useEffect for matching indents
    useEffect(() => {
        if (selectedIndent) {
            const matching = tableData.filter(
                (item) => item.poNumber === selectedIndent.poNumber
            );
            setMatchingIndents(matching);

            // Initialize items array in form with REMAINING quantity
            const initialItems = matching.map((indent) => ({
                indentNumber: indent.indentNumber,
                quantity: indent.remainingQty || 0,
            }));
            form.setValue('items', initialItems);
        } else if (!openDialog) {
            setMatchingIndents([]);
            form.reset();
        }
    }, [selectedIndent, openDialog, tableData]);

    // Updated onSubmit
    async function onSubmit(values: z.infer<typeof schema>) {
        const itemsToReceive = values.items.filter(item => item.quantity > 0);
        
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

            // Insert received items into backend
            const receivedRows = itemsToReceive.map((item) => {
                const originalItem = matchingIndents.find(i => i.indentNumber === item.indentNumber);
                
                return {
                    indent_number: item.indentNumber,
                    poNumber: selectedIndent?.poNumber || '',
                    vendor: selectedIndent?.vendor || '',
                    product: originalItem?.product || '',
                    receivedQuantity: item.quantity,
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
                };
            });

            const recResult = await postToSheet(receivedRows, 'insert', 'RECEIVED');
            if (!recResult.success) throw new Error('Failed to save received records');

            // Update indents for status and timestamps
            const indentUpdates = itemsToReceive.map((item) => {
                const originalItem = matchingIndents.find(i => i.indentNumber === item.indentNumber);
                const poQty = Number(originalItem?.quantity) || 0;
                const totalReceivedPrev = Number(originalItem?.receivedQty) || 0;
                const remaining = Math.max(0, poQty - (totalReceivedPrev + item.quantity));

                const updatePayload: any = {
                    id: item.indentNumber,
                    indentNumber: item.indentNumber,
                    receive_status: remaining === 0 ? 'Received' : 'Partially Received',
                    bill_status: values.billStatus,
                    actual_7: formatDate(new Date()),
                };

                if (remaining === 0) {
                    updatePayload.actual_5 = formatDate(new Date());
                }
                return updatePayload;
            });

            const indResult = await postToSheet(indentUpdates, 'update', 'INDENT');
            if (!indResult.success) throw new Error('Failed to update indents');

            toast.success('Items received successfully');
            
            // Update context and local data
            updateIndentSheet(); 
            updateReceivedSheet();
            updateRelatedSheets();
            
            setOpenDialog(false);
            
            // Refresh local data
            await fetchPendingItems();
            await fetchHistoryItems();

        } catch (error: any) {
            console.error('Error submitting received items:', error);
            toast.error('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    }

    function onError(e: FieldErrors<z.infer<typeof schema>>) {
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
                        <DataTable
                            data={filteredTableData}
                            columns={columns}
                            searchFields={['indentNumber', 'poNumber', 'product', 'vendor', 'poDate']}
                            dataLoading={localIndentLoading}
                            extraActions={
                                <div className="flex items-center gap-2">
                                    <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData} />
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
                            }
                        />
                    </TabsContent>

                    <TabsContent value="history">
                        <DataTable
                            data={filteredHistoryData}
                            columns={historyColumns}
                            searchFields={[
                                'indentNumber',
                                'poNumber',
                                'poDate',
                                'vendor',
                                'receiveStatus',
                                'product',
                                'receivedDate',
                                'billNumber'
                            ]}
                            dataLoading={localReceivedLoading}
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
                                    <DialogDescription>
                                        Process receiving and billing for PO Number{' '}
                                        <span className="font-medium text-primary">
                                            {selectedIndent.poNumber}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>

                                {/* PO Info Summary (Simplified as requested) */}
                                <div className="bg-[#f0f7ff]/50 border border-blue-100/50 p-6 rounded-xl shadow-sm">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 items-center">
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Vendor</p>
                                            <p className="text-sm font-bold text-slate-800 truncate" title={selectedIndent.vendor}>{selectedIndent.vendor}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">PO Number</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedIndent.poNumber}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">Firm</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedIndent.firm}</p>
                                        </div>
                                        <div className="space-y-1 flex flex-col items-start md:items-end">
                                            <p className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider mb-1">Documents</p>
                                            {selectedIndent.poCopy ? (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 text-[11px] font-bold flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 shadow-sm transition-all hover:scale-105 active:scale-95"
                                                    onClick={() => window.open(selectedIndent.poCopy, '_blank')}
                                                >
                                                    <DownloadOutlined style={{ fontSize: '12px' }} /> View PO Copy
                                                </Button>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground italic">No Attachment</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Item Receiving Table */}
                                <div className="border rounded-lg overflow-hidden shadow-sm">
                                    <div className="bg-muted px-4 py-2 border-b">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <Truck size={16} /> Items to Receive
                                        </h3>
                                    </div>
                                    
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Indent No.</th>
                                                    <th className="px-4 py-2 text-left">Item Name</th>
                                                    <th className="px-4 py-2 text-center">UOM</th>
                                                    <th className="px-4 py-2 text-center">Pending</th>
                                                    <th className="px-4 py-2 text-right w-[120px]">Receive Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {matchingIndents.map((indent, index) => (
                                                    <tr key={indent.indentNumber} className="hover:bg-muted/30 transition-colors">
                                                        <td className="px-4 py-3 font-mono text-xs">{indent.indentNumber}</td>
                                                        <td className="px-4 py-3 max-w-[200px] truncate">{indent.product}</td>
                                                        <td className="px-4 py-3 text-center text-xs">{indent.uom}</td>
                                                        <td className="px-4 py-3 text-center font-medium text-blue-600">{indent.remainingQty}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.quantity`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormControl>
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 text-right font-semibold"
                                                                                max={indent.remainingQty}
                                                                                {...field}
                                                                            />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
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
                                            <FormField
                                                control={form.control}
                                                name="billStatus"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Bill Status</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                                            <FormField
                                                control={form.control}
                                                name="billNo"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Bill Number</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Invoice#" className="h-10 text-sm shadow-sm" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="billAmount"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Bill Amount</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" className="h-10 text-sm shadow-sm" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="typeOfBill"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Type of Bill</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 text-sm shadow-sm">
                                                                    <SelectValue placeholder="Type" />
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

                                            <FormField
                                                control={form.control}
                                                name="paymentType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Payment Type</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 text-sm shadow-sm">
                                                                    <SelectValue placeholder="Type" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="Credit">Credit</SelectItem>
                                                                <SelectItem value="Advance">Advance</SelectItem>
                                                                <SelectItem value="Cash">Cash</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="leadTime"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs font-semibold">Lead Time to Lift Material</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="e.g. 5 Days" className="h-10 text-sm shadow-sm" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

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
                                                    <FormLabel className="text-xs">Photo of Received Items</FormLabel>
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

                                        <FormField
                                            control={form.control}
                                            name="photoOfBill"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Photo of Invoice / Bill</FormLabel>
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
        </div>
    );
};

export default ReceiveItems;
