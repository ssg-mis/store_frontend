import { ClipboardCheck, Search, Check, X, RotateCcw } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import { fetchPOApprovals, approvePO, rejectPO } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Pill } from '../ui/pill';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { usePageViewOnly } from '@/components/element/ViewOnlyGuard';

interface PORow {
    id: number;
    poNumber: string;
    partyName: string;
    firm: string;
    internalCode: string | null;
    product: string;
    description: string | null;
    quantity: number;
    unit: string;
    rate: number | string;
    gstPercent?: number | null;
    discountPercent?: number | null;
    amount: number | string;
    totalPOAmount: number | string;
    preparedBy: string;
    createdAt: string;
    pdf: string | null;
    rejectionReason: string | null;
    approvalStatus: string;
}

interface POGroup {
    poNumber: string;
    partyName: string;
    firm: string;
    preparedBy: string;
    createdAt: string;
    totalPOAmount: number | string;
    pdf: string | null;
    rejectionReason: string | null;
    items: PORow[];
}

function groupByPoNumber(rows: PORow[]): POGroup[] {
    const groups = new Map<string, PORow[]>();
    rows.forEach(r => {
        const key = r.poNumber || '—';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
    });
    return Array.from(groups.entries()).map(([poNumber, items]) => {
        const first = items[0];
        return {
            poNumber,
            partyName: first.partyName,
            firm: first.firm,
            preparedBy: first.preparedBy,
            createdAt: first.createdAt,
            totalPOAmount: first.totalPOAmount,
            pdf: first.pdf,
            rejectionReason: first.rejectionReason,
            items,
        };
    });
}

