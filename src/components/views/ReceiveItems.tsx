
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
    product: string;
    uom: string;
    quantity: number;
    receivedQty?: number;
    remainingQty?: number;
    poCopy: string;
}

interface HistoryData {
    indentNumber: string;
    receiveStatus: string;
    poNumber: string;
    poDate: string;
    vendor: string;
    product: string;
    orderQuantity: number;
    uom: string;
    receivedDate: string;
    receivedQuantity: number;
    totalReceivedQty?: number;
    remainingQty?: number;
    photoOfProduct: string;
    warrantyStatus: string;
    warrantyEndDate: string;
    billStatus: string;
    billNumber: string;
    billAmount: number;
    photoOfBill: string;
    anyTransport: string;
    transporterName: string;
    transportingAmount: number;
}

const ReceiveItems = () => {
    const [localIndentLoading, setLocalIndentLoading] = useState(false);
    const [localReceivedLoading, setLocalReceivedLoading] = useState(false);
    const { user } = useAuth();
    const { updateIndentSheet, updateReceivedSheet } = useSheets();

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

    useEffect(() => {
        const fetchPendingItems = async () => {
            setLocalIndentLoading(true);

            // Fetch po_master data
            const poMasterData = await fetchFromSupabasePaginated(
                'po_master',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Fetch billing records to determine what is allowed to be received
            const getPurchaseData = await fetchFromSupabasePaginated(
                'get_purchase',
                'indent_number',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Create a set of billed indent numbers for efficient lookup
            const billedIndents = new Set(
                (getPurchaseData || []).map((g: any) => String(g.indent_number || g.indentNumber || '').trim())
            );

            // Fetch all received records with pagination to calculate totals
            const receivedData = await fetchFromSupabasePaginated(
                'received',
                'indent_number, received_quantity',
                { column: 'createdAt', options: { ascending: false } }
            );

            const mappedData = poMasterData
                .filter((po: any) => {
                    // Normalize indent number
                    const indentNum = String(po.indentNumber || po.indent_number || po.internalCode || po.internal_code || '').trim();
                    // FILTER: Only show items that have been billed (exist in get_purchase)
                    return billedIndents.has(indentNum);
                })
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
                        receivedQty: totalReceived,
                        remainingQty: remainingQty,
                        poDate: po.createdAt || po.created_at,
                        product: po.product,
                    };
                }).filter((item) => item.remainingQty > 0); // Only show items with remaining quantity

            setTableData(mappedData.reverse());
            setLocalIndentLoading(false);
        };

        fetchPendingItems();
    }, []);

    useEffect(() => {
        const fetchHistoryItems = async () => {
            setLocalReceivedLoading(true);

            // Fetch po_master data
            const poMasterData = await fetchFromSupabasePaginated(
                'po_master',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Fetch received items with pagination
            const receivedData = await fetchFromSupabasePaginated(
                'received',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            // Map the combined data
            const mappedData = receivedData.map((receivedRecord: any) => {
                const indentNum = receivedRecord.indentNumber || receivedRecord.indent_number || '';
                const po = poMasterData.find((p: any) => (p.indentNumber || p.indent_number || p.internalCode || p.internal_code) === indentNum);

                // Calculate totals for this indent to show context
                const totalReceivedForIndent = receivedData
                    .filter((r: any) => (r.indentNumber || r.indent_number) === indentNum)
                    .reduce((sum: number, r: any) => sum + (Number(r.receivedQuantity || r.received_quantity) || 0), 0);

                const poQty = po ? (Number(po.quantity) || 0) : 0;
                const remainingQty = Math.max(0, poQty - totalReceivedForIndent);

                const receivedRecordDate = receivedRecord.createdAt || receivedRecord.created_at || receivedRecord.timestamp;

                return {
                    indentNumber: indentNum,
                    receiveStatus: receivedRecord.receivedStatus || receivedRecord.received_status || 'Unknown',
                    poNumber: receivedRecord.poNumber || receivedRecord.po_number || po?.poNumber || po?.po_number || '',
                    poDate: receivedRecord.poDate || receivedRecord.po_date ? formatDate(new Date(receivedRecord.poDate || receivedRecord.po_date)) : (po ? formatDate(new Date(po.createdAt || po.created_at)) : ''),
                    vendor: receivedRecord.vendor || po?.partyName || po?.party_name || '',
                    product: po?.product || '',
                    orderQuantity: poQty,
                    receivedQuantity: Number(receivedRecord.receivedQuantity || receivedRecord.received_quantity) || 0,
                    totalReceivedQty: totalReceivedForIndent,
                    remainingQty: remainingQty,
                    uom: receivedRecord.uom || po?.unit || '',
                    photoOfProduct: receivedRecord.photoOfProduct || receivedRecord.photo_of_product || '',
                    receivedDate: receivedRecordDate ? formatDate(new Date(receivedRecordDate)) : '',
                    warrantyStatus: receivedRecord.warrantyStatus || receivedRecord.warranty_status || '',
                    warrantyEndDate: receivedRecord.warrantyEndDate || receivedRecord.end_date ? formatDate(new Date(receivedRecord.warrantyEndDate || receivedRecord.end_date)) : '',
                    billStatus: receivedRecord.billStatus || receivedRecord.bill_status || '',
                    billNumber: receivedRecord.billNumber || receivedRecord.bill_number || '',
                    billAmount: receivedRecord.billAmount || receivedRecord.bill_amount || 0,
                    photoOfBill: receivedRecord.photoOfBill || receivedRecord.photo_of_bill || '',
                    anyTransport: receivedRecord.anyTransport || receivedRecord.any_transportations || '',
                    transporterName: receivedRecord.transporterName || receivedRecord.transporter_name || '',
                    transportingAmount: receivedRecord.transportingAmount || receivedRecord.transporting_amount || 0,
                };
            });

            setHistoryData(mappedData.reverse());
            setLocalReceivedLoading(false);
        };

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
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }) => (
                <div className="whitespace-normal break-words min-w-[200px] max-w-[300px]">
                    {row.original.product}
                </div>
            ),
        },
        { accessorKey: 'uom', header: 'UOM' },
        { accessorKey: 'quantity', header: 'Ordered Qty' },
        { accessorKey: 'receivedQty', header: 'Received Qty' },
        { accessorKey: 'remainingQty', header: 'Remaining Qty' },
        {
            accessorKey: 'poCopy',
            header: 'PO Copy',
            cell: ({ row }) => {
                const poCopy = row.original.poCopy;
                return poCopy ? (
                    <a href={poCopy} target="_blank">
                        PDF
                    </a>
                ) : (
                    <></>
                );
            },
        },
    ];

    const historyColumns: ColumnDef<HistoryData>[] = [
        { accessorKey: 'indentNumber', header: 'Indent No.' },
        { accessorKey: 'poDate', header: 'PO Date' },
        { accessorKey: 'poNumber', header: 'PO Number' },
        {
            accessorKey: 'receiveStatus',
            header: 'Receive Status',
            cell: ({ row }) => {
                const status = row.original.receiveStatus;
                const variant = status === 'Received' ? 'secondary' : 'reject';
                return <Pill variant={variant}>{status}</Pill>;
            },
        },
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
        {
            accessorKey: 'orderQuantity',
            header: 'Order Quantity',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const item = row.original;
                const isCellEditing = editingCell?.rowId === item.indentNumber && editingCell?.field === 'orderQuantity';

                if (isCellEditing) {
                    return (
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={editCellValue}
                                onChange={(e) => setEditCellValue(Number(e.target.value) || 0)}
                                className="w-20 text-xs sm:text-sm"
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
                        <span>{item.orderQuantity}</span>
                        <button
                            className="ml-1 text-black hover:text-gray-700 shrink-0"
                            onClick={() => handleStartCellEdit(item.indentNumber, 'orderQuantity', item.orderQuantity)}
                        >
                            <SquarePen className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            },
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ row }: { row: Row<HistoryData> }) => {
                const item = row.original;
                const isCellEditing = editingCell?.rowId === item.indentNumber && editingCell?.field === 'uom';

                if (isCellEditing) {
                    return (
                        <div className="flex items-center gap-1">
                            <Input
                                value={editCellValue}
                                onChange={(e) => setEditCellValue(e.target.value)}
                                className="w-20 text-xs sm:text-sm"
                                placeholder="UOM"
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
                        <span>{item.uom}</span>
                        <button
                            className="ml-1 text-black hover:text-gray-700 shrink-0"
                            onClick={() => handleStartCellEdit(item.indentNumber, 'uom', item.uom)}
                        >
                            <SquarePen className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            },
        },
        { accessorKey: 'receivedDate', header: 'Received Date' },
        { accessorKey: 'receivedQuantity', header: 'Received Qty' },
        { accessorKey: 'remainingQty', header: 'Remaining Qty' },
        {
            accessorKey: 'photoOfProduct',
            header: 'Photo of Product',
            cell: ({ row }) => {
                const photo = row.original.photoOfProduct;
                return photo ? (
                    <a href={photo} target="_blank">
                        Product
                    </a>
                ) : (
                    <></>
                );
            },
        },
        { accessorKey: 'billStatus', header: 'Bill Status' },
        { accessorKey: 'billAmount', header: 'Bill Amount' },
    ];

    // Updated Schema - status ko top level pe add kiya
    const schema = z
        .object({
            status: z.enum(['Received', 'Not Received']),
            items: z.array(
                z.object({
                    indentNumber: z.string(),
                    quantity: z.coerce.number().optional().default(0),
                })
            ),
            billReceived: z.enum(['Received', 'Not Received']).optional(),
            billAmount: z.coerce.number().optional(),
            photoOfBill: z.instanceof(File).optional(),
        })
        .superRefine((data, ctx) => {
            if (data.status === 'Received') {
                data.items.forEach((item, index) => {
                    if (item.quantity === undefined || item.quantity === 0) {
                        ctx.addIssue({
                            path: ['items', index, 'quantity'],
                            code: z.ZodIssueCode.custom,
                            message: 'Quantity required',
                        });
                    }
                });
            }

            if (data.billReceived === 'Received') {
                if (data.billAmount === undefined) {
                    ctx.addIssue({ path: ['billAmount'], code: z.ZodIssueCode.custom });
                }
            }
        });

    // Updated Form
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            status: "" as any,
            items: [],
            billAmount: 0,
            photoOfBill: undefined,
            billReceived: "" as any,
        },
    });

    const status = form.watch('status');
    const billReceived = form.watch('billReceived');

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
                quantity: indent.remainingQty, // Default to remaining quantity
            }));
            form.setValue('items', initialItems);
        } else if (!openDialog) {
            setMatchingIndents([]);
            form.reset({
                status: "" as any,
                items: [],
                billAmount: 0,
                photoOfBill: undefined,
                billReceived: "" as any,
            });
        }
    }, [selectedIndent, openDialog, tableData, form]);

    // Updated onSubmit
    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            // Validate quantities against remaining
            for (const item of values.items) {
                const originalItem = matchingIndents.find(i => i.indentNumber === item.indentNumber);
                if (originalItem && (item.quantity > (originalItem.remainingQty || 0))) {
                    toast.error(`Quantity for ${originalItem.product} cannot exceed remaining (${originalItem.remainingQty})`);
                    return;
                }
            }

            // Photo of bill upload
            let billPhotoUrl = '';
            if (values.photoOfBill !== undefined) {
                billPhotoUrl = await uploadFile(
                    values.photoOfBill,
                    'bill_photo',
                    'upload'
                );
            }

            // Fetch three_party_approval planned dates for delay calculation
            const threePartyData = await fetchFromSupabasePaginated(
                'three_party_approvals',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            const now = new Date();

            // Insert received items into backend using API
            const receivedRows = values.items.map((item) => {
                // Find the planned date from three_party_approval for this indent
                const threeParty = threePartyData.find((t: any) =>
                    (t.indent_number || t.indentNumber) === item.indentNumber
                );
                const plannedDate = threeParty?.planned ? new Date(threeParty.planned) : null;

                // Calculate delay in DD:HH:MM format (positive = late, negative = early)
                let delayValue: string | null = null;
                if (plannedDate) {
                    const diffMs = now.getTime() - plannedDate.getTime();
                    const absDiffMs = Math.abs(diffMs);
                    const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                    const formatted = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    delayValue = diffMs >= 0 ? `+${formatted}` : `-${formatted}`;
                }

                return {
                    indent_number: item.indentNumber,
                    poDate: selectedIndent?.poDate ? new Date(selectedIndent.poDate).toISOString() : new Date().toISOString(),
                    poNumber: selectedIndent?.poNumber || '',
                    vendor: selectedIndent?.vendor || '',
                    receivedStatus: values.status,
                    receivedQuantity: item.quantity,
                    uom: matchingIndents.find(i => i.indentNumber === item.indentNumber)?.uom || '',
                    billStatus: values.billReceived || 'Not Received',
                    billAmount: values.billAmount || 0,
                    photoOfBill: billPhotoUrl,
                    delay: delayValue,
                    planned: plannedDate ? plannedDate.toISOString() : null,
                };
            });

            const recResult = await postToSheet(receivedRows, 'insert', 'RECEIVED');
            if (!recResult.success) throw new Error('Failed to save received records');

            // Update each indent using bulk API call
            const indentUpdates = values.items.map((item) => {
                const currentIndent = tableData.find(d => d.indentNumber === item.indentNumber);
                const previousReceived = currentIndent?.receivedQty || 0;
                const newTotalReceived = previousReceived + item.quantity;
                const approvedQty = currentIndent?.quantity || 0;
                const remaining = Math.max(0, approvedQty - newTotalReceived);

                const updatePayload: any = {
                    id: item.indentNumber,
                    indentNumber: item.indentNumber,
                    receive_status: values.status
                };

                if (remaining === 0) {
                    updatePayload.actual_5 = formatDate(new Date());
                }
                return updatePayload;
            });

            const indResult = await postToSheet(indentUpdates, 'update', 'INDENT');
            if (!indResult.success) throw new Error('Failed to update indents');

            toast.success(`Items received for PO ${selectedIndent?.poNumber}`);
            updateIndentSheet(); // Update context for sidebar
            updateReceivedSheet(); // Update context for history
            setOpenDialog(false);

            // Refresh using the existing fetchPendingItems logic (which uses API)
            const fetchPendingItems = async () => {
                setLocalIndentLoading(true);

                // Re-fetch using po_master data
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

                const mappedData = poMasterData.map((po: any) => {
                    const indentNum = po.indentNumber || po.indent_number || po.internalCode || po.internal_code || '';

                    const totalReceived = receivedData
                        .filter((r: any) => r.indentNumber === indentNum || r.indent_number === indentNum)
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
                        receivedQty: totalReceived,
                        remainingQty: remainingQty,
                        poDate: po.createdAt || po.created_at,
                        product: po.product,
                    };
                }).filter((item) => item.remainingQty > 0);

                setTableData(mappedData.reverse());
                setLocalIndentLoading(false);
            };

            fetchPendingItems();
        } catch (error) {
            console.error('Error submitting received items:', error);
            toast.error('Failed to receive items');
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
                            data={tableData}
                            columns={columns}
                            searchFields={['indentNumber', 'poNumber', 'poDate', 'vendor', 'product', 'department', 'indenter', 'vendorType']}
                            dataLoading={localIndentLoading}
                            extraActions={
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
                            }
                        />
                    </TabsContent>

                    <TabsContent value="history">
                        <DataTable
                            data={historyData}
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
                                    <DialogTitle>Receive Items</DialogTitle>
                                    <DialogDescription>
                                        Receive items for PO Number{' '}
                                        <span className="font-medium">
                                            {selectedIndent.poNumber}
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>

                                {/* PO Number Display */}
                                <div className="bg-primary/10 p-3 sm:p-4 rounded-md">
                                    <p className="text-sm sm:text-base md:text-lg font-bold break-words">
                                        PO Number: {selectedIndent.poNumber}
                                    </p>
                                </div>

                                {/* Common Receive Status Field - TOP ME */}
                                <div className="border-b pb-4">
                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Receiving Status (Common for all items)</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Set status" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Received">
                                                                Received
                                                            </SelectItem>
                                                            <SelectItem value="Not Received">
                                                                Not Received
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Common fields */}
                                <div className="space-y-4">
                                    <h3 className="text-sm sm:text-base font-semibold">Common Fields for All Items</h3>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                        <FormField
                                            control={form.control}
                                            name="billReceived"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bill Received</FormLabel>
                                                    <FormControl>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue placeholder="Set bill received" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Received">
                                                                    Received
                                                                </SelectItem>
                                                                <SelectItem value="Not Received">
                                                                    Not Received
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="billAmount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bill Amount</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            disabled={billReceived !== 'Received'}
                                                            placeholder="Enter bill amount"
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
                                                    <FormLabel>Photo of Bill</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            disabled={billReceived !== 'Received'}
                                                            onChange={(e) =>
                                                                field.onChange(e.target.files?.[0])
                                                            }
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Table for matching indents - Responsive */}
                                <div className="border rounded-md mt-6">
                                    <h3 className="font-semibold p-3 bg-muted text-sm sm:text-base">Items in this PO</h3>

                                    {/* Desktop Table View */}
                                    <div className="hidden md:block overflow-x-auto">
                                        <div className="w-full overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-muted">
                                                    <tr>
                                                        <th className="p-2 text-left text-sm font-medium">Indent Number</th>
                                                        <th className="p-2 text-left text-sm font-medium">Item Name</th>
                                                        <th className="p-2 text-left text-sm font-medium">Ordered Qty</th>
                                                        <th className="p-2 text-left text-sm font-medium">UOM</th>
                                                        <th className="p-2 text-left text-sm font-medium">Received Qty</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {matchingIndents.map((indent, index) => (
                                                        <tr key={indent.indentNumber} className="border-t">
                                                            <td className="p-2 text-sm">{indent.indentNumber}</td>
                                                            <td className="p-2 text-sm">{indent.product}</td>
                                                            <td className="p-2 text-sm">{indent.quantity}</td>
                                                            <td className="p-2 text-sm">{indent.uom}</td>
                                                            <td className="p-2">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`items.${index}.quantity`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormControl>
                                                                                <div className="flex flex-col">
                                                                                    <Input
                                                                                        type="number"
                                                                                        className="h-8"
                                                                                        placeholder="Qty"
                                                                                        max={indent.remainingQty}
                                                                                        disabled={status !== 'Received'}
                                                                                        {...field}
                                                                                    />
                                                                                    <span className="text-xs text-muted-foreground mt-1">
                                                                                        Max: {indent.remainingQty}
                                                                                    </span>
                                                                                </div>
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

                                    {/* Mobile Card View */}
                                    <div className="md:hidden space-y-3 p-3">
                                        {matchingIndents.map((indent, index) => (
                                            <div key={indent.indentNumber} className="bg-muted/50 p-3 rounded-lg space-y-2">
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Indent Number</p>
                                                        <p className="font-medium break-words">{indent.indentNumber}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">UOM</p>
                                                        <p className="font-medium">{indent.uom}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Item Name</p>
                                                    <p className="font-medium text-sm break-words">{indent.product}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Ordered Qty</p>
                                                        <p className="font-medium">{indent.quantity}</p>
                                                    </div>
                                                    <div>
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.quantity`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel className="text-xs text-muted-foreground">
                                                                        Received Qty
                                                                    </FormLabel>
                                                                    <FormControl>
                                                                        <div className="flex flex-col">
                                                                            <Input
                                                                                type="number"
                                                                                className="h-9"
                                                                                placeholder="Qty"
                                                                                max={indent.remainingQty}
                                                                                disabled={status !== 'Received'}
                                                                                {...field}
                                                                            />
                                                                            <span className="text-xs text-muted-foreground mt-1">
                                                                                Max: {indent.remainingQty}
                                                                            </span>
                                                                        </div>
                                                                    </FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="secondary" type="button">
                                            Cancel
                                        </Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={loading}>
                                        {loading ? (
                                            <>
                                                <Loader size={20} color="#ffffff" className="mr-2" />
                                                Receiving...
                                            </>
                                        ) : (
                                            'Receive'
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
