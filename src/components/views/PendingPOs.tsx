import { ListTodo, Search } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { formatDate, debounce } from '@/lib/utils';
import { fetchFromSupabasePaginated } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface PendingIndentsData {
    date: string;
    validityDate: string;
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    areaOfUse: string;
    departmentHead: string;
    indentApprovedBy: string;
    product: string;
    productCode: string;
    quantity: number;
    rate: number;
    uom: string;
    vendorName: string;
    paymentTerm: string;
    approvedActualTime: number | null;
    specifications: string;
    attachment: string;
    remarks: string;
}

export default () => {
    const [tableData, setTableData] = useState<PendingIndentsData[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const [viewGroup, setViewGroup] = useState<{
        indentNo: string; firm: string; indenter: string; department: string;
        areaOfUse: string; departmentHead: string; indentApprovedBy: string;
        date: string; validityDate: string; vendorName: string; paymentTerm: string;
        approvedActualTime: number | null; remarks: string; items: PendingIndentsData[];
    } | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setSearching(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*',
                { column: 'planned_4', options: { ascending: true } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, status: 'PendingPO', abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    date: formatDate(new Date(record.createdAt)),
                    validityDate: record.validityDate ? formatDate(new Date(record.validityDate)) : '',
                    indentNo: record.indentNumber || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    areaOfUse: record.areaOfUse || '',
                    departmentHead: record.departmentHead || '',
                    indentApprovedBy: record.indentApprovedBy || '',
                    product: record.productName || '',
                    productCode: record.productCode || '',
                    quantity: record.approvedQuantity || record.quantity || 0,
                    rate: record.approvedRate || 0,
                    uom: record.uom || '',
                    vendorName: record.approvedVendorName || '',
                    paymentTerm: record.approvedPaymentTerm || '',
                    approvedActualTime: record.approvedActualTime ?? null,
                    specifications: record.specifications || '',
                    attachment: record.attachment || '',
                    remarks: record.remarks || '',
                }));
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching Pending POs:', error);
        } finally {
            if (!controller.signal.aborted) {
                setInitialLoading(false);
                setSearching(false);
            }
        }
    }, [tableData.length]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchData(1, '');
        return () => abortRef.current?.abort();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const debouncedSearch = useCallback(
        debounce((query: string) => {
            setPage(1);
            setSearch(query);
            fetchData(1, query);
        }, 500),
        [fetchData]
    );

    const groupedData = useMemo(() => {
        const groups = new Map<string, PendingIndentsData[]>();
        tableData.forEach(item => {
            if (!groups.has(item.indentNo)) groups.set(item.indentNo, []);
            groups.get(item.indentNo)!.push(item);
        });
        return Array.from(groups.entries()).map(([indentNo, items]) => {
            const first = items[0];
            return {
                indentNo,
                firm: first.firm,
                indenter: first.indenter,
                department: first.department,
                areaOfUse: first.areaOfUse,
                departmentHead: first.departmentHead,
                indentApprovedBy: first.indentApprovedBy,
                date: first.date,
                validityDate: first.validityDate,
                vendorName: first.vendorName,
                rate: first.rate,
                paymentTerm: first.paymentTerm,
                approvedActualTime: first.approvedActualTime,
                remarks: first.remarks,
                items,
            };
        });
    }, [tableData]);

    return (
        <>
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Heading heading="Pending for PO" subtext="View pending purchase orders">
                <ListTodo size={50} className="text-primary" />
            </Heading>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search indents..."
                            className="pl-8 h-8 text-xs w-[200px]"
                            onChange={(e) => debouncedSearch(e.target.value)}
                        />
                    </div>
                </div>

                {searching && (
                    <div className="w-full h-0.5 bg-primary/20 rounded-full overflow-hidden">
                        <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
                    </div>
                )}

                {initialLoading ? (
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                        ))}
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                        No pending POs found
                    </div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Indent No</TableHead>
                                    <TableHead>Firm</TableHead>
                                    <TableHead>Indenter</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Vendor Name</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Payment Term</TableHead>
                                    <TableHead>Products</TableHead>
                                    <TableHead>Remarks</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedData.map(group => (
                                    <TableRow key={group.indentNo}>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs px-3"
                                                onClick={() => setViewGroup(group)}
                                            >
                                                View
                                            </Button>
                                        </TableCell>
                                        <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.indentNo}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">{group.firm}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">{group.indenter}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">{group.department}</TableCell>
                                        <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.date}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">{group.vendorName}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">&#8377;{group.rate}</TableCell>
                                        <TableCell className="text-xs sm:text-sm">{group.paymentTerm}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs sm:text-sm text-muted-foreground max-w-[200px] break-words whitespace-normal">
                                            {group.remarks || '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {!initialLoading && total > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                        <span>{tableData.length} of {total} items</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                disabled={page === 1}
                                onClick={() => { const p = page - 1; setPage(p); fetchData(p, search, false); }}
                            >Previous</Button>
                            <span>Page {page}</span>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-3"
                                disabled={tableData.length >= total}
                                onClick={() => { const p = page + 1; setPage(p); fetchData(p, search, false); }}
                            >Next</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <Dialog open={!!viewGroup} onOpenChange={(open) => { if (!open) setViewGroup(null); }}>
            <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Indent Details — {viewGroup?.indentNo}</DialogTitle>
                </DialogHeader>

                {/* ── Details grid ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 bg-muted/30 rounded-lg px-4 py-3 border">
                    {[
                        { label: 'Firm',              value: viewGroup?.firm },
                        { label: 'Indenter',          value: viewGroup?.indenter },
                        { label: 'Department',        value: viewGroup?.department },
                        { label: 'Area of Use',       value: viewGroup?.areaOfUse },
                        { label: 'Department Head',   value: viewGroup?.departmentHead },
                        { label: 'Indent Approved By',value: viewGroup?.indentApprovedBy },
                        { label: 'Request Date',      value: viewGroup?.date },
                        { label: 'Validity Date',     value: viewGroup?.validityDate },
                        { label: 'Vendor Name',       value: viewGroup?.vendorName },
                        { label: 'Payment Term',      value: viewGroup?.paymentTerm },
                        {
                            label: 'Actual Time To Receive',
                            value: viewGroup?.approvedActualTime != null
                                ? `${viewGroup.approvedActualTime} days`
                                : null,
                        },
                        { label: 'Remarks',           value: viewGroup?.remarks },
                    ].map(({ label, value }) =>
                        value ? (
                            <div key={label} className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                <span className="text-xs font-medium text-foreground mt-0.5">{value}</span>
                            </div>
                        ) : null
                    )}
                </div>

                {/* ── Products table ── */}
                <div className="overflow-x-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="text-xs">#</TableHead>
                                <TableHead className="text-xs">Product Code</TableHead>
                                <TableHead className="text-xs">Product</TableHead>
                                <TableHead className="text-xs">Qty</TableHead>
                                <TableHead className="text-xs">UOM</TableHead>
                                <TableHead className="text-xs">Rate</TableHead>
                                <TableHead className="text-xs">Specifications</TableHead>
                                <TableHead className="text-xs">Attachment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewGroup?.items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell>
                                        {item.productCode
                                            ? <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">{item.productCode}</span>
                                            : <span className="text-muted-foreground text-xs">—</span>
                                        }
                                    </TableCell>
                                    <TableCell className="text-xs font-medium">{item.product}</TableCell>
                                    <TableCell className="text-xs">{item.quantity}</TableCell>
                                    <TableCell className="text-xs">{item.uom}</TableCell>
                                    <TableCell className="text-xs font-semibold">&#8377;{item.rate.toLocaleString()}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[180px] break-words whitespace-normal">{item.specifications || '—'}</TableCell>
                                    <TableCell className="text-xs">
                                        {item.attachment
                                            ? <a href={item.attachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                                            : <span className="text-muted-foreground">—</span>
                                        }
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
};