export default function ApprovalPO() {
    const isViewOnly = usePageViewOnly();
    const { user } = useAuth();
    const navigate = useNavigate();
    const actorName = (user as any)?.name || (user as any)?.username || '';

    const [tab, setTab] = useState<'pending' | 'rejected'>('pending');
    const [pendingRows, setPendingRows] = useState<PORow[]>([]);
    const [rejectedRows, setRejectedRows] = useState<PORow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [viewGroup, setViewGroup] = useState<POGroup | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectError, setRejectError] = useState(false);
    const [isRejectingInline, setIsRejectingInline] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pending, rejected] = await Promise.all([
                fetchPOApprovals('Pending'),
                fetchPOApprovals('Rejected'),
            ]);
            setPendingRows(Array.isArray(pending) ? pending : []);
            setRejectedRows(Array.isArray(rejected) ? rejected : []);
        } catch (err) {
            console.error('Error loading PO approvals:', err);
            toast.error('Failed to load PO approvals');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const filterRows = (rows: PORow[]) => {
        if (!search.trim()) return rows;
        const q = search.trim().toLowerCase();
        return rows.filter(r =>
            (r.poNumber || '').toLowerCase().includes(q) ||
            (r.partyName || '').toLowerCase().includes(q) ||
            (r.firm || '').toLowerCase().includes(q) ||
            (r.product || '').toLowerCase().includes(q)
        );
    };

    const pendingGroups = useMemo(() => groupByPoNumber(filterRows(pendingRows)), [pendingRows, search]);
    const rejectedGroups = useMemo(() => groupByPoNumber(filterRows(rejectedRows)), [rejectedRows, search]);
    const pendingCount = useMemo(() => groupByPoNumber(pendingRows).length, [pendingRows]);
    const rejectedCount = useMemo(() => groupByPoNumber(rejectedRows).length, [rejectedRows]);

    async function handleApprove(group: POGroup) {
        if (isViewOnly) { toast.info('View-only access: you cannot approve POs on this page.'); return; }
        if (!window.confirm(`Approve PO ${group.poNumber}? This will move it to the Receive Items stage.`)) return;
        setSubmitting(true);
        try {
            const result = await approvePO(group.poNumber, actorName);
            if (!result.success) throw new Error(result.error || 'Failed to approve PO');
            toast.success(`PO ${group.poNumber} approved`);
            loadData();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to approve PO');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRejectSubmitInline(group: POGroup) {
        if (!rejectReason.trim()) {
            setRejectError(true);
            toast.error('Rejection reason is required');
            return;
        }
        setRejectError(false);
        setSubmitting(true);
        try {
            const result = await rejectPO(group.poNumber, rejectReason.trim(), actorName);
            if (!result.success) throw new Error(result.error || 'Failed to reject PO');
            toast.success(`PO ${group.poNumber} rejected`);
            setViewGroup(null);
            setIsRejectingInline(false);
            setRejectReason('');
            loadData();
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to reject PO');
        } finally {
            setSubmitting(false);
        }
    }

    function handleRevise(group: POGroup) {
        // Hand off to Create PO's Revise tab with this rejected PO preselected.
        navigate('/create-po', { state: { revisePoNumber: group.poNumber } });
    }

    const groups = tab === 'pending' ? pendingGroups : rejectedGroups;

    return (
        <>
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Heading heading="Approval of PO" subtext="Approve or reject newly created purchase orders">
                <ClipboardCheck size={50} className="text-primary" />
            </Heading>

            <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'rejected')} className="mt-4 gap-3">
                <TabsList className="h-10">
                    <TabsTrigger value="pending" className="flex-none px-4">
                        Pending Approval
                        <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-xs font-semibold">{pendingCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value="rejected" className="flex-none px-4">
                        Rejected
                        <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-xs font-semibold">{rejectedCount}</span>
                    </TabsTrigger>
                </TabsList>

                <div className="flex items-center justify-end">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search PO, vendor, product..."
                            className="pl-8 h-9 text-sm w-[260px]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <TabsContent value={tab} className="mt-0">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                            ))}
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                            {tab === 'pending' ? 'No POs pending approval' : 'No rejected POs'}
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16 text-center">Actions</TableHead>
                                        <TableHead>PO Number</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Firm</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Prepared By</TableHead>
                                        <TableHead>Total Amount</TableHead>
                                        <TableHead>Items</TableHead>
                                        {tab === 'rejected' && <TableHead>Rejection Reason</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.map(group => {
                                        return (
                                            <TableRow 
                                                key={group.poNumber}
                                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                onClick={() => {
                                                    setViewGroup(group);
                                                }}
                                            >
                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs px-2.5"
                                                        onClick={() => setViewGroup(group)}>
                                                        View
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="font-medium text-xs sm:text-sm text-primary whitespace-nowrap">{group.poNumber}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.partyName}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.firm}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.createdAt ? formatDate(new Date(group.createdAt)) : '—'}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.preparedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">&#8377;{Number(group.totalPOAmount || 0).toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                        {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                                                    </span>
                                                </TableCell>
                                                {tab === 'rejected' && (
                                                    <TableCell className="text-xs text-destructive max-w-[220px] break-words whitespace-normal">
                                                        {group.rejectionReason || '—'}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>

        {/* ── View dialog ── */}
        <Dialog open={!!viewGroup} onOpenChange={(open) => {
            if (!open) {
                setViewGroup(null);
                setIsRejectingInline(false);
                setRejectReason('');
                setRejectError(false);
            }
        }}>
            <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>PO Details — {viewGroup?.poNumber}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 bg-muted/30 rounded-lg px-4 py-3 border">
                    {[
                        { label: 'Vendor', value: viewGroup?.partyName },
                        { label: 'Firm', value: viewGroup?.firm },
                        { label: 'Prepared By', value: viewGroup?.preparedBy },
                        { label: 'Date', value: viewGroup?.createdAt ? formatDate(new Date(viewGroup.createdAt)) : null },
                        { label: 'Total Amount', value: viewGroup ? `₹${Number(viewGroup.totalPOAmount || 0).toLocaleString()}` : null },
                        { label: 'Rejection Reason', value: viewGroup?.rejectionReason },
                    ].map(({ label, value }) =>
                        value ? (
                            <div key={label} className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                <span className="text-xs font-medium text-foreground mt-0.5">{value}</span>
                            </div>
                        ) : null
                    )}
                    {viewGroup?.pdf && (
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">PO Copy</span>
                            <a href={viewGroup.pdf} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:underline mt-0.5">View PDF</a>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="text-xs">#</TableHead>
                                <TableHead className="text-xs">Indent</TableHead>
                                <TableHead className="text-xs">Product</TableHead>
                                <TableHead className="text-xs">Qty</TableHead>
                                <TableHead className="text-xs">Unit</TableHead>
                                <TableHead className="text-xs">Rate</TableHead>
                                <TableHead className="text-xs">Discount</TableHead>
                                <TableHead className="text-xs">GST</TableHead>
                                <TableHead className="text-xs">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewGroup?.items.map((item, idx) => (
                                <TableRow key={item.id}>
                                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell className="text-xs">{item.internalCode || '—'}</TableCell>
                                    <TableCell className="text-xs font-medium">{item.product}</TableCell>
                                    <TableCell className="text-xs">{item.quantity}</TableCell>
                                    <TableCell className="text-xs">{item.unit}</TableCell>
                                    <TableCell className="text-xs">&#8377;{Number(item.rate || 0).toLocaleString()}</TableCell>
                                    <TableCell className="text-xs">
                                        {item.discountPercent ? `${item.discountPercent}%` : '—'}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {item.gstPercent !== undefined && item.gstPercent !== null ? `${item.gstPercent}%` : '—'}
                                    </TableCell>
                                    <TableCell className="text-xs font-semibold">&#8377;{Number(item.amount || 0).toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Rejection remarks form inline */}
                {isRejectingInline && (
                    <div className="space-y-2 py-3 border-t mt-4 animate-in slide-in-from-bottom-2 duration-200">
                        <label className="text-xs font-semibold text-red-600 flex items-center gap-1">
                            Reason for rejection <span className="text-red-500">*</span>
                        </label>
                        <Textarea
                            value={rejectReason}
                            onChange={(e) => {
                                setRejectReason(e.target.value);
                                if (e.target.value.trim()) setRejectError(false);
                            }}
                            placeholder="Explain why this PO is being rejected..."
                            rows={3}
                            className={`resize-none text-sm ${rejectError ? 'border-red-500 focus-visible:ring-red-500/20' : ''}`}
                        />
                        {rejectError && (
                            <p className="text-xs text-red-500">Rejection reason is required.</p>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 mt-4">
                    {viewGroup && (
                        isRejectingInline ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => {
                                    setIsRejectingInline(false);
                                    setRejectReason('');
                                    setRejectError(false);
                                }}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" size="sm" disabled={submitting} onClick={() => handleRejectSubmitInline(viewGroup)}>
                                    {submitting ? 'Rejecting...' : 'Confirm Reject'}
                                </Button>
                            </>
                        ) : tab === 'pending' ? (
                            <>
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 flex items-center gap-1.5"
                                    disabled={submitting || isViewOnly}
                                    onClick={() => {
                                        handleApprove(viewGroup);
                                        setViewGroup(null);
                                    }}>
                                    <Check className="h-3.5 w-3.5" /> Approve
                                </Button>
                                <Button variant="destructive" size="sm" className="flex items-center gap-1.5"
                                    disabled={submitting || isViewOnly}
                                    onClick={() => {
                                        setIsRejectingInline(true);
                                    }}>
                                    <X className="h-3.5 w-3.5" /> Reject
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" className="flex items-center gap-1.5"
                                disabled={isViewOnly}
                                onClick={() => {
                                    handleRevise(viewGroup);
                                    setViewGroup(null);
                                }}>
                                <RotateCcw className="h-3.5 w-3.5" /> Revise
                            </Button>
                        )
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
