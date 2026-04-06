import type { ColumnDef, Row } from '@tanstack/react-table';
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
import { useEffect, useState } from 'react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postToSheet, uploadFile, fetchFromSupabasePaginated } from '@/lib/fetchers';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Users } from 'lucide-react';
import { Tabs, TabsContent } from '../ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { formatDate } from '@/lib/utils';
import { Input } from '../ui/input';

interface RateApprovalData {
    id: number;
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    comparisonSheet: string;
    vendors: [string, string, string][];
    date: string;
}
interface HistoryData {
    id: number;
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    vendor: [string, string];
    date: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet } = useSheets();

    const [selectedIndent, setSelectedIndent] = useState<RateApprovalData | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<HistoryData | null>(null);
    const [tableData, setTableData] = useState<RateApprovalData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);

    // Fetching table data
    useEffect(() => {
        const fetchData = async () => {
            setDataLoading(true);
            try {
                // Fetch all vendor_rate_update records (Three Party submissions)
                const rateUpdates = await fetchFromSupabasePaginated(
                    'vendor_rate_update',
                    '*',
                    { column: 'createdAt', options: { ascending: false } }
                );

                // Fetch all three_party_approval records (approved ones)
                const threePartyApprovals = await fetchFromSupabasePaginated(
                    'three_party_approval',
                    '*',
                    { column: 'createdAt', options: { ascending: false } }
                );

                // Build a set of approved indent numbers for quick lookup
                const approvedIndentNumbers = new Set(
                    (threePartyApprovals || []).map((r: any) =>
                        r.indentNumber || r.indent_number || ''
                    )
                );

                // PENDING: vendor_rate_update records that are NOT yet in three_party_approval
                const pendingTableData = (rateUpdates || [])
                    .filter((record: any) => {
                        const indentNo = record.indentNumber || record.indent_number || '';
                        return !approvedIndentNumbers.has(indentNo);
                    })
                    .map((record: any) => ({
                        id: record.id,
                        indentNo: record.indentNumber || record.indent_number || '',
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        comparisonSheet: record.comparisonSheet || '',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        vendors: [
                            [record.vendorName1 || '', record.rate1?.toString() || '0', record.paymentTerm1 || ''] as [string, string, string],
                            [record.vendorName2 || '', record.rate2?.toString() || '0', record.paymentTerm2 || ''] as [string, string, string],
                            [record.vendorName3 || '', record.rate3?.toString() || '0', record.paymentTerm3 || ''] as [string, string, string],
                        ],
                    }));
                setTableData(pendingTableData);

                // Build set of indent numbers that came through the Three Party flow (vendor_rate_update)
                const threePartyIndentNumbers = new Set(
                    (rateUpdates || []).map((r: any) => r.indentNumber || r.indent_number || '')
                );

                // HISTORY: only three_party_approval records whose indent also exists in vendor_rate_update
                const historyTableData = (threePartyApprovals || [])
                    .filter((record: any) => {
                        const indentNo = record.indentNumber || record.indent_number || '';
                        return threePartyIndentNumbers.has(indentNo);
                    })
                    .map((record: any) => ({
                        id: record.id,
                        indentNo: record.indentNumber || record.indent_number || '',
                        indenter: record.indenterName || '',
                        department: record.department || '',
                        product: record.productName || '',
                        date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                        vendor: [
                            record.approvedVendorName || '',
                            record.approvedRate?.toString() || '0'
                        ] as [string, string],
                    }));
                setHistoryData(historyTableData);

            } catch (error: any) {
                console.error('Error fetching data from Supabase:', error);
                toast.error('Failed to fetch data: ' + error.message);
            } finally {
                setDataLoading(false);
            }
        };

        fetchData();
    }, []);

    // Creating table columns
    const columns: ColumnDef<RateApprovalData>[] = [
        {
            header: 'Action',
            id: 'action',
            cell: ({ row }: { row: Row<RateApprovalData> }) => {
                const indent = row.original;

                return (
                    <div>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedIndent(indent);
                                }}
                            >
                                Approve
                            </Button>
                        </DialogTrigger>
                    </div>
                );
            },
        },
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'date', header: 'Date' },
        {
            accessorKey: 'vendors',
            header: 'Vendors',
            enableSorting: false,   // <-- ADD THIS
            cell: ({ row }) => {
                const vendors = row.original.vendors;
                return (
                    <div className="grid place-items-center">
                        <div className="flex flex-col gap-1">
                            {vendors.map((vendor, index) => (
                                <span key={index} className="rounded-full text-xs px-3 py-1 bg-accent text-accent-foreground border border-accent-foreground">
                                    {vendor[0]} - ₹{vendor[1]}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            },
        },

        {
            accessorKey: 'comparisonSheet',
            header: 'Comparison Sheet',
            enableSorting: false,    // <-- ADD THIS
            cell: ({ row }) => {
                const sheet = row.original.comparisonSheet;
                return sheet ? (
                    <a href={sheet} target="_blank">Comparison Sheet</a>
                ) : <></>;
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
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedHistory(indent);
                                }}
                            >
                                Update
                            </Button>
                        </DialogTrigger>
                    </div>
                );
            },
        },
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'date', header: 'Date' },
    ];

    // Creating approval form
    const schema = z.object({
        vendor: z.coerce.number(),
        photoOfBill: z.instanceof(File).optional(),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            vendor: undefined,
            photoOfBill: undefined,
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

    async function onSubmit(values: z.infer<typeof schema>) {
        try {
            let photoUrl = '';
            if (values.photoOfBill) {
                photoUrl = await uploadFile(values.photoOfBill, 'bill_photo', 'upload');
            }

            const selectedVendor = selectedIndent?.vendors[values.vendor];

            // Save approved vendor to three_party_approval table
            const result = await postToSheet([{
                indent_number: selectedIndent?.indentNo,
                approvedVendorName: selectedVendor?.[0],
                approvedRate: selectedVendor?.[1],
                approvedPaymentTerm: selectedVendor?.[2],
                photo_of_bill: photoUrl || undefined,
            } as any], 'insert', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Approved vendor for ${selectedIndent?.indentNo}`);
            updateIndentSheet();
            setOpenDialog(false);
            form.reset();

            // Refresh using new table-based logic
            const rateUpdates = await fetchFromSupabasePaginated('vendor_rate_update', '*', { column: 'createdAt', options: { ascending: false } });
            const threePartyApprovals = await fetchFromSupabasePaginated('three_party_approval', '*', { column: 'createdAt', options: { ascending: false } });
            const approvedIndentNumbers = new Set((threePartyApprovals || []).map((r: any) => r.indentNumber || r.indent_number || ''));

            setTableData((rateUpdates || [])
                .filter((record: any) => !approvedIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    comparisonSheet: record.comparisonSheet || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendors: [
                        [record.vendorName1 || '', record.rate1?.toString() || '0', record.paymentTerm1 || ''] as [string, string, string],
                        [record.vendorName2 || '', record.rate2?.toString() || '0', record.paymentTerm2 || ''] as [string, string, string],
                        [record.vendorName3 || '', record.rate3?.toString() || '0', record.paymentTerm3 || ''] as [string, string, string],
                    ],
                }))
            );
            // Only show Three Party flow approvals in history (cross-ref with vendor_rate_update)
            const threePartyIndentNumbers = new Set(
                (rateUpdates || []).map((r: any) => r.indentNumber || r.indent_number || '')
            );
            setHistoryData((threePartyApprovals || [])
                .filter((record: any) => threePartyIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendor: [record.approvedVendorName || '', record.approvedRate?.toString() || '0'] as [string, string],
                }))
            );
        } catch (error: any) {
            console.error('Error updating vendor:', error);
            toast.error('Failed to update vendor: ' + error.message);
        }
    }

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
            historyUpdateForm.reset({ rate: parseInt(selectedHistory.vendor[1]) })
        }
    }, [selectedHistory])

    async function onSubmitHistoryUpdate(values: z.infer<typeof historyUpdateSchema>) {
        try {
            // Update approvedRate in three_party_approval table
            const result = await postToSheet([{
                id: selectedHistory?.id,
                indent_number: selectedHistory?.indentNo,
                approvedRate: values.rate
            } as any], 'update', 'THREE_PARTY_APPROVAL');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated rate of ${selectedHistory?.indentNo}`);
            updateIndentSheet();
            setOpenDialog(false);
            historyUpdateForm.reset({ rate: undefined });

            // Refresh history — only show Three Party flow approvals
            const [threePartyApprovals, rateUpdatesRefresh] = await Promise.all([
                fetchFromSupabasePaginated('three_party_approval', '*', { column: 'createdAt', options: { ascending: false } }),
                fetchFromSupabasePaginated('vendor_rate_update', '*', { column: 'createdAt', options: { ascending: false } })
            ]);
            const threePartyIndentNumbers = new Set(
                (rateUpdatesRefresh || []).map((r: any) => r.indentNumber || r.indent_number || '')
            );
            setHistoryData((threePartyApprovals || [])
                .filter((record: any) => threePartyIndentNumbers.has(record.indentNumber || record.indent_number || ''))
                .map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber || record.indent_number || '',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    vendor: [record.approvedVendorName || '', record.approvedRate?.toString() || '0'] as [string, string],
                }))
            );
        } catch (error: any) {
            console.error('Error updating vendor:', error);
            toast.error('Failed to update vendor: ' + error.message);
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
                        heading="Three Party Rate Approval"
                        subtext="Approve rates for three party vendors"
                        tabs
                    >
                        <Users size={50} className="text-primary" />
                    </Heading>
                    <TabsContent value="pending" className="overflow-hidden w-full">
                        <div className="overflow-x-auto max-w-[calc(100vw-3rem)] md:max-w-full">
                            <DataTable
                                data={tableData}
                                columns={columns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date']}
                                dataLoading={dataLoading}
                            />
                        </div>
                    </TabsContent>
                    <TabsContent value="history" className="overflow-hidden w-full">
                        <div className="overflow-x-auto max-w-[calc(100vw-3rem)] md:max-w-full">
                            <DataTable
                                data={historyData}
                                columns={historyColumns}
                                searchFields={['indentNo', 'product', 'department', 'indenter', 'date']}
                                dataLoading={dataLoading}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                {selectedIndent && (
                    <DialogContent>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit, onError)}
                                className="space-y-5"
                            >
                                <DialogHeader className="space-y-1">
                                    <DialogTitle>Rate Approval</DialogTitle>
                                    <DialogDescription>
                                        Update vendor for{' '}
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
                                <div className="grid gap-3">
                                    <FormField
                                        control={form.control}
                                        name="vendor"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Select a vendor</FormLabel>
                                                <FormControl>
                                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                                                        {selectedIndent.vendors.map(
                                                            (vendor, index) => (
                                                                <FormItem key={index}>
                                                                    <FormLabel className="flex items-center gap-4 border hover:bg-accent p-3 rounded-md">
                                                                        <FormControl>
                                                                            <RadioGroupItem
                                                                                value={`${index}`}
                                                                            />
                                                                        </FormControl>
                                                                        <div className="font-normal w-full">
                                                                            <div className="flex justify-between items-center w-full">
                                                                                <div>
                                                                                    <p className="font-medium text-base">
                                                                                        {vendor[0]}
                                                                                    </p>
                                                                                    <p className="text-xs">
                                                                                        Payment
                                                                                        Term:{' '}
                                                                                        {vendor[2]}
                                                                                    </p>
                                                                                </div>
                                                                                <p className="text-base">
                                                                                    &#8377;
                                                                                    {vendor[1]}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </FormLabel>
                                                                </FormItem>
                                                            )
                                                        )}
                                                    </RadioGroup>
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="photoOfBill"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Upload Bill Photo (Optional)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="file"
                                                        accept="image/*,application/pdf"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) field.onChange(file);
                                                        }}
                                                    />
                                                </FormControl>
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
                                        Update
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                )}

                {selectedHistory && (
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
                )}
            </Dialog>
        </div>
    );
};
