import Heading from '../element/Heading';

import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import type { ColumnDef } from '@tanstack/react-table';
import { Pill } from '../ui/pill';
import { Store } from 'lucide-react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { postToSheet } from '@/lib/fetchers';
import type { InventorySheet } from '@/types/sheets';

interface InventoryTable {
    inventoryId: number | null;
    itemName: string;
    departmentHead: string;
    department: string;
    uom: string;
    status: string;
    indented: number;
    approved: number;
    purchaseQuantity: number;
    storeOut: number;
    loanOut: number;
    current: number;
}


interface EditForm {
    uom: string;
    departmentHead: string;
    department: string;
}


export default () => {
    const { inventorySheet, inventoryLoading, updateInventorySheet, masterSheet } = useSheets();

    const [tableData, setTableData] = useState<InventoryTable[]>([]);
    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState<InventoryTable | null>(null);
    const [editForm, setEditForm] = useState<EditForm>({ uom: '', departmentHead: '', department: '' });
    const [saving, setSaving] = useState(false);
    // Derived unique options for dropdowns
    const departmentOptions = masterSheet?.departments || [];
    const headOptions = masterSheet?.createGroupHeads || [];


    useEffect(() => {
        setTableData(
            inventorySheet.map((i) => ({
                inventoryId: i.inventoryId || null,
                uom: i.uom || '-',
                current: Number(i.current || 0),
                status: i.colorCode || 'green',
                indented: Number(i.indented || 0),
                itemName: i.itemName || 'Unknown Item',
                departmentHead: i.departmentHead || 'N/A',
                department: i.department || 'N/A',
                purchaseQuantity: Number(i.purchaseQuantity || 0),
                approved: Number(i.approved || 0),
                storeOut: Number(i.storeOut || 0),
                loanOut: Number(i.loanOut || 0),
            }))
                .reverse()
        );
    }, [inventorySheet]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            updateInventorySheet(true);
        }, 5000);
        return () => clearInterval(intervalId);
    }, [updateInventorySheet]);

    function openEditDialog(row: InventoryTable) {
        setEditRow(row);
        setEditForm({
            uom: row.uom || '',
            departmentHead: row.departmentHead || '',
            department: row.department || '',
        });
        setEditOpen(true);
    }

    async function handleSave() {
        if (!editRow) return;
        setSaving(true);
        try {
            const payload: any = {
                itemName: editRow.itemName,
                departmentHead: editForm.departmentHead,
                department: editForm.department,
                uom: editForm.uom,
            };


            let result;
            if (editRow.inventoryId) {
                result = await postToSheet([{ id: editRow.inventoryId, ...payload }], 'update', 'INVENTORY');
            } else {
                result = await postToSheet([payload], 'insert', 'INVENTORY');
            }

            if (result.success) {
                toast.success('Inventory updated successfully');
                setEditOpen(false);
                updateInventorySheet();
            } else {
                throw new Error('Failed to save');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error saving inventory');
        } finally {
            setSaving(false);
        }
    }

    const columns: ColumnDef<InventoryTable>[] = [
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEditDialog(row.original)}
                >
                    Edit
                </Button>
            ),
        },
        {
            accessorKey: 'itemName',
            header: 'Item',
            cell: ({ row }) => (
                <div className="text-wrap max-w-40 text-center">{row.original.itemName}</div>
            ),
        },
        { accessorKey: 'uom', header: 'UOM' },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'departmentHead', header: 'Dept Head' },


        { accessorKey: 'indented', header: 'Indented' },
        { accessorKey: 'approved', header: 'Approved' },
        { accessorKey: 'purchaseQuantity', header: 'Purchased' },
        { accessorKey: 'storeOut', header: 'Store Out' },
        { accessorKey: 'loanOut', header: 'Loan Out' },
        { accessorKey: 'current', header: 'Stock' },

        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const code = (row.original.status || 'green').toLowerCase();
                if (row.original.current <= 0) {
                    return <Pill variant="reject">Out</Pill>;
                }
                if (code === 'red') {
                    return <Pill variant="pending">Low</Pill>;
                }
                if (code === 'purple') {
                    return <Pill variant="primary">Excess</Pill>;
                }
                return <Pill variant="secondary">OK</Pill>;
            },
        },
    ];

    return (
        <div>
            <Heading heading="Inventory" subtext="View inventory">
                <Store size={50} className="text-primary" />
            </Heading>

            <DataTable
                data={tableData}
                columns={columns}
                dataLoading={inventoryLoading}
                searchFields={['itemName', 'departmentHead', 'department', 'uom', 'status']}
                className="h-[80dvh]"
            />

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="w-full max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Inventory Info</DialogTitle>
                        <DialogDescription>
                            Updating {editRow?.itemName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-sm font-medium">Department</Label>
                                <Select 
                                    value={editForm.department} 
                                    onValueChange={(v) => setEditForm(p => ({ ...p, department: v }))}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Dept" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(departmentOptions as string[]).map((opt: string) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-sm font-medium">Dept Head</Label>
                                <Select 
                                    value={editForm.departmentHead} 
                                    onValueChange={(v) => setEditForm(p => ({ ...p, departmentHead: v }))}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Head" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(headOptions as string[]).map((opt: string) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-medium">UOM</Label>
                            <Input
                                value={editForm.uom}
                                onChange={(e) => setEditForm(p => ({ ...p, uom: e.target.value }))}
                                placeholder="Enter UOM"
                            />
                        </div>

                        <Button
                            className="w-full mt-2"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
