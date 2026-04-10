import { Database, Plus } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo } from 'react';
import { fetchFromSupabasePaginated, postToSheet } from '@/lib/fetchers';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetClose,
} from '../ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../element/DataTable';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

/* ───── types ───── */
interface MasterRow {
    id: number;
    vendor_name: string;
    vendorName?: string;
    vendor_gstin: string | null;
    vendorAddress?: string | null; // Note: address might be snake_case in DB too, checking prisma
    vendor_email: string | null;
    payment_term: string | null;
    department: string | null;
    group_head: string | null;
    itemName: string | null;
    firm_name: string | null;
    firmName?: string | null;
    createdAt: string | null;
}

interface MasterForm {
    vendor_name: string;
    vendor_gstin: string;
    vendor_address: string;
    vendor_email: string;
    payment_term: string;
    department: string;
    group_head: string;
    item_name: string;
    firm_name: string;
}

const emptyForm: MasterForm = {
    vendor_name: '',
    vendor_gstin: '',
    vendor_address: '',
    vendor_email: '',
    payment_term: '',
    department: '',
    group_head: '',
    item_name: '',
    firm_name: '',
};

/* ───── field helper ───── */
function Field({
    label,
    id,
    type = 'text',
    value,
    onChange,
    required,
    placeholder,
    textarea,
}: {
    label: string;
    id: string;
    type?: string;
    value: string;
    onChange: (val: string) => void;
    required?: boolean;
    placeholder?: string;
    textarea?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-sm font-medium">
                {label}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {textarea ? (
                <Textarea
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
                    rows={2}
                    className="resize-none text-sm"
                />
            ) : (
                <Input
                    id={id}
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
                    className="text-sm"
                />
            )}
        </div>
    );
}

function TruncCell({ value, width = 140 }: { value: string | null; width?: number }) {
    if (!value || value === 'null' || value === '---' || value.trim() === '') {
        return <span className="text-muted-foreground">—</span>;
    }
    return (
        <span
            title={value}
            style={{ maxWidth: width }}
            className="truncate block"
        >
            {value}
        </span>
    );
}

/* ───── columns ───── */
const columns: ColumnDef<MasterRow>[] = [
    {
        accessorKey: 'vendor_name',
        header: 'Vendor Name',
        cell: ({ getValue }) => <TruncCell value={getValue() as string} width={160} />,
    },
    {
        accessorKey: 'vendor_gstin',
        header: 'GSTIN',
        cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={130} />,
    },
    {
        accessorKey: 'vendor_email',
        header: 'Email',
        cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={160} />,
    },
    {
        accessorKey: 'payment_term',
        header: 'Payment Term',
        cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={110} />,
    },
    {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={120} />,
    },
    {
        accessorKey: 'group_head',
        header: 'Group Head',
        cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={120} />,
    },
    {
        accessorKey: 'itemName',
        header: 'Item Name',
        cell: ({ getValue }) => <TruncCell value={getValue() as string} width={160} />,
    },
    {
        accessorKey: 'firm_name',
        header: 'Firm Name',
        cell: ({ row }) => <TruncCell value={row.original.firm_name || row.original.firmName} width={160} />,
    },
];

