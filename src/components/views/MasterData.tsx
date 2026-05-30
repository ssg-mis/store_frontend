import { Database, Plus, Search } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo } from 'react';
import { fetchFromSupabasePaginated, postToSheet, fetchUOMs, postToUOM, updateUOM, fetchFirms, postToFirm, updateFirm, fetchProductCategories, postProductCategory, updateProductCategory, fetchDepartments, postDepartment, updateDepartment, fetchDepartmentHeads, postDepartmentHead, updateDepartmentHead, deleteProductCategory, deleteUOM, deleteDepartment, deleteDepartmentHead } from '@/lib/fetchers';
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
    vendor_name: string | null;
    vendor_gstin: string | null;
    vendor_address: string | null;
    vendor_email: string | null;
    payment_term: string | string[] | null;
    firm_name: string | null;
    contact_person: string | null;
    mobile: string | null;
    pan_number: string | null;
    state: string | null;
    pin_code: string | null;
    createdAt: string | null;
    isActive: boolean;
}

interface FirmRow {
    firm_id: number;
    firm_name: string;
    alias: string | null;
    firm_gstin: string | null;
    firm_address: string | null;
    firm_email: string | null;
    contact_person: string | null;
    mobile: string | null;
    pan_number: string | null;
    state: string | null;
    pin_code: string | null;
    isActive: boolean;
}

interface UOMConversionRow {
    conversion_id: number;
    conversionToBase: string | number;
    alternateUom?: {
        uom_id: number;
        uom_name: string;
    };
}

interface UOMRow {
    uom_id: number;
    uom_name: string;
    isActive?: boolean;
    baseConversions?: UOMConversionRow[];
}


