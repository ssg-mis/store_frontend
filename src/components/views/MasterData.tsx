import { Database, Plus, Check, X, Edit2 } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo } from 'react';
import { fetchFromSupabasePaginated, postToSheet, fetchUOMs, postToUOM, fetchFirms, postToFirm, fetchAreaOfUse, postAreaOfUse } from '@/lib/fetchers';
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
import { Checkbox } from '../ui/checkbox';
import { Pill } from '../ui/pill';

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
    uom: string | null;
    firm_name: string | null;
    firmName?: string | null;
    contact_person?: string | null;
    mobile?: string | null;
    pan_number?: string | null;
    state?: string | null;
    pin_code?: string | null;
    createdAt: string | null;
    isActive?: boolean;
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
    uom: string;
    firm_name: string;
    contact_person: string;
    mobile: string;
    pan_number: string;
    state: string;
    pin_code: string;
    isActive: string;
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
    uom: '',
    firm_name: '',
    contact_person: '',
    mobile: '',
    pan_number: '',
    state: '',
    pin_code: '',
    isActive: 'true',
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



/* ───── main component ───── */
export default function MasterData() {
    const [tableData, setTableData] = useState<MasterRow[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [form, setForm] = useState<MasterForm>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [vendorFilter, setVendorFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'item' | 'vendor'>('item');
    const [pageTab, setPageTab] = useState<'inventory' | 'vendor' | 'config'>('inventory');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<MasterRow>>({});

    const [uoms, setUoms] = useState<{ uom_id: number, uom_name: string }[]>([]);
    const [isAddingUOM, setIsAddingUOM] = useState(false);
    const [newUOMName, setNewUOMName] = useState('');
    const [addingUOM, setAddingUOM] = useState(false);
    const [firms, setFirms] = useState<{ firm_id: number, firm_name: string }[]>([]);
    const [isAddingFirm, setIsAddingFirm] = useState(false);
    const [newFirmName, setNewFirmName] = useState('');
    const [addingFirm, setAddingFirm] = useState(false);
    const [areasOfUse, setAreasOfUse] = useState<{ area_of_use_id: number, area_of_use_name: string }[]>([]);
    const [newAreaOfUseName, setNewAreaOfUseName] = useState('');
    const [addingAreaOfUse, setAddingAreaOfUse] = useState(false);

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

    const inventoryData = useMemo(() =>
        nonEmptyData.filter(r => r.itemName && r.itemName !== 'null'),
    [nonEmptyData]);

    const vendorData = useMemo(() => {
        const vendors = nonEmptyData.filter(r => r.vendor_name && r.vendor_name !== 'null');
        return vendorFilter === 'All' ? vendors : vendors.filter(r => r.vendor_name === vendorFilter);
    }, [nonEmptyData, vendorFilter]);

    const handleEditChange = (key: keyof MasterRow, value: any) => {
        setEditForm(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveEdit = async (id: number) => {
        setSubmitting(true);
        try {
            const updateData = { ...editForm };
            // Ensure we don't send extra fields that might cause issues
            delete (updateData as any).id;
            delete (updateData as any).createdAt;

            const result = await postToSheet([{ id, ...updateData }], 'update', 'MASTER');
            if (result.success) {
                toast.success('Row updated successfully');
                setEditingId(null);
                fetchData();
            } else {
                throw new Error('Failed to update row');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error updating row');
        } finally {
            setSubmitting(false);
        }
    };

    const editCol: ColumnDef<MasterRow> = {
        id: 'select',
        header: 'Edit',
        cell: ({ row }) => (
            <Checkbox
                checked={editingId === row.original.id}
                onCheckedChange={(checked) => {
                    if (checked) {
                        setEditingId(row.original.id);
                        setEditForm(row.original);
                    } else {
                        setEditingId(null);
                        setEditForm({});
                    }
                }}
            />
        ),
    };

    const actionsCol: ColumnDef<MasterRow> = {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
            if (editingId === row.original.id) {
                return (
                    <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleSaveEdit(row.original.id)} disabled={submitting}>
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                );
            }
            return (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    setEditingId(row.original.id);
                    setEditForm(row.original);
                }}>
                    <Edit2 className="h-4 w-4" />
                </Button>
            );
        },
    };

    const inventoryColumns = useMemo<ColumnDef<MasterRow>[]>(() => [
        editCol,
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.department || ''} onChange={(e) => handleEditChange('department', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={120} />;
            },
        },
        {
            accessorKey: 'group_head',
            header: 'Department Head',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.group_head || ''} onChange={(e) => handleEditChange('group_head', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={120} />;
            },
        },
        {
            accessorKey: 'itemName',
            header: 'Item Name',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.itemName || ''} onChange={(e) => handleEditChange('itemName', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={160} />;
            },
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return (
                        <Select
                            value={editForm.uom || ''}
                            onValueChange={(val) => handleEditChange('uom', val)}
                        >
                            <SelectTrigger className="h-8 text-xs w-[100px]">
                                <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                                {uoms.map((u) => (
                                    <SelectItem key={u.uom_id} value={u.uom_name}>
                                        {u.uom_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    );
                }
                return <TruncCell value={val} width={80} />;
            },
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: ({ row, getValue }) => {
                const val = getValue() as boolean;
                if (editingId === row.original.id) {
                    return (
                        <Select
                            value={String(editForm.isActive)}
                            onValueChange={(val) => handleEditChange('isActive', val === 'true')}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="true">Active</SelectItem>
                                <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    );
                }
                return (
                    <Pill variant={val ? 'secondary' : 'reject'}>
                        {val ? 'Active' : 'Inactive'}
                    </Pill>
                );
            },
        },
        actionsCol,
    ], [editingId, editForm, submitting, uoms]);

    const vendorColumns = useMemo<ColumnDef<MasterRow>[]>(() => [
        editCol,
        {
            accessorKey: 'vendor_name',
            header: 'Vendor Name',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.vendor_name || ''} onChange={(e) => handleEditChange('vendor_name', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={160} />;
            },
        },
        {
            accessorKey: 'firm_name',
            header: 'Firm Name',
            cell: ({ row }) => {
                const val = row.original.firm_name || row.original.firmName || '';
                if (editingId === row.original.id) {
                    return (
                        <Select
                            value={editForm.firm_name || ''}
                            onValueChange={(val) => handleEditChange('firm_name', val)}
                        >
                            <SelectTrigger className="h-8 text-xs w-[160px]">
                                <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                                {firms.map((f) => (
                                    <SelectItem key={f.firm_id} value={f.firm_name}>
                                        {f.firm_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    );
                }
                return <TruncCell value={val} width={160} />;
            },
        },
        {
            accessorKey: 'vendor_gstin',
            header: 'GSTIN',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.vendor_gstin || ''} onChange={(e) => handleEditChange('vendor_gstin', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={130} />;
            },
        },
        {
            accessorKey: 'pan_number',
            header: 'PAN',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.pan_number || ''} onChange={(e) => handleEditChange('pan_number', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={120} />;
            },
        },
        {
            accessorKey: 'contact_person',
            header: 'Contact',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.contact_person || ''} onChange={(e) => handleEditChange('contact_person', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={140} />;
            },
        },
        {
            accessorKey: 'mobile',
            header: 'Mobile',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.mobile || ''} onChange={(e) => handleEditChange('mobile', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={120} />;
            },
        },
        {
            accessorKey: 'vendor_email',
            header: 'Email',
            cell: ({ row, getValue }) => {
                const val = getValue() as string;
                if (editingId === row.original.id) {
                    return <Input value={editForm.vendor_email || ''} onChange={(e) => handleEditChange('vendor_email', e.target.value)} className="h-8 text-xs" />;
                }
                return <TruncCell value={val} width={160} />;
            },
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: ({ row, getValue }) => {
                const val = getValue() as boolean;
                if (editingId === row.original.id) {
                    return (
                        <Select
                            value={String(editForm.isActive)}
                            onValueChange={(val) => handleEditChange('isActive', val === 'true')}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="true">Active</SelectItem>
                                <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    );
                }
                return (
                    <Pill variant={val ? 'secondary' : 'reject'}>
                        {val ? 'Active' : 'Inactive'}
                    </Pill>
                );
            },
        },
        actionsCol,
    ], [editingId, editForm, submitting, firms]);

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

    async function loadUOMs() {
        const data = await fetchUOMs();
        setUoms(data || []);
    }

    async function loadFirms() {
        const data = await fetchFirms();
        setFirms(data || []);
    }

    async function loadAreasOfUse() {
        const data = await fetchAreaOfUse();
        setAreasOfUse(data || []);
    }

    useEffect(() => {
        fetchData();
        loadUOMs();
        loadFirms();
        loadAreasOfUse();
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
                uom: form.uom || null,
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
                contact_person: form.contact_person.trim() || null,
                mobile: form.mobile.trim() || null,
                pan_number: form.pan_number.trim() || null,
                state: form.state.trim() || null,
                pin_code: form.pin_code.trim() || null,
                isActive: form.isActive === 'true',
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

    async function handleAddUOM() {
        if (!newUOMName.trim()) return;
        setAddingUOM(true);
        try {
            const result = await postToUOM(newUOMName.trim());
            if (result.success) {
                toast.success('UOM added successfully');
                setNewUOMName('');
                setIsAddingUOM(false);
                loadUOMs();
                setForm(prev => ({ ...prev, uom: result.data.uom_name }));
            } else {
                toast.error(result.error || 'Failed to add UOM');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add UOM');
        } finally {
            setAddingUOM(false);
        }
    }

    async function handleAddAreaOfUseEntry() {
        if (!newAreaOfUseName.trim()) return;
        setAddingAreaOfUse(true);
        try {
            const result = await postAreaOfUse(newAreaOfUseName.trim());
            if (result.success) {
                toast.success('Area of use added');
                setNewAreaOfUseName('');
                loadAreasOfUse();
            } else {
                toast.error(result.error || 'Failed to add area of use');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add area of use');
        } finally {
            setAddingAreaOfUse(false);
        }
    }

    async function handleAddFirm() {
        if (!newFirmName.trim()) return;
        setAddingFirm(true);
        try {
            const result = await postToFirm(newFirmName.trim());
            if (result.success) {
                toast.success('Firm added successfully');
                setNewFirmName('');
                setIsAddingFirm(false);
                loadFirms();
                setForm(prev => ({ ...prev, firm_name: result.data.firm_name }));
            } else {
                toast.error(result.error || 'Failed to add firm');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add firm');
        } finally {
            setAddingFirm(false);
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

            {/* ── Page Tabs ── */}
            <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'inventory' | 'vendor' | 'config')}>
                <TabsList className="mb-4 w-full grid grid-cols-1 sm:grid-cols-3 h-auto gap-1">
                    <TabsTrigger value="inventory">Inventory Info</TabsTrigger>
                    <TabsTrigger value="vendor">Vendor Info</TabsTrigger>
                    <TabsTrigger value="config">Area of Use & UOM</TabsTrigger>
                </TabsList>

                <TabsContent value="inventory">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={inventoryData}
                            columns={inventoryColumns}
                            searchFields={['department', 'group_head', 'itemName', 'uom']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <Button
                                    className="h-9 shrink-0"
                                    onClick={() => { setActiveTab('item'); setSheetOpen(true); }}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Inventory
                                </Button>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="vendor">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={vendorData}
                            columns={vendorColumns}
                            searchFields={['vendor_name', 'vendor_gstin', 'vendor_email', 'payment_term', 'firm_name', 'contact_person', 'mobile', 'pan_number', 'state', 'pin_code']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                        <SelectTrigger className="w-full sm:w-[180px] h-9">
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
                                        className="h-9 shrink-0 whitespace-nowrap"
                                        onClick={() => { setActiveTab('vendor'); setSheetOpen(true); }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Vendor Info
                                    </Button>
                                </div>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="config">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* UOM */}
                        <div className="border rounded-lg p-4 space-y-3">
                            <h3 className="text-sm font-semibold">Unit of Measure (UOM)</h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="New UOM..."
                                    value={newUOMName}
                                    onChange={(e) => setNewUOMName(e.target.value)}
                                    className="h-9"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUOM(); } }}
                                />
                                <Button size="sm" onClick={handleAddUOM} disabled={addingUOM} className="h-9 shrink-0">
                                    {addingUOM ? <Loader size={14} color="white" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
                                </Button>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                                {uoms.length === 0 && <p className="text-sm text-muted-foreground">No UOMs added yet.</p>}
                                {uoms.map((u) => (
                                    <div key={u.uom_id} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/40 text-sm">
                                        {u.uom_name}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Area of Use */}
                        <div className="border rounded-lg p-4 space-y-3">
                            <h3 className="text-sm font-semibold">Area of Use</h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="New area of use..."
                                    value={newAreaOfUseName}
                                    onChange={(e) => setNewAreaOfUseName(e.target.value)}
                                    className="h-9"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAreaOfUseEntry(); } }}
                                />
                                <Button size="sm" onClick={handleAddAreaOfUseEntry} disabled={addingAreaOfUse} className="h-9 shrink-0">
                                    {addingAreaOfUse ? <Loader size={14} color="white" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
                                </Button>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                                {areasOfUse.length === 0 && <p className="text-sm text-muted-foreground">No areas added yet.</p>}
                                {areasOfUse.map((a) => (
                                    <div key={a.area_of_use_id} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/40 text-sm">
                                        {a.area_of_use_name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* ── Side Sheet Form ── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent
                    side="right"
                    className="w-full sm:max-w-md overflow-y-auto flex flex-col"
                >
                    <SheetHeader className="sticky top-0 bg-background z-10 pb-3 border-b mb-6">
                        <SheetTitle>
                            {activeTab === 'item' ? 'Add Inventory' : 'Add Vendor Info'}
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
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">UOM</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={form.uom}
                                                onValueChange={setField('uom')}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select UOM" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {uoms.map((u) => (
                                                        <SelectItem key={u.uom_id} value={u.uom_name}>
                                                            {u.uom_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setIsAddingUOM(!isAddingUOM)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isAddingUOM && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New UOM name..."
                                                value={newUOMName}
                                                onChange={(e) => setNewUOMName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleAddUOM}
                                                disabled={addingUOM}
                                                className="h-9 shrink-0"
                                            >
                                                {addingUOM ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <Field
                                    label="Department"
                                    id="department"
                                    value={form.department}
                                    onChange={setField('department')}
                                />
                                <Field
                                    label="Department Head"
                                    id="group_head"
                                    value={form.group_head}
                                    onChange={setField('group_head')}
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Firm Name</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={form.firm_name}
                                                onValueChange={setField('firm_name')}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Firm" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {firms.map((f) => (
                                                        <SelectItem key={f.firm_id} value={f.firm_name}>
                                                            {f.firm_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setIsAddingFirm(!isAddingFirm)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isAddingFirm && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New firm name..."
                                                value={newFirmName}
                                                onChange={(e) => setNewFirmName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleAddFirm}
                                                disabled={addingFirm}
                                                className="h-9 shrink-0"
                                            >
                                                {addingFirm ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="pt-4 flex gap-2">
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 h-11"
                                    >
                                        {submitting && (
                                            <Loader size={16} color="white" className="mr-2" />
                                        )}
                                        {submitting ? 'Saving Inventory…' : 'Save Inventory Data'}
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
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Firm Name</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={form.firm_name}
                                                onValueChange={setField('firm_name')}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Firm" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {firms.map((f) => (
                                                        <SelectItem key={f.firm_id} value={f.firm_name}>
                                                            {f.firm_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setIsAddingFirm(!isAddingFirm)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isAddingFirm && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New firm name..."
                                                value={newFirmName}
                                                onChange={(e) => setNewFirmName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleAddFirm}
                                                disabled={addingFirm}
                                                className="h-9 shrink-0"
                                            >
                                                {addingFirm ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <Field
                                    label="Vendor Address"
                                    id="vendor_address"
                                    value={form.vendor_address}
                                    onChange={setField('vendor_address')}
                                    textarea
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="Contact Person"
                                        id="contact_person"
                                        value={form.contact_person}
                                        onChange={setField('contact_person')}
                                    />
                                    <Field
                                        label="Mobile"
                                        id="mobile"
                                        type="number"
                                        value={form.mobile}
                                        onChange={setField('mobile')}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="PAN Number"
                                        id="pan_number"
                                        value={form.pan_number}
                                        onChange={setField('pan_number')}
                                    />
                                    <Field
                                        label="State"
                                        id="state"
                                        value={form.state}
                                        onChange={setField('state')}
                                    />
                                </div>
                                <Field
                                    label="PIN Code"
                                    id="pin_code"
                                    type="number"
                                    value={form.pin_code}
                                    onChange={setField('pin_code')}
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Is Active</Label>
                                    <Select
                                        value={form.isActive}
                                        onValueChange={setField('isActive')}
                                    >
                                        <SelectTrigger className="w-full h-10">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">True</SelectItem>
                                            <SelectItem value="false">False</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
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

