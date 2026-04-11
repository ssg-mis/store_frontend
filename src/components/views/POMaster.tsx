import { ListTodo } from 'lucide-react';
import Heading from '../element/Heading';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate, debounce } from '@/lib/utils';
import DataTable from '../element/DataTable';
import { fetchFromSupabasePaginated } from '@/lib/fetchers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface PendingIndentsData {
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

// Helper function to parse GST percentage value
const parseGSTPercent = (value: any): number => {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    // Convert to string first
    const stringValue = String(value).trim();

    // If it's already a percentage string (like "18%"), remove % and convert
    if (stringValue.includes('%')) {
        const numericPart = stringValue.replace('%', '').trim();
        const parsed = parseFloat(numericPart);
        return isNaN(parsed) ? 0 : parsed;
    }

    // If it's a decimal (like 0.18 for 18%), convert to percentage
    const numericValue = parseFloat(stringValue);
    if (isNaN(numericValue)) {
        return 0;
    }

    // If the value is between 0 and 1, it's likely a decimal representation
    // Convert it to percentage (0.18 -> 18)
    if (numericValue > 0 && numericValue < 1) {
        return numericValue * 100;
    }

    // Otherwise, assume it's already in percentage format
    return numericValue;
};

export default () => {

    const [tableData, setTableData] = useState<PendingIndentsData[]>([]);

    // Filter states (kept for FilterBar options)
    const [filters, setFilters] = useState({
        partyName: 'All',
        product: 'All'
    });

    // Server-side pagination states
    const [initialLoading, setInitialLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setIsSearching(true);
        else setIsLoadingMore(true);

        try {
            const data: any = await fetchFromSupabasePaginated(
                'po_master',
                '*',
                { column: 'createdAt', options: { ascending: false } }, 
                undefined, undefined,
                { page: pageValue, limit: 50, search: searchQuery, abortSignal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (data && data.items) {
                const mappedData = data.items.map((sheet: any) => {
                    let gstValue = sheet.gstPercent || 0; 

                    return {
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
                        gstPercent: parseGSTPercent(gstValue),
                        discountPercent: sheet.discountPercent || 0,
                        amount: Number(sheet.amount) || 0,
                        totalPoAmount: Number(sheet.totalPOAmount || sheet.totalPoAmount) || 0,
                        preparedBy: sheet.preparedBy || '',
                        approvedBy: sheet.approvedBy || '',
                        pdf: sheet.pdf || '',
                    };
                });
                
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
                setIsLoadingMore(false);
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

    // Helper to get unique filter options
    const getFilterOptions = (data: any[], key: string) => {
        const options = [...new Set(data.map(item => (item as any)[key]).filter(Boolean))].sort();
        return ['All', ...options];
    };

    // Derived filtered data
    const filteredTableData = tableData.filter(item => {
        return (filters.partyName === 'All' || item.partyName === filters.partyName) &&
               (filters.product === 'All' || item.product === filters.product);
    });

    const FilterBar = ({ filters, setFilters, data }: { filters: any, setFilters: any, data: any[] }) => (
        <div className="flex flex-wrap items-center gap-1.5">
            <Select value={filters.partyName} onValueChange={(val) => setFilters({ ...filters, partyName: val })}>
                <SelectTrigger className="h-7 w-[160px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Party:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'partyName').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={filters.product} onValueChange={(val) => setFilters({ ...filters, product: val })}>
                <SelectTrigger className="h-7 w-[160px] text-[11px] shadow-sm px-2">
                    <div className="flex truncate">
                        <span className="font-semibold text-muted-foreground mr-1">Prod:</span>
                        <SelectValue placeholder="All" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getFilterOptions(data, 'product').map(opt => (
                        <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    // Creating table columns based on PO MASTER sheet structure (Columns A-T)
    const columns: ColumnDef<PendingIndentsData>[] = [
        { accessorKey: 'timestamp', header: 'Timestamp' },
        { accessorKey: 'partyName', header: 'Party Name' },
        { accessorKey: 'poNumber', header: 'PO Number' },
        { accessorKey: 'quotationNumber', header: 'Quotation Number' },
        { accessorKey: 'quotationDate', header: 'Quotation Date' },
        { accessorKey: 'enquiryNumber', header: 'Enquiry Number' },
        { accessorKey: 'enquiryDate', header: 'Enquiry Date' },
        { accessorKey: 'internalCode', header: 'Internal Code' },
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'description', header: 'Description' },
        { accessorKey: 'quantity', header: 'Quantity' },
        { accessorKey: 'unit', header: 'Unit' },
        {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => {
                return <>&#8377;{row.original.rate.toLocaleString()}</>;
            },
        },
        {
            accessorKey: 'gstPercent',
            header: 'GST %',
            cell: ({ row }) => {
                return <>{row.original.gstPercent}%</>;
            },
        },
        {
            accessorKey: 'discountPercent',
            header: 'Discount %',
            cell: ({ row }) => {
                return <>{row.original.discountPercent}%</>;
            },
        },
        {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => {
                return <>&#8377;{row.original.amount.toLocaleString()}</>;
            },
        },
        {
            accessorKey: 'totalPoAmount',
            header: 'Total PO Amount',
            cell: ({ row }) => {
                return <>&#8377;{row.original.totalPoAmount.toLocaleString()}</>;
            },
        },
        { accessorKey: 'preparedBy', header: 'Prepared By' },
        { accessorKey: 'approvedBy', header: 'Approved By' },
        {
            accessorKey: 'pdf',
            header: 'PDF',
            cell: ({ row }) => {
                return row.original.pdf ? (
                    <a
                        href={row.original.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                    >
                        View PDF
                    </a>
                ) : (
                    <span className="text-gray-400">No PDF</span>
                );
            },
        },
    ];

    return (
        <div>
            <Heading heading="Pending POs" subtext="View pending purchase orders from PO Master">
                <ListTodo size={50} className="text-primary" />
            </Heading>
            <DataTable
                data={tableData}
                columns={columns}
                searchFields={[
                    'partyName',
                    'poNumber',
                    'product',
                    'description',
                    'quotationNumber',
                    'enquiryNumber',
                    'preparedBy',
                    'approvedBy'
                ]}
                dataLoading={initialLoading}
                isSearching={isSearching}
                totalCount={total}
                currentPage={page}
                onPageChange={(newPage) => {
                    setPage(newPage);
                    fetchData(newPage, search, false);
                }}
                onSearchChange={debouncedSearch}
                pagination={true}
                pageSize={50}
                extraActions={
                    <FilterBar filters={filters} setFilters={setFilters} data={tableData} />
                }
                className="h-[80dvh]"
            />
        </div>
    );
};