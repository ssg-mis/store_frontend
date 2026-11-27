import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { IndentLink, POLink } from './EntityLinks';
import { AttachmentThumb } from './AttachmentPreview';
import { formatDate } from '@/lib/utils';
import type { InventoryHistory } from '@/lib/fetchers';
import UomText from './UomText';

type Received = InventoryHistory['received'][number];
type StoreOut = InventoryHistory['storeOut'][number];

const showDate = (v?: string | null) => (v ? formatDate(new Date(v)) : '—');
const num = (v?: number | null) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
export const slipNo = (id: number) => `SOS-${String(id).padStart(5, '0')}`;

const linkBtn = 'font-semibold text-primary underline decoration-dotted underline-offset-4 hover:text-primary/70 cursor-pointer';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="flex gap-2 text-sm">
            <span className="w-36 shrink-0 text-muted-foreground">{k}</span>
            <span className="font-medium break-words">{v || '—'}</span>
        </div>
    );
}

const esc = (v: unknown) => String(v ?? '—').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function printSlip(r: StoreOut, item: string) {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const rows: [string, unknown][] = [
        ['Slip No', slipNo(r.id)], ['Date', showDate(r.date)], ['Firm', r.firm], ['Indent No', r.indentNumber],
        ['Material', r.product || item], ['Specifications', r.specifications], ['Issued Qty', `${num(r.quantity)} ${r.uom || ''}`],
        ['Department', r.department], ['Dept. Head', r.departmentHead], ['Issued To (Indenter)', r.indenter],
        ['Area of Use', r.areaOfUse], ['Approved By', r.approvedBy], ['Status', r.status],
    ];
    w.document.write(`<html><head><title>${slipNo(r.id)}</title><style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111}h2{text-align:center;margin:0 0 4px}p.s{text-align:center;margin:0 0 20px;color:#555}
        table{width:100%;border-collapse:collapse}td{border:1px solid #999;padding:8px 10px;font-size:14px}td:first-child{width:35%;background:#f4f4f4;font-weight:600}
        .sig{display:flex;justify-content:space-between;margin-top:70px;font-size:13px}.sig div{border-top:1px solid #333;padding-top:6px;width:30%;text-align:center}
        </style></head><body><h2>STORE OUT SLIP</h2><p class="s">Material Issue Note</p>
        <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
        <div class="sig"><div>Issued By (Store)</div><div>Approved By</div><div>Received By</div></div>
        <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
}

function SlipDialog({ row, item, onClose }: { row: StoreOut | null; item: string; onClose: () => void }) {
    return (
        <Dialog open={!!row} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Store Out Slip {row ? `— ${slipNo(row.id)}` : ''}</DialogTitle>
                    <DialogDescription className="sr-only">Material issue slip</DialogDescription>
                </DialogHeader>
                {row && (
                    <div className="space-y-2 rounded-md border p-4">
                        <Row k="Date" v={showDate(row.date)} />
                        <Row k="Firm" v={row.firm} />
                        <Row k="Indent No" v={<IndentLink value={row.indentNumber} />} />
                        <Row k="Material" v={row.product || item} />
                        <Row k="Specifications" v={row.specifications} />
                        <Row k="Issued Qty" v={`${num(row.quantity)} ${row.uom || ''}`} />
                        <Row k="Department" v={row.department} />
                        <Row k="Dept. Head" v={row.departmentHead} />
                        <Row k="Issued To" v={row.indenter} />
                        <Row k="Area of Use" v={row.areaOfUse} />
                        <Row k="Approved By" v={row.approvedBy} />
                        <Row k="Status" v={row.status} />
                    </div>
                )}
                <Button onClick={() => row && printSlip(row, item)}><Printer className="mr-1 h-4 w-4" /> Print Slip</Button>
            </DialogContent>
        </Dialog>
    );
}

function GrnDialog({ row, onClose }: { row: Received | null; onClose: () => void }) {
    return (
        <Dialog open={!!row} onOpenChange={o => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>GRN {row?.grnNumber || ''}</DialogTitle>
                    <DialogDescription className="sr-only">Goods receipt details</DialogDescription>
                </DialogHeader>
                {row && (
                    <div className="space-y-2 rounded-md border p-4">
                        <Row k="Date" v={showDate(row.date)} />
                        <Row k="PO No" v={<POLink value={row.poNumber} />} />
                        <Row k="Indent No" v={<IndentLink value={row.indentNumber} />} />
                        <Row k="Vendor" v={row.vendor} />
                        <Row k="OK Qty" v={`${num(row.okQuantity)} ${row.uom || ''}`} />
                        <Row k="Damaged / Returned" v={`${num(row.damagedQuantity)} / ${num(row.purchaseReturn)}`} />
                        <Row k="Receive Type" v={row.receiveType} />
                        <Row k="Bill No" v={row.billNumber} />
                        <Row k="Remark" v={row.remark} />
                        <div className="flex gap-6 pt-1">
                            <div><p className="mb-1 text-xs text-muted-foreground">Bill</p><AttachmentThumb url={row.billPhoto} /></div>
                            <div><p className="mb-1 text-xs text-muted-foreground">Item Photo</p><AttachmentThumb url={row.itemPhoto} /></div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default function ItemLedger({ data }: { data: InventoryHistory }) {
    const [side, setSide] = useState<'in' | 'out'>('in');
    const [grn, setGrn] = useState<Received | null>(null);
    const [slip, setSlip] = useState<StoreOut | null>(null);
    const uom = data.item.uom;
    const totalIn = data.received.reduce((t, r) => t + Number(r.okQuantity || 0), 0);
    const totalOut = data.storeOut.reduce((t, r) => t + Number(r.quantity || 0), 0);

    const tabBtn = (k: 'in' | 'out', label: string, count: number, tone: string) => (
        <button
            type="button"
            onClick={() => setSide(k)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${side === k ? tone : 'text-muted-foreground hover:bg-muted'}`}
        >
            {label} <span className="ml-1 text-xs opacity-80">({count})</span>
        </button>
    );

    return (
        <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                {tabBtn('in', 'IN (Received)', data.received.length, 'bg-green-600 text-white')}
                {tabBtn('out', 'OUT (Store Out)', data.storeOut.length, 'bg-red-600 text-white')}
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-md border">
                {side === 'in' ? (
                    data.received.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing received yet.</p> : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-muted">
                                <TableRow>
                                    {['Date', 'GRN No', 'PO No', 'Indent', 'Vendor', 'Bill No'].map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                                    <TableHead className="text-xs text-right whitespace-nowrap">IN Qty</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.received.map((r, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="text-xs whitespace-nowrap">{showDate(r.date)}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                            {r.grnNumber ? <button type="button" className={linkBtn} onClick={() => setGrn(r)}>{r.grnNumber}</button> : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap"><POLink value={r.poNumber} /></TableCell>
                                        <TableCell className="text-xs whitespace-nowrap"><IndentLink value={r.indentNumber} /></TableCell>
                                        <TableCell className="text-xs">{r.vendor || '—'}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">{r.billNumber || '—'}</TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-green-700 tabular-nums">+{num(r.okQuantity)} <UomText uom={r.uom} inline /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow><TableCell colSpan={6} className="text-xs font-semibold">Total IN</TableCell><TableCell className="text-right text-xs font-bold tabular-nums">{num(totalIn)} <UomText uom={uom} inline /></TableCell></TableRow>
                            </TableFooter>
                        </Table>
                    )
                ) : (
                    data.storeOut.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No store out yet.</p> : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-muted">
                                <TableRow>
                                    {['Date', 'Store Out Slip', 'Indent', 'Department', 'Issued To', 'Approved By'].map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                                    <TableHead className="text-xs text-right whitespace-nowrap">OUT Qty</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.storeOut.map((r, i) => (
                                    <TableRow key={r.id ?? i}>
                                        <TableCell className="text-xs whitespace-nowrap">{showDate(r.date)}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                            <button type="button" className={linkBtn} onClick={() => setSlip(r)}>{slipNo(r.id)}</button>
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap"><IndentLink value={r.indentNumber} /></TableCell>
                                        <TableCell className="text-xs">{r.department || '—'}</TableCell>
                                        <TableCell className="text-xs">{r.indenter || '—'}</TableCell>
                                        <TableCell className="text-xs">{r.approvedBy || '—'}</TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-red-600 tabular-nums">−{num(r.quantity)} <UomText uom={r.uom} inline /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow><TableCell colSpan={6} className="text-xs font-semibold">Total OUT</TableCell><TableCell className="text-right text-xs font-bold tabular-nums">{num(totalOut)} <UomText uom={uom} inline /></TableCell></TableRow>
                            </TableFooter>
                        </Table>
                    )
                )}
            </div>

            <GrnDialog row={grn} onClose={() => setGrn(null)} />
            <SlipDialog row={slip} item={data.item.itemName} onClose={() => setSlip(null)} />
        </div>
    );
}
