import { useEffect, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { FileDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Pill } from '../ui/pill';
import { fetchInventoryHistory, type InventoryHistory } from '@/lib/fetchers';
import { formatDate } from '@/lib/utils';

// `value` renders the cell; `excel` (optional) is the plain value used in the Excel export.
type Column<T> = { header: string; value: (row: T) => ReactNode; excel?: (row: T) => string | number | null | undefined; align?: 'right' };

const fileLink = (url: string | null | undefined, label: string) =>
    url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{label}</a>
    ) : '—';

const showDate = (value?: string | null) => (value ? formatDate(new Date(value)) : '—');
const showNum = (value?: number | null) => (value == null ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
const showMoney = (value?: number | null) =>
    value == null ? '—' : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function HistoryTable<T>({ rows, columns, empty }: { rows: T[]; columns: Column<T>[]; empty: string }) {
    if (rows.length === 0) {
        return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;
    }
    return (
        <div className="max-h-[45vh] overflow-auto rounded-md border">
            <Table>
                <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                        {columns.map(c => (
                            <TableHead key={c.header} className={`text-xs whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={i}>
                            {columns.map(c => (
                                <TableCell key={c.header} className={`text-xs whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                                    {c.value(row) ?? '—'}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

type H = InventoryHistory;
const poColumns: Column<H['purchaseOrders'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'PO Number', value: r => r.poNumber },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'Vendor', value: r => r.vendor },
    { header: 'Qty', value: r => `${showNum(r.quantity)} ${r.unit || ''}`, align: 'right' },
    { header: 'Rate', value: r => showMoney(r.rate), align: 'right' },
    { header: 'GST %', value: r => (r.gstPercent != null ? `${r.gstPercent}%` : '—'), align: 'right' },
    { header: 'Amount', value: r => showMoney(r.amount), align: 'right' },
    { header: 'PO PDF', value: r => fileLink(r.pdf, 'View PDF'), excel: r => r.pdf || '' },
];
const receivedColumns: Column<H['received'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'GRN', value: r => r.grnNumber },
    { header: 'PO Number', value: r => r.poNumber },
    { header: 'Vendor', value: r => r.vendor },
    { header: 'OK Qty', value: r => showNum(r.okQuantity), align: 'right' },
    { header: 'Damaged', value: r => showNum(r.damagedQuantity), align: 'right' },
    { header: 'Returned', value: r => showNum(r.purchaseReturn), align: 'right' },
    { header: 'Type', value: r => (r.receiveType === 'Full' ? 'Fully' : r.receiveType === 'Partial' ? 'Partially' : '—') },
    { header: 'Bill No.', value: r => r.billNumber },
    { header: 'Remark', value: r => r.remark },
    { header: 'Bill', value: r => fileLink(r.billPhoto, 'View'), excel: r => r.billPhoto || '' },
    { header: 'Item Photo', value: r => fileLink(r.itemPhoto, 'View'), excel: r => r.itemPhoto || '' },
];
const storeOutColumns: Column<H['storeOut'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'Issued Qty', value: r => showNum(r.quantity), align: 'right' },
    { header: 'Department', value: r => r.department },
    { header: 'Requested By', value: r => r.indenter },
    { header: 'Approved By', value: r => r.approvedBy },
    { header: 'Status', value: r => r.status },
];
const loanColumns: Column<H['loans'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'Qty', value: r => showNum(r.quantity), align: 'right' },
    { header: 'User', value: r => r.user },
    { header: 'Approved By', value: r => r.approvedBy },
    { header: 'Status', value: r => r.status },
];
const indentColumns: Column<H['indents'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Indent', value: r => r.productCode || r.indentNumber },
    { header: 'Current Stage', value: r => r.stage },
    { header: 'Type', value: r => r.indentType },
    { header: 'Indenter', value: r => r.indenter },
    { header: 'Department', value: r => r.department },
    { header: 'Qty', value: r => `${showNum(r.quantity)} ${r.uom || ''}`, align: 'right' },
    { header: 'Approved Qty', value: r => showNum(r.approvedQuantity), align: 'right' },
    { header: 'Vendor Type', value: r => (r.vendorType === 'Three Party' ? 'Multi-Party' : r.vendorType) },
];
const quoteColumns: Column<H['quotes'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'Vendor', value: r => r.vendor },
    { header: 'Rate', value: r => showMoney(r.rate), align: 'right' },
    { header: 'Payment Term', value: r => r.paymentTerm },
    { header: 'Delivery (days)', value: r => showNum(r.deliveryTime), align: 'right' },
    { header: 'Result', value: r => (r.approved ? '✔ Approved' : '—') },
];
const rfqColumns: Column<H['rfq'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Quotation No.', value: r => r.quotationNumber },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'Supplier', value: r => r.supplier },
    { header: 'Qty', value: r => `${r.quantity ?? '—'} ${r.unit || ''}`, align: 'right' },
];
const priceColumns: Column<H['priceList'][number]>[] = [
    { header: 'Vendor', value: r => r.vendor },
    { header: 'Price', value: r => showMoney(r.price), align: 'right' },
    { header: 'UOM', value: r => r.uom },
    { header: 'Valid From', value: r => showDate(r.validFrom) },
    { header: 'Valid Upto', value: r => showDate(r.validUpto) },
    { header: 'Status', value: r => (r.valid ? 'Valid' : 'Expired') },
];
const activityColumns: Column<H['activity'][number]>[] = [
    { header: 'Date', value: r => showDate(r.date) },
    { header: 'Action', value: r => r.action },
    { header: 'Qty', value: r => showNum(r.quantity), align: 'right' },
    { header: 'Indent', value: r => r.indentNumber },
    { header: 'User', value: r => r.user },
    { header: 'Department Head', value: r => r.departmentHead },
];

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' }) {
    const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-600' : 'text-foreground';
    return (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground truncate" title={sub}>{sub}</p>}
        </div>
    );
}