interface MasterForm {
    vendor_name: string;
    vendor_gstin: string;
    vendor_address: string;
    vendor_email: string;
    payment_term: string;
    department: string;
    department_head: string;
    item_name: string;
    uom: string;
    firm_name: string;
    alias: string;
    firm_gstin: string;
    firm_address: string;
    firm_email: string;
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
    department_head: '',
    item_name: '',
    uom: '',
    firm_name: '',
    alias: '',
    firm_gstin: '',
    firm_address: '',
    firm_email: '',
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

function ActiveStatusField({
    value,
    onChange,
}: {
    value: string;
    onChange: (val: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium">Is Active</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                </SelectContent>
            </Select>
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

function normalizePaymentTerm(value: string | string[] | null | undefined) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}



/* ───── main component ───── */
export default function MasterData() {
    const [tableData, setTableData] = useState<MasterRow[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [form, setForm] = useState<MasterForm>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [vendorFilter, setVendorFilter] = useState('All');
    const [inventoryTableData, setInventoryTableData] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'item' | 'vendor' | 'firm' | 'productCategory' | 'uom' | 'department' | 'departmentHead'>('item');
    const [pageTab, setPageTab] = useState<'inventory' | 'vendor' | 'firm' | 'productCategory' | 'uom' | 'department' | 'departmentHead'>('productCategory');

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editDialogType, setEditDialogType] = useState<'inventory' | 'vendor' | 'firm'>('inventory');
    const [editDialogForm, setEditDialogForm] = useState<MasterForm>(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [simpleEditOpen, setSimpleEditOpen] = useState(false);
    const [simpleEditType, setSimpleEditType] = useState<'productCategory' | 'uom' | 'department' | 'departmentHead'>('productCategory');
    const [simpleEditId, setSimpleEditId] = useState<number | null>(null);
    const [simpleEditName, setSimpleEditName] = useState('');
    const [simpleEditActive, setSimpleEditActive] = useState('true');
    const [postAddReturn, setPostAddReturn] = useState<'item' | 'vendor' | 'editInventory' | null>(null);

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

    const [uoms, setUoms] = useState<UOMRow[]>([]);
    const [isAddingUOM, setIsAddingUOM] = useState(false);
    const [newUOMName, setNewUOMName] = useState('');
    const [addingUOM, setAddingUOM] = useState(false);
    const [firms, setFirms] = useState<FirmRow[]>([]);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number, product_category_name: string, isActive?: boolean }[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);
    const [newMasterActive, setNewMasterActive] = useState('true');

    const [allDepartments, setAllDepartments] = useState<{ id: number, name: string, isActive?: boolean }[]>([]);
    const [allDepartmentHeads, setAllDepartmentHeads] = useState<{ id: number, name: string, isActive?: boolean }[]>([]);
    const [addingDepartment, setAddingDepartment] = useState(false);
    const [addingHead, setAddingHead] = useState(false);

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
    const [editAddingDepartment, setEditAddingDepartment] = useState(false);
    const [editAddingHead, setEditAddingHead] = useState(false);
    const [editIsAddingPaymentTerm, setEditIsAddingPaymentTerm] = useState(false);
    const [editNewPaymentTermName, setEditNewPaymentTermName] = useState('');
    const [isAddingPaymentTerm, setIsAddingPaymentTerm] = useState(false);
    const [newPaymentTermName, setNewPaymentTermName] = useState('');
    const [showAddInvAdditionalUOM, setShowAddInvAdditionalUOM] = useState(false);
    const [addInvAdditionalUOMName, setAddInvAdditionalUOMName] = useState('');
    const [addInvAdditionalUOMConversion, setAddInvAdditionalUOMConversion] = useState('');
    const [additionalUomDrafts, setAdditionalUomDrafts] = useState<{ uomName: string; uomId: number; conversionToBase: number }[]>([]);
    const [showEditInvAdditionalUOM, setShowEditInvAdditionalUOM] = useState(false);
    const [editInvAdditionalUOMName, setEditInvAdditionalUOMName] = useState('');
    const [editInvAdditionalUOMConversion, setEditInvAdditionalUOMConversion] = useState('');
    const [editAdditionalUomDrafts, setEditAdditionalUomDrafts] = useState<{ uomName: string; uomId: number; conversionToBase: number }[]>([]);

    const uniqueVendors = Array.from(new Set(tableData.map(r => r.vendor_name).filter(Boolean))).sort();

    // Derive unique payment terms from all master records (payment_term is String[])
    const uniquePaymentTerms = useMemo(() => {
        const terms = new Set<string>();
        tableData.forEach(r => {
            const pt = r.payment_term;
            if (Array.isArray(pt)) pt.forEach(t => { if (t) terms.add(t); });
            else if (typeof pt === 'string' && pt) terms.add(pt);
        });
        return Array.from(terms).sort();
    }, [tableData]);

    const uniqueDepartments = useMemo(() =>
        allDepartments.map(d => d.name).sort() as string[],
    [allDepartments]);

    const uniqueHeads = useMemo(() =>
        allDepartmentHeads.map(h => h.name).sort() as string[],
    [allDepartmentHeads]);

    const inventoryData = useMemo(() => inventoryTableData, [inventoryTableData]);

    const vendorData = useMemo(() => {
        const vendors = tableData.filter(r => r.vendor_name && r.vendor_name !== 'null');
        return vendorFilter === 'All' ? vendors : vendors.filter(r => r.vendor_name === vendorFilter);
    }, [tableData, vendorFilter]);

    async function deleteRecord(label: string, action: () => Promise<{ success: boolean; error?: string }>, reload: () => void) {
        if (!window.confirm(`Remove this ${label}?`)) return;
        const result = await action();
        if (result.success) {
            toast.success(`${label} removed successfully`);
            reload();
        } else {
            toast.error(result.error || `Failed to remove ${label}`);
        }
    }

    function openRelatedMasterAdd(tab: 'productCategory' | 'uom' | 'department' | 'departmentHead' | 'firm') {
        setPostAddReturn(
            editDialogOpen && editDialogType === 'inventory'
                ? 'editInventory'
                : sheetOpen && (activeTab === 'item' || activeTab === 'vendor')
                    ? activeTab
                    : null
        );
        setActiveTab(tab);
        setSheetOpen(true);
        if (editDialogOpen) {
            setEditDialogOpen(false);
        }
    }

    function closeOrReturnAfterRelatedAdd() {
        if (postAddReturn === 'item') {
            setActiveTab('item');
            setSheetOpen(true);
        } else if (postAddReturn === 'vendor') {
            setActiveTab('vendor');
            setSheetOpen(true);
        } else if (postAddReturn === 'editInventory') {
            setSheetOpen(false);
            setEditDialogOpen(true);
        } else {
            setSheetOpen(false);
        }
        setPostAddReturn(null);
    }

    function handleAddDialogOpenChange(open: boolean) {
        if (open) {
            setSheetOpen(true);
            return;
        }

        if (postAddReturn) {
            closeOrReturnAfterRelatedAdd();
            return;
        }

        setSheetOpen(false);
    }

    const simpleEditLabels: Record<typeof simpleEditType, string> = {
        productCategory: 'Product Category',
        uom: 'UOM',
        department: 'Department',
        departmentHead: 'Department Head',
    };

    function openSimpleEditDialog(
        type: typeof simpleEditType,
        row: { product_category_id?: number; product_category_name?: string; uom_id?: number; uom_name?: string; id?: number; name?: string; isActive?: boolean }
    ) {
        setSimpleEditType(type);
        setSimpleEditId(row.product_category_id ?? row.uom_id ?? row.id ?? null);
        setSimpleEditName(row.product_category_name ?? row.uom_name ?? row.name ?? '');
        setSimpleEditActive(row.isActive !== false ? 'true' : 'false');
        setSimpleEditOpen(true);
    }

    async function handleSimpleEditSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!simpleEditId) return;
        if (!simpleEditName.trim()) {
            toast.error(`${simpleEditLabels[simpleEditType]} is required`);
            return;
        }

        setSubmitting(true);
        try {
            const isActive = simpleEditActive === 'true';
            let result: { success: boolean; error?: string };

            if (simpleEditType === 'productCategory') {
                result = await updateProductCategory(simpleEditId, { product_category_name: simpleEditName.trim(), isActive });
            } else if (simpleEditType === 'uom') {
                result = await updateUOM(simpleEditId, { uom_name: simpleEditName.trim(), isActive });
            } else if (simpleEditType === 'department') {
                result = await updateDepartment(simpleEditId, { name: simpleEditName.trim(), isActive });
            } else {
                result = await updateDepartmentHead(simpleEditId, { name: simpleEditName.trim(), isActive });
            }

            if (!result.success) throw new Error(result.error || 'Failed to update record');

            toast.success(`${simpleEditLabels[simpleEditType]} updated successfully`);
            setSimpleEditOpen(false);
            setSimpleEditId(null);

            if (simpleEditType === 'productCategory') loadProductCategories();
            else if (simpleEditType === 'uom') loadUOMs();
            else if (simpleEditType === 'department') loadDepartments();
            else loadDepartmentHeads();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to update record');
        } finally {
            setSubmitting(false);
        }
    }

    function setEditDialogField(key: keyof MasterForm) {
        return (val: string) => setEditDialogForm(prev => ({ ...prev, [key]: val }));
    }

    function openEditDialog(row: any, type: 'inventory' | 'vendor' | 'firm') {
        setEditingId(type === 'firm' ? row.firm_id : row.id);
        setEditDialogType(type);
        if (type === 'inventory') {
            setEditDialogForm({
                ...emptyForm,
                department: row.department || '',
                department_head: row.departmentHead || '',
                item_name: row.itemName || '',
                uom: row.uom || '',
                firm_name: row.firmName || '',
                itemCategoryId: row.itemCategoryId?.toString() || '',
            });
        } else if (type === 'vendor') {
            setEditDialogForm({
                vendor_name: row.vendor_name || '',
                vendor_gstin: row.vendor_gstin || '',
                vendor_address: row.vendorAddress || row.vendor_address || '',
                vendor_email: row.vendor_email || '',
                payment_term: normalizePaymentTerm(row.payment_term),
                department: row.department || '',
                department_head: row.departmentHead || row.department_head || '',
                item_name: row.itemName || '',
                uom: row.uom || '',
                firm_name: row.firm_name || row.firmName || '',
                contact_person: row.contact_person || '',
                mobile: row.mobile || '',
                pan_number: row.pan_number || '',
                state: row.state || '',
                pin_code: row.pin_code || '',
                isActive: row.isActive !== false ? 'true' : 'false',
                itemCategoryId: row.itemCategoryId?.toString() || '',
                inventory_status: row.inventoryStatus || 'Show',
                alias: '',
                firm_gstin: '',
                firm_address: '',
                firm_email: '',
            });
        } else {
            setEditDialogForm({
                ...emptyForm,
                firm_name: row.firm_name || '',
                alias: row.alias || '',
                firm_gstin: row.firm_gstin || '',
                firm_address: row.firm_address || '',
                firm_email: row.firm_email || '',
                contact_person: row.contact_person || '',
                mobile: row.mobile || '',
                pan_number: row.pan_number || '',
                state: row.state || '',
                pin_code: row.pin_code || '',
                isActive: row.isActive !== false ? 'true' : 'false',
            });
        }
        setEditIsAddingUOM(false);
        setEditIsAddingFirm(false);
        setEditIsAddingDepartment(false);
        setEditNewDepartmentName('');
        setEditIsAddingHead(false);
        setEditNewHeadName('');
        setShowEditInvAdditionalUOM(false);
        setEditInvAdditionalUOMName('');
        setEditInvAdditionalUOMConversion('');
        setEditAdditionalUomDrafts(
            type === 'inventory' && Array.isArray(row.additionalUoms)
                ? row.additionalUoms
                : []
        );
        setEditDialogOpen(true);
    }

    async function handleSaveEditFromDialog() {
        if (!editingId) return;
        setSubmitting(true);
        try {
            let result;
            if (editDialogType === 'inventory') {
                const selectedDept = allDepartments.find(d => d.name === editDialogForm.department);
                const selectedHead = allDepartmentHeads.find(h => h.name === editDialogForm.department_head);
                const selectedUomObj = uoms.find(u => u.uom_name === editDialogForm.uom);
                const payload: any = {
                    id: editingId,
                    department: editDialogForm.department.trim() || '',
                    departmentHead: editDialogForm.department_head.trim() || '',
                    itemName: editDialogForm.item_name.trim(),
                    uom: editDialogForm.uom || '',
                    itemCategoryId: editDialogForm.itemCategoryId ? parseInt(editDialogForm.itemCategoryId) : undefined,
                    additionalUoms: editAdditionalUomDrafts,
                    ...(selectedDept && { departmentId: Number(selectedDept.id) }),
                    ...(selectedHead && { departmentHeadId: Number(selectedHead.id) }),
                    ...(selectedUomObj && { uomId: Number(selectedUomObj.uom_id) }),
                };
                result = await postToSheet([payload], 'update', 'INVENTORY');
                if (result.success) {
                    toast.success('Updated successfully');
                    setEditDialogOpen(false);
                    setEditingId(null);
                    fetchData();
                } else {
                    throw new Error('Failed to update');
                }
            } else if (editDialogType === 'vendor') {
                const payload = {
                    id: editingId,
                    vendor_name: editDialogForm.vendor_name.trim(),
                    vendor_gstin: editDialogForm.vendor_gstin.trim() || null,
                    vendor_address: editDialogForm.vendor_address.trim() || null,
                    vendor_email: editDialogForm.vendor_email.trim() || null,
                    payment_term: normalizePaymentTerm(editDialogForm.payment_term).trim() || null,
                    firm_name: editDialogForm.firm_name.trim() || null,
                    contact_person: editDialogForm.contact_person.trim() || null,
                    mobile: editDialogForm.mobile.trim() || null,
                    pan_number: editDialogForm.pan_number.trim() || null,
                    state: editDialogForm.state.trim() || null,
                    pin_code: editDialogForm.pin_code.trim() || null,
                    isActive: editDialogForm.isActive === 'true',
                };
                result = await postToSheet([payload], 'update', 'MASTER');
                if (result.success) {
                    toast.success('Updated successfully');
                    setEditDialogOpen(false);
                    setEditingId(null);
                    fetchData();
                } else {
                    throw new Error('Failed to update');
                }
            } else {
                result = await updateFirm(editingId, {
                    firm_name: editDialogForm.firm_name,
                    alias: editDialogForm.alias || null,
                    firm_gstin: editDialogForm.firm_gstin,
                    firm_address: editDialogForm.firm_address,
                    firm_email: editDialogForm.firm_email,
                    contact_person: editDialogForm.contact_person,
                    mobile: editDialogForm.mobile,
                    pan_number: editDialogForm.pan_number,
                    state: editDialogForm.state,
                    pin_code: editDialogForm.pin_code,
                    isActive: editDialogForm.isActive === 'true',
                });
                if (result.success) {
                    toast.success('Firm updated successfully');
                    setEditDialogOpen(false);
                    setEditingId(null);
                    loadFirms();
                } else {
                    throw new Error(result.error || 'Failed to update firm');
                }
            }

        } catch (err: any) {
            toast.error(err.message || 'Error updating');
        } finally {
            setSubmitting(false);
        }
    }

    const inventoryColumns = useMemo<ColumnDef<any>[]>(() => [
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
            accessorKey: 'itemName',
            header: 'Item Name',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={200} />,
        },
        {
            accessorKey: 'itemCategoryName',
            header: 'Category',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'departmentHead',
            header: 'Department Head',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={120} />,
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={80} />,
        },
        {
            accessorKey: 'firmName',
            header: 'Firm',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={140} />,
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
                const val = row.original.firm_name || (row.original as any).firmName || '';
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

    const firmColumns = useMemo<ColumnDef<FirmRow>[]>(() => [
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEditDialog(row.original, 'firm')}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'firm_name',
            header: 'Firm Name',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={160} />,
        },
        {
            accessorKey: 'alias',
            header: 'Alias',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={100} />,
        },
        {
            accessorKey: 'firm_gstin',
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
            accessorKey: 'firm_email',
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

    const productCategoryColumns = useMemo<ColumnDef<{ product_category_id: number; product_category_name: string; isActive?: boolean }>[]>(() => [
        {
            id: 'edit',
            header: 'Edit',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openSimpleEditDialog('productCategory', row.original)}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'product_category_name',
            header: 'Product Category',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={240} />,
        },
        {
            id: 'delete',
            header: 'Delete Record',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteRecord('product category', () => deleteProductCategory(row.original.product_category_id), loadProductCategories)}
                >
                    Remove
                </Button>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'Active Status',
            cell: ({ getValue }) => <Pill variant={(getValue() as boolean) !== false ? 'secondary' : 'reject'}>{(getValue() as boolean) !== false ? 'True' : 'False'}</Pill>,
        },
    ], [loadProductCategories]);

    const uomColumns = useMemo<ColumnDef<UOMRow>[]>(() => [
        {
            id: 'edit',
            header: 'Edit',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openSimpleEditDialog('uom', row.original)}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'uom_name',
            header: 'UOM',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={180} />,
        },
        {
            id: 'additionalUoms',
            header: 'Additional UOM',
            cell: ({ row }) => {
                const conversions = row.original.baseConversions || [];
                if (conversions.length === 0) {
                    return <span className="text-muted-foreground">-</span>;
                }

                return (
                    <div className="space-y-1">
                        {conversions.map((conversion) => (
                            <div key={conversion.conversion_id} className="text-xs">
                                1 {conversion.alternateUom?.uom_name || '-'} = {Number(conversion.conversionToBase).toLocaleString()} {row.original.uom_name}
                            </div>
                        ))}
                    </div>
                );
            },
        },
        {
            id: 'delete',
            header: 'Delete Record',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteRecord('UOM', () => deleteUOM(row.original.uom_id), loadUOMs)}
                >
                    Remove
                </Button>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'Active Status',
            cell: ({ getValue }) => <Pill variant={(getValue() as boolean) !== false ? 'secondary' : 'reject'}>{(getValue() as boolean) !== false ? 'True' : 'False'}</Pill>,
        },
    ], [loadUOMs]);

