import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, History, PenSquare, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { IndentLink, ProductLink } from '../element/EntityLinks';
import MakeText from '../element/MakeText';
import UomText from '../element/UomText';
import { formatDate } from '@/lib/utils';
import {
    fetchQuotationRegister,
    type QuotationRegisterEntry,
    type QuotationRegisterVendor,
    type QuotationRegisterVersion,
} from '@/lib/fetchers';

const STATUS_STYLES: Record<string, string> = {
    'PO Created': 'bg-green-100 text-green-800 border-green-200',
    'Rate Received': 'bg-blue-100 text-blue-800 border-blue-200',
    Sent: 'bg-sky-100 text-sky-800 border-sky-200',
    'Email Failed': 'bg-red-100 text-red-700 border-red-200',
    'No Email': 'bg-amber-100 text-amber-800 border-amber-200',
    Created: 'bg-gray-100 text-gray-700 border-gray-200',
    Superseded: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
};

const StatusChip = ({ status }: { status: string }) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLES[status] || STATUS_STYLES.Created}`}>
        {status}
    </span>
);

const RevBadge = ({ revisionNo }: { revisionNo: number }) => (
    <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
        {revisionNo > 0 ? `Rev ${revisionNo}` : 'Original'}
    </span>
);

const money = (n: number | null | undefined) =>
    n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const showDate = (d?: string | null) => (d ? formatDate(new Date(d)) : '—');
const showDateTime = (d?: string | null) =>
    d ? `${formatDate(new Date(d))} ${new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '—';

// Overall status of a quotation = most advanced status among its latest version's vendors.
const STATUS_RANK = ['PO Created', 'Rate Received', 'Sent', 'Email Failed', 'No Email', 'Created'];
function overallStatus(entry: QuotationRegisterEntry) {
    const statuses = (entry.versions[0]?.vendors || []).map((v) => v.status);
    return STATUS_RANK.find((s) => statuses.includes(s)) || 'Created';
}

function versionTotal(version: QuotationRegisterVersion) {
    const priced = version.vendors.filter((v) => v.ratesReceived > 0);
    if (priced.length === 0) return null;
    // Lowest grand total among vendors that quoted (the comparable figure across vendors).
    return Math.min(...priced.map((v) => v.grandTotal));
}

function viewPdf(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function downloadPdf(url: string, fileName: string) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch {
        // Storage may not allow direct download from the browser — open it so it can be saved from the viewer.
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

const PdfButtons = ({ vendor, quotationNo }: { vendor: QuotationRegisterVendor; quotationNo: string }) =>
    vendor.pdfLink ? (
        <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" title="View PDF" onClick={() => viewPdf(vendor.pdfLink)}>
                <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                title="Download PDF"
                onClick={() => downloadPdf(vendor.pdfLink, `QUOTATION-${quotationNo}-${vendor.supplierName}.pdf`.replace(/[^\w.\- ]/g, '_'))}
            >
                <Download className="h-3.5 w-3.5" />
            </Button>
        </div>
    ) : (
        <span className="text-xs text-muted-foreground">No PDF</span>
    );

export default function QuotationHistoryTab({ onRevise }: { onRevise: (quotationNo: string) => void }) {
    const [data, setData] = useState<QuotationRegisterEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [selected, setSelected] = useState<QuotationRegisterEntry | null>(null);
    const [selectedVersionNo, setSelectedVersionNo] = useState<string>('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await fetchQuotationRegister());
        } catch (err: any) {
            console.error('Error loading quotation history:', err);
            toast.error(err?.message || 'Failed to load quotation history');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return data.filter((entry) => {
            if (statusFilter !== 'All' && overallStatus(entry) !== statusFilter) return false;
            if (!q) return true;
            return entry.versions.some((v) =>
                v.quotationNo.toLowerCase().includes(q) ||
                v.vendors.some((vd) =>
                    vd.supplierName.toLowerCase().includes(q) ||
                    vd.items.some((i) => i.product.toLowerCase().includes(q) || i.indentNo.toLowerCase().includes(q))
                )
            );
        });
    }, [data, search, statusFilter]);

    const openDetails = (entry: QuotationRegisterEntry) => {
        setSelected(entry);
        setSelectedVersionNo(entry.versions[0]?.quotationNo || '');
    };

    const version = selected?.versions.find((v) => v.quotationNo === selectedVersionNo) || selected?.versions[0];

    return (
        <div className="space-y-3 p-4 w-full bg-white shadow-md rounded-sm mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search quotation, vendor, product, indent..."
                            className="pl-8 h-8 text-xs w-[280px]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-8 w-[170px] text-xs">
                            <span className="font-semibold text-muted-foreground mr-1">Status:</span>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {['All', ...STATUS_RANK].map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {loading && data.length === 0 ? (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                    <FileText className="h-8 w-8 opacity-50" />
                    No quotations found
                </div>
            ) : (
                <div className="rounded-md border overflow-x-auto">
                    <Table className="[&_th]:!text-left [&_td]:!text-left">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Quotation No</TableHead>
                                <TableHead>Version</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last Revised</TableHead>
                                <TableHead>Vendors</TableHead>
                                <TableHead>Items</TableHead>
                                <TableHead>Best Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((entry) => {
                                const latest = entry.versions[0];
                                const itemCount = new Set(latest.vendors.flatMap((v) => v.items.map((i) => i.indent_id))).size;
                                return (
                                    <TableRow key={entry.baseQuotationNo}>
                                        <TableCell className="font-semibold text-xs sm:text-sm whitespace-nowrap">
                                            {entry.latestQuotationNo}
                                            {entry.latestQuotationNo !== entry.baseQuotationNo && (
                                                <div className="text-[10px] font-normal text-muted-foreground">Original: {entry.baseQuotationNo}</div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col items-start gap-1">
                                                <RevBadge revisionNo={entry.latestRevisionNo} />
                                                {entry.versions.length > 1 && (
                                                    <span className="text-[10px] text-muted-foreground">{entry.versions.length} versions</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">{showDate(entry.createdAt)}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">{entry.versions.length > 1 ? showDate(entry.updatedAt) : '—'}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {latest.vendors.map((v) => (
                                                    <div key={v.supplierName} className="flex items-center gap-1.5">
                                                        <span className="text-xs max-w-[200px] truncate" title={v.supplierName}>{v.supplierName}</span>
                                                        <StatusChip status={v.status} />
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{itemCount}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">{money(versionTotal(latest))}</TableCell>
                                        <TableCell><StatusChip status={overallStatus(entry)} /></TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openDetails(entry)}>
                                                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                                                </Button>
                                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRevise(entry.latestQuotationNo)}>
                                                    <PenSquare className="h-3.5 w-3.5 mr-1" /> Revise
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
                <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Quotation {selected?.baseQuotationNo}</DialogTitle>
                    </DialogHeader>

                    {selected && version && (
                        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                            {/* ── Version history ── */}
                            <div className="space-y-2">
                                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    <History className="h-3.5 w-3.5" /> Version History
                                </p>
                                {selected.versions.map((v) => (
                                    <button
                                        key={v.quotationNo}
                                        type="button"
                                        onClick={() => setSelectedVersionNo(v.quotationNo)}
                                        className={`w-full rounded-md border p-2 text-left transition-colors ${v.quotationNo === version.quotationNo ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold">{v.quotationNo}</span>
                                            <RevBadge revisionNo={v.revisionNo} />
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">{showDateTime(v.timestamp)}</div>
                                        <div className="mt-1">
                                            {v.isLatest
                                                ? <span className="text-[10px] font-semibold text-green-700">Current version</span>
                                                : <span className="text-[10px] text-muted-foreground">Previous version</span>}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* ── Selected version ── */}
                            <div className="space-y-4 min-w-0">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/30 p-3 rounded-lg">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quotation No</p>
                                        <p className="text-sm font-medium">{version.quotationNo}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date</p>
                                        <p className="text-sm font-medium">{showDateTime(version.timestamp)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Version</p>
                                        <p className="text-sm font-medium">{version.revisionNo > 0 ? `Revision ${version.revisionNo}` : 'Original'}{version.isLatest ? ' (current)' : ''}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Revised From</p>
                                        <p className="text-sm font-medium">{version.previousQuotationNo || '—'}</p>
                                    </div>
                                    {version.description && (
                                        <div className="col-span-2 md:col-span-4">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Description</p>
                                            <p className="text-sm whitespace-pre-wrap">{version.description}</p>
                                        </div>
                                    )}
                                </div>

                                {version.changeSummary && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                                            Changes from {version.previousQuotationNo}
                                        </p>
                                        <ul className="mt-1 list-disc pl-5 text-xs text-amber-900 space-y-0.5">
                                            {version.changeSummary.split('\n').map((line, i) => <li key={i}>{line}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {version.vendors.map((vendor) => (
                                    <div key={vendor.supplierName} className="rounded-lg border overflow-hidden">
                                        <div className="flex flex-wrap items-start justify-between gap-3 bg-muted/30 px-4 py-3 border-b">
                                            <div className="space-y-0.5 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold">{vendor.supplierName}</span>
                                                    <StatusChip status={vendor.status} />
                                                </div>
                                                {vendor.address && <p className="text-[11px] text-muted-foreground">{vendor.address}</p>}
                                                <p className="text-[11px] text-muted-foreground">
                                                    GSTIN: {vendor.gst || 'N/A'}
                                                    {vendor.contactPerson ? ` · ${vendor.contactPerson}` : ''}
                                                    {vendor.mobile ? ` · ${vendor.mobile}` : ''}
                                                </p>
                                                <p className="text-[11px]">
                                                    <span className="text-muted-foreground">Email: </span>
                                                    {vendor.emailedTo || vendor.email || 'Not available'}
                                                    {vendor.emailStatus && (
                                                        <span className={vendor.emailStatus === 'Sent' ? 'text-green-700' : 'text-red-600'}>
                                                            {' '}· {vendor.emailStatus === 'Sent' ? 'Sent' : vendor.emailStatus}
                                                            {vendor.emailedAt ? ` on ${showDateTime(vendor.emailedAt)}` : ''}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quotation PDF</span>
                                                <PdfButtons vendor={vendor} quotationNo={version.quotationNo} />
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <Table className="[&_th]:!text-left [&_td]:!text-left">
                                                <TableHeader>
                                                    <TableRow className="bg-muted/20">
                                                        <TableHead className="text-xs">Indent</TableHead>
                                                        <TableHead className="text-xs">Product</TableHead>
                                                        <TableHead className="text-xs">Description</TableHead>
                                                        <TableHead className="text-xs">Qty</TableHead>
                                                        <TableHead className="text-xs">UOM</TableHead>
                                                        <TableHead className="text-xs">Rate</TableHead>
                                                        <TableHead className="text-xs">Disc %</TableHead>
                                                        <TableHead className="text-xs">Amount</TableHead>
                                                        <TableHead className="text-xs">GST %</TableHead>
                                                        <TableHead className="text-xs">Tax</TableHead>
                                                        <TableHead className="text-xs">Total</TableHead>
                                                        <TableHead className="text-xs">Price From</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {vendor.items.map((item) => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="text-xs"><IndentLink value={item.indentNo} /></TableCell>
                                                            <TableCell className="text-xs max-w-[220px]"><ProductLink value={item.product} /><MakeText make={item.make} /></TableCell>
                                                            <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground" title={item.description}>{item.description || '—'}</TableCell>
                                                            <TableCell className="text-xs">{item.qty ?? '—'}</TableCell>
                                                            <TableCell className="text-xs">{item.unit ? <UomText uom={item.unit} /> : '—'}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap">{money(item.rate)}</TableCell>
                                                            <TableCell className="text-xs">{item.discountPercent ?? '—'}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap">{money(item.amount)}</TableCell>
                                                            <TableCell className="text-xs">{item.gstPercent ?? '—'}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap">{money(item.gstAmount)}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap font-medium">{money(item.total)}</TableCell>
                                                            <TableCell className="text-xs whitespace-nowrap">
                                                                {item.priceSource
                                                                    ? <span>{item.priceSource}{item.poNumber ? ` (${item.poNumber})` : ''}</span>
                                                                    : <span className="text-muted-foreground">Awaiting rate</span>}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t bg-muted/10 px-4 py-2 text-xs">
                                            <span>Subtotal: <b>{money(vendor.ratesReceived ? vendor.subtotal : null)}</b></span>
                                            <span>Tax: <b>{money(vendor.ratesReceived ? vendor.taxTotal : null)}</b></span>
                                            <span>Total: <b>{money(vendor.ratesReceived ? vendor.grandTotal : null)}</b></span>
                                            {vendor.ratesReceived > 0 && vendor.ratesReceived < vendor.items.length && (
                                                <span className="text-muted-foreground">({vendor.ratesReceived} of {vendor.items.length} items priced)</span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {version.isLatest && (
                                    <div className="flex justify-end">
                                        <Button type="button" onClick={() => { const no = version.quotationNo; setSelected(null); onRevise(no); }}>
                                            <PenSquare className="h-4 w-4 mr-1" /> Revise this quotation
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
