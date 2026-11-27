import { useParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { fetchProductDetail } from '@/lib/fetchers';
import { IndentLink, POLink, VendorLink } from '../element/EntityLinks';
import { Badge, DetailPage, Field, FieldGrid, Section, StatusBadge, dash, fmtDate, fmtMoney, fmtQty, useDetail } from './DetailKit';
import StockPanel from './StockPanel';
import { formatFirmName } from '@/lib/utils';
import UomText from '../element/UomText';

export default function ProductDetailPage() {
    const { productName = '' } = useParams();
    const { data, loading, error } = useDetail<any>(() => fetchProductDetail(productName), [productName]);

    return (
        <DetailPage
            kind="Product & Stock"
            title={data?.name || productName}
            loading={loading}
            error={error}
            subtitle={data && <>{data.code && <Badge tone="blue">{data.code}</Badge>}{data.category && <span>{data.category}</span>}{data.uom && <span>· <UomText uom={data.uom} inline /></span>}</>}
        >
            {data && (
                <>
                    <StockPanel stock={data.stock} uom={data.uom} />

                    {data.specifications && <Section title="Specifications"><p className="text-sm">{data.specifications}</p></Section>}

                    <Section title="Stock by Firm / Department" flush>
                        {data.stockByFirm.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">This product is not in the inventory list yet.</p> : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/40"><TableRow>
                                        <TableHead>Firm</TableHead><TableHead>Department</TableHead>
                                        <TableHead className="text-right">Available</TableHead><TableHead className="text-right">Indented</TableHead><TableHead className="text-right">Approved</TableHead>
                                        <TableHead className="text-right">Purchased</TableHead><TableHead className="text-right">Stock In</TableHead><TableHead className="text-right">Store Out</TableHead><TableHead className="text-right">Loan Out</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {data.stockByFirm.map((r: any) => (
                                            <TableRow key={r.id}>
                                                <TableCell>{formatFirmName(r.firm)}</TableCell>
                                                <TableCell>{dash(r.department)}</TableCell>
                                                <TableCell className={`text-right font-bold tabular-nums ${r.current <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtQty(r.current)} <UomText uom={r.uom} inline /></TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.indented)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.approved)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.purchased)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.stockIn)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.storeOut)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.loanOut)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Section>

                    <div className="grid gap-5">
                        <Section title={`Indents (${data.indents.length})`} flush>
                            <div className="max-h-[460px] overflow-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted"><TableRow>
                                        <TableHead>Indent</TableHead><TableHead>Date</TableHead><TableHead>Department</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Approved</TableHead><TableHead>Stage</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {data.indents.map((i: any, k: number) => (
                                            <TableRow key={k}>
                                                <TableCell><IndentLink value={i.indentNumber} /></TableCell>
                                                <TableCell className="whitespace-nowrap">{fmtDate(i.createdAt)}</TableCell>
                                                <TableCell>{dash(i.department)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(i.quantity)} <UomText uom={i.uom} inline /></TableCell>
                                                <TableCell className="text-right tabular-nums">{i.approvedQuantity != null ? fmtQty(i.approvedQuantity) : '—'}</TableCell>
                                                <TableCell><StatusBadge status={i.stage} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Section>

                    </div>

                    {data.receipts.length > 0 && (
                        <Section title="Recent Receipts" flush>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/40"><TableRow>
                                        <TableHead>Date</TableHead><TableHead>PO</TableHead><TableHead>GRN</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {data.receipts.map((r: any, k: number) => (
                                            <TableRow key={k}>
                                                <TableCell className="whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                                                <TableCell><POLink value={r.poNumber} /></TableCell>
                                                <TableCell className="font-mono text-xs">{dash(r.grnNumber)}</TableCell>
                                                <TableCell><VendorLink value={r.vendor} /></TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(r.receivedQuantity)} <UomText uom={r.uom} inline /></TableCell>
                                                <TableCell><StatusBadge status={r.status} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Section>
                    )}
                </>
            )}
        </DetailPage>
    );
}
