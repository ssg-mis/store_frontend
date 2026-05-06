import { Database, Plus, Search } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo } from 'react';
import { fetchFromSupabasePaginated, postToSheet, fetchUOMs, postToUOM, fetchFirms, postToFirm, updateFirm, fetchProductCategories, postProductCategory, fetchDepartments, postDepartment, fetchDepartmentHeads, postDepartmentHead } from '@/lib/fetchers';
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
    const [inventoryTableData, setInventoryTableData] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'item' | 'vendor' | 'firm'>('item');
    const [pageTab, setPageTab] = useState<'inventory' | 'vendor' | 'firm'>('inventory');

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editDialogType, setEditDialogType] = useState<'inventory' | 'vendor' | 'firm'>('inventory');
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
    const [firms, setFirms] = useState<FirmRow[]>([]);
    const [isAddingFirm, setIsAddingFirm] = useState(false);
    const [newFirmName, setNewFirmName] = useState('');
    const [addingFirm, setAddingFirm] = useState(false);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number, product_category_name: string }[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);

    const [allDepartments, setAllDepartments] = useState<{ id: number, name: string }[]>([]);
    const [allDepartmentHeads, setAllDepartmentHeads] = useState<{ id: number, name: string }[]>([]);
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
                payment_term: row.payment_term || '',
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
                firm_gstin: '',
                firm_address: '',
                firm_email: '',
            });
        } else {
            setEditDialogForm({
                ...emptyForm,
                firm_name: row.firm_name || '',
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
        setEditDialogOpen(true);
    }

    async function handleSaveEditFromDialog() {
        if (!editingId) return;
        setSubmitting(true);
        try {
            let result;
            if (editDialogType === 'inventory') {
                const selectedFirm = firms.find(f => f.firm_name === editDialogForm.firm_name);
                const payload: any = {
                    id: editingId,
                    department: editDialogForm.department.trim() || '',
                    departmentHead: editDialogForm.department_head.trim() || '',
                    itemName: editDialogForm.item_name.trim(),
                    uom: editDialogForm.uom || '',
                    itemCategoryId: editDialogForm.itemCategoryId ? parseInt(editDialogForm.itemCategoryId) : undefined,
                };
                if (selectedFirm) payload.firm = selectedFirm.firm_id;
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
                    payment_term: editDialogForm.payment_term.trim() || null,
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
        const selectedFirm = firms.find(f => f.firm_name === form.firm_name);
        if (!selectedFirm) {
            toast.error('Please select a Firm');
            return;
        }
        setSubmitting(true);
        try {
            const result = await postToSheet([{
                department: form.department.trim() || '',
                departmentHead: form.department_head.trim() || '',
                itemName: form.item_name.trim(),
                uom: form.uom || '',
                firm: selectedFirm.firm_name,
                itemCategoryId: parseInt(form.itemCategoryId),
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
            setSheetOpen(false);
            loadFirms();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to save firm data');
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
            <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'inventory' | 'vendor' | 'firm')}>
                <TabsList className="mb-4 w-full grid grid-cols-1 sm:grid-cols-3 h-auto gap-1">
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

            </Tabs>

            {/* ── Add Dialog ── */}
            <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
                <DialogContent className="w-full max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader className="shrink-0 pb-3 border-b">
                        <DialogTitle>
                            {activeTab === 'item' ? 'Add Inventory' : activeTab === 'vendor' ? 'Add Vendor Info' : 'Add Firm Info'}
                        </DialogTitle>
                        <DialogDescription>
                            {activeTab === 'item'
                                ? 'Fill in the item and department details.'
                                : activeTab === 'vendor'
                                    ? 'Fill in the vendor contact and firm details.'
                                    : 'Fill in the firm details.'}
                        </DialogDescription>
                    </DialogHeader>

                    {activeTab === 'item' ? (
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
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
                                                disabled={addingDepartment || !newDepartmentName.trim()}
                                                onClick={handleAddDept}
                                                className="h-9 shrink-0"
                                            >
                                                {addingDepartment ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={form.department_head} 
                                                onValueChange={(val) => {
                                                    setField('department_head')(val);
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
                                                disabled={addingHead || !newHeadName.trim()}
                                                onClick={handleAddHead}
                                                className="h-9 shrink-0"
                                            >
                                                {addingHead ? <Loader size={14} color="white" /> : 'Add'}
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
                    ) : activeTab === 'vendor' ? (
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
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                            <form id="firm-form" onSubmit={handleFirmSubmit} className="space-y-4">
                                <Field
                                    label="Firm Name"
                                    id="firm_name"
                                    value={form.firm_name}
                                    onChange={setField('firm_name')}
                                    required
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
                                                disabled={editAddingDepartment || !editNewDepartmentName.trim()}
                                                onClick={handleEditAddDept}
                                                className="h-9 shrink-0"
                                            >
                                                {editAddingDepartment ? <Loader size={14} color="white" /> : 'Add'}
                                            </Button>
                                        </div>

                                    )}
                                </div>


                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-sm font-medium">Department Head</Label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select 
                                                value={editDialogForm.department_head} 
                                                onValueChange={(val) => {
                                                    setEditDialogField('department_head')(val);
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
                                                disabled={editAddingHead || !editNewHeadName.trim()}
                                                onClick={handleEditAddHead}
                                                className="h-9 shrink-0"
                                            >
                                                {editAddingHead ? <Loader size={14} color="white" /> : 'Add'}
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
                    ) : (
                            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                                <div className="space-y-4">
                                    <Field label="Firm Name" id="edit_firm_name" value={editDialogForm.firm_name} onChange={setEditDialogField('firm_name')} required />
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
