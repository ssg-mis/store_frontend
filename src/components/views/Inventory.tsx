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
import { toast } from 'sonner';
import { postToSheet } from '@/lib/fetchers';
import type { InventorySheet } from '@/types/sheets';

interface InventoryTable {
    inventoryId: number | null;
    itemName: string;
    groupHead: string;
    uom: string;
    status: string;
    opening: number;
    indented: number;
    approved: number;
    purchaseQuantity: number;
    storeOut: number;
    current: number;
    maxLevel: number;
}


interface EditForm {
    opening: string;
    maxLevel: string;
}


export default () => {
    const { inventorySheet, inventoryLoading, updateInventorySheet } = useSheets();

    const [tableData, setTableData] = useState<InventoryTable[]>([]);
    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState<InventoryTable | null>(null);
    const [editForm, setEditForm] = useState<EditForm>({ opening: '', maxLevel: '' });
    const [saving, setSaving] = useState(false);


    useEffect(() => {
        setTableData(
            inventorySheet.map((i) => ({
                inventoryId: i.inventoryId ?? null,
                uom: i.uom || '-',
                current: Number(i.current || 0),
                status: i.colorCode || 'green',
                indented: Number(i.indented || 0),
                opening: Number(i.opening || 0),
                itemName: i.itemName || 'Unknown Item',
                groupHead: i.groupHead || 'Unknown Group',
                purchaseQuantity: Number(i.purchaseQuantity || 0),
                approved: Number(i.approved || 0),
                storeOut: Number(i.storeOut || 0),
                maxLevel: Number(i.maxLevel || 0),
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
            opening: row.opening ? String(row.opening) : '',
            maxLevel: row.maxLevel ? String(row.maxLevel) : '',
        });
        setEditOpen(true);

    }

    async function handleSave() {
        if (!editRow) return;
        setSaving(true);
        try {
            const payload: any = {
                itemName: editRow.itemName,
                groupHead: editRow.groupHead,
                uom: editRow.uom,
                opening: parseFloat(editForm.opening) || 0,
                maxLevel: editForm.maxLevel ? parseFloat(editForm.maxLevel) : null,
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
        { accessorKey: 'groupHead', header: 'Department Head' },
        { accessorKey: 'opening', header: 'Opening' },

        { accessorKey: 'indented', header: 'Indented' },
        { accessorKey: 'approved', header: 'Approved' },
        { accessorKey: 'purchaseQuantity', header: 'Purchased' },
        { accessorKey: 'storeOut', header: 'Store Out' },
        { accessorKey: 'current', header: 'Current Stock' },

        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const code = (row.original.status || 'green').toLowerCase();
                if (row.original.current <= 0) {
                    return <Pill variant="reject">Out of Stock</Pill>;
                }
                if (code === 'red') {
                    return <Pill variant="pending">Low Stock</Pill>;
                }
                if (code === 'purple') {
                    return <Pill variant="primary">Excess</Pill>;
                }
                return <Pill variant="secondary">In Stock</Pill>;
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
                searchFields={['itemName', 'groupHead', 'uom', 'status']}
                className="h-[80dvh]"
            />

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="w-full max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Edit Inventory</DialogTitle>
                        <DialogDescription>
                            {editRow?.itemName} — {editRow?.groupHead}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-medium">Opening Stock</Label>
                            <Input
                                type="number"
                                value={editForm.opening}
                                onChange={(e) => setEditForm(p => ({ ...p, opening: e.target.value }))}
                                placeholder="Enter opening stock"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-medium">Max Level (optional)</Label>
                            <Input
                                type="number"
                                value={editForm.maxLevel}
                                onChange={(e) => setEditForm(p => ({ ...p, maxLevel: e.target.value }))}
                                placeholder="Enter max stock level"
                            />
                        </div>

                        <Button
                            className="w-full"
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
