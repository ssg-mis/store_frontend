import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { ClipLoader as Loader } from 'react-spinners';
import { PackageCheck, RotateCw, Plus } from 'lucide-react';
import {
    fetchAccessoryIssues,
    syncHrEmployeesNow,
    returnAccessoryItem,
    type AccessoryIssueRow,
    type AccessoryIssueItemRow,
} from '@/lib/fetchers';
import Heading from '../element/Heading';

const statusClasses: Record<string, string> = {
    Issued: 'bg-amber-100 text-amber-800',
    'Partially Returned': 'bg-blue-100 text-blue-800',
    Closed: 'bg-green-100 text-green-800',
};

const StatusBadge = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
    </span>
);

function ReturnItemRow({ issueId, item, onDone }: { issueId: number; item: AccessoryIssueItemRow; onDone: () => void }) {
    const remaining = item.issuedQuantity - item.reusableQty - item.unusableQty;
    const [condition, setCondition] = useState<'Reusable' | 'Unusable'>('Reusable');
    const [qty, setQty] = useState<string>('');
    const [remark, setRemark] = useState<string>('');
    const [saving, setSaving] = useState(false);

    // Two separate returns (e.g. 3 Reusable then 2 Unusable) are recorded as two saves —
    // the backend accumulates each item's reusable/unusable qty across multiple calls.
    const handleSave = async () => {
        const q = parseFloat(qty) || 0;
        if (q <= 0) {
            toast.error('Enter a quantity');
            return;
        }
        if (q > remaining + 0.0001) {
            toast.error(`Only ${remaining} unit(s) remain`);
            return;
        }
        setSaving(true);
        try {
            await returnAccessoryItem(issueId, item.id, {
                ...(condition === 'Reusable' ? { reusableQty: q } : { unusableQty: q }),
                ...(remark.trim() ? { returnRemarks: remark.trim() } : {}),
            });
            toast.success('Return recorded');
            setQty('');
            setRemark('');
            onDone();
        } catch (error: any) {
            toast.error(error.message || 'Failed to record return');
        } finally {
            setSaving(false);
        }
    };

    return (
        <TableRow>
            <TableCell>{item.productName}</TableCell>
            <TableCell>{item.issuedQuantity} {item.uom}</TableCell>
            <TableCell>{item.reusableQty}</TableCell>
            <TableCell>{item.unusableQty}</TableCell>
            <TableCell><StatusBadge status={item.status} /></TableCell>
            <TableCell className="text-xs text-muted-foreground">
                {item.returnedAt ? new Date(item.returnedAt).toLocaleString() : '-'}
                {item.returnRemarks && <div className="italic">"{item.returnRemarks}"</div>}
            </TableCell>
            <TableCell>
                {item.status === 'Closed' ? (
                    <span className="text-xs text-muted-foreground">Fully resolved</span>
                ) : (
                    <div className="flex items-center gap-2">
                        <Select value={condition} onValueChange={(v) => setCondition(v as 'Reusable' | 'Unusable')}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Reusable">Reusable</SelectItem>
                                <SelectItem value="Unusable">Unusable</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            type="number"
                            step="any"
                            placeholder="Qty"
                            className="w-20"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                        />
                        <Input
                            placeholder="Remark about the product"
                            className="w-44"
                            value={remark}
                            onChange={(e) => setRemark(e.target.value)}
                        />
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader size={14} color="#fff" /> : 'Save'}
                        </Button>
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}

export default () => {
    const navigate = useNavigate();
    const [issues, setIssues] = useState<AccessoryIssueRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [activeIssue, setActiveIssue] = useState<AccessoryIssueRow | null>(null);

    const load = async () => {
        setLoading(true);
        const data = await fetchAccessoryIssues();
        setIssues(data);
        setLoading(false);
        // Keep the open dialog's data fresh after a return is recorded
        setActiveIssue((prev) => (prev ? data.find((i) => i.id === prev.id) || null : null));
    };

    useEffect(() => {
        load();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const result = await syncHrEmployeesNow();
            toast.success(`Synced ${result.synced ?? 0} employee(s) from HR`);
        } catch (error: any) {
            toast.error(error.message || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-4">
            <Heading heading="Employee Loan Tracker" subtext="Items issued to employees — reusable returns restock, unusable returns are written off">
                <PackageCheck className="size-6 text-primary" />
            </Heading>

            <div className="flex justify-end gap-2 px-4">
                <Button variant="outline" onClick={handleSync} disabled={syncing}>
                    <RotateCw className={`size-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> Sync HR Employees
                </Button>
                <Button onClick={() => navigate('/accessory-tracking/new')}>
                    <Plus className="size-4 mr-2" /> Issue Accessory
                </Button>
            </div>

            <div className="border rounded-md mx-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Products</TableHead>
                            <TableHead>Issue Date</TableHead>
                            <TableHead>Issued By</TableHead>
                            <TableHead>Remarks</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Return Date</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-6"><Loader size={20} /></TableCell></TableRow>
                        ) : issues.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No accessory issues yet</TableCell></TableRow>
                        ) : (
                            issues.map((issue) => {
                                // Only shown once every item is back (Reusable or Unusable) — not for a
                                // still-open or partially-returned issue.
                                const returnedAt = issue.status === 'Closed'
                                    ? issue.items.reduce<string | null>((latest, it) => (
                                        it.returnedAt && (!latest || it.returnedAt > latest) ? it.returnedAt : latest
                                    ), null)
                                    : null;
                                return (
                                    <TableRow key={issue.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveIssue(issue)}>
                                        <TableCell>{issue.employeeCode} — {issue.employeeName}</TableCell>
                                        <TableCell>{issue.items.map((i) => `${i.productName} x${i.issuedQuantity}`).join(', ')}</TableCell>
                                        <TableCell>{new Date(issue.createdAt).toLocaleString()}</TableCell>
                                        <TableCell>{issue.issuedBy || '-'}</TableCell>
                                        <TableCell className="max-w-48 truncate" title={issue.remarks || ''}>{issue.remarks || '-'}</TableCell>
                                        <TableCell><StatusBadge status={issue.status} /></TableCell>
                                        <TableCell>{returnedAt ? new Date(returnedAt).toLocaleString() : '-'}</TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setActiveIssue(issue); }}>
                                                View / Return
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!activeIssue} onOpenChange={(open) => !open && setActiveIssue(null)}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            {activeIssue && `${activeIssue.employeeCode} — ${activeIssue.employeeName}`}
                        </DialogTitle>
                        {activeIssue && (
                            <div className="text-sm text-muted-foreground space-y-0.5">
                                <div>Issued {new Date(activeIssue.createdAt).toLocaleString()}{activeIssue.issuedBy ? ` by ${activeIssue.issuedBy}` : ''}</div>
                                {activeIssue.remarks && <div>Remarks: {activeIssue.remarks}</div>}
                            </div>
                        )}
                    </DialogHeader>
                    {activeIssue && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Issued</TableHead>
                                    <TableHead>Reusable</TableHead>
                                    <TableHead>Unusable</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last Returned</TableHead>
                                    <TableHead>Process Return</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeIssue.items.map((item) => (
                                    <ReturnItemRow key={item.id} issueId={activeIssue.id} item={item} onDone={load} />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};
