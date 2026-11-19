import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { POLink, VendorLink } from '../element/EntityLinks';
import { Progress, StatusBadge, fmtDate, fmtMoney, fmtQty } from './DetailKit';
import { formatFirmName } from '@/lib/utils';

export interface POSummary {
    poNumber: string; poDate: string; vendor: string; firm: string; status: string; itemCount: number;
    totalAmount: number; ordered: number; received: number; percent: number; grns: string[]; products: string[];
}

export default function POTable({ pos, hideVendor }: { pos: POSummary[]; hideVendor?: boolean }) {
    if (!pos.length) return <p className="p-6 text-center text-sm text-muted-foreground">No purchase orders yet.</p>;
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader className="bg-muted/40">
                    <TableRow>
                        <TableHead>PO No</TableHead>
                        <TableHead>PO Date</TableHead>
                        {!hideVendor && <TableHead>Vendor</TableHead>}
                        <TableHead>Firm</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Ordered</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>GRN</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pos.map((p) => (
                        <TableRow key={p.poNumber}>
                            <TableCell><POLink value={p.poNumber} /></TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(p.poDate)}</TableCell>
                            {!hideVendor && <TableCell><VendorLink value={p.vendor} /></TableCell>}
                            <TableCell>{formatFirmName(p.firm || '')}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(p.totalAmount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQty(p.ordered)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQty(p.received)}</TableCell>
                            <TableCell><Progress percent={p.percent} /></TableCell>
                            <TableCell className="text-xs">{p.grns.length ? p.grns.join(', ') : '—'}</TableCell>
                            <TableCell><StatusBadge status={p.status} /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