    const departmentColumns = useMemo<ColumnDef<{ id: number; name: string; isActive?: boolean }>[]>(() => [
        {
            id: 'edit',
            header: 'Edit',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openSimpleEditDialog('department', row.original)}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'name',
            header: 'Department',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={240} />,
        },
        {
            id: 'delete',
            header: 'Delete Record',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteRecord('department', () => deleteDepartment(row.original.id), loadDepartments)}
                >
                    Remove
                </Button>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'Active Status',
            cell: ({ getValue }) => <Pill variant={(getValue() as boolean) !== false ? 'secondary' : 'reject'}>{(getValue() as boolean) !== false ? 'True' : 'False'}</Pill>,
        },
    ], [loadDepartments]);

    const departmentHeadColumns = useMemo<ColumnDef<{ id: number; name: string; isActive?: boolean }>[]>(() => [
        {
            id: 'edit',
            header: 'Edit',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openSimpleEditDialog('departmentHead', row.original)}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'name',
            header: 'Department Head',
            cell: ({ getValue }) => <TruncCell value={getValue() as string} width={240} />,
        },
        {
            id: 'delete',
            header: 'Delete Record',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteRecord('department head', () => deleteDepartmentHead(row.original.id), loadDepartmentHeads)}
                >
                    Remove
                </Button>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'Active Status',
            cell: ({ getValue }) => <Pill variant={(getValue() as boolean) !== false ? 'secondary' : 'reject'}>{(getValue() as boolean) !== false ? 'True' : 'False'}</Pill>,
        },
    ], [loadDepartmentHeads]);

    /* fetch */
    async function fetchData() {
        setDataLoading(true);
        try {
            const [masterData, invData] = await Promise.all([
                fetchFromSupabasePaginated('MASTER', '*', { column: 'id', options: { ascending: false } }),
                fetchFromSupabasePaginated('inventory', '*', { column: 'id', options: { ascending: false } }),
            ]);
            setTableData(masterData || []);
            setInventoryTableData(Array.isArray(invData) ? invData : (invData?.items || []));
        } catch (err: any) {
            console.error('Master/Inventory data fetch exception:', err);
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

    async function loadDepartments() {
        const data = await fetchDepartments();
        setAllDepartments(data || []);
    }

    async function loadDepartmentHeads() {
        const data = await fetchDepartmentHeads();
        setAllDepartmentHeads(data || []);
    }

    useEffect(() => {
        fetchData();
        loadUOMs();
        loadFirms();
        loadProductCategories();
        loadDepartments();
        loadDepartmentHeads();
    }, []);

    /* reset form when sheet closes */
    useEffect(() => {
        if (!sheetOpen) {
            setForm(emptyForm);
            setIsAddingDepartment(false);
            setNewDepartmentName('');
            setNewMasterActive('true');
            setShowAddInvAdditionalUOM(false);
            setAddInvAdditionalUOMName('');
            setAddInvAdditionalUOMConversion('');
            setAdditionalUomDrafts([]);
        }
    }, [sheetOpen]);

    function setField(key: keyof MasterForm) {
        return (val: string) => setForm((prev) => ({ ...prev, [key]: val }));
    }

    /* submit */
    async function handleItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.item_name.trim()) {
            toast.error('Item Name is required');
            return;
        }
        if (!form.itemCategoryId) {
            toast.error('Item Category is required');
            return;
        }
        const selectedDept = allDepartments.find(d => d.name === form.department);
        const selectedHead = allDepartmentHeads.find(h => h.name === form.department_head);
        const selectedUomObj = uoms.find(u => u.uom_name === form.uom);
        setSubmitting(true);
        try {
            const result = await postToSheet([{
                department: form.department.trim() || '',
                departmentHead: form.department_head.trim() || '',
                itemName: form.item_name.trim(),
                uom: form.uom || '',
                itemCategoryId: parseInt(form.itemCategoryId),
                ...(selectedDept && { departmentId: Number(selectedDept.id) }),
                ...(selectedHead && { departmentHeadId: Number(selectedHead.id) }),
                ...(selectedUomObj && { uomId: Number(selectedUomObj.uom_id) }),
                additionalUoms: additionalUomDrafts,
            }], 'insert', 'INVENTORY');

            if (!result.success) throw new Error('Failed to save inventory item');
            toast.success('Inventory item saved successfully!');
            setSheetOpen(false);
            fetchData();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save inventory item');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleFirmSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.firm_name.trim()) {
            toast.error('Firm Name is required');
            return;
        }
        setSubmitting(true);
        try {
            const result = await postToFirm({
                firm_name: form.firm_name.trim(),
                alias: form.alias.trim() || null,
                firm_gstin: form.firm_gstin.trim() || null,
                firm_address: form.firm_address.trim() || null,
                firm_email: form.firm_email.trim() || null,
                contact_person: form.contact_person.trim() || null,
                mobile: form.mobile.trim() || null,
                pan_number: form.pan_number.trim() || null,
                state: form.state.trim() || null,
                pin_code: form.pin_code.trim() || null,
                isActive: form.isActive === 'true',
            });

            if (!result.success) throw new Error(result.error || 'Failed to save firm data');
            toast.success('Firm data saved successfully!');
            loadFirms();
            closeOrReturnAfterRelatedAdd();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save firm data');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleProductCategorySubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newCategoryName.trim()) {
            toast.error('Product Category is required');
            return;
        }
        setSubmitting(true);
        try {
            const result = await postProductCategory(newCategoryName.trim(), newMasterActive === 'true');
            if (!result.success) throw new Error(result.error || 'Failed to save product category');
            toast.success('Product category saved successfully!');
            setNewCategoryName('');
            setNewMasterActive('true');
            loadProductCategories();
            closeOrReturnAfterRelatedAdd();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save product category');
        } finally {
            setSubmitting(false);
        }
    }


    async function handleUOMSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newUOMName.trim()) {
            toast.error('UOM is required');
            return;
        }
        setSubmitting(true);
        try {
            const result = await postToUOM(newUOMName.trim(), newMasterActive === 'true');
            if (!result.success) throw new Error(result.error || 'Failed to save UOM');
            toast.success('UOM saved successfully!');
            setNewUOMName('');
            setNewMasterActive('true');
            loadUOMs();
            closeOrReturnAfterRelatedAdd();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save UOM');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDepartmentSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newDepartmentName.trim()) {
            toast.error('Department is required');
            return;
        }
        setSubmitting(true);
        try {
            await postDepartment(newDepartmentName.trim(), newMasterActive === 'true');
            toast.success('Department saved successfully!');
            setNewDepartmentName('');
            setNewMasterActive('true');
            loadDepartments();
            closeOrReturnAfterRelatedAdd();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save department');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDepartmentHeadSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newHeadName.trim()) {
            toast.error('Department Head is required');
            return;
        }
        setSubmitting(true);
        try {
            await postDepartmentHead(newHeadName.trim(), newMasterActive === 'true');
            toast.success('Department head saved successfully!');
            setNewHeadName('');
            setNewMasterActive('true');
            loadDepartmentHeads();
            closeOrReturnAfterRelatedAdd();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save department head');
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

    async function handleAddDept() {
        if (!newDepartmentName.trim()) return;
        setAddingDepartment(true);
        try {
            const result = await postDepartment(newDepartmentName.trim());
            toast.success('Department added successfully');
            setNewDepartmentName('');
            setIsAddingDepartment(false);
            loadDepartments();
            setForm(prev => ({ ...prev, department: result.name }));
        } catch (error: any) {
            toast.error(error.message || 'Failed to add department');
        } finally {
            setAddingDepartment(false);
        }
    }

    async function handleAddHead() {
        if (!newHeadName.trim()) return;
        setAddingHead(true);
        try {
            const result = await postDepartmentHead(newHeadName.trim());
            toast.success('Department head added successfully');
            setNewHeadName('');
            setIsAddingHead(false);
            loadDepartmentHeads();
            setForm(prev => ({ ...prev, department_head: result.name }));
        } catch (error: any) {
            toast.error(error.message || 'Failed to add head');
        } finally {
            setAddingHead(false);
        }
    }

    async function handleEditAddDept() {
        if (!editNewDepartmentName.trim()) return;
        setEditAddingDepartment(true);
        try {
            const result = await postDepartment(editNewDepartmentName.trim());
            toast.success('Department added successfully');
            setEditNewDepartmentName('');
            setEditIsAddingDepartment(false);
            loadDepartments();
            setEditDialogForm(prev => ({ ...prev, department: result.name }));
        } catch (error: any) {
            toast.error(error.message || 'Failed to add department');
        } finally {
            setEditAddingDepartment(false);
        }
    }

    async function handleEditAddHead() {
        if (!editNewHeadName.trim()) return;
        setEditAddingHead(true);
        try {
            const result = await postDepartmentHead(editNewHeadName.trim());
            toast.success('Department head added successfully');
            setEditNewHeadName('');
            setEditIsAddingHead(false);
            loadDepartmentHeads();
            setEditDialogForm(prev => ({ ...prev, department_head: result.name }));
        } catch (error: any) {
            toast.error(error.message || 'Failed to add head');
        } finally {
            setEditAddingHead(false);
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
            <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'inventory' | 'vendor' | 'firm' | 'productCategory' | 'uom' | 'department' | 'departmentHead')}>
                <TabsList className="mb-4 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 h-auto gap-1">
                    <TabsTrigger value="productCategory">Product Category</TabsTrigger>
                    <TabsTrigger value="uom">UOM</TabsTrigger>
                    <TabsTrigger value="department">Department</TabsTrigger>
                    <TabsTrigger value="departmentHead">Department Head</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory Info</TabsTrigger>
                    <TabsTrigger value="vendor">Vendor Info</TabsTrigger>
                    <TabsTrigger value="firm">Firm Info</TabsTrigger>
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

                <TabsContent value="firm">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={firms}
                            columns={firmColumns}
                            searchFields={['firm_name', 'firm_gstin', 'firm_email', 'contact_person', 'mobile', 'pan_number', 'state', 'pin_code']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Button
                                        className="h-9 shrink-0 whitespace-nowrap"
                                        onClick={() => { setActiveTab('firm'); setSheetOpen(true); }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Firm Info
                                    </Button>
                                </div>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="productCategory">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={productCategories}
                            columns={productCategoryColumns}
                            searchFields={['product_category_name']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <Button className="h-9 shrink-0 whitespace-nowrap" onClick={() => { setActiveTab('productCategory'); setSheetOpen(true); }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Product Category
                                </Button>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="uom">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={uoms}
                            columns={uomColumns}
                            searchFields={['uom_name']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <Button className="h-9 shrink-0 whitespace-nowrap" onClick={() => { setActiveTab('uom'); setSheetOpen(true); }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add UOM
                                </Button>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="department">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={allDepartments}
                            columns={departmentColumns}
                            searchFields={['name']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <Button className="h-9 shrink-0 whitespace-nowrap" onClick={() => { setActiveTab('department'); setSheetOpen(true); }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Department
                                </Button>
                            }
                        />
                    </div>
                </TabsContent>

                <TabsContent value="departmentHead">
                    <div className="w-full max-w-full overflow-x-auto">
                        <DataTable
                            data={allDepartmentHeads}
                            columns={departmentHeadColumns}
                            searchFields={['name']}
                            dataLoading={dataLoading}
                            pagination={true}
                            extraActions={
                                <Button className="h-9 shrink-0 whitespace-nowrap" onClick={() => { setActiveTab('departmentHead'); setSheetOpen(true); }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Department Head
                                </Button>
                            }
                        />
                    </div>
                </TabsContent>

            </Tabs>

            {/* ── Add Dialog ── */}
            <Dialog open={sheetOpen} onOpenChange={handleAddDialogOpenChange}>
                <DialogContent className="w-full max-w-lg max-h-[85vh] min-h-0 overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0 pb-3 border-b">
                        <DialogTitle>
                            {activeTab === 'item'
                                ? 'Add Inventory'
                                : activeTab === 'vendor'
                                    ? 'Add Vendor Info'
                                    : activeTab === 'firm'
                                        ? 'Add Firm Info'
                                        : activeTab === 'productCategory'
                                            ? 'Add Product Category'
                                            : activeTab === 'uom'
                                                ? 'Add UOM'
                                                : activeTab === 'department'
                                                    ? 'Add Department'
                                                    : 'Add Department Head'}
                        </DialogTitle>
                        <DialogDescription>
                            {activeTab === 'item'
                                ? 'Fill in the item and department details.'
                                : activeTab === 'vendor'
                                    ? 'Fill in the vendor contact and firm details.'
                                    : activeTab === 'firm'
                                        ? 'Fill in the firm details.'
                                        : 'Add a master value for use across forms.'}
                        </DialogDescription>
                    </DialogHeader>

                    {activeTab === 'item' ? (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                            <form id="item-form" onSubmit={handleItemSubmit} className="space-y-4">
                                <Field
                                    label="Product Name"
                                    id="item_name"
                                    value={form.item_name}
                                    onChange={setField('item_name')}
                                    required
                                />

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">
                                        Product Category<span className="text-destructive ml-0.5">*</span>
                                    </Label>
                                    <Select
                                        value={form.itemCategoryId}
                                        onValueChange={setField('itemCategoryId')}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Category" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('productCategory')} aria-label="Add product category">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <SelectContent>
                                            {productCategories.map((c) => (
                                                <SelectItem key={c.product_category_id} value={c.product_category_id.toString()}>
                                                    {c.product_category_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">UOM</Label>
                                    <Select value={form.uom} onValueChange={(val) => { setField('uom')(val); setAdditionalUomDrafts([]); setAddInvAdditionalUOMName(''); setAddInvAdditionalUOMConversion(''); setShowAddInvAdditionalUOM(false); }}>
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select UOM" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('uom')} aria-label="Add UOM">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <SelectContent>
                                            {uoms.map((u) => (
                                                <SelectItem key={u.uom_id} value={u.uom_name}>
                                                    {u.uom_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-3 rounded-md border border-dashed p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">Additional UOM</p>
                                        {!showAddInvAdditionalUOM && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowAddInvAdditionalUOM(true)}
                                                className="shrink-0"
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add Additional UOM
                                            </Button>
                                        )}
                                    </div>

                                    {additionalUomDrafts.length > 0 && (
                                        <div className="space-y-2">
                                            {additionalUomDrafts.map((d, i) => (
                                                <div key={i} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                                    <span>1 {d.uomName} = {d.conversionToBase} {form.uom}</span>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        onClick={() => setAdditionalUomDrafts(prev => prev.filter((_, idx) => idx !== i))}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {showAddInvAdditionalUOM && (
                                        <div className="grid grid-cols-1 gap-3 rounded-md bg-muted/30 p-3">
                                            <div className="flex flex-col gap-1.5">
                                                <Label className="text-xs text-muted-foreground">Additional UOM</Label>
                                                <Select
                                                    value={addInvAdditionalUOMName}
                                                    onValueChange={(val) => {
                                                        setAddInvAdditionalUOMName(val);
                                                        const existing = uoms.find(u => u.uom_name === form.uom)?.baseConversions?.find(c => c.alternateUom?.uom_name === val);
                                                        setAddInvAdditionalUOMConversion(existing ? String(existing.conversionToBase) : '');
                                                    }}
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Select UOM" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {uoms
                                                            .filter(u => u.uom_name !== form.uom && !additionalUomDrafts.some(d => d.uomName === u.uom_name))
                                                            .map(u => (
                                                                <SelectItem key={u.uom_id} value={u.uom_name}>{u.uom_name}</SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <Label className="text-xs text-muted-foreground">
                                                    How many {form.uom || 'base UOM'} in 1 {addInvAdditionalUOMName || 'additional UOM'}?
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={addInvAdditionalUOMConversion}
                                                    onChange={e => setAddInvAdditionalUOMConversion(e.target.value)}
                                                    placeholder="e.g. 10"
                                                    className="h-9"
                                                />
                                            </div>
                                            {addInvAdditionalUOMName && addInvAdditionalUOMConversion && (
                                                <p className="text-xs text-muted-foreground">
                                                    1 {addInvAdditionalUOMName} = {addInvAdditionalUOMConversion} {form.uom || 'base UOM'}
                                                </p>
                                            )}
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setAddInvAdditionalUOMName('');
                                                        setAddInvAdditionalUOMConversion('');
                                                        setShowAddInvAdditionalUOM(false);
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={!addInvAdditionalUOMName || !addInvAdditionalUOMConversion || Number(addInvAdditionalUOMConversion) <= 0}
                                                    onClick={() => {
                                                        const selectedUomObj = uoms.find(u => u.uom_name === addInvAdditionalUOMName);
                                                        setAdditionalUomDrafts(prev => [...prev, {
                                                            uomName: addInvAdditionalUOMName,
                                                            uomId: selectedUomObj?.uom_id ?? 0,
                                                            conversionToBase: parseFloat(addInvAdditionalUOMConversion),
                                                        }]);
                                                        setAddInvAdditionalUOMName('');
                                                        setAddInvAdditionalUOMConversion('');
                                                        setShowAddInvAdditionalUOM(false);
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department</Label>
                                    <Select 
                                        value={form.department} 
                                        onValueChange={(val) => {
                                            setField('department')(val);
                                        }}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Department" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('department')} aria-label="Add department">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
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
                                            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                                                {uniqueDepartments.filter(d => d.toLowerCase().includes(searchTermDept.toLowerCase())).map(dept => (
                                                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                                ))}
                                            </div>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <Select 
                                        value={form.department_head} 
                                        onValueChange={(val) => {
                                            setField('department_head')(val);
                                        }}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Department Head" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('departmentHead')} aria-label="Add department head">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
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
                                            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                                                {uniqueHeads.filter(h => h.toLowerCase().includes(searchTermHead.toLowerCase())).map(head => (
                                                    <SelectItem key={head} value={head}>{head}</SelectItem>
                                                ))}
                                            </div>
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
                                        {submitting ? 'Saving Inventory…' : 'Save Inventory Data'}
                                    </Button>
                                </div>

                            </form>
                        </div>
                    ) : activeTab === 'productCategory' ? (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                            <form onSubmit={handleProductCategorySubmit} className="space-y-4">
                                <Field
                                    label="Product Category"
                                    id="product_category_name"
                                    value={newCategoryName}
                                    onChange={setNewCategoryName}
                                    required
                                />
                                <ActiveStatusField
                                    value={newMasterActive}
                                    onChange={setNewMasterActive}
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button type="submit" disabled={submitting} className="flex-1 h-11">
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving Product Category...' : 'Save Product Category'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : activeTab === 'uom' ? (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                            <form onSubmit={handleUOMSubmit} className="space-y-4">
                                <Field
                                    label="UOM"
                                    id="uom_name"
                                    value={newUOMName}
                                    onChange={setNewUOMName}
                                    required
                                />
                                <ActiveStatusField
                                    value={newMasterActive}
                                    onChange={setNewMasterActive}
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button type="submit" disabled={submitting} className="flex-1 h-11">
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving UOM...' : 'Save UOM'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : activeTab === 'department' ? (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                            <form onSubmit={handleDepartmentSubmit} className="space-y-4">
                                <Field
                                    label="Department"
                                    id="department_name"
                                    value={newDepartmentName}
                                    onChange={setNewDepartmentName}
                                    required
                                />
                                <ActiveStatusField
                                    value={newMasterActive}
                                    onChange={setNewMasterActive}
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button type="submit" disabled={submitting} className="flex-1 h-11">
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving Department...' : 'Save Department'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : activeTab === 'departmentHead' ? (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                            <form onSubmit={handleDepartmentHeadSubmit} className="space-y-4">
                                <Field
                                    label="Department Head"
                                    id="department_head_name"
                                    value={newHeadName}
                                    onChange={setNewHeadName}
                                    required
                                />
                                <ActiveStatusField
                                    value={newMasterActive}
                                    onChange={setNewMasterActive}
                                />
                                <div className="pt-4 flex gap-2">
                                    <Button type="submit" disabled={submitting} className="flex-1 h-11">
                                        {submitting && <Loader size={16} color="white" className="mr-2" />}
                                        {submitting ? 'Saving Department Head...' : 'Save Department Head'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : activeTab === 'vendor' ? (
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4 py-4 pr-1">
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
                    ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4 py-4 pr-1">
                            <form id="firm-form" onSubmit={handleFirmSubmit} className="space-y-4">
                                <Field
                                    label="Firm Name"
                                    id="firm_name"
                                    value={form.firm_name}
                                    onChange={setField('firm_name')}
                                    required
                                />
                                <Field
                                    label="Alias (used in PO Number)"
                                    id="firm_alias"
                                    value={form.alias}
                                    onChange={setField('alias')}
                                    placeholder="e.g. SSESPL"
                                />
                                <Field
                                    label="Firm GSTIN"
                                    id="firm_gstin"
                                    value={form.firm_gstin}
                                    onChange={setField('firm_gstin')}
                                    placeholder="e.g. 09AAAAA0000A1ZZ"
                                />
                                <Field
                                    label="Firm Email"
                                    id="firm_email"
                                    type="email"
                                    value={form.firm_email}
                                    onChange={setField('firm_email')}
                                />
                                <Field
                                    label="Firm Address"
                                    id="firm_address"
                                    value={form.firm_address}
                                    onChange={setField('firm_address')}
                                    textarea
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="Contact Person"
                                        id="firm_contact_person"
                                        value={form.contact_person}
                                        onChange={setField('contact_person')}
                                    />
                                    <Field
                                        label="Mobile"
                                        id="firm_mobile"
                                        type="number"
                                        value={form.mobile}
                                        onChange={setField('mobile')}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field
                                        label="PAN Number"
                                        id="firm_pan_number"
                                        value={form.pan_number}
                                        onChange={setField('pan_number')}
                                    />
                                    <Field
                                        label="State"
                                        id="firm_state"
                                        value={form.state}
                                        onChange={setField('state')}
                                    />
                                </div>
                                <Field
                                    label="PIN Code"
                                    id="firm_pin_code"
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
                                        {submitting ? 'Saving Firm…' : 'Save Firm Data'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}

                </DialogContent>
            </Dialog>

            <Dialog open={simpleEditOpen} onOpenChange={(open) => {
                setSimpleEditOpen(open);
                if (!open) setSimpleEditId(null);
            }}>
                <DialogContent className="w-full max-w-md">
                    <DialogHeader className="pb-3 border-b">
                        <DialogTitle>Edit {simpleEditLabels[simpleEditType]}</DialogTitle>
                        <DialogDescription>
                            Update the name and active status.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSimpleEditSubmit} className="space-y-4 py-2">
                        <Field
                            label={simpleEditLabels[simpleEditType]}
                            id="simple_edit_name"
                            value={simpleEditName}
                            onChange={setSimpleEditName}
                            required
                        />

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-medium">Active Status</Label>
                            <Select value={simpleEditActive} onValueChange={setSimpleEditActive}>
                                <SelectTrigger className="w-full h-10">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">True</SelectItem>
                                    <SelectItem value="false">False</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-2 flex gap-2">
                            <Button type="submit" disabled={submitting} className="flex-1 h-10">
                                {submitting && <Loader size={16} color="white" className="mr-2" />}
                                {submitting ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
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
                            {editDialogType === 'inventory' ? 'Edit Inventory' : editDialogType === 'vendor' ? 'Edit Vendor Info' : 'Edit Firm Info'}
                        </DialogTitle>
                        <DialogDescription>
                            {editDialogType === 'inventory'
                                ? 'Update the item and department details.'
                                : editDialogType === 'vendor'
                                    ? 'Update the vendor contact and firm details.'
                                    : 'Update the firm details.'}
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
                                    <Label className="text-sm font-medium">
                                        Item Category<span className="text-destructive ml-0.5">*</span>
                                    </Label>
                                    <Select
                                        value={editDialogForm.itemCategoryId}
                                        onValueChange={setEditDialogField('itemCategoryId')}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Category" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('productCategory')} aria-label="Add product category">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <SelectContent>
                                            {productCategories.map((c) => (
                                                <SelectItem key={c.product_category_id} value={c.product_category_id.toString()}>
                                                    {c.product_category_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">UOM</Label>
                                    <Select value={editDialogForm.uom} onValueChange={(val) => { setEditDialogField('uom')(val); setEditAdditionalUomDrafts([]); setEditInvAdditionalUOMName(''); setEditInvAdditionalUOMConversion(''); setShowEditInvAdditionalUOM(false); }}>
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select UOM" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('uom')} aria-label="Add UOM">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <SelectContent>
                                            {uoms.map((u) => (
                                                <SelectItem key={u.uom_id} value={u.uom_name}>
                                                    {u.uom_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-3 rounded-md border border-dashed p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">Additional UOM</p>
                                        {!showEditInvAdditionalUOM && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowEditInvAdditionalUOM(true)}
                                                className="shrink-0"
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add Additional UOM
                                            </Button>
                                        )}
                                    </div>

                                    {editAdditionalUomDrafts.length > 0 && (
                                        <div className="space-y-2">
                                            {editAdditionalUomDrafts.map((d, i) => (
                                                <div key={i} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                                    <span>1 {d.uomName} = {d.conversionToBase} {editDialogForm.uom}</span>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        onClick={() => setEditAdditionalUomDrafts(prev => prev.filter((_, idx) => idx !== i))}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {showEditInvAdditionalUOM && (
                                        <div className="grid grid-cols-1 gap-3 rounded-md bg-muted/30 p-3">
                                            <div className="flex flex-col gap-1.5">
                                                <Label className="text-xs text-muted-foreground">Additional UOM</Label>
                                                <Select
                                                    value={editInvAdditionalUOMName}
                                                    onValueChange={(val) => {
                                                        setEditInvAdditionalUOMName(val);
                                                        const existing = uoms.find(u => u.uom_name === editDialogForm.uom)?.baseConversions?.find(c => c.alternateUom?.uom_name === val);
                                                        setEditInvAdditionalUOMConversion(existing ? String(existing.conversionToBase) : '');
                                                    }}
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Select UOM" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {uoms
                                                            .filter(u => u.uom_name !== editDialogForm.uom && !editAdditionalUomDrafts.some(d => d.uomName === u.uom_name))
                                                            .map(u => (
                                                                <SelectItem key={u.uom_id} value={u.uom_name}>{u.uom_name}</SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <Label className="text-xs text-muted-foreground">
                                                    How many {editDialogForm.uom || 'base UOM'} in 1 {editInvAdditionalUOMName || 'additional UOM'}?
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={editInvAdditionalUOMConversion}
                                                    onChange={e => setEditInvAdditionalUOMConversion(e.target.value)}
                                                    placeholder="e.g. 10"
                                                    className="h-9"
                                                />
                                            </div>
                                            {editInvAdditionalUOMName && editInvAdditionalUOMConversion && (
                                                <p className="text-xs text-muted-foreground">
                                                    1 {editInvAdditionalUOMName} = {editInvAdditionalUOMConversion} {editDialogForm.uom || 'base UOM'}
                                                </p>
                                            )}
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditInvAdditionalUOMName('');
                                                        setEditInvAdditionalUOMConversion('');
                                                        setShowEditInvAdditionalUOM(false);
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={!editInvAdditionalUOMName || !editInvAdditionalUOMConversion || Number(editInvAdditionalUOMConversion) <= 0}
                                                    onClick={() => {
                                                        const selectedUomObj = uoms.find(u => u.uom_name === editInvAdditionalUOMName);
                                                        setEditAdditionalUomDrafts(prev => [...prev, {
                                                            uomName: editInvAdditionalUOMName,
                                                            uomId: selectedUomObj?.uom_id ?? 0,
                                                            conversionToBase: parseFloat(editInvAdditionalUOMConversion),
                                                        }]);
                                                        setEditInvAdditionalUOMName('');
                                                        setEditInvAdditionalUOMConversion('');
                                                        setShowEditInvAdditionalUOM(false);
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department</Label>
                                    <Select
                                        value={editDialogForm.department}
                                        onValueChange={(val) => {
                                            setEditDialogField('department')(val);
                                        }}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Department" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('department')} aria-label="Add department">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
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


                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <Select 
                                        value={editDialogForm.department_head} 
                                        onValueChange={(val) => {
                                            setEditDialogField('department_head')(val);
                                        }}
                                    >
                                        <div className="flex gap-2 items-end">
                                            <SelectTrigger className="w-full h-10">
                                                <SelectValue placeholder="Select Department Head" />
                                            </SelectTrigger>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => openRelatedMasterAdd('departmentHead')} aria-label="Add department head">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
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
                    ) : editDialogType === 'vendor' ? (
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
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Payment Term</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select
                                                value={editDialogForm.payment_term}
                                                onValueChange={setEditDialogField('payment_term')}
                                            >
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Select payment term" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {uniquePaymentTerms.map((t) => (
                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={() => setEditIsAddingPaymentTerm(!editIsAddingPaymentTerm)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {editIsAddingPaymentTerm && (
                                        <div className="flex gap-2 mt-2 p-3 bg-muted/30 rounded-lg border border-dashed border-primary/30">
                                            <Input
                                                placeholder="New payment term..."
                                                value={editNewPaymentTermName}
                                                onChange={(e) => setEditNewPaymentTermName(e.target.value)}
                                                className="h-9"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const t = editNewPaymentTermName.trim();
                                                        if (t) {
                                                            setEditDialogField('payment_term')(t);
                                                            setEditNewPaymentTermName('');
                                                            setEditIsAddingPaymentTerm(false);
                                                        }
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!editNewPaymentTermName.trim()}
                                                className="h-9 shrink-0"
                                                onClick={() => {
                                                    const t = editNewPaymentTermName.trim();
                                                    if (t) {
                                                        setEditDialogField('payment_term')(t);
                                                        setEditNewPaymentTermName('');
                                                        setEditIsAddingPaymentTerm(false);
                                                    }
                                                }}
                                            >
                                                Add
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
                    ) : (
                            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                                <div className="space-y-4">
                                    <Field label="Firm Name" id="edit_firm_name" value={editDialogForm.firm_name} onChange={setEditDialogField('firm_name')} required />
                                    <Field label="Alias (used in PO Number)" id="edit_firm_alias" value={editDialogForm.alias} onChange={setEditDialogField('alias')} placeholder="e.g. SSESPL" />
                                    <Field label="GSTIN" id="edit_firm_gstin" value={editDialogForm.firm_gstin} onChange={setEditDialogField('firm_gstin')} />
                                    <Field label="PAN Number" id="edit_pan_number" value={editDialogForm.pan_number} onChange={setEditDialogField('pan_number')} />
                                    <Field label="Contact Person" id="edit_contact_person" value={editDialogForm.contact_person} onChange={setEditDialogField('contact_person')} />
                                    <Field label="Mobile" id="edit_mobile" value={editDialogForm.mobile} onChange={setEditDialogField('mobile')} />
                                    <Field label="Email" id="edit_firm_email" value={editDialogForm.firm_email} onChange={setEditDialogField('firm_email')} />
                                    <Field label="Address" id="edit_firm_address" value={editDialogForm.firm_address} onChange={setEditDialogField('firm_address')} textarea />
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="State" id="edit_state" value={editDialogForm.state} onChange={setEditDialogField('state')} />
                                        <Field label="Pin Code" id="edit_pin_code" value={editDialogForm.pin_code} onChange={setEditDialogField('pin_code')} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Status</Label>
                                        <Select value={editDialogForm.isActive} onValueChange={setEditDialogField('isActive')}>
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
