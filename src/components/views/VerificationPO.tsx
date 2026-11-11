import { ShieldCheck, Search, Check, X, FileText, Clock, History, Undo2 } from 'lucide-react';
import Heading from '../element/Heading';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { fetchPOVerifications, verifyPOApi, sendBackPOApi } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Pill } from '../ui/pill';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { usePageViewOnly } from '@/components/element/ViewOnlyGuard';

type TabKey = 'Pending' | 'Verified' | 'Rejected';

interface PORow {
    id: number;
    poNumber: string;
    partyName: string;
    firm: string;
    preparedBy: string;
    createdAt: string;
    totalPOAmount: number | string;
    pdf: string | null;
    internalCode?: string;
    product: string;
    quantity: number | string;
    unit: string;
    rate: number | string;
    discountPercent?: number | string | null;
    gstPercent?: number | string | null;
    amount: number | string;
    make?: string | null;
    verifiedBy?: string | null;
    verifiedAt?: string | null;
    rejectionReason?: string | null;
    vendorQuotes?: { slot: number; vendorName: string | null; rate: number | null; paymentTerm: string | null; deliveryTime: number | null; comparisonSheet: string | null }[];
    approvedVendorName?: string;
}

interface POGroup {
    poNumber: string;
    first: PORow;
    items: PORow[];
}

const money = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function group(rows: PORow[]): POGroup[] {
    const map = new Map<string, PORow[]>();
    rows.forEach(r => map.set(r.poNumber, [...(map.get(r.poNumber) || []), r]));
    return [...map.entries()].map(([poNumber, items]) => ({ poNumber, first: items[0], items }));
}

