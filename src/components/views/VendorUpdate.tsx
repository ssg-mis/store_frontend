import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
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
import { UserCheck, PenSquare, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { Pill } from '../ui/pill';
import { formatDate } from '@/lib/utils';

const AddVendorSection = ({ onVendorAdded }: { onVendorAdded: () => Promise<void> }) => {
    const [name, setName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        if (!name.trim()) {
            toast.error('Vendor name cannot be empty');
            return;
        }
        setIsAdding(true);
        try {
            const payload = { vendor_name: name.trim() };
            const result = await postToSheet([payload as any], 'insert', 'MASTER');
            if (result.success) {
                toast.success('New vendor added');
                setName('');
                await onVendorAdded();
            } else {
                throw new Error('API save failed');
            }
        } catch (error: any) {
            toast.error('Failed to add vendor: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div
            className="flex items-center gap-2 p-2 border-b"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <Input
                placeholder="Add new vendor..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAdd();
                    }
                }}
                className="h-8"
            />
            <Button
                size="icon"
                variant="ghost"
                type="button"
                disabled={isAdding}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd();
                }}
                className="h-8 w-8"
            >
                {isAdding ? <Loader size={12} color="currentColor" /> : <Plus className="h-4 w-4" />}
            </Button>
        </div>
    );
};

interface VendorUpdateData {
    id: number;
    indentId: number;
    indentNo: string;
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
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet } = useSheets();

    const [selectedIndent, setSelectedIndent] = useState<VendorUpdateData | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<HistoryData | null>(null);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [tableData, setTableData] = useState<VendorUpdateData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<HistoryData>>({});
    const [vendorSearch, setVendorSearch] = useState('');
    const [vendors, setVendors] = useState<any[]>([]);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(true);
    const [paymentTerms, setPaymentTerms] = useState<string[]>([]);
    const [paymentTermsLoading, setPaymentTermsLoading] = useState(true);
    const [newPaymentTerm, setNewPaymentTerm] = useState('');

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

    const handleAddPaymentTerm = async () => {
        const trimmed = newPaymentTerm.trim();
        if (!trimmed) {
            toast.error('Please enter a payment term');
            return;
        }
        if (paymentTerms.includes(trimmed)) {
            toast.error('Payment term already exists');
            return;
        }
        try {
            const payload = { payment_term: trimmed };
            const result = await postToSheet([payload as any], 'insert', 'MASTER');
            if (result.success) {
                setPaymentTerms(prev => [...prev, trimmed]);
                setNewPaymentTerm('');
                toast.success(`Added payment term: ${trimmed}`);
            } else {
                throw new Error('API save failed');
            }
        } catch (err: any) {
            toast.error('Failed to add: ' + err.message);
        }
    };

    const fetchData = async () => {
        setDataLoading(true);
        try {
            // 1. Fetch Approved Indents for the PENDING tab
            const approvedIndentsData = await fetchFromSupabasePaginated(
                'approved_indent',
                '*',
                { column: 'createdAt', options: { ascending: false } }
            );

            if (approvedIndentsData) {
                // Filter out indents that already have a vendor rate update OR a three-party approval
                const pendingTableData = approvedIndentsData
                    .filter((record: any) => {
                        return !(record.hasRateUpdate || record.hasThreeParty);
                    })
                    .map((record: any) => ({
                        id: record.id,
                        indentId: record.indentId,
                        indentNo: record.indentNumber || record.indent_number || record.indentNo || '',
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        vendorType: record.vendorType as VendorUpdateData['vendorType'],
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                    }));
                setTableData(pendingTableData);
            }

            // 2. Fetch History from BOTH tables
            const [rateUpdates, threePartyApprovals] = await Promise.all([
                fetchFromSupabasePaginated('vendor_rate_update', '*'),
                fetchFromSupabasePaginated('three_party_approval', '*')
            ]);

            const historyItems: any[] = [];

            if (rateUpdates) {
                rateUpdates.forEach((record: any) => {
                    const indentNo = record.indentNumber || record.indent_number || record.indentNo || '';
                    const approvalMatch = approvedIndentsData?.find((a: any) => 
                        (a.indentNumber === indentNo || a.indent_number === indentNo || a.indentNo === indentNo)
                    );

                    historyItems.push({
                        id: record.id,
                        source: 'rate_update',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        indentNo: indentNo,
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate: record.rate1 || 0,
                        vendorType: approvalMatch?.vendorType || 'Regular',
                        vendorName: record.vendorName1 || '',
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                    });
                });
            }

            if (threePartyApprovals) {
                threePartyApprovals.forEach((record: any) => {
                    const indentNo = record.indentNumber || record.indent_number || record.indentNo || '';
                    const approvalMatch = approvedIndentsData?.find((a: any) => 
                        (a.indentNumber === indentNo || a.indent_number === indentNo || a.indentNo === indentNo)
                    );

                    historyItems.push({
                        id: record.id,
                        source: 'three_party',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        indentNo: indentNo,
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        quantity: record.approvedQuantity || 0,
                        uom: record.uom || '',
                        rate: record.approvedRate || 0,
                        vendorType: approvalMatch?.vendorType || 'Three Party',
                        vendorName: record.approvedVendorName || '',
                        requestDate: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        approvalDate: record.planned ? formatDate(new Date(record.planned)) : '',
                    });
                });
            }

            setHistoryData(historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch (error: any) {
            console.error('Error fetching data for Vendor Update:', error);
            toast.error('Failed to fetch data: ' + error.message);
        } finally {
            setDataLoading(false);
        }
    };

    // Fetching table data on mount
    useEffect(() => {
        fetchData();
    }, []);


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
                            <AddVendorSection onVendorAdded={refreshVendors} />
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
                    <TabsContent value="pending">
                        <DataTable
                            data={tableData}
                            columns={columns}
                            searchFields={['indentNo', 'product', 'department', 'indenter', 'vendorType', 'vendorName', 'date']}
                            dataLoading={dataLoading}
                        />
                    </TabsContent>
                    <TabsContent value="history">
                        <DataTable
                            data={historyData}
                            columns={historyColumns}
                            searchFields={['indentNo', 'product', 'department', 'indenter', 'vendorType', 'vendorName', 'date']}
                            dataLoading={dataLoading}
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
                                                                        <AddVendorSection onVendorAdded={refreshVendors} />
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
                                                                        <div className="p-2 border-b">
                                                                            <div className="flex items-center gap-1">
                                                                                <Input
                                                                                    placeholder="New payment term..."
                                                                                    className="h-8 text-sm"
                                                                                    value={newPaymentTerm}
                                                                                    onChange={(e) => setNewPaymentTerm(e.target.value)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onKeyDown={(e) => e.stopPropagation()}
                                                                                />
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 shrink-0"
                                                                                    onClick={(e) => { e.stopPropagation(); handleAddPaymentTerm(); }}
                                                                                >
                                                                                    <Plus className="h-4 w-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
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
                                                                    <AddVendorSection onVendorAdded={refreshVendors} />
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
                                                            <div className="p-2 border-b">
                                                                <div className="flex items-center gap-1">
                                                                    <Input
                                                                        placeholder="New payment term..."
                                                                        className="h-8 text-sm"
                                                                        value={newPaymentTerm}
                                                                        onChange={(e) => setNewPaymentTerm(e.target.value)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onKeyDown={(e) => e.stopPropagation()}
                                                                    />
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        className="h-8 w-8 shrink-0"
                                                                        onClick={(e) => { e.stopPropagation(); handleAddPaymentTerm(); }}
                                                                    >
                                                                        <Plus className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
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
        </div>
    )
};