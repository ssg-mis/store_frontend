import Heading from '../element/Heading';

import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import type { ColumnDef } from '@tanstack/react-table';
import { Pill } from '../ui/pill';
import { Store } from 'lucide-react';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { fetchInventoryAuditLogs, type InventoryAuditLog } from '@/lib/fetchers';

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

export default () => {
    const { inventorySheet, inventoryLoading, updateInventorySheet } = useSheets();

    const [tableData, setTableData] = useState<InventoryTable[]>([]);
    const [viewOpen, setViewOpen] = useState(false);
    const [viewRow, setViewRow] = useState<InventoryTable | null>(null);
    const [auditLogs, setAuditLogs] = useState<InventoryAuditLog[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        setTableData(
            inventorySheet.map((i) => ({
                inventoryId: i.inventoryId || (i as any).id || null,
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
            })).reverse()
        );
    }, [inventorySheet]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            updateInventorySheet(true);
        }, 5000);
        return () => clearInterval(intervalId);
    }, [updateInventorySheet]);

    async function openViewDialog(row: InventoryTable) {
        setViewRow(row);
        setViewOpen(true);
        setAuditLogs([]);

        if (!row.inventoryId) {
            toast.error('No inventory record found for this item');
            return;
        }

        setAuditLoading(true);
        try {
            const logs = await fetchInventoryAuditLogs(row.inventoryId);
            setAuditLogs(logs);
        } catch {
            toast.error('Failed to load inventory history');
        } finally {
            setAuditLoading(false);
        }
    }

    const formatDate = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
    };

    const columns: ColumnDef<InventoryTable>[] = [
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openViewDialog(row.original)}
                >
                    View
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

            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Inventory History</DialogTitle>
                        <DialogDescription>
                            {viewRow?.itemName} {viewRow?.uom ? `(${viewRow.uom})` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {auditLoading ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading history...</div>
                        ) : auditLogs.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                No inventory history recorded yet. New inventory actions will appear here.
                            </div>
                        ) : (
                            auditLogs.map((log) => (
                                <div key={log.id} className="rounded-sm border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-medium">
                                            {log.action} {Math.abs(Number(log.quantity || 0))} {log.uom || viewRow?.uom || ''}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {log.action} by {log.userName || 'Unknown user'}
                                        {log.indentNumber ? ` for ${log.indentNumber}` : ''}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
