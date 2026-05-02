import { Database, Plus, Search } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo } from 'react';
import { fetchFromSupabasePaginated, postToSheet, fetchUOMs, postToUOM, fetchFirms, postToFirm, fetchProductCategories, postProductCategory } from '@/lib/fetchers';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../element/DataTable';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Pill } from '../ui/pill';

/* ───── types ───── */
interface MasterRow {
    id: number;
    vendor_name: string;
    vendorName?: string;
    vendor_gstin: string | null;
    vendorAddress?: string | null;
    vendor_address?: string | null;
    vendor_email: string | null;
    payment_term: string | null;
    department: string | null;
    group_head: string | null;
    groupHead?: string | null;
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
    itemCategory?: string | any | null;
    itemCategoryId?: number | string | null;
    inventoryStatus?: string | null;
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
    itemCategoryId: string;
    inventory_status: string;
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
    itemCategoryId: '',
    inventory_status: 'Show',
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
    const [pageTab, setPageTab] = useState<'inventory' | 'vendor'>('inventory');
    const [inventoryFilter, setInventoryFilter] = useState('Show');

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editDialogType, setEditDialogType] = useState<'inventory' | 'vendor'>('inventory');
    const [editDialogForm, setEditDialogForm] = useState<MasterForm>(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [isAddingDepartment, setIsAddingDepartment] = useState(false);
    const [newDepartmentName, setNewDepartmentName] = useState('');
    const [editIsAddingDepartment, setEditIsAddingDepartment] = useState(false);
    const [editNewDepartmentName, setEditNewDepartmentName] = useState('');

    const [isAddingHead, setIsAddingHead] = useState(false);
    const [newHeadName, setNewHeadName] = useState('');
    const [editIsAddingHead, setEditIsAddingHead] = useState(false);
    const [editNewHeadName, setEditNewHeadName] = useState('');

    const [searchTermDept, setSearchTermDept] = useState('');
    const [searchTermHead, setSearchTermHead] = useState('');

    const [uoms, setUoms] = useState<{ uom_id: number, uom_name: string }[]>([]);
    const [isAddingUOM, setIsAddingUOM] = useState(false);
    const [newUOMName, setNewUOMName] = useState('');
    const [addingUOM, setAddingUOM] = useState(false);
    const [firms, setFirms] = useState<{ firm_id: number, firm_name: string }[]>([]);
    const [isAddingFirm, setIsAddingFirm] = useState(false);
    const [newFirmName, setNewFirmName] = useState('');
    const [addingFirm, setAddingFirm] = useState(false);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number, product_category_name: string }[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);

    // Edit dialog UOM/Firm add state (separate from add dialog)
    const [editIsAddingUOM, setEditIsAddingUOM] = useState(false);
    const [editNewUOMName, setEditNewUOMName] = useState('');
    const [editAddingUOM, setEditAddingUOM] = useState(false);
    const [editIsAddingFirm, setEditIsAddingFirm] = useState(false);
    const [editNewFirmName, setEditNewFirmName] = useState('');
    const [editAddingFirm, setEditAddingFirm] = useState(false);
    const [editIsAddingCategory, setEditIsAddingCategory] = useState(false);
    const [editNewCategoryName, setEditNewCategoryName] = useState('');
    const [editAddingCategory, setEditAddingCategory] = useState(false);

    const uniqueVendors = Array.from(new Set(tableData.map(r => r.vendor_name).filter(Boolean))).sort();
    const uniqueDepartments = useMemo(() =>
        Array.from(new Set(tableData.map(r => r.department).filter(Boolean))).sort() as string[],
    [tableData]);

    const uniqueHeads = useMemo(() =>
        Array.from(new Set(tableData.map(r => r.group_head || r.groupHead).filter(Boolean))).sort() as string[],
    [tableData]);

    const deptToHeadMap = useMemo(() => {
        const map: Record<string, string> = {};
        tableData.forEach(r => {
            const gh = r.group_head || r.groupHead;
            if (r.department && gh) map[r.department] = gh;
        });
        return map;
    }, [tableData]);

    const headToDeptMap = useMemo(() => {
        const map: Record<string, string> = {};
        tableData.forEach(r => {
            const gh = r.group_head || r.groupHead;
            if (r.department && gh) map[gh] = r.department;
        });
        return map;
    }, [tableData]);

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
                    r.firm_name
                ];
                return fields.some(f => f && f !== 'null' && f !== '---' && f.trim() !== '') ||
                    (!!r.itemName && r.itemName !== 'null' && r.itemName.trim() !== '');
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

    const inventoryData = useMemo(() => {
        const items = nonEmptyData.filter(r => !!r.itemName && r.itemName !== 'null' && r.itemName.trim() !== '');
        if (inventoryFilter === 'All') return items;
        return items.filter(r => (r.inventoryStatus || 'Show') === inventoryFilter);
    }, [nonEmptyData, inventoryFilter]);

    const vendorData = useMemo(() => {
        const vendors = nonEmptyData.filter(r => r.vendor_name && r.vendor_name !== 'null');
        return vendorFilter === 'All' ? vendors : vendors.filter(r => r.vendor_name === vendorFilter);
    }, [nonEmptyData, vendorFilter]);

    function setEditDialogField(key: keyof MasterForm) {
        return (val: string) => setEditDialogForm(prev => ({ ...prev, [key]: val }));
    }

    function openEditDialog(row: MasterRow, type: 'inventory' | 'vendor') {
        setEditingId(row.id);
        setEditDialogType(type);
        setEditDialogForm({
            vendor_name: row.vendor_name || '',
            vendor_gstin: row.vendor_gstin || '',
            vendor_address: row.vendorAddress || row.vendor_address || '',
            vendor_email: row.vendor_email || '',
            payment_term: row.payment_term || '',
            department: row.department || '',
            group_head: row.groupHead || row.group_head || '',
            item_name: row.itemName || '',
            uom: row.uom || '',
            firm_name: row.firm_name || row.firmName || '',
            contact_person: row.contact_person || '',
            mobile: row.mobile || '',
            pan_number: row.pan_number || '',
            state: row.state || '',
            pin_code: row.pin_code || '',
            isActive: row.isActive !== false ? 'true' : 'false',
            itemCategoryId: (row.itemCategoryId as any)?.toString() || '',
            inventory_status: row.inventoryStatus || 'Show',
        });
        setEditIsAddingUOM(false);
        setEditIsAddingFirm(false);
        setEditIsAddingDepartment(false);
        setEditNewDepartmentName('');
        setEditIsAddingHead(false);
        setEditNewHeadName('');
        setEditDialogOpen(true);
    }

    async function handleSaveEditFromDialog() {
        if (!editingId) return;
        setSubmitting(true);
        try {
            const payload = editDialogType === 'inventory'
                ? {
                    id: editingId,
                    department: editDialogForm.department.trim() || null,
                    groupHead: editDialogForm.group_head.trim() || null,
                    itemName: editDialogForm.item_name.trim() || null,
                    itemCategoryId: editDialogForm.itemCategoryId ? parseInt(editDialogForm.itemCategoryId) : null,
                    inventoryStatus: editDialogForm.inventory_status || 'Show',
                    uom: editDialogForm.uom || null,
                    isActive: editDialogForm.isActive === 'true',
                }
                : {
                    id: editingId,
                    vendor_name: editDialogForm.vendor_name.trim(),
                    vendor_gstin: editDialogForm.vendor_gstin.trim() || null,
                    vendor_address: editDialogForm.vendor_address.trim() || null,
                    vendor_email: editDialogForm.vendor_email.trim() || null,
                    payment_term: editDialogForm.payment_term.trim() || null,
                    firm_name: editDialogForm.firm_name.trim() || null,
                    contact_person: editDialogForm.contact_person.trim() || null,
                    mobile: editDialogForm.mobile.trim() || null,
                    pan_number: editDialogForm.pan_number.trim() || null,
                    state: editDialogForm.state.trim() || null,
                    pin_code: editDialogForm.pin_code.trim() || null,
                    isActive: editDialogForm.isActive === 'true',
                };

            const result = await postToSheet([payload], 'update', 'MASTER');
            if (result.success) {
                toast.success('Updated successfully');
                setEditDialogOpen(false);
                setEditingId(null);
                fetchData();
            } else {
                throw new Error('Failed to update');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error updating');
        } finally {
            setSubmitting(false);
        }
    }

    const inventoryColumns = useMemo<ColumnDef<MasterRow>[]>(() => [
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEditDialog(row.original, 'inventory')}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'groupHead',
            header: 'Department Head',
            cell: ({ row }) => {
                const val = row.original.groupHead || row.original.group_head || '';
                return <TruncCell value={val} width={120} />;
            },
        },
        {
            accessorKey: 'itemName',
            header: 'Item Names',
            cell: ({ getValue }) => <TruncCell value={getValue() as string | null} width={200} />,
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={80} />,
        },
        {
            accessorKey: 'itemCategory',
            header: 'Category',
            cell: ({ row }) => {
                const val = row.original.itemCategory;
                const name = (val && typeof val === 'object') ? (val as any).product_category_name : val;
                return <TruncCell value={name || ''} width={100} />;
            },
        },
        {
            accessorKey: 'inventoryStatus',
            header: 'Inventory Status',
            cell: ({ getValue }) => {
                const val = (getValue() as string) || 'Show';
                return (
                    <Pill variant={val === 'Show' ? 'secondary' : 'default'}>
                        {val}
                    </Pill>
                );
            },
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: ({ getValue }) => {
                const val = getValue() as boolean;
                return (
                    <Pill variant={val ? 'secondary' : 'reject'}>
                        {val ? 'Active' : 'Inactive'}
                    </Pill>
                );
            },
        },
    ], []);

    const vendorColumns = useMemo<ColumnDef<MasterRow>[]>(() => [
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEditDialog(row.original, 'vendor')}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'vendor_name',
            header: 'Vendor Name',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={160} />,
        },
        {
            accessorKey: 'firm_name',
            header: 'Firm Name',
            cell: ({ row }) => {
                const val = row.original.firm_name || row.original.firmName || '';
                return <TruncCell value={val} width={160} />;
            },
        },
        {
            accessorKey: 'vendor_gstin',
            header: 'GSTIN',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={130} />,
        },
        {
            accessorKey: 'pan_number',
            header: 'PAN',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'contact_person',
            header: 'Contact',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={140} />,
        },
        {
            accessorKey: 'mobile',
            header: 'Mobile',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'vendor_email',
            header: 'Email',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={160} />,
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: ({ getValue }) => {
                const val = getValue() as boolean;
                return (
                    <Pill variant={val ? 'secondary' : 'reject'}>
                        {val ? 'Active' : 'Inactive'}
                    </Pill>
                );
            },
        },
    ], []);

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

    async function loadProductCategories() {
        const data = await fetchProductCategories();
        setProductCategories(data || []);
    }

    useEffect(() => {
        fetchData();
        loadUOMs();
        loadFirms();
        loadProductCategories();
    }, []);

    /* reset form when sheet closes */
    useEffect(() => {
        if (!sheetOpen) {
            setForm(emptyForm);
            setIsAddingDepartment(false);
            setNewDepartmentName('');
        }
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
                department: form.department.trim() || null,
                groupHead: form.group_head.trim() || null,
                itemName: form.item_name.trim() || null,
                itemCategoryId: form.itemCategoryId ? parseInt(form.itemCategoryId) : null,
                inventoryStatus: form.inventory_status || 'Show',
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
                ...(form.payment_term.trim() ? { payment_term: form.payment_term.trim() } : {}),
                firm_name: form.firm_name.trim() || null,
                contact_person: form.contact_person.trim() || null,
                mobile: form.mobile.trim() || null,
                pan_number: form.pan_number.trim() || null,
                state: form.state.trim() || null,
                pin_code: form.pin_code.trim() || null,
                isActive: form.isActive === 'true',
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

    async function handleEditAddUOM() {
        if (!editNewUOMName.trim()) return;
        setEditAddingUOM(true);
        try {
            const result = await postToUOM(editNewUOMName.trim());
            if (result.success) {
                toast.success('UOM added successfully');
                setEditNewUOMName('');
                setEditIsAddingUOM(false);
                loadUOMs();
                setEditDialogForm(prev => ({ ...prev, uom: result.data.uom_name }));
            } else {
                toast.error(result.error || 'Failed to add UOM');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add UOM');
        } finally {
            setEditAddingUOM(false);
        }
    }

    async function handleEditAddFirm() {
        if (!editNewFirmName.trim()) return;
        setEditAddingFirm(true);
        try {
            const result = await postToFirm(editNewFirmName.trim());
            if (result.success) {
                toast.success('Firm added successfully');
                setEditNewFirmName('');
                setEditIsAddingFirm(false);
                loadFirms();
                setEditDialogForm(prev => ({ ...prev, firm_name: result.data.firm_name }));
            } else {
                toast.error(result.error || 'Failed to add firm');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add firm');
        } finally {
            setEditAddingFirm(false);
        }
    }

    async function handleAddCategory() {
        if (!newCategoryName.trim()) return;
        setAddingCategory(true);
        try {
            const result = await postProductCategory(newCategoryName.trim());
            if (result.success) {
                toast.success('Category added successfully');
                setNewCategoryName('');
                setIsAddingCategory(false);
                loadProductCategories();
                setForm(prev => ({ ...prev, itemCategoryId: result.data.product_category_id.toString() }));
            } else {
                toast.error(result.error || 'Failed to add category');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add category');
        } finally {
            setAddingCategory(false);
        }
    }

    async function handleEditAddCategory() {
        if (!editNewCategoryName.trim()) return;
        setEditAddingCategory(true);
        try {
            const result = await postProductCategory(editNewCategoryName.trim());
            if (result.success) {
                toast.success('Category added successfully');
                setEditNewCategoryName('');
                setEditIsAddingCategory(false);
                loadProductCategories();
                setEditDialogForm(prev => ({ ...prev, itemCategoryId: result.data.product_category_id.toString() }));
            } else {
                toast.error(result.error || 'Failed to add category');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add category');
        } finally {
            setEditAddingCategory(false);
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
            <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'inventory' | 'vendor')}>
                <TabsList className="mb-4 w-full grid grid-cols-1 sm:grid-cols-2 h-auto gap-1">
                    <TabsTrigger value="inventory">Inventory Info</TabsTrigger>
                    <TabsTrigger value="vendor">Vendor Info</TabsTrigger>
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
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Select value={inventoryFilter} onValueChange={setInventoryFilter}>
                                        <SelectTrigger className="w-full sm:w-[180px] h-9">
                                            <SelectValue placeholder="Shown Items" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All Items</SelectItem>
                                            <SelectItem value="Show">Shown Items</SelectItem>
                                            <SelectItem value="Hide">Hidden Items</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        className="h-9 shrink-0"
                                        onClick={() => { setActiveTab('item'); setSheetOpen(true); }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Inventory
                                    </Button>
                                </div>
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

            </Tabs>

            {/* ── Add Dialog ── */}
            <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
                <DialogContent className="w-full max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader className="shrink-0 pb-3 border-b">
                        <DialogTitle>
                            {activeTab === 'item' ? 'Add Inventory' : 'Add Vendor Info'}
                        </DialogTitle>
                        <DialogDescription>
                            {activeTab === 'item'
                                ? 'Fill in the item and department details.'
                                : 'Fill in the vendor contact and firm details.'}
                        </DialogDescription>
                    </DialogHeader>

                    {activeTab === 'item' ? (
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
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
                                            <Select value={form.uom} onValueChange={setField('uom')}>
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
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={form.department} 
                                                onValueChange={(val) => {
                                                    setField('department')(val);
                                                    if (deptToHeadMap[val]) setField('group_head')(deptToHeadMap[val]);
                                                }}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Department" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <div className="flex items-center border-b px-3 pb-3">
                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                        <input
                                                            placeholder="Search departments..."
                                                            value={searchTermDept}
                                                            onChange={(e) => setSearchTermDept(e.target.value)}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                        />
                                                    </div>
                                                    <div className="max-h-[300px] overflow-y-auto">
                                                        {uniqueDepartments.filter(d => d.toLowerCase().includes(searchTermDept.toLowerCase())).map(dept => (
                                                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                                        ))}
                                                    </div>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setIsAddingDepartment(!isAddingDepartment)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isAddingDepartment && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New department name..."
                                                value={newDepartmentName}
                                                onChange={(e) => setNewDepartmentName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!newDepartmentName.trim()}
                                                onClick={() => {
                                                    const val = newDepartmentName.trim();
                                                    setField('department')(val);
                                                    if (deptToHeadMap[val]) setField('group_head')(deptToHeadMap[val]);
                                                    setNewDepartmentName('');
                                                    setIsAddingDepartment(false);
                                                }}
                                                className="h-9 shrink-0"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={form.group_head} 
                                                onValueChange={(val) => {
                                                    setField('group_head')(val);
                                                    if (headToDeptMap[val]) setField('department')(headToDeptMap[val]);
                                                }}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Department Head" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <div className="flex items-center border-b px-3 pb-3">
                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                        <input
                                                            placeholder="Search heads..."
                                                            value={searchTermHead}
                                                            onChange={(e) => setSearchTermHead(e.target.value)}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                        />
                                                    </div>
                                                    <div className="max-h-[300px] overflow-y-auto">
                                                        {uniqueHeads.filter(h => h.toLowerCase().includes(searchTermHead.toLowerCase())).map(head => (
                                                            <SelectItem key={head} value={head}>{head}</SelectItem>
                                                        ))}
                                                    </div>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setIsAddingHead(!isAddingHead)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isAddingHead && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New head name..."
                                                value={newHeadName}
                                                onChange={(e) => setNewHeadName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!newHeadName.trim()}
                                                onClick={() => {
                                                    const val = newHeadName.trim();
                                                    setField('group_head')(val);
                                                    if (headToDeptMap[val]) setField('department')(headToDeptMap[val]);
                                                    setNewHeadName('');
                                                    setIsAddingHead(false);
                                                }}
                                                className="h-9 shrink-0"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    )}
                                </div>
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Item Category</Label>
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1">
                                                <Select 
                                                    value={form.itemCategoryId} 
                                                    onValueChange={setField('itemCategoryId')}
                                                >
                                                    <SelectTrigger className="w-full h-10">
                                                        <SelectValue placeholder="Select Category" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {productCategories.map((c) => (
                                                            <SelectItem key={c.product_category_id} value={c.product_category_id.toString()}>
                                                                {c.product_category_name}
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
                                                onClick={() => setIsAddingCategory(!isAddingCategory)}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        {isAddingCategory && (
                                            <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                                <Input
                                                    placeholder="New category name..."
                                                    value={newCategoryName}
                                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                                    className="h-9"
                                                    autoFocus
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={handleAddCategory}
                                                    disabled={addingCategory}
                                                    className="h-9 shrink-0"
                                                >
                                                    {addingCategory ? <Loader size={14} color="white" /> : 'Add'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Inventory Status</Label>
                                        <Select 
                                            value={form.inventory_status} 
                                            onValueChange={setField('inventory_status')}
                                        >
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Show">Show</SelectItem>
                                                <SelectItem value="Hide">Hide</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
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
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
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

                </DialogContent>
            </Dialog>

            {/* ── Edit Dialog ── */}
            <Dialog open={editDialogOpen} onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (!open) setEditingId(null);
            }}>
                <DialogContent className="w-full max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader className="shrink-0 pb-3 border-b">
                        <DialogTitle>
                            {editDialogType === 'inventory' ? 'Edit Inventory' : 'Edit Vendor Info'}
                        </DialogTitle>
                        <DialogDescription>
                            {editDialogType === 'inventory'
                                ? 'Update the item and department details.'
                                : 'Update the vendor contact and firm details.'}
                        </DialogDescription>
                    </DialogHeader>

                    {editDialogType === 'inventory' ? (
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                            <div className="space-y-4">
                                <Field
                                    label="Item Name"
                                    id="edit_item_name"
                                    value={editDialogForm.item_name}
                                    onChange={setEditDialogField('item_name')}
                                    required
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">UOM</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select value={editDialogForm.uom} onValueChange={setEditDialogField('uom')}>
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
                                            onClick={() => setEditIsAddingUOM(!editIsAddingUOM)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {editIsAddingUOM && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New UOM name..."
                                                value={editNewUOMName}
                                                onChange={(e) => setEditNewUOMName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleEditAddUOM}
                                                disabled={editAddingUOM}
                                                className="h-9 shrink-0"
                                            >
                                                {editAddingUOM ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>

                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={editDialogForm.department} 
                                                onValueChange={(val) => {
                                                    setEditDialogField('department')(val);
                                                    if (deptToHeadMap[val]) setEditDialogField('group_head')(deptToHeadMap[val]);
                                                }}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Department" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <div className="flex items-center border-b px-3 pb-3">
                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                        <input
                                                            placeholder="Search departments..."
                                                            value={searchTermDept}
                                                            onChange={(e) => setSearchTermDept(e.target.value)}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                        />
                                                    </div>

                                                    <div className="max-h-[300px] overflow-y-auto">
                                                        {uniqueDepartments.filter(d => d.toLowerCase().includes(searchTermDept.toLowerCase())).map(dept => (
                                                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                                        ))}
                                                    </div>

                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setEditIsAddingDepartment(!editIsAddingDepartment)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {editIsAddingDepartment && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New department name..."
                                                value={editNewDepartmentName}
                                                onChange={(e) => setEditNewDepartmentName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!editNewDepartmentName.trim()}
                                                onClick={() => {
                                                    const val = editNewDepartmentName.trim();
                                                    setEditDialogField('department')(val);
                                                    if (deptToHeadMap[val]) setEditDialogField('group_head')(deptToHeadMap[val]);
                                                    setEditNewDepartmentName('');
                                                    setEditIsAddingDepartment(false);
                                                }}
                                                className="h-9 shrink-0"
                                            >
                                                Add
                                            </Button>
                                        </div>

                                    )}
                                </div>


                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={editDialogForm.group_head} 
                                                onValueChange={(val) => {
                                                    setEditDialogField('group_head')(val);
                                                    if (headToDeptMap[val]) setEditDialogField('department')(headToDeptMap[val]);
                                                }}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select Department Head" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <div className="flex items-center border-b px-3 pb-3">
                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                        <input
                                                            placeholder="Search heads..."
                                                            value={searchTermHead}
                                                            onChange={(e) => setSearchTermHead(e.target.value)}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                        />
                                                    </div>

                                                    <div className="max-h-[300px] overflow-y-auto">
                                                        {uniqueHeads.filter(h => h.toLowerCase().includes(searchTermHead.toLowerCase())).map(head => (
                                                            <SelectItem key={head} value={head}>{head}</SelectItem>
                                                        ))}
                                                    </div>

                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setEditIsAddingHead(!editIsAddingHead)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {editIsAddingHead && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New head name..."
                                                value={editNewHeadName}
                                                onChange={(e) => setEditNewHeadName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!editNewHeadName.trim()}
                                                onClick={() => {
                                                    const val = editNewHeadName.trim();
                                                    setEditDialogField('group_head')(val);
                                                    if (headToDeptMap[val]) setEditDialogField('department')(headToDeptMap[val]);
                                                    setEditNewHeadName('');
                                                    setEditIsAddingHead(false);
                                                }}
                                                className="h-9 shrink-0"
                                            >
                                                Add
                                            </Button>
                                        </div>

                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Firm Name</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={editDialogForm.firm_name}
                                                onValueChange={setEditDialogField('firm_name')}
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
                                            onClick={() => setEditIsAddingFirm(!editIsAddingFirm)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {editIsAddingFirm && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New firm name..."
                                                value={editNewFirmName}
                                                onChange={(e) => setEditNewFirmName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleEditAddFirm}
                                                disabled={editAddingFirm}
                                                className="h-9 shrink-0"
                                            >
                                                {editAddingFirm ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>

                                    )}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Status</Label>
                                    <Select
                                        value={editDialogForm.isActive}
                                        onValueChange={setEditDialogField('isActive')}
                                    >
                                        <SelectTrigger className="w-full h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">Active</SelectItem>
                                            <SelectItem value="false">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Item Category</Label>
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1">
                                                <Select 
                                                    value={editDialogForm.itemCategoryId} 
                                                    onValueChange={setEditDialogField('itemCategoryId')}
                                                >
                                                    <SelectTrigger className="w-full h-10">
                                                        <SelectValue placeholder="Select Category" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {productCategories.map((c) => (
                                                            <SelectItem key={c.product_category_id} value={c.product_category_id.toString()}>
                                                                {c.product_category_name}
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
                                                onClick={() => setEditIsAddingCategory(!editIsAddingCategory)}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        {editIsAddingCategory && (
                                            <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                                <Input
                                                    placeholder="New category name..."
                                                    value={editNewCategoryName}
                                                    onChange={(e) => setEditNewCategoryName(e.target.value)}
                                                    className="h-9"
                                                    autoFocus
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={handleEditAddCategory}
                                                    disabled={editAddingCategory}
                                                    className="h-9 shrink-0"
                                                >
                                                    {editAddingCategory ? <Loader size={14} color="white" /> : 'Add'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Inventory Status</Label>
                                        <Select 
                                            value={editDialogForm.inventory_status} 
                                            onValueChange={setEditDialogField('inventory_status')}
                                        >
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Show">Show</SelectItem>
                                                <SelectItem value="Hide">Hide</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-2">
                                    <Button
                                        onClick={handleSaveEditFromDialog}
                                        disabled={submitting}
                                        className="flex-1 h-11"
                                    >
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving…' : 'Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                            <div className="space-y-4">
                                <Field
                                    label="Vendor Name"
                                    id="edit_vendor_name"
                                    value={editDialogForm.vendor_name}
                                    onChange={setEditDialogField('vendor_name')}
                                    required
                                />
                                <Field
                                    label="Vendor GSTIN"
                                    id="edit_vendor_gstin"
                                    value={editDialogForm.vendor_gstin}
                                    onChange={setEditDialogField('vendor_gstin')}
                                    placeholder="e.g. 09AAAAA0000A1ZZ"
                                />
                                <Field
                                    label="Vendor Email"
                                    id="edit_vendor_email"
                                    type="email"
                                    value={editDialogForm.vendor_email}
                                    onChange={setEditDialogField('vendor_email')}
                                />
                                <Field
                                    label="Payment Term"
                                    id="edit_payment_term"
                                    value={editDialogForm.payment_term}
                                    onChange={setEditDialogField('payment_term')}
                                    placeholder="e.g. Net 30"
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Firm Name</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={editDialogForm.firm_name}
                                                onValueChange={setEditDialogField('firm_name')}
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
                                            onClick={() => setEditIsAddingFirm(!editIsAddingFirm)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {editIsAddingFirm && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New firm name..."
                                                value={editNewFirmName}
                                                onChange={(e) => setEditNewFirmName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleEditAddFirm}
                                                disabled={editAddingFirm}
                                                className="h-9 shrink-0"
                                            >
                                                {editAddingFirm ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <Field
                                    label="Vendor Address"
                                    id="edit_vendor_address"
                                    value={editDialogForm.vendor_address}
                                    onChange={setEditDialogField('vendor_address')}
                                    textarea
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="Contact Person"
                                        id="edit_contact_person"
                                        value={editDialogForm.contact_person}
                                        onChange={setEditDialogField('contact_person')}
                                    />
                                    <Field
                                        label="Mobile"
                                        id="edit_mobile"
                                        type="number"
                                        value={editDialogForm.mobile}
                                        onChange={setEditDialogField('mobile')}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="PAN Number"
                                        id="edit_pan_number"
                                        value={editDialogForm.pan_number}
                                        onChange={setEditDialogField('pan_number')}
                                    />
                                    <Field
                                        label="State"
                                        id="edit_state"
                                        value={editDialogForm.state}
                                        onChange={setEditDialogField('state')}
                                    />
                                </div>
                                <Field
                                    label="PIN Code"
                                    id="edit_pin_code"
                                    type="number"
                                    value={editDialogForm.pin_code}
                                    onChange={setEditDialogField('pin_code')}
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Status</Label>
                                    <Select
                                        value={editDialogForm.isActive}
                                        onValueChange={setEditDialogField('isActive')}
                                    >
                                        <SelectTrigger className="w-full h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">Active</SelectItem>
                                            <SelectItem value="false">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="pt-4 flex gap-2">
                                    <Button
                                        onClick={handleSaveEditFromDialog}
                                        disabled={submitting}
                                        className="flex-1 h-11"
                                    >
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving…' : 'Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
