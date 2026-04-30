import { ListTodo, Search, ChevronDown, ChevronRight } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { formatDate, debounce } from '@/lib/utils';
import { fetchFromSupabasePaginated } from '@/lib/fetchers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface POMasterItem {
    id: number;
    timestamp: string;
    partyName: string;
    poNumber: string;
    quotationNumber: string;
    quotationDate: string;
    enquiryNumber: string;
    enquiryDate: string;
    internalCode: string;
    product: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    gstPercent: number;
    discountPercent: number;
    amount: number;
    totalPoAmount: number;
    preparedBy: string;
    approvedBy: string;
    pdf: string;
}

const parseGSTPercent = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const stringValue = String(value).trim();
    if (stringValue.includes('%')) return parseFloat(stringValue.replace('%', '').trim()) || 0;
    const numericValue = parseFloat(stringValue);
    if (isNaN(numericValue)) return 0;
    if (numericValue > 0 && numericValue < 1) return numericValue * 100;
    return numericValue;
};

export default () => {
    const [tableData, setTableData] = useState<POMasterItem[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setIsSearching(true);

        try {
            const data: any = await fetchFromSupabasePaginated(
                'po_master', '*',
                { column: 'createdAt', options: { ascending: false } },
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((sheet: any) => ({
                    id: sheet.id,
                    timestamp: sheet.createdAt ? formatDate(new Date(sheet.createdAt)) : '',
                    partyName: sheet.partyName || '',
                    poNumber: sheet.poNumber || '',
                    quotationNumber: sheet.quotationNumber || '',
                    quotationDate: sheet.quotationDate ? formatDate(new Date(sheet.quotationDate)) : '',
                    enquiryNumber: sheet.enquiryNumber || '',
                    enquiryDate: sheet.enquiryDate ? formatDate(new Date(sheet.enquiryDate)) : '',
                    internalCode: sheet.internalCode || '',
                    product: sheet.product || '',
                    description: sheet.description || '',
                    quantity: sheet.quantity || 0,
                    unit: sheet.unit || '',
                    rate: Number(sheet.rate) || 0,
                    gstPercent: parseGSTPercent(sheet.gstPercent),
                    discountPercent: sheet.discountPercent || 0,
                    amount: Number(sheet.amount) || 0,
                    totalPoAmount: Number(sheet.totalPOAmount || sheet.totalPoAmount) || 0,
                    preparedBy: sheet.preparedBy || '',
                    approvedBy: sheet.approvedBy || '',
                    pdf: sheet.pdf || '',
                }));
                setTableData(prev => append ? [...prev, ...mappedData] : mappedData);
                setTotal(data.total);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching PO Master:', error);
        } finally {
            if (!controller.signal.aborted) {
                setInitialLoading(false);
                setIsSearching(false);
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
        const groups = new Map<string, POMasterItem[]>();
        tableData.forEach(item => {
            if (!groups.has(item.poNumber)) groups.set(item.poNumber, []);
            groups.get(item.poNumber)!.push(item);
        });
        return Array.from(groups.entries()).map(([poNumber, items]) => {
            const first = items[0];
            return {
                poNumber,
                partyName: first.partyName,
                timestamp: first.timestamp,
                preparedBy: first.preparedBy,
                approvedBy: first.approvedBy,
                totalPoAmount: first.totalPoAmount,
                pdf: first.pdf,
                items,
            };
        });
    }, [tableData]);

    const toggleGroup = (poNumber: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(poNumber) ? next.delete(poNumber) : next.add(poNumber);
            return next;
        });
    };

    return (
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Heading heading="PO Master" subtext="View purchase orders from PO Master">
                <ListTodo size={50} className="text-primary" />
            </Heading>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search POs..."
                            className="pl-8 h-8 text-xs w-[200px]"
                            onChange={(e) => debouncedSearch(e.target.value)}
                        />
                    </div>
                </div>

                {isSearching && (
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
                        No POs found
                    </div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Party Name</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Prepared By</TableHead>
                                    <TableHead>Approved By</TableHead>
                                    <TableHead>Total PO Amount</TableHead>
                                    <TableHead>Indents</TableHead>
                                    <TableHead>PDF</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedData.map(group => {
                                    const isExpanded = expandedGroups.has(group.poNumber);
                                    return (
                                        <>
                                            <TableRow
                                                key={group.poNumber}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => toggleGroup(group.poNumber)}
                                            >
                                                <TableCell className="w-8">
                                                    {isExpanded
                                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                </TableCell>
                                                <TableCell className="font-medium text-xs sm:text-sm text-primary">{group.poNumber}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.partyName}</TableCell>
                                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{group.timestamp}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.preparedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm">{group.approvedBy}</TableCell>
                                                <TableCell className="text-xs sm:text-sm font-medium">&#8377;{group.totalPoAmount.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                        {group.items.length} {group.items.length === 1 ? 'indent' : 'indents'}
                                                    </span>
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    {group.pdf ? (
                                                        <a href={group.pdf} target="_blank" rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 underline text-xs">
                                                            View PDF
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">No PDF</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            {isExpanded && group.items.map((item, idx) => (
                                                <TableRow key={`${group.poNumber}-${idx}`} className="bg-muted/20">
                                                    <TableCell />
                                                    <TableCell className="text-xs text-muted-foreground pl-6">{item.internalCode || '-'}</TableCell>
                                                    <TableCell className="text-xs">{item.product}</TableCell>
                                                    <TableCell className="text-xs">{item.description || '-'}</TableCell>
                                                    <TableCell className="text-xs">{item.quantity} {item.unit}</TableCell>
                                                    <TableCell className="text-xs">&#8377;{item.rate.toLocaleString()}</TableCell>
                                                    <TableCell className="text-xs">{item.gstPercent}%</TableCell>
                                                    <TableCell className="text-xs">&#8377;{item.amount.toLocaleString()}</TableCell>
                                                    <TableCell />
                                                </TableRow>
                                            ))}
                                        </>
                                    );
                                })}
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
    );
};
