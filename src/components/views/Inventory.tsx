import Heading from '../element/Heading';
import UomText from '../element/UomText';

import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import type { ColumnDef } from '@tanstack/react-table';
import { Pill } from '../ui/pill';
import { Store, PackagePlus } from 'lucide-react';
import StockInView from '../element/StockInView';
import DataTable from '../element/DataTable';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import InventoryHistoryDialog from '../element/InventoryHistoryDialog';
import { fetchInventoryAuditLogs, type InventoryAuditLog } from '@/lib/fetchers';
import { ProductLink } from '../element/EntityLinks';

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
    stockIn: number;
    storeOut: number;
    loanOut: number;
    current: number;
    currentWeight: number;
}



export default () => {
    const { inventorySheet, inventoryLoading, updateInventorySheet } = useSheets();

    const [view, setView] = useState<'inventory' | 'stockin'>('inventory');
    const [tableData, setTableData] = useState<InventoryTable[]>([]);
    const [historyInventoryId, setHistoryInventoryId] = useState<number | null>(null);
    const [viewOpen, setViewOpen] = useState(false);
    const [viewRow, setViewRow] = useState<InventoryTable | null>(null);
    const [viewMovement, setViewMovement] = useState<{ field: 'purchaseQuantity' | 'storeOut' | 'loanOut' | 'stockIn'; label: string } | null>(null);
    const [auditLogs, setAuditLogs] = useState<InventoryAuditLog[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        setTableData(
            inventorySheet.map((i) => ({
                inventoryId: i.inventoryId || (i as any).id || null,
                uom: i.uom || '-',
                current: Number(i.current || 0),
                currentWeight: Number((i as any).currentWeight || 0),
                status: i.colorCode || 'green',
                indented: Number(i.indented || 0),
                itemName: i.itemName || 'Unknown Item',
                departmentHead: i.departmentHead || 'N/A',
                department: i.department || 'N/A',
                purchaseQuantity: Number(i.purchaseQuantity || 0),
                approved: Number(i.approved || 0),
                stockIn: Number(i.stockIn || 0),
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

    async function openViewDialog(
        row: InventoryTable,
        movement?: { field: 'purchaseQuantity' | 'storeOut' | 'loanOut' | 'stockIn'; label: string }
    ) {
        setViewRow(row);
        setViewMovement(movement || null);
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

    const movementLogs = viewMovement
        ? auditLogs.filter((log) => log.metadata?.field === viewMovement.field)
        : auditLogs;

    const renderMovementLink = (
        row: InventoryTable,
        field: 'purchaseQuantity' | 'storeOut' | 'loanOut' | 'stockIn',
        label: string
    ) => {
        const value = Number(row[field] || 0);
        return (
            <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-muted-foreground disabled:no-underline"
                disabled={value === 0}
                onClick={() => openViewDialog(row, { field, label })}
            >
                {value}
            </button>
        );
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
                    disabled={row.original.inventoryId == null}
                    onClick={() => setHistoryInventoryId(row.original.inventoryId)}
                >
                    View
                </Button>
            ),
        },
        {
            accessorKey: 'itemName',
            header: 'Item',
            cell: ({ row }) => (
                <div className="text-wrap max-w-40 text-center"><ProductLink value={row.original.itemName} /></div>
            ),
        },
        { accessorKey: 'uom', header: 'UOM', cell: ({ getValue }: any) => <UomText uom={getValue()} /> },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'departmentHead', header: 'Dept Head' },
        { accessorKey: 'indented', header: 'Indented' },
        { accessorKey: 'approved', header: 'Approved' },
        {
            accessorKey: 'purchaseQuantity',
            header: 'Purchased',
            cell: ({ row }) => renderMovementLink(row.original, 'purchaseQuantity', 'Purchased'),
        },
        {
            accessorKey: 'stockIn',
            header: 'Stock In',
            cell: ({ row }) => renderMovementLink(row.original, 'stockIn', 'Stock In'),
        },
        {
            accessorKey: 'storeOut',
            header: 'Store Out',
            cell: ({ row }) => renderMovementLink(row.original, 'storeOut', 'Store Out'),
        },
        {
            accessorKey: 'loanOut',
            header: 'Loan Out',
            cell: ({ row }) => renderMovementLink(row.original, 'loanOut', 'Loan Out'),
        },
        { accessorKey: 'current', header: 'Stock' },
        {
            accessorKey: 'currentWeight',
            header: 'Stock (kg)',
            cell: ({ row }) => (row.original.currentWeight ? `${Math.round(row.original.currentWeight * 1000) / 1000} kg` : '—'),
        },
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
            <InventoryHistoryDialog inventoryId={historyInventoryId} onClose={() => setHistoryInventoryId(null)} />
            <div className="relative">
                <Heading heading={view === 'stockin' ? 'Stock In' : 'Inventory'} subtext={view === 'stockin' ? 'All stock received (GRN) and added manually' : 'View inventory'}>
                    <Store size={50} className="text-primary" />
                </Heading>
                <div className="absolute right-16 top-1/2 -translate-y-1/2 inline-flex rounded-md border bg-background p-0.5 text-xs shadow-sm">
                    <button type="button" onClick={() => setView('inventory')}
                        className={`rounded px-3 py-1.5 font-medium ${view === 'inventory' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                        Inventory
                    </button>
                    <button type="button" onClick={() => setView('stockin')}
                        className={`inline-flex items-center gap-1 rounded px-3 py-1.5 font-medium ${view === 'stockin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                        <PackagePlus size={13} /> Stock In
                    </button>
                </div>
            </div>

            {view === 'stockin' ? (
                <StockInView />
            ) : (
                <DataTable
                    data={tableData}
                    columns={columns}
                    dataLoading={inventoryLoading}
                    searchFields={['itemName', 'departmentHead', 'department', 'uom', 'status']}
                    className="h-[80dvh]"
                />
            )}

            <Dialog open={viewOpen} onOpenChange={(open) => {
                setViewOpen(open);
                if (!open) setViewMovement(null);
            }}>
                <DialogContent className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewMovement ? `${viewMovement.label} History` : 'Inventory History'}</DialogTitle>
                        <DialogDescription>
                            {viewRow?.itemName} {viewRow?.uom ? `(${viewRow.uom})` : ''}
                        </DialogDescription>
                    </DialogHeader>



                    <div className="space-y-3 py-2">
                        {auditLoading ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading history...</div>
                        ) : movementLogs.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                {viewMovement
                                    ? `No ${viewMovement.label.toLowerCase()} history recorded for this item yet.`
                                    : 'No inventory history recorded yet. New inventory actions will appear here.'}
                            </div>
                        ) : (
                            movementLogs.map((log) => (
                                <div key={log.id} className="rounded-sm border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-medium">
                                            {log.action} {Math.abs(Number(log.quantity || 0))} <UomText uom={log.uom || viewRow?.uom || ''} inline />
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
