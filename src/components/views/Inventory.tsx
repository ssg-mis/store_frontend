import Heading from '../element/Heading';

import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import type { ColumnDef } from '@tanstack/react-table';
import { Pill } from '../ui/pill';
import { Store } from 'lucide-react';
import DataTable from '../element/DataTable';

interface InventoryTable {
    itemName: string;
    groupHead: string;
    uom: string;
    status: string;
    opening: number;
    rate: number;
    indented: number;
    approved: number;
    purchaseQuantity: number;
    outQuantity: number;
    current: number;
    totalPrice: number;
}

export default () => {
    const { inventorySheet, inventoryLoading, updateInventorySheet } = useSheets();

    const [tableData, setTableData] = useState<InventoryTable[]>([]);

    useEffect(() => {
        setTableData(
            inventorySheet.map((i) => ({
                totalPrice: Number(i.totalPrice || 0),
                approvedIndents: Number(i.approved || 0),
                uom: i.uom || '-',
                rate: Number(i.individualRate || 0),
                current: Number(i.current || 0),
                status: i.colorCode || 'green',
                indented: Number(i.indented || 0),
                opening: Number(i.opening || 0),
                itemName: i.itemName || 'Unknown Item',
                groupHead: i.groupHead || 'Unknown Group',
                purchaseQuantity: Number(i.purchaseQuantity || 0),
                approved: Number(i.approved || 0),
                outQuantity: Number(i.outQuantity || 0),
            }))
            .reverse()
        );
    }, [inventorySheet]);
    useEffect(() => {
        const intervalId = setInterval(() => {
            updateInventorySheet(true);
        }, 5000); // 5 seconds

        return () => clearInterval(intervalId);
    }, [updateInventorySheet]);
    const columns: ColumnDef<InventoryTable>[] = [
        {
            accessorKey: 'itemName',
            header: 'Item',
            cell: ({ row }) => {
                return (
                    <div className="text-wrap max-w-40 text-center">{row.original.itemName}</div>
                );
            },
        },
        { accessorKey: 'groupHead', header: 'Group Head' },
        { accessorKey: 'uom', header: 'UOM' },
        {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => {
                return <>&#8377;{Number(row.original.rate).toFixed(2)}</>;
            },
        },
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
        { accessorKey: 'indented', header: 'Indented' },
        { accessorKey: 'approved', header: 'Approved' },
        { accessorKey: 'purchaseQuantity', header: 'Purchased' },
        { accessorKey: 'outQuantity', header: 'Issued' },
        { accessorKey: 'current', header: 'Current Stock' },
        {
            accessorKey: 'totalPrice',
            header: 'Total Price',
            cell: ({ row }) => {
                return <>&#8377;{Number(row.original.totalPrice).toFixed(2)}</>;
            },
        },
    ];

    return (
        <div>
            <Heading heading="Inventory" subtext="View inveontory">
                <Store size={50} className="text-primary" />
            </Heading>

            <DataTable
                data={tableData}
                columns={columns}
                dataLoading={inventoryLoading}
                searchFields={['itemName', 'groupHead', 'uom', 'status']}
                className="h-[80dvh]"
            />
        </div>
    );
};
