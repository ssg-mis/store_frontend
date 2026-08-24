import { ClipboardCheck, Search, Check, X, RotateCcw, FileText, History } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import { fetchPOApprovals, approvePO, rejectPO, fetchVendors, fetchFirms, uploadFile, fetchPurchaseHistory, fetchIndentHistory, fetchPOByNumber, type PurchaseHistoryRow } from '@/lib/fetchers';
import { useSheets } from '@/context/SheetsContext';
import { pdf } from '@react-pdf/renderer';
import POPdf, { type POPdfProps } from '../element/POPdf';
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
    make: string | null;
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

const formatFirmAddress = (firm: any, fallback = '') => {
    if (!firm) return fallback;
    const lines = [
        firm.firm_address || '',
        [firm.state, firm.pin_code].filter(Boolean).join(' '),
    ].filter(Boolean);
    return lines.join('\n') || fallback;
};

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
    const { masterSheet: details } = useSheets();
    const navigate = useNavigate();
    const actorName = (user as any)?.name || (user as any)?.username || '';

    // Vendor + firm data, used to regenerate the PO copy from live line items.
    const [vendors, setVendors] = useState<any[]>([]);
    const [firms, setFirms] = useState<any[]>([]);
    const [generatingCopy, setGeneratingCopy] = useState(false);

    const [tab, setTab] = useState<'pending' | 'rejected'>('pending');
    const [pendingRows, setPendingRows] = useState<PORow[]>([]);
    const [rejectedRows, setRejectedRows] = useState<PORow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [viewGroup, setViewGroup] = useState<POGroup | null>(null);
    const [viewFromHistory, setViewFromHistory] = useState(false);
    const [historyPOLoading, setHistoryPOLoading] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectError, setRejectError] = useState(false);
    const [isRejectingInline, setIsRejectingInline] = useState(false);

    const [historyProduct, setHistoryProduct] = useState<string | null>(null);
    const [historyData, setHistoryData] = useState<PurchaseHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [historyIndentNumber, setHistoryIndentNumber] = useState<string | null>(null);
    const [historyIndentData, setHistoryIndentData] = useState<any[]>([]);
    const [historyIndentLoading, setHistoryIndentLoading] = useState(false);

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

    useEffect(() => {
        fetchVendors().then((v) => setVendors(Array.isArray(v) ? v : [])).catch(() => {});
        fetchFirms().then((f) => setFirms(Array.isArray(f) ? f : [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!historyProduct) return;
        setHistoryLoading(true);
        fetchPurchaseHistory(historyProduct)
            .then(setHistoryData)
            .finally(() => setHistoryLoading(false));
    }, [historyProduct]);

    useEffect(() => {
        if (!historyIndentNumber) return;
        setHistoryIndentLoading(true);
        fetchIndentHistory(historyIndentNumber)
            .then(setHistoryIndentData)
            .finally(() => setHistoryIndentLoading(false));
    }, [historyIndentNumber]);

    // Regenerate the PO copy from ALL of this PO's live line items, so the PDF
    // always matches what's shown in the modal — instead of relying on the single
    // (possibly partial) PDF that was stored when one submit created the PO.
    async function handleViewPOCopy(group: POGroup) {
        setGeneratingCopy(true);
        try {
            const first: any = group.items[0] || {};
            const firm = firms.find((f: any) => f.firm_name === group.firm);
            const vendor = vendors.find((v: any) => (v.vendorName || '').trim().toLowerCase() === (group.partyName || '').trim().toLowerCase());

            const firmAddress = formatFirmAddress(firm, details?.companyAddress || '');
            const companyName = firm?.firm_name || details?.companyName || '';

            let logoBase64 = '';
            try {
                const logoResponse = await fetch('/logo.png');
                const logoBlob = await logoResponse.blob();
                logoBase64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(logoBlob);
                });
            } catch { /* logo is optional */ }

            const terms: string[] = [];
            for (let i = 1; i <= 10; i++) {
                const t = first[`term${i}`] || first[`term_${i}`];
                if (t && String(t).trim()) terms.push(String(t).trim());
            }

            const props: POPdfProps = {
                companyLogo: logoBase64,
                companyName,
                companyPhone: firm?.mobile || details?.companyPhone || '',
                companyGstin: firm?.firm_gstin || details?.companyGstin || '',
                companyPan: firm?.pan_number || details?.companyPan || '',
                companyAddress: firmAddress,
                billingAddress: firmAddress || details?.billingAddress || '',
                // The user-edited destination address is saved per-PO (POMaster.destinationAddress).
                // Fall back to the firm's own address for POs created before this field existed.
                destinationAddress: first.destinationAddress || [companyName, firmAddress].filter(Boolean).join('\n'),
                supplierName: group.partyName,
                supplierAddress: vendor?.address || '',
                supplierGstin: vendor?.gstin || '',
                orderNumber: group.poNumber,
                orderDate: group.createdAt ? formatDate(new Date(group.createdAt)) : '',
                quotationNumber: (first.quotationNumber && first.quotationNumber !== '-') ? first.quotationNumber : '',
                quotationDate: (first.quotationNumber && first.quotationNumber !== '-' && first.quotationDate) ? formatDate(new Date(first.quotationDate)) : '',
                enqNo: first.enquiryNumber || '',
                enqDate: first.enquiryDate ? formatDate(new Date(first.enquiryDate)) : '',
                description: first.description || '',
                items: group.items.map((it: any) => ({
                    internalCode: it.internalCode || '',
                    firm: group.firm,
                    product: it.product || '',
                    description: it.description || '',
                    quantity: Number(it.quantity || 0),
                    unit: it.unit || '',
                    rate: Number(it.rate || 0),
                    gst: Number(it.gstPercent || 0),
                    discount: Number(it.discountPercent || 0),
                    amount: Number(it.amount || 0),
                })),
                total: Number(group.totalPOAmount || 0),
                gstAmount: 0,
                grandTotal: Number(group.totalPOAmount || 0),
                terms,
                preparedBy: group.preparedBy || '',
                approvedBy: first.approvedBy || '',
                transportationType: first.transportationType || '',
                firm: group.firm,
            };

            const blob = await pdf(<POPdf {...props} />).toBlob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            // Revoke after a delay so the new tab has time to load it.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err: any) {
            console.error('Error generating PO copy:', err);
            toast.error('Failed to generate PO copy');
        } finally {
            setGeneratingCopy(false);
        }
    }

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
            // Generate the final PDF from live line items and store it to S3 at the
            // moment of approval — this is the official, immutable copy of the PO.
            let pdfUrl: string | undefined;
            try {
                const firm = firms.find((f: any) => f.firm_name === group.items[0]?.firm);
                const vendor = vendors.find((v: any) =>
                    (v.vendorName || '').trim().toLowerCase() === (group.partyName || '').trim().toLowerCase()
                );
                const firmAddress = formatFirmAddress(firm, details?.companyAddress || '');
                const companyName = firm?.firm_name || details?.companyName || '';

                let logoBase64 = '';
                try {
                    const logoBlob = await fetch('/logo.png').then(r => r.blob());
                    logoBase64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(logoBlob);
                    });
                } catch { /* logo optional */ }

                const first: any = group.items[0] || {};
                const terms: string[] = [];
                for (let i = 1; i <= 10; i++) {
                    const t = first[`term${i}`] || first[`term_${i}`];
                    if (t && String(t).trim()) terms.push(String(t).trim());
                }

                const props: POPdfProps = {
                    companyLogo: logoBase64,
                    companyName,
                    companyPhone: firm?.mobile || details?.companyPhone || '',
                    companyGstin: firm?.firm_gstin || details?.companyGstin || '',
                    companyPan: firm?.pan_number || details?.companyPan || '',
                    companyAddress: firmAddress,
                    billingAddress: firmAddress || details?.billingAddress || '',
                    // The user-edited destination address is saved per-PO (POMaster.destinationAddress).
                    // Fall back to the firm's own address for POs created before this field existed.
                    destinationAddress: first.destinationAddress || [companyName, firmAddress].filter(Boolean).join('\n'),
                    supplierName: group.partyName,
                    supplierAddress: vendor?.address || '',
                    supplierGstin: vendor?.gstin || '',
                    orderNumber: group.poNumber,
                    orderDate: group.createdAt ? formatDate(new Date(group.createdAt)) : '',
                    quotationNumber: (first.quotationNumber && first.quotationNumber !== '-') ? first.quotationNumber : '',
                    quotationDate: (first.quotationNumber && first.quotationNumber !== '-' && first.quotationDate) ? formatDate(new Date(first.quotationDate)) : '',
                    enqNo: first.enquiryNumber || '',
                    enqDate: first.enquiryDate ? formatDate(new Date(first.enquiryDate)) : '',
                    description: first.description || '',
                    items: group.items.map((it: any) => ({
                        internalCode: it.internalCode || '',
                        firm: group.items[0]?.firm || '',
                        product: it.product || '',
                        description: it.description || '',
                        quantity: Number(it.quantity || 0),
                        unit: it.unit || '',
                        rate: Number(it.rate || 0),
                        gst: Number(it.gstPercent || 0),
                        discount: Number(it.discountPercent || 0),
                        amount: Number(it.amount || 0),
                    })),
                    total: Number(group.totalPOAmount || 0),
                    gstAmount: 0,
                    grandTotal: Number(group.totalPOAmount || 0),
                    terms,
                    preparedBy: group.preparedBy || '',
                    approvedBy: first.approvedBy || '',
                    transportationType: first.transportationType || '',
                    firm: group.items[0]?.firm || '',
                };

                const blob = await pdf(<POPdf {...props} />).toBlob();
                const file = new File([blob], `PO-${group.poNumber}.pdf`, { type: 'application/pdf' });
                pdfUrl = await uploadFile(file, import.meta.env.VITE_PURCHASE_ORDERS_FOLDER || '');
            } catch (pdfErr) {
                // PDF generation/upload failure should not block approval.
                console.error('PDF generation failed during approval:', pdfErr);
                toast.warning('PO approved but PDF could not be saved — you can still view it on demand.');
            }

            const result = await approvePO(group.poNumber, actorName, pdfUrl);
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

    // Opens the read-only "View PO" dialog for a PO surfaced via Purchase
    // History — it may already be Approved, so it won't be in pendingRows/rejectedRows.
    async function handleViewHistoricalPO(poNumber: string) {
        setHistoryPOLoading(poNumber);
        try {
            const rows = await fetchPOByNumber(poNumber);
            if (!Array.isArray(rows) || rows.length === 0) {
                toast.error(`Could not load details for PO ${poNumber}`);
                return;
            }
            const [group] = groupByPoNumber(rows);
            // Stack the View PO dialog on top instead of closing the Purchase
            // History dialog first — toggling one Radix Dialog closed the same
            // tick another opens makes their focus/dismiss layers fight and the
            // new dialog closes itself immediately. Leaving History open
            // underneath sidesteps that entirely.
            setViewFromHistory(true);
            setViewGroup(group);
        } finally {
            setHistoryPOLoading(null);
        }
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
                                        <TableHead>Make</TableHead>
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
                                                    setViewFromHistory(false);
                                                    setViewGroup(group);
                                                }}
                                            >
                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs px-2.5"
                                                        onClick={() => { setViewFromHistory(false); setViewGroup(group); }}>
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
                                                <TableCell className="text-xs sm:text-sm text-muted-foreground">
                                                    {(() => {
                                                        const makes = [...new Set(group.items.map(i => i.make).filter(Boolean))];
                                                        return makes.length ? makes.join(', ') : '—';
                                                    })()}
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
                setViewFromHistory(false);
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
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">PO Copy</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <button
                                type="button"
                                disabled={generatingCopy || !viewGroup}
                                onClick={() => viewGroup && handleViewPOCopy(viewGroup)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FileText className="h-3 w-3" />
                                {generatingCopy ? 'Generating...' : 'View PDF'}
                            </button>
                        </div>
                    </div>
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
                                <TableHead className="text-xs">Amount (excl. GST)</TableHead>
                                <TableHead className="text-xs">Amount</TableHead>
                                <TableHead className="text-xs">Make</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewGroup?.items.map((item, idx) => {
                                const rate = Number(item.rate || 0);
                                const qty = Number(item.quantity || 0);
                                const discount = Number(item.discountPercent || 0);
                                const exclGst = (rate * qty) * (1 - discount / 100);

                                return (
                                    <TableRow key={item.id}>
                                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="text-xs">
                                            {item.internalCode ? (
                                                <button
                                                    type="button"
                                                    className="font-medium text-primary hover:underline flex items-center gap-1 text-left"
                                                    onClick={(e) => { e.stopPropagation(); setHistoryIndentNumber(item.internalCode); setHistoryIndentData([]); }}
                                                >
                                                    {item.internalCode}
                                                    <History className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                </button>
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <button
                                                type="button"
                                                className="font-medium text-primary hover:underline flex items-center gap-1 text-left"
                                                onClick={(e) => { e.stopPropagation(); setHistoryProduct(item.product); setHistoryData([]); }}
                                            >
                                                {item.product}
                                                <History className="h-3 w-3 shrink-0 text-muted-foreground" />
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-xs">{item.quantity}</TableCell>
                                        <TableCell className="text-xs">{item.unit}</TableCell>
                                        <TableCell className="text-xs">&#8377;{Number(item.rate || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs">
                                            {item.discountPercent ? `${item.discountPercent}%` : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {item.gstPercent !== undefined && item.gstPercent !== null ? `${item.gstPercent}%` : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">&#8377;{Number(exclGst.toFixed(2)).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs font-semibold">&#8377;{Number(item.amount || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{item.make || '—'}</TableCell>
                                    </TableRow>
                                );
                            })}
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
                        viewFromHistory ? null :
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
        {/* ── Purchase history dialog ── */}
        <Dialog open={!!historyProduct} onOpenChange={(open) => { if (!open) { setHistoryProduct(null); setHistoryData([]); } }}>
            <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Purchase History — {historyProduct}
                    </DialogTitle>
                </DialogHeader>

                {historyLoading ? (
                    <div className="space-y-2 py-4">
                        {[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-muted animate-pulse rounded" />)}
                    </div>
                ) : historyData.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                        No purchase history found for this item
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/20">
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs">PO Number</TableHead>
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Vendor / Party</TableHead>
                                    <TableHead className="text-xs">Qty</TableHead>
                                    <TableHead className="text-xs">Unit</TableHead>
                                    <TableHead className="text-xs">Rate</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Received</TableHead>
                                    <TableHead className="text-xs">GRN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyData.map((row, idx) => (
                                    <TableRow key={row.poNumber + idx}>
                                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="text-xs font-medium whitespace-nowrap">
                                            <button
                                                type="button"
                                                disabled={historyPOLoading === row.poNumber}
                                                className="text-primary hover:underline flex items-center gap-1 text-left disabled:opacity-50"
                                                onClick={() => handleViewHistoricalPO(row.poNumber)}
                                            >
                                                {row.poNumber}
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">{row.poDate ? formatDate(new Date(row.poDate)) : '—'}</TableCell>
                                        <TableCell className="text-xs">{row.vendor}</TableCell>
                                        <TableCell className="text-xs">{row.quantity}</TableCell>
                                        <TableCell className="text-xs">{row.unit}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">&#8377;{Number(row.rate || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">&#8377;{Number(row.amount || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs">
                                            {row.receivedQuantity != null ? (
                                                <span>{row.receivedQuantity} {row.unit}</span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {row.grnNumber || '—'}
                                            {row.receivedDate && (
                                                <div className="text-[10px]">{formatDate(new Date(row.receivedDate))}</div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </DialogContent>
        </Dialog>

        {/* ── Indent history dialog ── */}
        <Dialog open={!!historyIndentNumber} onOpenChange={(open) => { if (!open) { setHistoryIndentNumber(null); setHistoryIndentData([]); } }}>
            <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Indent History — {historyIndentNumber}
                        {historyIndentData[0]?.createdAt && (
                            <span className="text-xs font-normal text-muted-foreground ml-2">
                                (Requested: {formatDate(new Date(historyIndentData[0].createdAt))})
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {historyIndentLoading ? (
                    <div className="space-y-2 py-4">
                        {[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-muted animate-pulse rounded" />)}
                    </div>
                ) : historyIndentData.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                        No indent details found
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/20">
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs">Product Name</TableHead>
                                    <TableHead className="text-xs">Indenter</TableHead>
                                    <TableHead className="text-xs">Area of Use</TableHead>
                                    <TableHead className="text-xs">Indented Qty</TableHead>
                                    <TableHead className="text-xs">Approved Qty</TableHead>
                                    <TableHead className="text-xs">Rate Comparison</TableHead>
                                    <TableHead className="text-xs">PO Status</TableHead>
                                    <TableHead className="text-xs">GRN Status</TableHead>
                                    <TableHead className="text-xs">Issue Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyIndentData.map((row, idx) => {
                                    const approved = row.approvedIndents?.[0];
                                    const threeParty = row.threePartyApproval?.[0];
                                    const quotes = row.vendorRateUpdates?.[0];
                                    const poList = row.poMasters || [];
                                    const grnList = row.received || [];
                                    const storeOutList = row.storeOutApproval || [];

                                    // Quoted rates text
                                    const rateQuotes = [];
                                    if (quotes?.vendorName1) rateQuotes.push(`${quotes.vendorName1}: ₹${quotes.rate1}`);
                                    if (quotes?.vendorName2) rateQuotes.push(`${quotes.vendorName2}: ₹${quotes.rate2}`);
                                    if (quotes?.vendorName3) rateQuotes.push(`${quotes.vendorName3}: ₹${quotes.rate3}`);
                                    const quotesText = rateQuotes.join(', ') || '—';

                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                            <TableCell className="text-xs font-medium whitespace-nowrap">{row.productName}</TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                <div>{row.indenterName || '—'}</div>
                                                {row.department && (
                                                    <div className="text-[10px] text-muted-foreground">{row.department}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">{row.areaOfUse || '—'}</TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                <div>{row.quantity} {row.uom}</div>
                                                <div className="text-[10px] text-muted-foreground">{row.createdAt ? formatDate(new Date(row.createdAt)) : '—'}</div>
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {approved ? (
                                                    <>
                                                        <div>{approved.approvedQuantity} {row.uom}</div>
                                                        {approved.planned && (
                                                            <div className="text-[10px] text-muted-foreground">Planned: {formatDate(new Date(approved.planned))}</div>
                                                        )}
                                                    </>
                                                ) : <span className="text-muted-foreground">Pending</span>}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <div className="text-[10px] text-muted-foreground whitespace-pre-wrap">{quotesText}</div>
                                                {threeParty && (
                                                    <div className="font-medium text-emerald-600 mt-0.5 text-[11px]">
                                                        Selected: {threeParty.approvedVendorName} (₹{threeParty.approvedRate})
                                                        {threeParty.approvedDate && (
                                                            <div className="text-[10px] text-muted-foreground font-normal">
                                                                {formatDate(new Date(threeParty.approvedDate))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {poList.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {poList.map((po: any, pIdx: number) => (
                                                            <div key={pIdx} className="whitespace-nowrap">
                                                                <div className="font-medium">{po.poNumber} <span className="text-muted-foreground font-normal ml-0.5">({po.quantity} {po.unit})</span></div>
                                                                <div className="text-[10px] text-muted-foreground">{po.createdAt ? formatDate(new Date(po.createdAt)) : ''}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {grnList.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {grnList.map((grn: any, gIdx: number) => (
                                                            <div key={gIdx} className="whitespace-nowrap">
                                                                <div className="font-medium">{grn.grnNumber || 'GRN'} <span className="text-muted-foreground font-normal ml-0.5">({grn.receivedQuantity} {row.uom})</span></div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {grn.createdAt ? formatDate(new Date(grn.createdAt)) : ''}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {storeOutList.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {storeOutList.map((so: any, sIdx: number) => (
                                                            <div key={sIdx} className="whitespace-nowrap">
                                                                <div className="font-medium">{so.issue_status || 'Issued'} <span className="text-muted-foreground font-normal ml-0.5">({so.issued_quantity || 0} {row.uom})</span></div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {so.createdAt ? formatDate(new Date(so.createdAt)) : ''}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
        </>
    );
}
