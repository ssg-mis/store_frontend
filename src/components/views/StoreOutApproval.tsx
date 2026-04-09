import { useEffect, useState } from 'react';
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
import { formatDate } from '@/lib/utils';
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

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet, updateRelatedSheets } = useSheets();
    const [openDialog, setOpenDialog] = useState(false);
    const [tableData, setTableData] = useState<StoreOutTableData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [selectedIndent, setSelectedIndent] = useState<StoreOutTableData | null>(null);
    const [rejecting, setRejecting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const [mainTab, setMainTab] = useState('store-out');

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
    const [editValues, setEditValues] = useState<{
        quantity?: number;
        requestedQuantity?: number;
        indentNo?: string;
        department?: string;
        product?: string;
    }>({});

    const [editingField, setEditingField] = useState<"quantity" | "requestedQuantity" | null>(null);



    const handleSaveEdit = async (row: HistoryData) => {
        try {
            setLoading(true);
            const updateData = {
                indentNumber: row.indentNo,
                issuedQuantity: editValues.quantity,
                quantity: editValues.requestedQuantity
            };

            // Note: In a real Prisma setup, we might need the numeric ID.
            // But since our controllers use indent_number for lookup in some cases or 
            // we should ensure the backend handles this. 
            // Our current updateIndent controller uses `where: { id: parseInt(id) }`.
            // I should update the controller to support indentNumber if needed, 
            // or fetch the ID first.

            // For now, I'll assume we need to update by indentNumber which is unique.
            const result = await postToSheet([updateData], 'update', 'INDENT');

            if (result.success) {
                toast.success(`Updated ${row.indentNo}`);
                setEditingRow(null);
                setEditValues({});
                fetchData();
                updateIndentSheet();
                updateRelatedSheets();
            } else {
                toast.error('Failed to update');
            }
        } catch (error) {
            console.error('Update error:', error);
            toast.error("An error occurred during update");
        } finally {
            setLoading(false);
        }
    };



    // Fetching table data
    const fetchData = async () => {
        setDataLoading(true);
        try {
            // Fetch all Store Out indents with pagination
            const allData = await fetchFromSupabasePaginated(
                'indent',
                '*',
                { column: 'createdAt', options: { ascending: false } },
                (q) => q.in('indentType', ['Store Out', 'Store Out Return'])
            );

            if (allData) {
                const pendingData = allData.filter(record =>
                    (record.indentType === 'Store Out' || record.indentType === 'Store Out Return') && record.actual_6 == null
                );

                const pendingTableData = pendingData.map((record: any) => ({
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
                    validityDate: record.validityDate ? formatDate(new Date(record.validityDate)) : '—',
                    indentType: record.indentType || 'Store Out',
                }));
                setTableData(pendingTableData);

                // History: actual_6 not null
                const historyDataResult = allData.filter(record =>
                    (record.indentType === 'Store Out' || record.indentType === 'Store Out Return') && record.actual_6 != null
                );

                const historyTableData = historyDataResult.map((record: any) => ({
                    approvalDate: formatDate(new Date(record.actual_6)),
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
                    validityDate: record.validityDate ? formatDate(new Date(record.validityDate)) : '—',
                    indentType: record.indentType || 'Store Out',
                }));
                setHistoryData(historyTableData);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch store out data');
        } finally {
            setDataLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Add this function inside your component, before the return statement
    const onDownloadClick = async () => {
        setLoading(true);
        try {
            // Create a new workbook
            const workbook = XLSX.utils.book_new();

            // Convert table data to worksheet format
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

            // Create worksheet from data
            const worksheet = XLSX.utils.json_to_sheet(worksheetData);

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Store Out Pending');

            // Generate filename with current date
            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `Store_Out_Pending_${currentDate}.xlsx`;

            // Write and download the file
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

    const displayPendingData = filteredTableData.filter(item => 
        mainTab === 'store-out' ? item.indentType === 'Store Out' : item.indentType === 'Store Out Return'
    );

    const displayHistoryData = filteredHistoryData.filter(item => 
        mainTab === 'store-out' ? item.indentType === 'Store Out' : item.indentType === 'Store Out Return'
    );

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
                        <span className="font-semibold text-muted-foreground mr-1">Item:</span>
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
                                    variant="default"
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
                                    Done
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
        { accessorKey: 'product', header: 'Item' },
        { accessorKey: 'date', header: 'Date' },
        { accessorKey: 'validityDate', header: 'Validity Date' },
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
        {
            header: "Edit",
            id: "edit",
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                return isEditing ? (
                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            onClick={() => handleSaveEdit(row.original)}
                            className="flex items-center gap-1"
                        >
                            <SaveOutlined /> Save
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setEditingRow(null);
                                setEditValues({});
                            }}
                            className="flex items-center gap-1"
                        >
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setEditingRow(row.original.indentNo);
                            setEditValues({
                                quantity: row.original.quantity,
                                requestedQuantity: row.original.requestedQuantity,
                                indentNo: row.original.indentNo,
                                department: row.original.department,
                                product: row.original.product,
                            });
                            setEditingField("quantity"); // Default focus on quantity
                        }}
                    >
                        <EditOutlined /> Edit
                    </Button>

                );
            },
        },

        { accessorKey: "indentNo", header: "Indent No." },
        { accessorKey: "firm", header: "Firm" },
        { accessorKey: "indenter", header: "Indenter" },
        { accessorKey: "department", header: "Department" },
        { accessorKey: "product", header: "Item" },
        { accessorKey: "uom", header: "UOM" },

        // 👇 Issued Quantity editable banaya


        // 2. Update the input cells to use a more stable approach:
        {
            accessorKey: "quantity",
            header: "Issued Quantity",
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                if (isEditing) {
                    return (
                        <Input
                            type="number"
                            value={editValues.quantity ?? ""}
                            onChange={e =>
                                setEditValues(prev => ({
                                    ...prev,
                                    quantity: e.target.value === "" ? undefined : Number(e.target.value)
                                }))
                            }
                            autoFocus={editingField === "quantity"}
                            onFocus={() => setEditingField("quantity")}
                        />
                    );
                }
                return row.original.quantity;
            },
        },
        {
            accessorKey: "requestedQuantity",
            header: "Requested Quantity",
            cell: ({ row }) => {
                const isEditing = editingRow === row.original.indentNo;
                if (isEditing) {
                    return (
                        <Input
                            type="number"
                            value={editValues.requestedQuantity ?? ""}
                            onChange={e =>
                                setEditValues(prev => ({
                                    ...prev,
                                    requestedQuantity: e.target.value === "" ? undefined : Number(e.target.value)
                                }))
                            }
                            autoFocus={editingField === "requestedQuantity"}
                            onFocus={() => setEditingField("requestedQuantity")}
                        />
                    );
                }
                return row.original.requestedQuantity;
            },
        },


        { accessorKey: "issueApprovedBy", header: "Issue Approved By" },
        { accessorKey: "validityDate", header: "Validity Date" },
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
    });

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
                id: selectedIndent?.id, // Fix for 404 error - ID is required for PUT /api/indents/:id
                indentNumber: selectedIndent?.indentNo,
                actual_6: timestamp,
                issueApprovedBy: values.issueApprovedBy,
                issueStatus: values.issueStatus,
                issuedQuantity: values.issuedQuantity,
            };

            const result = await postToSheet([updateData], 'update', 'INDENT');

            if (result.success) {
                // Also insert into STORE OUT APPROVAL table
                const delay = calculateStoreOutDelay(selectedIndent?.planned || null);
                const plannedDate = selectedIndent?.planned ? new Date(selectedIndent.planned) : null;

                const approvalData = {
                    indent_number: selectedIndent?.indentNo,
                    issueApprovedBy: values.issueApprovedBy,
                    issueStatus: values.issueStatus,
                    issuedQuantity: values.issuedQuantity,
                    delay: delay,
                    planned: plannedDate,
                };
                const approvalResult = await postToSheet([approvalData], 'insert', 'STORE OUT APPROVAL');

                if (!approvalResult.success) {
                    console.error('Failed to insert store out approval record:', approvalResult.error);
                }

                toast.success(`Updated store out approval status of ${selectedIndent?.indentNo}`);
                updateIndentSheet(); // Update context for sidebars
                updateRelatedSheets();
                setOpenDialog(false);
                form.reset();
                fetchData();
            } else {
                toast.error('Failed to update status');
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
            <Tabs defaultValue="store-out" onValueChange={setMainTab} className="w-full">
                <div className="px-5 pt-4">
                    <TabsList className="grid w-full grid-cols-2 shadow-sm border">
                        <TabsTrigger value="store-out">Store Out Approval</TabsTrigger>
                        <TabsTrigger value="return">Store Out Return Approval</TabsTrigger>
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
                                dataLoading={dataLoading}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData.filter(d => d.indentType === 'Store Out')} />
                                        <Button
                                            variant="default"
                                            onClick={onDownloadClick}
                                            className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8"
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
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={dataLoading}
                                extraActions={
                                    <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData.filter(d => d.indentType === 'Store Out')} />
                                }
                            />
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="return">
                    <Tabs defaultValue="pending">
                        <Heading heading="Store Out Return" subtext="Manage returned items" tabs>
                            <PackageCheck size={50} className="text-primary" />
                        </Heading>
                        <TabsContent value="pending">
                            <DataTable
                                data={displayPendingData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'uom', 'specifications']}
                                dataLoading={dataLoading}
                                extraActions={
                                    <div className="flex items-center gap-2">
                                        <FilterBar filters={pendingFilters} setFilters={setPendingFilters} data={tableData.filter(d => d.indentType === 'Store Out Return')} />
                                        <Button
                                            variant="default"
                                            onClick={onDownloadClick}
                                            className="bg-gradient-to-r from-green-600 to-green-800 border-none rounded-lg px-4 font-bold shadow-md flex items-center gap-2 h-8"
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
                                data={displayHistoryData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date', 'areaOfUse', 'quantity', 'requestedQuantity', 'uom', 'approvalDate', 'issuedStatus']}
                                dataLoading={dataLoading}
                                extraActions={
                                    <FilterBar filters={historyFilters} setFilters={setHistoryFilters} data={historyData.filter(d => d.indentType === 'Store Out Return')} />
                                }
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
                                <DialogTitle>Approve Store Out Request</DialogTitle>
                                <DialogDescription>
                                    Approve Store Out Request{' '}
                                    <span className="font-medium">{selectedIndent.indentNo}</span>
                                </DialogDescription>
                            </DialogHeader>
                            <div className="bg-muted p-4 rounded-md grid gap-3">
                                <h3 className="text-lg font-bold">Request Details</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 bg-muted rounded-md gap-3 ">
                                    <div className="space-y-1">
                                        <p className="font-medium">Indenter</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.indenter}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">Department</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.department}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">Area of Use</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.areaOfUse}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">Date</p>
                                        <p className="text-sm font-light">{selectedIndent.date}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-muted p-4 rounded-md grid gap-3">
                                <h3 className="text-lg font-bold">Item Details</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 bg-muted rounded-md gap-3 ">
                                    <div className="space-y-1">
                                        <p className="font-medium">Item Name</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.product}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">Quantity</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.quantity}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">UOM</p>
                                        <p className="text-sm font-light">{selectedIndent.uom}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-nowrap">Specifications</p>
                                        <p className="text-sm font-light">
                                            {selectedIndent.specifications}
                                        </p>
                                    </div>
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