export default function VerificationPO() {
    const isViewOnly = usePageViewOnly();
    const [tab, setTab] = useState<TabKey>('Pending');
    const [data, setData] = useState<Record<TabKey, PORow[]>>({ Pending: [], Verified: [], Rejected: [] });
    const rows = data[tab];
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewGroup, setViewGroup] = useState<POGroup | null>(null);
    const [sendBackGroup, setSendBackGroup] = useState<POGroup | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async (showLoader = false) => {
        if (showLoader) setLoading(true);
        const [Pending, Verified, Rejected] = await Promise.all([
            fetchPOVerifications('Pending'), fetchPOVerifications('Verified'), fetchPOVerifications('Rejected'),
        ]);
        setData({ Pending, Verified, Rejected });
        setLoading(false);
    }, []);

    useEffect(() => { load(true); }, [load]);

    // Verify/Needs-correction pressed on WhatsApp changes the PO on the server; pick it up
    // quietly every 20s and when the tab regains focus, so it moves to the right tab by itself.
    useEffect(() => {
        const refresh = () => { if (document.visibilityState === 'visible') load(); };
        const timer = setInterval(refresh, 20000);
        document.addEventListener('visibilitychange', refresh);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
    }, [load]);

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return group(rows).filter(g =>
            !q || [g.poNumber, g.first.partyName, g.first.firm, g.first.preparedBy].some(v => (v || '').toLowerCase().includes(q)));
    }, [rows, search]);

    async function verify(g: POGroup) {
        setBusy(g.poNumber);
        const res = await verifyPOApi(g.poNumber);
        setBusy(null);
        if (res.success) {
            toast.success(`PO ${g.poNumber} verified and sent for approval`);
            setViewGroup(null);
            load();
        } else {
            toast.error(res.error || 'Failed to verify PO');
        }
    }

    async function sendBack() {
        if (!sendBackGroup) return;
        if (!reason.trim()) { toast.error('Reason is required'); return; }
        setBusy(sendBackGroup.poNumber);
        const res = await sendBackPOApi(sendBackGroup.poNumber, reason.trim());
        setBusy(null);
        if (res.success) {
            toast.success(`PO ${sendBackGroup.poNumber} sent back for correction`);
            setSendBackGroup(null);
            setViewGroup(null);
            setReason('');
            load();
        } else {
            toast.error(res.error || 'Failed to send PO back');
        }
    }

    const showActions = tab === 'Pending' && !isViewOnly;

    return (
        <div className="space-y-4">
            <Heading heading="Verification of PO" subtext="Verify POs before they go to the approver (same as the WhatsApp Verify button)">
                <ShieldCheck size={50} className="text-primary" />
            </Heading>

            <div className="grid gap-3 sm:grid-cols-3">
                {([
                    { key: 'Pending', label: 'Pending', hint: 'Waiting for verification', icon: Clock, tone: 'amber' },
                    { key: 'Verified', label: 'History', hint: 'Verified POs', icon: History, tone: 'green' },
                    { key: 'Rejected', label: 'Sent Back', hint: 'Needs correction', icon: Undo2, tone: 'red' },
                ] as const).map(t => {
                    const active = tab === t.key;
                    const tones = {
                        amber: 'bg-amber-100 text-amber-700',
                        green: 'bg-green-100 text-green-700',
                        red: 'bg-red-100 text-red-700',
                    } as const;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:shadow-md ${active ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'}`}
                        >
                            <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tones[t.tone]}`}>
                                <t.icon size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{t.label}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
                            </span>
                            <span className="text-2xl font-black tabular-nums">{group(data[t.key]).length}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search PO, vendor, firm..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="overflow-x-auto rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">PO Number</TableHead>
                            <TableHead className="text-xs">Vendor</TableHead>
                            <TableHead className="text-xs">Prepared By</TableHead>
                            <TableHead className="text-xs text-right">Items</TableHead>
                            <TableHead className="text-xs text-right">Amount</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="sticky right-0 bg-muted/30 text-xs text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
                        ) : groups.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No POs found</TableCell></TableRow>
                        ) : groups.map(g => (
                            <TableRow key={g.poNumber}>
                                <TableCell className="text-xs">
                                    <div className="font-semibold">{g.poNumber}</div>
                                    <div className="max-w-64 truncate text-[10px] text-muted-foreground" title={g.first.firm}>{g.first.firm}</div>
                                </TableCell>
                                <TableCell className="text-xs">{g.first.partyName}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                    <div>{g.first.preparedBy || '—'}</div>
                                    <div className="text-[10px] text-muted-foreground">{g.first.createdAt ? formatDate(new Date(g.first.createdAt)) : '—'}</div>
                                </TableCell>
                                <TableCell className="text-xs text-right">{g.items.length}</TableCell>
                                <TableCell className="text-xs text-right whitespace-nowrap">{money(g.first.totalPOAmount)}</TableCell>
                                <TableCell className="text-xs">
                                    {tab === 'Pending' && <Pill variant="pending">Awaiting</Pill>}
                                    {tab === 'Verified' && (
                                        <div>
                                            <Pill variant="primary">Verified</Pill>
                                            <div className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">
                                                {g.first.verifiedBy || '—'}{g.first.verifiedAt ? ` • ${formatDate(new Date(g.first.verifiedAt))}` : ''}
                                            </div>
                                        </div>
                                    )}
                                    {tab === 'Rejected' && (
                                        <div>
                                            <Pill variant="reject">Needs correction</Pill>
                                            {g.first.rejectionReason && <div className="mt-1 max-w-48 text-[10px] text-muted-foreground">{g.first.rejectionReason}</div>}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="sticky right-0 bg-white text-right">
                                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setViewGroup(g)}>View</Button>
                                        {showActions && (
                                            <>
                                                <Button size="sm" className="h-7 bg-green-600 px-2.5 text-xs hover:bg-green-700" disabled={busy === g.poNumber} onClick={() => verify(g)}>
                                                    <Check size={12} className="mr-1" /> Verify
                                                </Button>
                                                <Button size="sm" variant="destructive" className="h-7 px-2.5 text-xs" disabled={busy === g.poNumber} onClick={() => { setSendBackGroup(g); setReason(''); }}>
                                                    <X size={12} className="mr-1" /> Correction
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* PO details */}
            <Dialog open={!!viewGroup} onOpenChange={(o) => { if (!o) setViewGroup(null); }}>
                <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>PO Details — {viewGroup?.poNumber}</DialogTitle></DialogHeader>
                    {viewGroup && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3 text-xs">
                                {[
                                    ['Vendor', viewGroup.first.partyName],
                                    ['Firm', viewGroup.first.firm],
                                    ['Prepared By', viewGroup.first.preparedBy],
                                    ['Date', viewGroup.first.createdAt ? formatDate(new Date(viewGroup.first.createdAt)) : ''],
                                    ['Total Amount', money(viewGroup.first.totalPOAmount)],
                                    ['Reason', viewGroup.first.rejectionReason || ''],
                                ].map(([label, value]) => value ? (
                                    <div key={label}>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                                        <p className="mt-0.5 font-medium">{value}</p>
                                    </div>
                                ) : null)}
                                {viewGroup.first.pdf && (
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PO Copy</p>
                                        <a href={viewGroup.first.pdf} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                                            <FileText className="h-3 w-3" /> View PDF
                                        </a>
                                    </div>
                                )}
                            </div>

                            {(viewGroup.first.vendorQuotes?.length ?? 0) > 0 && (
                                <div className="rounded-md border text-xs">
                                    <div className="border-b bg-muted/40 px-4 py-2 font-semibold uppercase tracking-wider text-muted-foreground">Vendor Quotes</div>
                                    <div className="divide-y">
                                        {viewGroup.first.vendorQuotes!.map(q => {
                                            const selected = (q.vendorName || '').trim().toLowerCase() === (viewGroup.first.approvedVendorName || viewGroup.first.partyName || '').trim().toLowerCase();
                                            return (
                                                <div key={q.slot} className={`flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 ${selected ? 'bg-green-50' : ''}`}>
                                                    <span className="min-w-[140px] font-semibold">{q.vendorName || '—'}{selected && ' ✓ Selected'}</span>
                                                    <span className="font-mono">{money(q.rate)}</span>
                                                    <span className="text-muted-foreground">{q.paymentTerm || '—'}</span>
                                                    <span className="text-muted-foreground">{q.deliveryTime != null ? `${q.deliveryTime} days` : '—'}</span>
                                                    {q.comparisonSheet && (
                                                        <a href={q.comparisonSheet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                                                            <FileText className="h-3 w-3" /> Quote
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/20">
                                            {['#', 'Indent', 'Product', 'Qty', 'Unit', 'Rate', 'Discount', 'GST', 'Amount', 'Make'].map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {viewGroup.items.map((it, i) => (
                                            <TableRow key={it.id}>
                                                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="text-xs">{it.internalCode || '—'}</TableCell>
                                                <TableCell className="text-xs font-medium">{it.product}</TableCell>
                                                <TableCell className="text-xs">{it.quantity}</TableCell>
                                                <TableCell className="text-xs">{it.unit}</TableCell>
                                                <TableCell className="text-xs">{money(it.rate)}</TableCell>
                                                <TableCell className="text-xs">{it.discountPercent ? `${it.discountPercent}%` : '—'}</TableCell>
                                                <TableCell className="text-xs">{it.gstPercent != null ? `${it.gstPercent}%` : '—'}</TableCell>
                                                <TableCell className="text-xs font-semibold">{money(it.amount)}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{it.make || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {showActions && (
                                <DialogFooter className="gap-2">
                                    <Button className="bg-green-600 hover:bg-green-700" disabled={busy === viewGroup.poNumber} onClick={() => verify(viewGroup)}>
                                        <Check size={14} className="mr-1" /> Verify
                                    </Button>
                                    <Button variant="destructive" onClick={() => { setSendBackGroup(viewGroup); setReason(''); }}>
                                        <X size={14} className="mr-1" /> Needs Correction
                                    </Button>
                                </DialogFooter>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Needs-correction reason */}
            <Dialog open={!!sendBackGroup} onOpenChange={(o) => { if (!o) setSendBackGroup(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Needs Correction — {sendBackGroup?.poNumber}</DialogTitle></DialogHeader>
                    <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to be corrected?" className="resize-none" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSendBackGroup(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={!!busy} onClick={sendBack}>Send Back</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
