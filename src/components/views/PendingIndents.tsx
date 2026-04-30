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
    indentNo: string;
    firm: string;
    indenter: string;
    department: string;
    product: string;
    productCode: string;
    quantity: number;
    rate: number;
    uom: string;
    vendorName: string;
    paymentTerm: string;
    specifications: string;
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
    const [viewGroup, setViewGroup] = useState<{ indentNo: string; items: PendingIndentsData[] } | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setSearching(true);

        try {
            const data: any = await fetchFromSupabasePaginated('indent', '*',
                { column: 'planned_4', options: { ascending: false } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, status: 'PendingPO', abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((record: any) => ({
                    date: formatDate(new Date(record.createdAt)),
                    indentNo: record.indentNumber || '',
                    firm: record.firm || 'N/A',
                    indenter: record.indenterName || '',
                    department: record.department || '',
                    product: record.productName || '',
                    productCode: record.productCode || '',
                    quantity: record.approvedQuantity || record.quantity || 0,
                    rate: record.approvedRate || 0,
                    uom: record.uom || '',
                    vendorName: record.approvedVendorName || '',
                    paymentTerm: record.approvedPaymentTerm || '',
                    specifications: record.specifications || '',
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
                date: first.date,
                vendorName: first.vendorName,
                rate: first.rate,
                paymentTerm: first.paymentTerm,
                remarks: first.remarks,
                items,
            };
        });
    }, [tableData]);

    return (
        <>
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Heading heading="Pending POs" subtext="View pending purchase orders">
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
                                                onClick={() => setViewGroup({ indentNo: group.indentNo, items: group.items })}
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
            <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>Products — {viewGroup?.indentNo}</DialogTitle>
                </DialogHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Product Code</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>UOM</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Specifications</TableHead>
                                <TableHead>Remarks</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewGroup?.items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="text-xs">{idx + 1}</TableCell>
                                    <TableCell className="text-xs font-medium">{item.productCode || '-'}</TableCell>
                                    <TableCell className="text-xs">{item.product}</TableCell>
                                    <TableCell className="text-xs">{item.quantity}</TableCell>
                                    <TableCell className="text-xs">{item.uom}</TableCell>
                                    <TableCell className="text-xs">&#8377;{item.rate}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] break-words whitespace-normal">{item.specifications || '-'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] break-words whitespace-normal">{item.remarks || '-'}</TableCell>
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
