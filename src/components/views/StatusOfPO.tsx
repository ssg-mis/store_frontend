import React, { useEffect, useState, useMemo } from 'react';
import { ClipboardList, Search, RefreshCw, CheckCircle2, AlertTriangle, Clock, Calendar } from 'lucide-react';
import Heading from '../element/Heading';
import { fetchPendingPODetails, fetchPOStatusDetails, completePOTracking } from '@/lib/fetchers';
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
    const [generatingPdfFor, setGeneratingPdfFor] = useState<string | null>(null);

    const [completeDialogPo, setCompleteDialogPo] = useState<string | null>(null);
    const [remarksText, setRemarksText] = useState('');
    const [submittingComplete, setSubmittingComplete] = useState(false);

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

            return {
                poNumber,
                partyName: first.partyName,
                poDate: first.poDate,
                status: first.status,
                deliveryDate: deliveryDateStr,
                statusDateTime: first.statusDateTime,
                grnNumber: grnNumbers.join(', '),
                items
            };
        });
    }, [pendingPOs]);

    const filteredPOs = useMemo(() => {
        return groupedPOs.filter(group => {
            const term = searchTerm.toLowerCase();
            return (
                group.poNumber.toLowerCase().includes(term) ||
                group.grnNumber.toLowerCase().includes(term) ||
                group.partyName.toLowerCase().includes(term) ||
                group.status.toLowerCase().includes(term)
            );
        });
    }, [groupedPOs, searchTerm]);

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
        <div className="w-full space-y-6 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <Heading
                    heading="Status of PO"
                    subtext="View POs that already have a GRN generated but still have quantity pending."
                >
                    <ClipboardList size={40} className="text-primary animate-pulse" />
                </Heading>
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search records..."
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

            <div className="rounded-2xl border border-primary/10 bg-card/60 backdrop-blur-md shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/40">
                            <TableRow>
                                <TableHead className="font-semibold py-4">PO Date</TableHead>
                                <TableHead className="font-semibold py-4">PO No</TableHead>
                                <TableHead className="font-semibold py-4">GRN No</TableHead>
                                <TableHead className="font-semibold py-4">Vendor Name</TableHead>
                                <TableHead className="font-semibold py-4">Delivery Date</TableHead>
                                <TableHead className="font-semibold py-4">Status</TableHead>
                                <TableHead className="font-semibold py-4">Date &amp; Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <Clock className="h-8 w-8 animate-spin text-primary" />
                                            <span className="text-sm text-muted-foreground font-medium">Fetching PO details...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredPOs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <AlertTriangle className="h-8 w-8 text-amber-500" />
                                            <span className="text-sm text-muted-foreground font-medium">No partially received POs with outstanding quantities found.</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredPOs.map((po, index) => (
                                    <TableRow key={index} className="hover:bg-muted/30 transition-colors duration-200">
                                        <TableCell className="py-4 text-muted-foreground">{formatDate(new Date(po.poDate))}</TableCell>
                                        <TableCell className="py-4 font-semibold text-primary">
                                            <button
                                                onClick={() => handleViewPdf(po.poNumber)}
                                                disabled={generatingPdfFor === po.poNumber}
                                                className="underline decoration-dotted decoration-2 underline-offset-4 hover:text-primary/80 disabled:opacity-50"
                                            >
                                                {generatingPdfFor === po.poNumber ? 'Generating...' : po.poNumber}
                                            </button>
                                        </TableCell>
                                        <TableCell className="py-4 font-medium text-foreground">{po.grnNumber || '-'}</TableCell>
                                        <TableCell className="font-medium py-4 text-foreground">{po.partyName}</TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-1.5 text-foreground font-medium">
                                                <Calendar className="w-4 h-4 text-primary/70" />
                                                {po.deliveryDate}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <span
                                                onClick={() => isAdmin && setCompleteDialogPo(po.poNumber)}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border bg-blue-50 text-blue-700 border-blue-200 ${isAdmin ? 'cursor-pointer hover:shadow-md transition-all duration-300' : ''}`}
                                                title={isAdmin ? 'Click to mark as completed' : undefined}
                                            >
                                                Pending
                                                {isAdmin ? ' (Click to complete)' : ''}
                                            </span>
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
        </div>
    );
}
