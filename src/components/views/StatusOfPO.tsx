import React, { useEffect, useState, useMemo } from 'react';
import { ClipboardList, Search, RefreshCw, CheckCircle2, AlertTriangle, Clock, Calendar } from 'lucide-react';
import Heading from '../element/Heading';
import { fetchPendingPODetails } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface PendingPO {
    id: number;
    partyName: string;
    poNumber: string;
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
}

interface PendingQuantity {
    id: number;
    indentNumber: string;
    partyName: string;
    productName: string;
    approvedQuantity: number;
    poQuantityCreated: number;
    remainingQuantity: number;
    uom: string;
    rate: number;
    date: string;
    plannedDate: string | null;
}

export default function StatusOfPO() {
    const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
    const [pendingQuantities, setPendingQuantities] = useState<PendingQuantity[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [simulatedUpdates, setSimulatedUpdates] = useState<Record<string, string>>({});

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchPendingPODetails();
            setPendingPOs(data.pendingPOs || []);
            setPendingQuantities(data.pendingQuantities || []);
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
            // Delivery Date simulation
            let deliveryDateStr = 'Pending';
            if (first.planned) {
                deliveryDateStr = formatDate(new Date(first.planned));
            } else {
                const date = new Date(first.poDate);
                const days = parseInt(first.leadTime || '7');
                date.setDate(date.getDate() + (isNaN(days) ? 7 : days));
                deliveryDateStr = formatDate(date);
            }

            return {
                poNumber,
                partyName: first.partyName,
                poDate: first.poDate,
                status: first.status,
                deliveryDate: deliveryDateStr,
                items
            };
        });
    }, [pendingPOs]);

    const handleUpdateStatus = (poNumber: string) => {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = formatDate(now);
        const updateText = `Updated at ${dateString} ${timeString}`;

        setSimulatedUpdates(prev => ({
            ...prev,
            [poNumber]: updateText
        }));

        toast.success(`Status update simulated successfully for PO ${poNumber}!`, {
            description: `Timestamp: ${dateString} ${timeString}`,
            icon: <CheckCircle2 className="text-green-500 w-5 h-5" />,
            duration: 3000
        });
    };

    const filteredPOs = useMemo(() => {
        return groupedPOs.filter(group => {
            const term = searchTerm.toLowerCase();
            return (
                group.poNumber.toLowerCase().includes(term) ||
                group.partyName.toLowerCase().includes(term) ||
                group.status.toLowerCase().includes(term)
            );
        });
    }, [groupedPOs, searchTerm]);

    const filteredQuantities = useMemo(() => {
        return pendingQuantities.filter(item => {
            const term = searchTerm.toLowerCase();
            return (
                item.indentNumber.toLowerCase().includes(term) ||
                item.partyName.toLowerCase().includes(term) ||
                item.productName.toLowerCase().includes(term)
            );
        });
    }, [pendingQuantities, searchTerm]);

    return (
        <div className="w-full space-y-6 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <Heading
                    heading="Status of PO"
                    subtext="View pending/rejected POs, tracking status, and partial/outstanding quantities."
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

            <Tabs defaultValue="tracker" className="w-full">
                <TabsList className="grid grid-cols-2 max-w-md bg-muted/60 p-1 rounded-xl">
                    <TabsTrigger value="tracker" className="rounded-lg py-2 text-sm font-medium transition-all duration-300">
                        Pending POs Tracker
                    </TabsTrigger>
                    <TabsTrigger value="quantities" className="rounded-lg py-2 text-sm font-medium transition-all duration-300">
                        Pending PO Quantities
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tracker" className="mt-4 focus-visible:outline-none">
                    <div className="rounded-2xl border border-primary/10 bg-card/60 backdrop-blur-md shadow-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="font-semibold py-4">Party Name</TableHead>
                                        <TableHead className="font-semibold py-4">PO No</TableHead>
                                        <TableHead className="font-semibold py-4">PO Date</TableHead>
                                        <TableHead className="font-semibold py-4">Status</TableHead>
                                        <TableHead className="font-semibold py-4">Delivery Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12">
                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                    <Clock className="h-8 w-8 animate-spin text-primary" />
                                                    <span className="text-sm text-muted-foreground font-medium">Fetching PO details...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredPOs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12">
                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                                                    <span className="text-sm text-muted-foreground font-medium">No pending or rejected POs found.</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredPOs.map((po, index) => {
                                            const hasSimulatedUpdate = simulatedUpdates[po.poNumber];
                                            return (
                                                <TableRow key={index} className="hover:bg-muted/30 transition-colors duration-200">
                                                    <TableCell className="font-medium py-4 text-foreground">{po.partyName}</TableCell>
                                                    <TableCell className="py-4 font-semibold text-primary">{po.poNumber}</TableCell>
                                                    <TableCell className="py-4 text-muted-foreground">{formatDate(new Date(po.poDate))}</TableCell>
                                                    <TableCell className="py-4">
                                                        <button
                                                            onClick={() => handleUpdateStatus(po.poNumber)}
                                                            className={`text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm hover:shadow-md transition-all duration-300 underline decoration-dotted decoration-2 underline-offset-4 ${
                                                                hasSimulatedUpdate
                                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                                    : po.status === 'Rejected'
                                                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                                            }`}
                                                        >
                                                            {hasSimulatedUpdate ? hasSimulatedUpdate : po.status === 'Rejected' ? 'Rejected (Click to Update)' : 'Pending Approval (Click to Update)'}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                                                            <Calendar className="w-4 h-4 text-primary/70" />
                                                            {po.deliveryDate}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="quantities" className="mt-4 focus-visible:outline-none">
                    <div className="rounded-2xl border border-primary/10 bg-card/60 backdrop-blur-md shadow-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="font-semibold py-4">Party Name</TableHead>
                                        <TableHead className="font-semibold py-4">Indent No</TableHead>
                                        <TableHead className="font-semibold py-4">Indent Date</TableHead>
                                        <TableHead className="font-semibold py-4">Product</TableHead>
                                        <TableHead className="font-semibold py-4 text-right">Approved Qty</TableHead>
                                        <TableHead className="font-semibold py-4 text-right">PO Qty Created</TableHead>
                                        <TableHead className="font-semibold py-4 text-right">Remaining Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-12">
                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                    <Clock className="h-8 w-8 animate-spin text-primary" />
                                                    <span className="text-sm text-muted-foreground font-medium">Calculating pending quantities...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredQuantities.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-12">
                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                                                    <span className="text-sm text-muted-foreground font-medium">No partially pending PO quantities found.</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredQuantities.map((item, index) => (
                                            <TableRow key={index} className="hover:bg-muted/30 transition-colors duration-200">
                                                <TableCell className="font-medium py-4 text-foreground">{item.partyName}</TableCell>
                                                <TableCell className="py-4 font-semibold text-primary">{item.indentNumber}</TableCell>
                                                <TableCell className="py-4 text-muted-foreground">{formatDate(new Date(item.date))}</TableCell>
                                                <TableCell className="py-4 text-foreground font-medium">{item.productName}</TableCell>
                                                <TableCell className="py-4 text-right font-medium text-foreground">{item.approvedQuantity} {item.uom}</TableCell>
                                                <TableCell className="py-4 text-right font-medium text-blue-600">{item.poQuantityCreated} {item.uom}</TableCell>
                                                <TableCell className="py-4 text-right font-bold text-rose-600">
                                                    <span className="bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                                                        {item.remainingQuantity} {item.uom}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