const monthKey = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 7) : '');
const monthLabel = (k: string) => new Date(`${k}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

function Field({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-medium break-words">{value || '—'}</p>
        </div>
    );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-lg border">
            <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="p-4">{children}</div>
        </div>
    );
}

function Bars({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
    const max = Math.max(...rows.map(r => r.value), 1);
    if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
    return (
        <div className="space-y-1.5">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" title={r.sub}>
                    <span className="w-28 shrink-0 truncate text-muted-foreground">{r.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmt(r.value)}</span>
                </div>
            ))}
        </div>
    );
}

function Overview({ data }: { data: H }) {
    const { item, summary, rates } = data;
    const lastIndent = data.indents[0];
    const lastReceipt = data.received[0];
    const lastPo = data.purchaseOrders[0];
    const lastOut = data.storeOut[0];
    const lastLoan = data.loans[0];

    // Monthly: received (OK qty) vs store out, last 6 months with activity
    const monthly = new Map<string, { inQty: number; outQty: number }>();
    data.received.forEach(r => { const k = monthKey(r.date); if (k) monthly.set(k, { inQty: (monthly.get(k)?.inQty || 0) + Number(r.okQuantity || 0), outQty: monthly.get(k)?.outQty || 0 }); });
    data.storeOut.forEach(r => { const k = monthKey(r.date); if (k) monthly.set(k, { inQty: monthly.get(k)?.inQty || 0, outQty: (monthly.get(k)?.outQty || 0) + Number(r.quantity || 0) }); });
    const months = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

    // Rate trend (oldest -> newest, last 8 POs)
    const rateTrend = [...data.purchaseOrders].filter(p => p.rate > 0).reverse().slice(-8)
        .map(p => ({ label: showDate(p.date), value: Number(p.rate), sub: `${p.vendor} • ${p.poNumber}` }));

    // Vendor share by PO value
    const vendorMap = new Map<string, number>();
    data.purchaseOrders.forEach(p => vendorMap.set(p.vendor || '—', (vendorMap.get(p.vendor || '—') || 0) + Number(p.amount || 0)));
    const vendors = [...vendorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));

    return (
        <div className="space-y-4">
            <Panel title="Material Description">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Field label="Item Name" value={item.itemName} />
                    <Field label="Category" value={item.category} />
                    <Field label="Sub Category" value={item.subCategory} />
                    <Field label="UOM" value={item.uom} />
                    <Field label="Specifications" value={item.specifications} />
                    <Field label="Product Groups" value={item.productGroups?.map(g => g.name).filter(Boolean).join(', ')} />
                    <Field label="Other UOMs" value={item.additionalUoms?.map(u => `${u.uomName}${u.conversionToBase ? ` (${u.conversionToBase})` : ''}`).join(', ')} />
                    <Field label="Firm" value={item.firm} />
                    <Field label="Department" value={item.department} />
                    <Field label="Department Head" value={item.departmentHead} />
                    <Field label="Added On" value={showDate(item.createdAt)} />
                    <Field label="Current Stock" value={`${showNum(summary.current)} ${item.uom}`} />
                </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Panel title="Last Purchase">
                    <div className="space-y-2">
                        <Field label="Date" value={showDate(lastReceipt?.date || lastPo?.date)} />
                        <Field label="Qty" value={lastReceipt ? `${showNum(lastReceipt.okQuantity)} ${lastReceipt.uom || item.uom}` : lastPo ? `${showNum(lastPo.quantity)} ${lastPo.unit} (ordered)` : null} />
                        <Field label="Vendor" value={rates.last?.vendor || lastReceipt?.vendor} />
                        <Field label="Rate" value={rates.last ? showMoney(rates.last.rate) : null} />
                        <Field label="PO / GRN" value={[lastPo?.poNumber, lastReceipt?.grnNumber].filter(Boolean).join(' • ')} />
                    </div>
                </Panel>
                <Panel title="Last Indent">
                    <div className="space-y-2">
                        <Field label="Date" value={showDate(lastIndent?.date)} />
                        <Field label="Qty" value={lastIndent ? `${showNum(lastIndent.quantity)} ${lastIndent.uom || ''}` : null} />
                        <Field label="Indent" value={lastIndent?.productCode || lastIndent?.indentNumber} />
                        <Field label="Indenter" value={lastIndent ? `${lastIndent.indenter || '—'}${lastIndent.department ? ` (${lastIndent.department})` : ''}` : null} />
                        <Field label="Stage" value={lastIndent?.stage} />
                    </div>
                </Panel>
                <Panel title="Last Store Out / Loan">
                    <div className="space-y-2">
                        <Field label="Store Out Date" value={showDate(lastOut?.date)} />
                        <Field label="Store Out Qty" value={lastOut ? showNum(lastOut.quantity) : null} />
                        <Field label="Issued To" value={lastOut?.indenter} />
                        <Field label="Last Loan" value={lastLoan ? `${showNum(lastLoan.quantity)} • ${showDate(lastLoan.date)}` : null} />
                    </div>
                </Panel>
                <Panel title="Rates">
                    <div className="space-y-2">
                        <Field label="Last Rate" value={showMoney(rates.last?.rate)} />
                        <Field label="Average Rate" value={showMoney(rates.average)} />
                        <Field label="Lowest / Highest" value={rates.purchaseCount ? `${showMoney(rates.lowest)} / ${showMoney(rates.highest)}` : null} />
                        <Field label="Total Purchases" value={String(rates.purchaseCount)} />
                        <Field label="Pending Receipt" value={showNum(summary.onOrder)} />
                    </div>
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Monthly Received (last 6 months)">
                    <Bars rows={months.map(([k, v]) => ({ label: monthLabel(k), value: v.inQty }))} fmt={showNum} />
                </Panel>
                <Panel title="Monthly Store Out (last 6 months)">
                    <Bars rows={months.map(([k, v]) => ({ label: monthLabel(k), value: v.outQty }))} fmt={showNum} />
                </Panel>
                <Panel title="Rate Trend (recent POs)">
                    <Bars rows={rateTrend} fmt={showMoney} />
                </Panel>
            </div>

            <Panel title="Vendor-wise Purchase Value">
                <Bars rows={vendors} fmt={showMoney} />
            </Panel>
        </div>
    );
}

export type PoContext = { qty: number; unit?: string; rate: number };

// Banner used when the dialog is opened from Create PO: how this PO's rate compares with history.
function PoContextBanner({ ctx, data }: { ctx: PoContext; data: H }) {
    const { last, average, lowest, highest } = data.rates;
    const diff = (base?: number | null) => (base && base > 0 ? ((ctx.rate - base) / base) * 100 : null);
    const Chip = ({ label, base }: { label: string; base?: number | null }) => {
        const d = diff(base);
        if (d == null) return null;
        const tone = d > 0.5 ? 'bg-red-100 text-red-700' : d < -0.5 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600';
        return (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
                {label} {showMoney(base)} · {d > 0 ? '+' : ''}{d.toFixed(1)}%
            </span>
        );
    };
    const beyond = highest != null && ctx.rate > highest ? 'Higher than any earlier purchase' : lowest != null && ctx.rate < lowest ? 'Lower than any earlier purchase' : null;
    return (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">In this PO</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="text-lg font-bold">{showNum(ctx.qty)} {ctx.unit || data.item.uom} <span className="font-normal text-muted-foreground">×</span> {showMoney(ctx.rate)}</p>
                <p className="text-sm text-muted-foreground">= <span className="font-semibold text-foreground">{showMoney(ctx.qty * ctx.rate)}</span></p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                <Chip label="vs last" base={last?.rate} />
                <Chip label="vs average" base={average} />
                {beyond && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">{beyond}</span>}
                {!last && <span className="text-xs text-muted-foreground">No earlier purchase to compare with.</span>}
            </div>
        </div>
    );
}

export default function InventoryHistoryDialog({ inventoryId, onClose, initialScope = 'row', poContext }: { inventoryId: number | null; onClose: () => void; initialScope?: 'row' | 'all'; poContext?: PoContext }) {
    const [scope, setScope] = useState<'row' | 'all'>(initialScope);
    const [data, setData] = useState<InventoryHistory | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (inventoryId == null) {
            setData(null);
            setScope(initialScope);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchInventoryHistory(inventoryId, scope)
            .then(res => { if (!cancelled) setData(res); })
            .catch((err: any) => { if (!cancelled) toast.error(err?.message || 'Failed to load history'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [inventoryId, scope]);

    function exportExcel() {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const sheet = <T,>(name: string, rows: T[], columns: Column<T>[]) => {
            const out = rows.map(r => Object.fromEntries(columns.map(c => [c.header, (c.excel ? c.excel(r) : (c.value(r) as string | number | null)) ?? ''])));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.length ? out : [{ Info: 'No records' }]), name);
        };
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
            Product: data.item.itemName,
            UOM: data.item.uom,
            Scope: data.scope === 'all' ? 'All departments' : `${data.item.departmentHead} / ${data.item.firm || '-'}`,
            'Current Stock': data.summary.current,
            'On Order (pending receipt)': data.summary.onOrder,
            Purchased: data.summary.purchased,
            'Stock In': data.summary.stockIn,
            'Store Out': data.summary.storeOut,
            'Loan Out': data.summary.loanOut,
            'Last Rate': data.rates.last?.rate ?? '',
            'Last Vendor': data.rates.last?.vendor ?? '',
            'Average Rate': data.rates.average != null ? Number(data.rates.average.toFixed(2)) : '',
        }]), 'Summary');
        sheet('Purchase Orders', data.purchaseOrders, poColumns);
        sheet('Store In', data.received, receivedColumns);
        sheet('Store Out', data.storeOut, storeOutColumns);
        sheet('Loans', data.loans, loanColumns);
        sheet('Indents', data.indents, indentColumns);
        sheet('Vendor Quotes', data.quotes, quoteColumns);
        sheet('RFQ Sent', data.rfq, rfqColumns);
        sheet('Price List', data.priceList, priceColumns);
        sheet('Activity Log', data.activity, activityColumns);
        XLSX.writeFile(wb, `History_${data.item.itemName.replace(/[^\w-]+/g, '_')}.xlsx`);
    }

    const tabs = data ? [
        { key: 'overview', label: 'Overview', count: null as number | null, body: <Overview data={data} /> },
        { key: 'po', label: 'Purchase Orders', count: data.purchaseOrders.length, body: <HistoryTable rows={data.purchaseOrders} columns={poColumns} empty="No purchase orders for this product." /> },
        { key: 'in', label: 'Store In', count: data.received.length, body: <HistoryTable rows={data.received} columns={receivedColumns} empty="Nothing received yet." /> },
        { key: 'out', label: 'Store Out', count: data.storeOut.length, body: <HistoryTable rows={data.storeOut} columns={storeOutColumns} empty="No store out yet." /> },
        { key: 'loan', label: 'Loans', count: data.loans.length, body: <HistoryTable rows={data.loans} columns={loanColumns} empty="No loans for this product." /> },
        { key: 'indent', label: 'Indents', count: data.indents.length, body: <HistoryTable rows={data.indents} columns={indentColumns} empty="No indents for this product." /> },
        { key: 'quote', label: 'Vendor Quotes', count: data.quotes.length, body: <HistoryTable rows={data.quotes} columns={quoteColumns} empty="No vendor quotes yet." /> },
        { key: 'rfq', label: 'RFQ Sent', count: data.rfq.length, body: <HistoryTable rows={data.rfq} columns={rfqColumns} empty="No quotation requests sent for this product." /> },
        { key: 'price', label: 'Price List', count: data.priceList.length, body: <HistoryTable rows={data.priceList} columns={priceColumns} empty="No vendor price list entries for this product." /> },
        { key: 'log', label: 'Activity Log', count: data.activity.length, body: <HistoryTable rows={data.activity} columns={activityColumns} empty="No stock activity recorded." /> },
    ] : [];

    return (
        <Dialog open={inventoryId != null} onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className="w-full max-w-[95vw] lg:max-w-6xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Product History — {data?.item.itemName || '…'}</DialogTitle>
                    <DialogDescription>
                        {data
                            ? scope === 'all'
                                ? 'All departments and firms combined'
                                : `${data.item.department} • ${data.item.departmentHead}${data.item.firm ? ` • ${data.item.firm}` : ''}`
                            : 'Loading…'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-md border p-0.5 text-xs">
                        <button type="button" onClick={() => setScope('row')}
                            className={`rounded px-3 py-1 ${scope === 'row' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                            This department
                        </button>
                        <button type="button" onClick={() => setScope('all')}
                            className={`rounded px-3 py-1 ${scope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                            All departments
                        </button>
                    </div>
                    <Button variant="outline" size="sm" onClick={exportExcel} disabled={!data || loading}>
                        <FileDown size={14} className="mr-1" /> Export Excel
                    </Button>
                </div>

                {poContext && data && <PoContextBanner ctx={poContext} data={data} />}

                {loading || !data ? (
                    <div className="flex justify-center py-16"><Loader size={40} color="#3b82f6" /></div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <SummaryCard
                                label="Current Stock"
                                value={`${showNum(data.summary.current)} ${data.item.uom}`}
                                tone={data.summary.current > 0 ? 'green' : 'red'}
                            />
                            <SummaryCard label="On Order" value={showNum(data.summary.onOrder)} sub="Ordered, not yet received" />
                            <SummaryCard label="Purchased (received)" value={showNum(data.summary.purchased)} sub={`Stock In (manual): ${showNum(data.summary.stockIn)}`} />
                            <SummaryCard label="Store Out" value={showNum(data.summary.storeOut)} sub={`Loan Out: ${showNum(data.summary.loanOut)}`} />
                            <SummaryCard
                                label="Last Rate"
                                value={showMoney(data.rates.last?.rate)}
                                sub={data.rates.last ? `${data.rates.last.vendor} • ${showDate(data.rates.last.date)}` : 'Never purchased'}
                            />
                            <SummaryCard
                                label="Average Rate"
                                value={showMoney(data.rates.average)}
                                sub={data.rates.purchaseCount ? `Low ${showMoney(data.rates.lowest)} • High ${showMoney(data.rates.highest)}` : undefined}
                            />
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Pill variant="secondary">Indented: {showNum(data.summary.indented)}</Pill>
                            <Pill variant="secondary">Approved: {showNum(data.summary.approved)}</Pill>
                            <Pill variant="secondary">Purchases: {data.rates.purchaseCount}</Pill>
                        </div>

                        <div className="flex flex-wrap gap-1.5 border-b pb-2">
                            {tabs.map(t => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setActiveTab(t.key)}
                                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                                >
                                    {t.label}
                                    {t.count != null && <span className={`rounded-full px-1.5 text-[10px] ${activeTab === t.key ? 'bg-white/25' : 'bg-muted'}`}>{t.count}</span>}
                                </button>
                            ))}
                        </div>
                        <div>{tabs.find(t => t.key === activeTab)?.body}</div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
