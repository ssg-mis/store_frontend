import { useParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { fetchVendorDetail } from '@/lib/fetchers';
import { POLink, ProductLink } from '../element/EntityLinks';
import { DetailPage, Field, FieldGrid, Section, Stat, StatusBadge, dash, fmtDate, fmtDateTime, fmtMoney, fmtQty, useDetail } from './DetailKit';
import POTable from './POTable';
import UomText from '../element/UomText';

export default function VendorDetailPage() {
    const { vendorName = '' } = useParams();
    const { data, loading, error } = useDetail<any>(() => fetchVendorDetail(vendorName), [vendorName]);

    return (
        <DetailPage kind="Vendor" title={data?.name || vendorName} loading={loading} error={error}>
            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <Stat label="Total POs" value={data.totals.pos} />
                        <Stat label="Active POs" value={data.totals.active} tone="amber" />
                        <Stat label="Completed POs" value={data.totals.completed} tone="green" />
                        <Stat label="Total PO Value" value={fmtMoney(data.totals.totalAmount)} />
                        <Stat label="Pending Value" value={fmtMoney(data.totals.pendingAmount)} tone="red" sub="unreceived portion of active POs" />
                    </div>

                    {data.contact && (
                        <Section title="Vendor Information">
                            <FieldGrid>
                                <Field label="Contact Person">{dash(data.contact.person)}</Field>
                                <Field label="Mobile">{dash(data.contact.mobile)}</Field>
                                <Field label="Email">{dash(data.contact.email)}</Field>
                                <Field label="GSTIN">{dash(data.contact.gstin)}</Field>
                                <Field label="PAN">{dash(data.contact.pan)}</Field>
                                <Field label="State">{dash(data.contact.state)}</Field>
                                <Field label="Payment Terms">{(data.contact.paymentTerms || []).join(', ') || '—'}</Field>
                                <Field label="Address">{dash(data.contact.address)}</Field>
                            </FieldGrid>
                        </Section>
                    )}

                    <Section title={`Purchase Orders (${data.pos.length})`} flush><POTable pos={data.pos} hideVendor /></Section>

                    <div className="grid gap-5 xl:grid-cols-2">
                        <Section title={`Products Supplied (${data.products.length})`} flush>
                            <div className="max-h-[480px] overflow-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted"><TableRow>
                                        <TableHead>Product</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Total Qty</TableHead><TableHead className="text-right">Last Rate</TableHead><TableHead className="text-right">Value</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {data.products.map((p: any) => (
                                            <TableRow key={p.product}>
                                                <TableCell className="whitespace-normal"><ProductLink value={p.product} /></TableCell>
                                                <TableCell className="text-right tabular-nums">{p.orders}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(p.quantity)} {p.unit}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtMoney(p.lastRate)}<p className="text-[10px] text-muted-foreground">{fmtDate(p.lastDate)}</p></TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtMoney(p.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Section>

                        <Section title={`Recent Deliveries (${data.receipts.length})`} flush>
                            <div className="max-h-[480px] overflow-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted"><TableRow>
                                        <TableHead>Date</TableHead><TableHead>PO</TableHead><TableHead>GRN</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {data.receipts.map((r: any, i: number) => (
                                            <TableRow key={i}>
                                                <TableCell className="whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                                                <TableCell><POLink value={r.poNumber} /></TableCell>
                                                <TableCell className="font-mono text-xs">{dash(r.grnNumber)}</TableCell>
                                                <TableCell className="whitespace-normal">{r.product}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.receivedQuantity)} <UomText uom={r.uom} inline /></TableCell>
                                                <TableCell><StatusBadge status={r.status} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Section>
                    </div>

                    <Section title={`Vendor Updates (${data.updates.length})`}>
                        {data.updates.length === 0 ? <p className="text-center text-sm text-muted-foreground">No updates recorded.</p> : (
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {data.updates.map((u: any) => (
                                    <div key={u.id} className="rounded-lg border p-3 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <POLink value={u.poNumber} />
                                            <StatusBadge status={u.vendorStatus} />
                                        </div>
                                        <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(u.createdAt)}{u.updatedBy ? ` · ${u.updatedBy}` : ''}{u.expectedDate ? ` · ETA ${fmtDate(u.expectedDate)}` : ''}</p>
                                        {u.remarks && <p className="mt-1 text-xs">{u.remarks}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>
                </>
            )}
        </DetailPage>
    );
}
