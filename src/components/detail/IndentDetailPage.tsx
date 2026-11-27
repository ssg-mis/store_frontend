import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { fetchIndentDetail, fetchStockForProducts, type ProductStock } from '@/lib/fetchers';
import { POLink, ProductLink, VendorLink } from '../element/EntityLinks';
import { Badge, DetailPage, Field, FieldGrid, Section, Stat, StatusBadge, StockChip, dash, fmtDate, fmtMoney, fmtQty, useDetail } from './DetailKit';
import LedgerLink from '../element/LedgerLink';
import PriorityBadge, { highestPriority } from '../element/PriorityBadge';
import { formatFirmName } from '@/lib/utils';
import UomText from '../element/UomText';
import MakeText from '../element/MakeText';

export default function IndentDetailPage() {
    const { indentNumber = '' } = useParams();
    const { data, loading, error } = useDetail<any>(() => fetchIndentDetail(indentNumber), [indentNumber]);
    const items: any[] = data?.items || [];
    const [invMap, setInvMap] = useState<Record<string, ProductStock>>({});
    const namesKey = items.map((i) => i.productName).join('|');
    useEffect(() => {
        if (namesKey) fetchStockForProducts(namesKey.split('|')).then(setInvMap);
    }, [namesKey]);
    const done = items.filter((i) => ['Received', 'Issued'].includes(i.stage)).length;

    return (
        <DetailPage
            kind="Indent"
            title={indentNumber}
            loading={loading}
            error={error}
            subtitle={data && <><Badge tone="blue">{data.indentType}</Badge><PriorityBadge priority={highestPriority(items.map((i) => i.priority))} /><span>{formatFirmName(data.firm || '')}</span><span>· {fmtDate(data.createdAt)}</span></>}
        >
            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Products" value={items.length} />
                        <Stat label="Completed" value={`${done} / ${items.length}`} tone={done === items.length ? 'green' : 'amber'} />
                    </div>

                    <Section title="Indent Details">
                        <FieldGrid>
                            <Field label="Indenter">{dash(data.indenter)}</Field>
                            <Field label="Department">{dash(data.department)}</Field>
                            <Field label="Department Head">{dash(data.departmentHead)}</Field>
                            <Field label="Area of Use">{dash(data.areaOfUse)}</Field>
                            <Field label="Approved By">{dash(data.approvedBy)}</Field>
                            <Field label="Request Date">{fmtDate(data.createdAt)}</Field>
                            <Field label="Validity Date">{fmtDate(data.validityDate)}</Field>
                            <Field label="Contractor">{dash(data.contractor)}</Field>
                        </FieldGrid>
                    </Section>

                    <Section title="Products & Stock" flush>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Approved</TableHead>
                                        <TableHead>Available Stock</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead>Stage</TableHead>
                                        <TableHead>PO No</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead className="text-right">Received</TableHead>
                                        <TableHead className="text-right">Issued</TableHead>
                                        <TableHead>Specifications</TableHead>
                                        <TableHead>Item Ledger</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((it, idx) => (
                                        <TableRow key={it.id}>
                                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                            <TableCell className="min-w-[220px] max-w-[320px] whitespace-normal break-words">
                                                <ProductLink value={it.productName} />
                                                <MakeText make={it.make} />
                                                {it.productCode && <p className="font-mono text-[10px] text-muted-foreground">{it.productCode}</p>}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtQty(it.quantity)} <UomText uom={it.uom} inline /></TableCell>
                                            <TableCell className="text-right tabular-nums">{it.approvedQuantity != null ? fmtQty(it.approvedQuantity) : '—'}</TableCell>
                                            <TableCell><StockChip stock={{ ...it.stock, found: true }} requested={it.approvedQuantity ?? it.quantity} /></TableCell>
                                            <TableCell><PriorityBadge priority={it.priority} /></TableCell>
                                            <TableCell><StatusBadge status={it.stage} /></TableCell>
                                            <TableCell>{it.poNumbers.length ? <span className="flex flex-col">{it.poNumbers.map((p: string) => <POLink key={p} value={p} />)}</span> : '—'}</TableCell>
                                            <TableCell>{it.vendors.length ? <span className="flex flex-col">{it.vendors.map((v: string) => <VendorLink key={v} value={v} />)}</span> : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{fmtQty(it.receivedQuantity)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{fmtQty(it.issuedQuantity)}</TableCell>
                                            <TableCell className="max-w-[220px] whitespace-normal text-xs text-muted-foreground">{dash(it.specifications)}</TableCell>
                                            <TableCell><LedgerLink inventoryId={invMap[(it.productName || '').trim()]?.inventoryId} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Section>

                    <Section title="Progress Timeline" flush>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>1. Created</TableHead>
                                        <TableHead>2. Approved</TableHead>
                                        <TableHead>3. Rate Update</TableHead>
                                        <TableHead>4. PO Created</TableHead>
                                        <TableHead>5. Received</TableHead>
                                        <TableHead>6. Issued</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((it) => (
                                        <TableRow key={it.id}>
                                            <TableCell className="min-w-[220px] whitespace-normal break-words font-medium">{it.productName}<MakeText make={it.make} /></TableCell>
                                            {(['created', 'approved', 'rateUpdated', 'poCreated', 'received', 'issued'] as const).map((k) => (
                                                <TableCell key={k} className={it.timeline[k] ? 'whitespace-nowrap' : 'text-muted-foreground'}>{fmtDate(it.timeline[k])}</TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Section>

                    {items.some((i) => i.rateUpdates.length || i.finalVendor) && (
                        <Section title="Vendor Quotes & Final Vendor" flush>
                            <div className="divide-y">
                                {items.filter((i) => i.rateUpdates.length || i.finalVendor).map((it) => (
                                    <div key={it.id} className="space-y-2 p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold">{it.productName}<MakeText make={it.make} inline /></span>
                                            {it.finalVendor && (
                                                <Badge tone="green">Final: {it.finalVendor.vendor} @ {fmtMoney(it.finalVendor.rate)} · {it.finalVendor.paymentTerm}</Badge>
                                            )}
                                        </div>
                                        {it.rateUpdates.map((ru: any, k: number) => (
                                            <Table key={k}>
                                                <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Payment Term</TableHead><TableHead className="text-right">Delivery (days)</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {ru.quotes.map((q: any, j: number) => (
                                                        <TableRow key={j}>
                                                            <TableCell><VendorLink value={q.vendor} /></TableCell>
                                                            <TableCell className="text-right tabular-nums">{fmtMoney(q.rate)}</TableCell>
                                                            <TableCell>{dash(q.paymentTerm)}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{dash(q.deliveryTime)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </>
            )}
        </DetailPage>
    );
}
