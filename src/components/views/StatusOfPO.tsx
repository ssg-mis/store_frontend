import React, { useEffect, useState, useMemo } from 'react';
import { Phone, ClipboardList, Search, RefreshCw, CheckCircle2, AlertTriangle, Clock, Calendar, FileText, FilterX, History as HistoryIcon } from 'lucide-react';
import Heading from '../element/Heading';
import { fetchPendingPODetails, fetchPOStatusDetails, completePOTracking, addPOVendorUpdate, fetchPOVendorUpdates } from '@/lib/fetchers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { pdf } from '@react-pdf/renderer';
import POStatusPdf from '../element/POStatusPdf';
import { POLink, VendorLink } from '../element/EntityLinks';
import { Progress, fmtMoney, fmtQty } from '../detail/DetailKit';
import { cn } from '@/lib/utils';

const ALL = '__all__';
type Tab = 'active' | 'history';
type Period = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: 'month', label: 'This month' },
    { value: 'custom', label: 'Custom range' },
];
const dayKey = (v: string | Date) => {
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function periodRange(period: Period, from: string, to: string): [string, string] {
    const now = new Date();
    const today = dayKey(now);
    if (period === 'today') return [today, today];
    if (period === '7d' || period === '30d') {
        const start = new Date(now);
        start.setDate(start.getDate() - (period === '7d' ? 6 : 29));
        return [dayKey(start), today];
    }
    if (period === 'month') return [dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    if (period === 'custom') return [from, to];
    return ['', ''];
}

interface VendorUpdate {
    id: number;
    createdAt: string;
    poNumber: string;
    vendorStatus: string;
    expectedDate: string | null;
    remarks: string | null;
    updatedBy: string | null;
}

const VENDOR_STATUS_OPTIONS = [
    'Order Confirmed',
    'Material Ready',
    'Will Dispatch Soon',
    'Partially Dispatched',
    'Dispatched',
    'In Transit',
    'Delayed',
    'Cancelled',
    'Other',
];

const vendorStatusStyle = (s: string) =>
    ['Dispatched', 'In Transit', 'Material Ready'].includes(s)
        ? 'bg-green-50 text-green-700 border-green-200'
        : ['Delayed', 'Cancelled'].includes(s)
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-amber-50 text-amber-700 border-amber-200';

interface PendingPO {
    id: number;
    partyName: string;
    poNumber: string;
    grnNumber: string;
    poDate: string;
    status: string;
    planned: string | null;
    delay: string | null;
    leadTime: string | null;
    firm: string;
    product: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    receivedQuantity: number;
    balanceQuantity: number;
    trackingStatus: string;
    trackingRemarks: string | null;
    statusDateTime: string;
    vendorUpdate?: VendorUpdate | null;
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${formatDate(date)} ${time}`;
}

export default function StatusOfPO() {
    const { user } = useAuth();
    const isAdmin = (user as any)?.role === 'ADMIN';

    const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [tab, setTab] = useState<Tab>('active');
    const [period, setPeriod] = useState<Period>('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [poFilter, setPoFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState(ALL);
    const [vendorFilter, setVendorFilter] = useState(ALL);
    const [generatingPdfFor, setGeneratingPdfFor] = useState<string | null>(null);

    const [completeDialogPo, setCompleteDialogPo] = useState<string | null>(null);
    const [remarksText, setRemarksText] = useState('');
    const [submittingComplete, setSubmittingComplete] = useState(false);

    const [vuPo, setVuPo] = useState<string | null>(null);
    const [vuStatus, setVuStatus] = useState('');
    const [vuDate, setVuDate] = useState('');
    const [vuRemarks, setVuRemarks] = useState('');
    const [vuHistory, setVuHistory] = useState<VendorUpdate[]>([]);
    const [vuSaving, setVuSaving] = useState(false);

    async function openVendorUpdate(poNumber: string) {
        setVuPo(poNumber);
        setVuStatus('');
        setVuDate('');
        setVuRemarks('');
        setVuHistory([]);
        setVuHistory(await fetchPOVendorUpdates(poNumber));
    }

    async function saveVendorUpdate() {
        if (!vuPo) return;
        if (!vuStatus) return toast.error('Select vendor status');
        setVuSaving(true);
        try {
            const result = await addPOVendorUpdate({
                poNumber: vuPo,
                vendorStatus: vuStatus,
                expectedDate: vuDate || undefined,
                remarks: vuRemarks.trim() || undefined,
            });
            if (!result.success) throw new Error(result.error || 'Failed to save update');
            toast.success('Vendor update saved.');
            setVuStatus('');
            setVuDate('');
            setVuRemarks('');
            setVuHistory(await fetchPOVendorUpdates(vuPo));
            loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save update');
        } finally {
            setVuSaving(false);
        }
    }

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchPendingPODetails();
            setPendingPOs(data.pendingPOs || []);
        } catch (error) {
            console.error('Error loading pending details:', error);
            toast.error('Failed to load status details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Group POs by poNumber to avoid showing duplicate rows for the same PO
    const groupedPOs = useMemo(() => {
        const groups = new Map<string, PendingPO[]>();
        pendingPOs.forEach(po => {
            if (!groups.has(po.poNumber)) {
                groups.set(po.poNumber, []);
            }
            groups.get(po.poNumber)!.push(po);
        });

        return Array.from(groups.entries()).map(([poNumber, items]) => {
            const first = items[0];
            // Delivery Date prefill: use planned date if set, otherwise PO date + lead time
            let deliveryDateStr = 'Pending';
            if (first.planned) {
                deliveryDateStr = formatDate(new Date(first.planned));
            } else {
                const date = new Date(first.poDate);
                const days = parseInt(first.leadTime || '7');
                date.setDate(date.getDate() + (isNaN(days) ? 7 : days));
                deliveryDateStr = formatDate(date);
            }

            const grnNumbers = Array.from(new Set(
                items.flatMap(item => (item.grnNumber || '').split(',').map(g => g.trim()).filter(Boolean))
            ));

            const ordered = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
            const received = items.reduce((sum, i) => sum + Math.min(Number(i.receivedQuantity) || 0, Number(i.quantity) || 0), 0);
            const percent = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
            const amount = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
            // 100% received (or admin-completed) POs are moved to History
            const isDone = first.status === 'Completed' || (ordered > 0 && received >= ordered);
            return {
                ordered, received, percent, amount, isDone,
                poNumber,
                partyName: first.partyName,
                poDate: first.poDate,
                status: first.status,
                deliveryDate: deliveryDateStr,
                statusDateTime: first.statusDateTime,
                vendorUpdate: first.vendorUpdate ?? null,
                grnNumber: grnNumbers.join(', '),
                items
            };
        });
    }, [pendingPOs]);

    const activeCount = useMemo(() => groupedPOs.filter(g => !g.isDone).length, [groupedPOs]);
    const historyCount = groupedPOs.length - activeCount;
    const vendorOptions = useMemo(() => Array.from(new Set(groupedPOs.map(g => g.partyName).filter(Boolean))).sort(), [groupedPOs]);
    const vendorStatusOptions = useMemo(() => Array.from(new Set(groupedPOs.map(g => g.vendorUpdate?.vendorStatus).filter(Boolean) as string[])).sort(), [groupedPOs]);

    const hasFilters = period !== 'all' || !!poFilter || statusFilter !== ALL || vendorFilter !== ALL || !!searchTerm;
    function clearFilters() {
        setPeriod('all'); setFromDate(''); setToDate(''); setPoFilter(''); setStatusFilter(ALL); setVendorFilter(ALL); setSearchTerm('');
    }

    const filteredPOs = useMemo(() => {
        const norm = (v: string) => (v || '').toLowerCase().replace(/\s+/g, '');
        const term = norm(searchTerm);
        const poTerm = norm(poFilter);
        const [from, to] = periodRange(period, fromDate, toDate);
        return groupedPOs.filter(group => {
            if (tab === 'active' ? group.isDone : !group.isDone) return false;
            if (poTerm && !norm(group.poNumber).includes(poTerm)) return false;
            if (vendorFilter !== ALL && group.partyName !== vendorFilter) return false;
            if (statusFilter !== ALL) {
                const vs = group.vendorUpdate?.vendorStatus;
                if (statusFilter === 'Pending' || statusFilter === 'Completed') {
                    if (group.status !== statusFilter) return false;
                } else if (statusFilter === '__noupdate__') {
                    if (vs) return false;
                } else if (vs !== statusFilter) return false;
            }
            const key = dayKey(group.poDate);
            if (from && key < from) return false;
            if (to && key > to) return false;
            if (!term) return true;
            return (
                norm(group.poNumber).includes(term) ||
                norm(group.grnNumber).includes(term) ||
                norm(group.partyName).includes(term) ||
                norm(group.status).includes(term) ||
                norm(group.vendorUpdate?.vendorStatus || '').includes(term)
            );
        });
    }, [groupedPOs, searchTerm, tab, period, fromDate, toDate, poFilter, statusFilter, vendorFilter]);

    async function handleViewPdf(poNumber: string) {
        setGeneratingPdfFor(poNumber);
        try {
            const details = await fetchPOStatusDetails(poNumber);
            if (!details) throw new Error('Failed to load PO status details');

            const blob = await pdf(
                <POStatusPdf
                    poNumber={details.poNumber}
                    poDate={formatDate(new Date(details.poDate))}
                    vendor={details.vendor}
                    firm={details.firm}
                    trackingStatus={details.trackingStatus}
                    trackingRemarks={details.trackingRemarks}
                    items={details.items}
                />
            ).toBlob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            console.error('Error generating PO status PDF:', error);
            toast.error('Failed to generate PO PDF');
        } finally {
            setGeneratingPdfFor(null);
        }
    }

    async function handleConfirmComplete() {
        if (!completeDialogPo) return;
        setSubmittingComplete(true);
        try {
            const result = await completePOTracking(completeDialogPo, remarksText.trim());
            if (!result.success) throw new Error(result.error || 'Failed to update PO status');
            toast.success(`PO ${completeDialogPo} marked as completed.`);
            setCompleteDialogPo(null);
            setRemarksText('');
            loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update PO status');
        } finally {
            setSubmittingComplete(false);
        }
    }

    return (
        <div className="w-full space-y-5 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <Heading
                    heading="Status of PO"
                    subtext="Track every PO that has a GRN. Fully received POs move to History."
                >
                    <ClipboardList size={40} className="text-primary animate-pulse" />
                </Heading>
                <div className="flex items-center gap-2">
                    <div className="relative w-80">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search PO no, GRN no, vendor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-background/50 backdrop-blur-sm border-primary/20 hover:border-primary/45 transition-colors duration-200"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={loadData}
                        disabled={loading}
                        className="border-primary/20 hover:bg-primary/10 transition-colors duration-200"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Active / History */}
            <div className="flex items-center gap-2">
                {([
                    { key: 'active' as Tab, label: 'Active', count: activeCount, icon: <Clock className="h-4 w-4" /> },
                    { key: 'history' as Tab, label: 'History', count: historyCount, icon: <HistoryIcon className="h-4 w-4" /> },
                ]).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors',
                            tab === t.key ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background text-slate-600 hover:bg-muted'
                        )}
                    >
                        {t.icon} {t.label}
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] tabular-nums', tab === t.key ? 'bg-white/20' : 'bg-muted')}>{t.count}</span>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 items-end gap-3 rounded-xl border bg-background p-3 shadow-xs md:grid-cols-4 xl:grid-cols-7">
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Period</label>
                    <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">From</label>
                    <Input type="date" className="h-9" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPeriod('custom'); }} />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">To</label>
                    <Input type="date" className="h-9" value={toDate} onChange={(e) => { setToDate(e.target.value); setPeriod('custom'); }} />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">PO No</label>
                    <Input className="h-9" placeholder="e.g. PO-102" value={poFilter} onChange={(e) => setPoFilter(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All statuses</SelectItem>
                            <SelectItem value="Pending">PO: Pending</SelectItem>
                            <SelectItem value="Completed">PO: Completed</SelectItem>
                            <SelectItem value="__noupdate__">Vendor: No update yet</SelectItem>
                            {vendorStatusOptions.map(v => <SelectItem key={v} value={v}>Vendor: {v}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</label>
                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All vendors</SelectItem>
                            {vendorOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" className="h-9 gap-1" disabled={!hasFilters} onClick={clearFilters}>
                    <FilterX className="h-4 w-4" /> Clear
                </Button>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-card/60 backdrop-blur-md shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/40">
                            <TableRow>
                                <TableHead className="font-semibold py-4">PO Date</TableHead>
                                <TableHead className="font-semibold py-4">PO No</TableHead>
                                <TableHead className="font-semibold py-4">GRN No</TableHead>
                                <TableHead className="font-semibold py-4">Vendor Name</TableHead>
                                <TableHead className="font-semibold py-4 text-right">Amount</TableHead>
                                <TableHead className="font-semibold py-4">Received</TableHead>
                                <TableHead className="font-semibold py-4 text-right">Balance Qty</TableHead>
                                <TableHead className="font-semibold py-4">Delivery Date</TableHead>
                                <TableHead className="font-semibold py-4">Status</TableHead>
                                <TableHead className="font-semibold py-4">Vendor Update</TableHead>
                                <TableHead className="font-semibold py-4">Date &amp; Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={11} className="text-center py-12">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <Clock className="h-8 w-8 animate-spin text-primary" />
                                            <span className="text-sm text-muted-foreground font-medium">Fetching PO details...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredPOs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} className="text-center py-12">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <AlertTriangle className="h-8 w-8 text-amber-500" />
                                            <span className="text-sm text-muted-foreground font-medium">
                                                {hasFilters ? 'No PO matches the current filters.' : tab === 'active' ? 'No active POs. Fully received POs are in History.' : 'No completed POs yet.'}
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredPOs.map((po) => (
                                    <TableRow key={po.poNumber} className="hover:bg-muted/30 transition-colors duration-200">
                                        <TableCell className="py-4 text-muted-foreground whitespace-nowrap">{formatDate(new Date(po.poDate))}</TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-1.5">
                                                <POLink value={po.poNumber} />
                                                <button
                                                    onClick={() => handleViewPdf(po.poNumber)}
                                                    disabled={generatingPdfFor === po.poNumber}
                                                    title="Open PO status PDF"
                                                    className="text-muted-foreground hover:text-primary disabled:opacity-50"
                                                >
                                                    {generatingPdfFor === po.poNumber ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 font-medium text-foreground">
                                            {po.grnNumber ? (
                                                <div className="flex flex-col items-start gap-0.5 text-xs font-mono">
                                                    {po.grnNumber.split(',').map((g) => g.trim()).filter(Boolean).map((g) => (<span key={g}>{g}</span>))}
                                                </div>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="py-4"><VendorLink value={po.partyName} /></TableCell>
                                        <TableCell className="py-4 text-right tabular-nums">{fmtMoney(po.amount)}</TableCell>
                                        <TableCell className="py-4"><Progress percent={po.percent} /></TableCell>
                                        <TableCell className="py-4 text-right tabular-nums">
                                            {po.ordered - po.received > 0 ? <span className="font-semibold text-amber-600">{fmtQty(po.ordered - po.received)}</span> : <span className="text-emerald-600">0</span>}
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-1.5 text-foreground font-medium">
                                                <Calendar className="w-4 h-4 text-primary/70" />
                                                {po.deliveryDate}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            {po.status === 'Completed' ? (
                                                <span
                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border bg-green-50 text-green-700 border-green-200"
                                                    title={po.items[0]?.trackingRemarks ? `Remarks: ${po.items[0].trackingRemarks}` : undefined}
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                                                </span>
                                            ) : po.isDone ? (
                                                <span
                                                    onClick={() => isAdmin && setCompleteDialogPo(po.poNumber)}
                                                    className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border bg-green-50 text-green-700 border-green-200 ${isAdmin ? 'cursor-pointer hover:bg-green-100' : ''}`}
                                                    title={isAdmin ? 'Fully received. Click to mark as completed' : 'Fully received'}
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Fully Received
                                                </span>
                                            ) : (
                                                <span
                                                    onClick={() => isAdmin && setCompleteDialogPo(po.poNumber)}
                                                    className={`text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border bg-blue-50 text-blue-700 border-blue-200 ${isAdmin ? 'cursor-pointer hover:bg-blue-100' : ''}`}
                                                    title={isAdmin ? 'Click to mark as completed' : undefined}
                                                >
                                                    Pending
                                                    {isAdmin ? ' (Click to complete)' : ''}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col items-start gap-1 min-w-[180px]">
                                                {po.vendorUpdate ? (
                                                    <>
                                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${vendorStatusStyle(po.vendorUpdate.vendorStatus)}`}>
                                                            {po.vendorUpdate.vendorStatus}
                                                        </span>
                                                        {po.vendorUpdate.expectedDate && (
                                                            <span className="text-xs text-foreground">ETA: {formatDate(new Date(po.vendorUpdate.expectedDate))}</span>
                                                        )}
                                                        {po.vendorUpdate.remarks && (
                                                            <span className="text-xs text-muted-foreground max-w-[220px] line-clamp-2" title={po.vendorUpdate.remarks}>
                                                                {po.vendorUpdate.remarks}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {formatDateTime(po.vendorUpdate.createdAt)}
                                                            {po.vendorUpdate.updatedBy ? ` · ${po.vendorUpdate.updatedBy}` : ''}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">No update yet</span>
                                                )}
                                                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openVendorUpdate(po.poNumber)}>
                                                    <Phone className="w-3 h-3" /> {po.vendorUpdate ? 'Update / History' : 'Add Update'}
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 text-muted-foreground">{formatDateTime(po.statusDateTime)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <Dialog open={!!completeDialogPo} onOpenChange={(open) => {
                if (!open) {
                    setCompleteDialogPo(null);
                    setRemarksText('');
                }
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Mark PO {completeDialogPo} as Completed</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <label className="text-xs font-semibold text-muted-foreground">Remarks (optional)</label>
                        <Textarea
                            value={remarksText}
                            onChange={(e) => setRemarksText(e.target.value)}
                            placeholder="Add any remarks..."
                            rows={3}
                            className="resize-none text-sm"
                        />
                    </div>
                    <DialogFooter className="gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={() => { setCompleteDialogPo(null); setRemarksText(''); }}>
                            Cancel
                        </Button>
                        <Button size="sm" disabled={submittingComplete} onClick={handleConfirmComplete}>
                            {submittingComplete ? 'Saving...' : (
                                <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" /> Mark Completed
                                </span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!vuPo} onOpenChange={(open) => { if (!open) setVuPo(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Vendor Update · PO {vuPo}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Vendor Status *</label>
                            <Select value={vuStatus} onValueChange={setVuStatus}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
                                <SelectContent>
                                    {VENDOR_STATUS_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Expected Delivery Date (optional)</label>
                            <Input type="date" value={vuDate} onChange={(e) => setVuDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Remarks (what vendor said)</label>
                            <Textarea value={vuRemarks} onChange={(e) => setVuRemarks(e.target.value)} rows={3} className="resize-none text-sm" placeholder="e.g. Spoke to vendor, truck leaves tomorrow..." />
                        </div>
                        <Button className="w-full" disabled={vuSaving} onClick={saveVendorUpdate}>
                            {vuSaving ? 'Saving...' : 'Save Update'}
                        </Button>
                        <div className="border-t pt-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">History</p>
                            <div className="max-h-48 overflow-y-auto space-y-2">
                                {vuHistory.length === 0 && <p className="text-xs text-muted-foreground italic">No updates yet.</p>}
                                {vuHistory.map((u) => (
                                    <div key={u.id} className="rounded-lg border p-2 text-xs space-y-0.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`font-semibold px-2 py-0.5 rounded-full border ${vendorStatusStyle(u.vendorStatus)}`}>{u.vendorStatus}</span>
                                            <span className="text-muted-foreground">{formatDateTime(u.createdAt)}{u.updatedBy ? ` · ${u.updatedBy}` : ''}</span>
                                        </div>
                                        {u.expectedDate && <p>ETA: {formatDate(new Date(u.expectedDate))}</p>}
                                        {u.remarks && <p className="text-muted-foreground">{u.remarks}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
