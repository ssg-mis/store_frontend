import { cn } from '@/lib/utils';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const fmtQ = (n?: number | null) => (n == null || !Number.isFinite(n) ? '—' : r3(n).toLocaleString('en-IN'));

// balance = PO qty − (already received + receiving now). >0 short, <0 extra, 0 matches.
export const qtyBalance = (poQty: number, receivedBefore: number, receivingNow: number) =>
    r3((Number(poQty) || 0) - (Number(receivedBefore) || 0) - (Number(receivingNow) || 0));

export function QtyStatusChip({ balance, uom, className }: { balance: number; uom?: string; className?: string }) {
    const u = uom ? ` ${uom}` : '';
    const tone = balance === 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : balance > 0 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200';
    const label = balance === 0 ? '✓ Matches PO' : balance > 0 ? `Short ${fmtQ(balance)}${u}` : `Extra ${fmtQ(Math.abs(balance))}${u}`;
    return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tone, className)}>{label}</span>;
}
