import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from './DataTable';
import { Button } from '../ui/button';
import { Pill } from '../ui/pill';
import { IndentLink, POLink, ProductLink } from './EntityLinks';
import { fetchStockInList, type StockInRow } from '@/lib/fetchers';
import { formatDate } from '@/lib/utils';

const num = (v: number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function StockInView() {
    const [rows, setRows] = useState<StockInRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        fetchStockInList()
            .then(r => { if (alive) setRows(r); })
            .catch((e: any) => toast.error(e?.message || 'Failed to load stock in'))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const columns = useMemo<ColumnDef<StockInRow>[]>(() => [
        { accessorKey: 'date', header: 'Date', cell: ({ row }) => formatDate(new Date(row.original.date)) },
        {
            accessorKey: 'item',
            header: 'Item',
            cell: ({ row }) => (
                <div className="w-[240px] max-w-[240px] whitespace-normal break-words leading-snug">
                    <ProductLink value={row.original.item} />
                </div>
            ),
        },
        {
            accessorKey: 'quantity',
            header: 'Qty In',
            cell: ({ row }) => <span className="font-semibold text-green-700">+{num(row.original.quantity)} {row.original.uom || ''}</span>,
        },
        { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Pill variant={row.original.type === 'GRN' ? 'secondary' : 'primary'}>{row.original.type === 'GRN' ? 'GRN' : 'Manual'}</Pill> },
        { accessorKey: 'grnNumber', header: 'GRN No', cell: ({ row }) => row.original.grnNumber || '—' },
        { accessorKey: 'poNumber', header: 'PO No', cell: ({ row }) => <POLink value={row.original.poNumber} /> },
        { accessorKey: 'indentNumber', header: 'Indent', cell: ({ row }) => <IndentLink value={row.original.indentNumber} /> },
        { accessorKey: 'vendor', header: 'Vendor', cell: ({ row }) => row.original.vendor || '—' },
        { accessorKey: 'billNumber', header: 'Bill No', cell: ({ row }) => row.original.billNumber || '—' },
        { accessorKey: 'department', header: 'Department', cell: ({ row }) => row.original.department || '—' },
        { accessorKey: 'firm', header: 'Firm', cell: ({ row }) => row.original.firm || '—' },
        { accessorKey: 'remark', header: 'Remark / By', cell: ({ row }) => [row.original.remark, row.original.by].filter(Boolean).join(' • ') || '—' },
    ], []);

    const exportExcel = () => {
        const out = rows.map(r => ({
            Date: formatDate(new Date(r.date)), Item: r.item, 'Qty In': r.quantity, UOM: r.uom || '', Type: r.type,
            'GRN No': r.grnNumber || '', 'PO No': r.poNumber || '', Indent: r.indentNumber || '', Vendor: r.vendor || '',
            'Bill No': r.billNumber || '', Department: r.department || '', Firm: r.firm || '', Remark: r.remark || '', 'Added By': r.by || '',
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.length ? out : [{ Info: 'No records' }]), 'Stock In');
        XLSX.writeFile(wb, 'Stock_In.xlsx');
    };

    return (
        <DataTable
            data={rows}
            columns={columns}
            dataLoading={loading}
            searchFields={['item', 'grnNumber', 'poNumber', 'indentNumber', 'vendor', 'department']}
            className="h-[80dvh] [&_th]:!text-left [&_td]:!text-left"
            extraActions={
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
                    <FileDown size={14} className="mr-1" /> Export Excel
                </Button>
            }
        />
    );
}
