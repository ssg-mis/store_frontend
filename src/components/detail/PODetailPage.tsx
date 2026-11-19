import { useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { fetchPODetail } from '@/lib/fetchers';
import { IndentLink, ProductLink, VendorLink } from '../element/EntityLinks';
import { Badge, DetailPage, Field, FieldGrid, Progress, Section, Stat, StatusBadge, StockChip, dash, fmtDate, fmtDateTime, fmtMoney, fmtQty, useDetail } from './DetailKit';
import { formatFirmName } from '@/lib/utils';

const API = import.meta.env.VITE_API_BASE_URL;

export default function PODetailPage() {
    const { poNumber = '' } = useParams();
    const { data, loading, error } = useDetail<any>(() => fetchPODetail(poNumber), [poNumber]);

    return (
        <DetailPage
            kind="Purchase Order"
            title={poNumber}
            loading={loading}
            error={error}
            subtitle={data && <><StatusBadge status={data.status} /><span>{formatFirmName(data.firm || '')}</span><span>· {fmtDate(data.poDate)}</span></>}
            actions={data?.hasPdf && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(`${API}/po/pdf/${encodeURIComponent(poNumber)}`, '_blank', 'noopener')}>
                    <ExternalLink className="h-4 w-4" /> PO PDF
                </Button>
            )}
        >
            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                        <Stat label="PO Amount" value={fmtMoney(data.totalAmount)} />
                        <Stat label="Ordered Qty" value={fmtQty(data.progress.ordered)} />
                        <Stat label="Received Qty" value={fmtQty(data.progress.received)} tone="green" />
                        <Stat label="Balance Qty" value={fmtQty(Math.max(0, data.progress.ordered - data.progress.received))} tone={data.progress.percent >= 100 ? 'green' : 'amber'} />
                        <div className="rounded-xl border bg-background p-4 shadow-xs">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received</p>
                            <Progress percent={data.progress.percent} className="mt-3" />
                        </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-3">
                        <Section title="PO Details" className="xl:col-span-2">
                            <FieldGrid>
                                <Field label="Vendor"><VendorLink value={data.vendor} /></Field>
                                <Field label="Prepared By">{dash(data.preparedBy)}</Field>
                                <Field label="Quotation">{dash(data.quotationNumber)} {data.quotationDate ? `(${fmtDate(data.quotationDate)})` : ''}</Field>
                                <Field label="Enquiry">{dash(data.enquiryNumber)} {data.enquiryDate ? `(${fmtDate(data.enquiryDate)})` : ''}</Field>
                                <Field label="Verification"><StatusBadge status={data.verificationStatus} /> {data.verifiedBy && <span className="text-xs text-muted-foreground">{data.verifiedBy} · {fmtDateTime(data.verifiedAt)}</span>}</Field>
                                <Field label="Approval"><StatusBadge status={data.approvalStatus} /> {data.approvalActionBy && <span className="text-xs text-muted-foreground">{data.approvalActionBy} · {fmtDateTime(data.approvalActionAt)}</span>}</Field>
                                <Field label="Expected Delivery">{fmtDate(data.planned)}</Field>
                                <Field label="Lead Time">{dash(data.leadTime)}</Field>
                                <Field label="Transport">{dash(data.transportationType)}</Field>
                                <Field label="Destination">{dash(data.destinationAddress)}</Field>
                                <Field label="Tracking"><StatusBadge status={data.trackingStatus} /></Field>
                                <Field label="Tracking Remarks">{dash(data.trackingRemarks)}</Field>
                                <Field label="Linked Indents">
                                    {data.indents.length ? <span className="flex flex-wrap gap-x-3">{data.indents.map((n: string) => <IndentLink key={n} value={n} />)}</span> : '—'}
                                </Field>
                                {data.rejectionReason && <Field label="Rejection Reason">{data.rejectionReason}</Field>}
                            </FieldGrid>
                        </Section>
                        <Section title="Vendor Contact">
                            {data.vendorContact ? (
                                <div className="space-y-3">
                                    <Field label="Contact Person">{dash(data.vendorContact.person)}</Field>
                                    <Field label="Mobile">{dash(data.vendorContact.mobile)}</Field>
                                    <Field label="Email">{dash(data.vendorContact.email)}</Field>
                                    <Field label="GSTIN">{dash(data.vendorContact.gstin)}</Field>
                                    <Field label="Address">{dash(data.vendorContact.address)}</Field>
                                </div>
                            ) : <p className="text-sm text-muted-foreground">No vendor master record linked.</p>}
                        </Section>
                    </div>

                    <Section title="Items" flush>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Indent</TableHead>
                                        <TableHead className="text-right">Indent Qty</TableHead>
                                        <TableHead className="text-right">PO Qty</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">GST %</TableHead>
                                        <TableHead className="text-right">Disc %</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Received</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead>Stock Now</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.items.map((it: any, idx: number) => (
                                        <TableRow key={it.id}>
                                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                            <TableCell className="max-w-[260px] whitespace-normal">
                                                <ProductLink value={it.product} />
                                                {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                                            </TableCell>
                                            <TableCell>{it.indentNumber ? <IndentLink value={it.indentNumber} /> : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{it.indentQuantity != null ? `${fmtQty(it.indentQuantity)} ${it.indentUom || ''}` : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{fmtQty(it.quantity)} {it.unit}</TableCell>
                                            <TableCell className="text-right tabular-nums">{fmtMoney(it.rate)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{dash(it.gstPercent)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{dash(it.discountPercent)}</TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">{fmtMoney(it.amount)}</TableCell>
                                            <TableCell className="text-right tabular-nums text-emerald-600">{fmtQty(it.receivedQuantity)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{it.extraQuantity > 0 ? <Badge tone="red">Extra {fmtQty(it.extraQuantity)}</Badge> : it.balanceQuantity > 0 ? <span className="text-amber-600">{fmtQty(it.balanceQuantity)}</span> : <Badge tone="green">Done</Badge>}</TableCell>
                                            <TableCell><StockChip stock={{ current: it.stock.current, found: true }} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Section>

                    <div className="grid gap-5 xl:grid-cols-2">
                        <Section title={`Goods Received (${data.receipts.length})`} flush>
                            {data.receipts.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing received yet.</p> : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/40"><TableRow>
                                            <TableHead>Date</TableHead><TableHead>GRN</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead><TableHead>Bill</TableHead>
                                        </TableRow></TableHeader>
                                        <TableBody>
                                            {data.receipts.map((r: any) => (
                                                <TableRow key={r.id}>
                                                    <TableCell className="whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                                                    <TableCell className="font-mono text-xs">{dash(r.grnNumber)}</TableCell>
                                                    <TableCell>{r.product}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{fmtQty(r.receivedQuantity)} {r.uom}{r.damagedQuantity ? <span className="text-red-600"> (−{fmtQty(r.damagedQuantity)} dmg)</span> : null}</TableCell>
                                                    <TableCell><StatusBadge status={r.status} /></TableCell>
                                                    <TableCell className="text-xs">{dash(r.billNumber)}{r.billAmount != null ? ` · ${fmtMoney(r.billAmount)}` : ''}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Section>
                        <Section title={`Vendor Updates (${data.vendorUpdates.length})`}>
                            {data.vendorUpdates.length === 0 ? <p className="text-center text-sm text-muted-foreground">No vendor updates yet.</p> : (
                                <div className="space-y-2">
                                    {data.vendorUpdates.map((u: any) => (
                                        <div key={u.id} className="rounded-lg border p-3 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <StatusBadge status={u.vendorStatus} />
                                                <span className="text-xs text-muted-foreground">{fmtDateTime(u.createdAt)}{u.updatedBy ? ` · ${u.updatedBy}` : ''}</span>
                                            </div>
                                            {u.expectedDate && <p className="mt-1 text-xs">ETA: {fmtDate(u.expectedDate)}</p>}
                                            {u.remarks && <p className="mt-1 text-xs text-muted-foreground">{u.remarks}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>

                    {data.terms.length > 0 && (
                        <Section title="Terms & Conditions">
                            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">{data.terms.map((t: string, i: number) => <li key={i}>{t}</li>)}</ol>
                        </Section>
                    )}
                </>
            )}
        </DetailPage>
    );
}