/* ───── main component ───── */
export default function MasterData() {
    const [tableData, setTableData] = useState<MasterRow[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [form, setForm] = useState<MasterForm>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [vendorFilter, setVendorFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'item' | 'vendor'>('item');

    const uniqueVendors = Array.from(new Set(tableData.map(r => r.vendor_name).filter(Boolean))).sort();

    const vendorToFirmMap = useMemo(() => {
        const map: Record<string, string> = {};
        tableData.forEach(r => {
            const vendor = r.vendor_name || r.vendorName;
            const firm = r.firm_name || r.firmName;
            if (vendor && firm && firm !== '---' && firm !== 'null' && firm !== 'undefined') {
                map[vendor] = firm;
            }
        });
        return map;
    }, [tableData]);

    // Show all data properly no matter what any column has more or less data, 
    // but filter out completely empty/null rows.
    const nonEmptyData = useMemo(() => {
        return tableData
            .filter(r => {
                const fields = [
                    r.vendor_name,
                    r.vendor_gstin,
                    r.vendor_email,
                    r.payment_term,
                    r.department,
                    r.group_head,
                    r.itemName,
                    r.firm_name
                ];
                return fields.some(f => f && f !== 'null' && f !== '---' && f.trim() !== '');
            })
            .map(r => {
                const vendor = r.vendor_name || r.vendorName;
                const firm = r.firm_name || r.firmName;
                return {
                    ...r,
                    firm_name: firm || (vendor ? vendorToFirmMap[vendor] : firm)
                };
            });
    }, [tableData, vendorToFirmMap]);

    const filteredData = useMemo(() => {
        return vendorFilter === 'All'
            ? nonEmptyData
            : nonEmptyData.filter(r => r.vendor_name === vendorFilter);
    }, [nonEmptyData, vendorFilter]);

    /* fetch */
    async function fetchData() {
        setDataLoading(true);
        try {
            const data = await fetchFromSupabasePaginated(
                'MASTER',
                '*',
                { column: 'id', options: { ascending: false } }
            );

            console.log("Fetched Firm Names:", (data || []).map((d: any) => ({
                vendor: d.vendor_name || d.vendorName,
                firm: d.firm_name || d.firmName
            })));

            setTableData(data || []);
        } catch (err: any) {
            console.error('Master data fetch exception:', err);
            toast.error('An unexpected error occurred while fetching data');
        } finally {
            setDataLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
    }, []);

    /* reset form when sheet closes */
    useEffect(() => {
        if (!sheetOpen) setForm(emptyForm);
    }, [sheetOpen]);

    function setField(key: keyof MasterForm) {
        return (val: string) => setForm((prev) => ({ ...prev, [key]: val }));
    }

    /* submit */
    async function handleItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await postToSheet([{
                vendor_name: null,
                vendor_gstin: null,
                vendor_address: null,
                vendor_email: null,
                payment_term: null,
                department: form.department.trim() || null,
                group_head: form.group_head.trim() || null,
                groupHead: form.group_head.trim() || null,
                itemName: form.item_name.trim() || null,
                firm_name: form.firm_name.trim() || null,
            }], 'insert', 'MASTER');

            if (!result.success) throw new Error('Failed to save item data');
            toast.success('Item master data saved successfully!');
            setSheetOpen(false);
            fetchData();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save item data');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleVendorSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await postToSheet([{
                vendor_name: form.vendor_name.trim(),
                vendor_gstin: form.vendor_gstin.trim() || null,
                vendor_address: form.vendor_address.trim() || null,
                vendor_email: form.vendor_email.trim() || null,
                payment_term: form.payment_term.trim() || null,
                firm_name: form.firm_name.trim() || null,
                department: null,
                group_head: null,
                groupHead: null,
                itemName: null,
            }], 'insert', 'MASTER');

            if (!result.success) throw new Error('Failed to save vendor data');
            toast.success('Vendor master data saved successfully!');
            setSheetOpen(false);
            fetchData();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save vendor data');
        } finally {
            setSubmitting(false);
        }
    }


    return (
        <div className="space-y-6 w-full overflow-x-hidden">
            <Heading
                heading="Master Data"
                subtext="Manage vendor master records"
            >
                <Database size={50} className="text-primary" />
            </Heading>

            {/* ── Table & Toolbar ── */}
            <div className="w-full max-w-full overflow-x-auto">
                <DataTable
                    data={filteredData}
                    columns={columns}
                    searchFields={['vendor_name', 'department', 'group_head', 'itemName', 'vendor_gstin', 'vendor_email', 'payment_term', 'firm_name']}
                    dataLoading={dataLoading}
                    pagination={true}
                    extraActions={
                        <div className="flex gap-2">
                            <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                <SelectTrigger className="w-full sm:min-w-[200px] h-9">
                                    <SelectValue placeholder="All Vendors" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <SelectItem value="All">All Vendors</SelectItem>
                                    {uniqueVendors.map(vendor => (
                                        <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                className="h-9 shrink-0"
                                onClick={() => {
                                    setActiveTab('item');
                                    setSheetOpen(true);
                                }}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Item Info
                            </Button>
                            <Button
                                className="h-9 shrink-0"
                                onClick={() => {
                                    setActiveTab('vendor');
                                    setSheetOpen(true);
                                }}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Vendor Info
                            </Button>
                        </div>
                    }
                />
            </div>

            {/* ── Side Sheet Form ── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent
                    side="right"
                    className="w-full sm:max-w-md overflow-y-auto flex flex-col"
                >
                    <SheetHeader className="sticky top-0 bg-background z-10 pb-3 border-b mb-6">
                        <SheetTitle>
                            {activeTab === 'item' ? 'Add Item Info' : 'Add Vendor Info'}
                        </SheetTitle>
                        <SheetDescription>
                            {activeTab === 'item'
                                ? 'Fill in the item and department details.'
                                : 'Fill in the vendor contact and firm details.'}
                        </SheetDescription>
                    </SheetHeader>

                    {activeTab === 'item' ? (
                        <div className="flex-1 overflow-y-auto space-y-4 px-1">
                            <form id="item-form" onSubmit={handleItemSubmit} className="space-y-4">
                                <Field
                                    label="Item Name"
                                    id="item_name"
                                    value={form.item_name}
                                    onChange={setField('item_name')}
                                    required
                                />
                                <Field
                                    label="Department"
                                    id="department"
                                    value={form.department}
                                    onChange={setField('department')}
                                />
                                <Field
                                    label="Group Head"
                                    id="group_head"
                                    value={form.group_head}
                                    onChange={setField('group_head')}
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 h-11"
                                    >
                                        {submitting && (
                                            <Loader size={16} color="white" className="mr-2" />
                                        )}
                                        {submitting ? 'Saving Item…' : 'Save Item Data'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-4 px-1">
                            <form id="vendor-form" onSubmit={handleVendorSubmit} className="space-y-4">
                                <Field
                                    label="Vendor Name"
                                    id="vendor_name"
                                    value={form.vendor_name}
                                    onChange={setField('vendor_name')}
                                    required
                                />
                                <Field
                                    label="Vendor GSTIN"
                                    id="vendor_gstin"
                                    value={form.vendor_gstin}
                                    onChange={setField('vendor_gstin')}
                                    placeholder="e.g. 09AAAAA0000A1ZZ"
                                />
                                <Field
                                    label="Vendor Email"
                                    id="vendor_email"
                                    type="email"
                                    value={form.vendor_email}
                                    onChange={setField('vendor_email')}
                                />
                                <Field
                                    label="Payment Term"
                                    id="payment_term"
                                    value={form.payment_term}
                                    onChange={setField('payment_term')}
                                    placeholder="e.g. Net 30"
                                />
                                <Field
                                    label="Firm Name"
                                    id="firm_name"
                                    value={form.firm_name}
                                    onChange={setField('firm_name')}
                                    placeholder="e.g. Shri Shyam Oil Extractions"
                                />
                                <Field
                                    label="Vendor Address"
                                    id="vendor_address"
                                    value={form.vendor_address}
                                    onChange={setField('vendor_address')}
                                    textarea
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 h-11"
                                    >
                                        {submitting && (
                                            <Loader size={16} color="white" className="mr-2" />
                                        )}
                                        {submitting ? 'Saving Vendor…' : 'Save Vendor Data'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="mt-auto pt-4 border-t sticky bottom-0 bg-background">
                        <SheetClose asChild>
                            <Button variant="outline" type="button" className="w-full">
                                Close
                            </Button>
                        </SheetClose>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

