import { ListTodo } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate, debounce } from '@/lib/utils';
import DataTable from '../element/DataTable';
// supabase removed - using dummy data via fetchers

import { fetchFromSupabasePaginated } from '@/lib/fetchers';

interface PendingIndentsData {
    date: string;
    indentNo: string;
    firm: string;
    product: string;
    quantity: number;
    rate: number;
    uom: string;
    vendorName: string;
    paymentTerm: string;
    specifications: string;
}

export default () => {
    const [tableData, setTableData] = useState<PendingIndentsData[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async (pageValue = 1, searchQuery = '', append = false) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append && tableData.length === 0) setInitialLoading(true);
        else if (!append) setSearching(true);
        else setLoadingMore(true);

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
                    product: record.productName || '',
                    quantity: record.approvedQuantity || record.quantity || 0,
                    rate: record.approvedRate || 0,
                    uom: record.uom || '',
                    vendorName: record.approvedVendorName || '',
                    paymentTerm: record.approvedPaymentTerm || '',
                    specifications: record.specifications || '',
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
                setLoadingMore(false);
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

    // Creating table columns with compact Product column
    const columns: ColumnDef<PendingIndentsData>[] = [
        {
            accessorKey: 'date',
            header: 'Date',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent Number',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'firm',
            header: 'Firm',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ getValue }) => (
                <div className="max-w-[120px] break-words whitespace-normal px-1 text-sm">
                    {getValue() as string}
                </div>
            ),
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ getValue }) => <div className="px-2">{getValue() as number}</div>
        },
        {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => (
                <div className="px-2">
                    &#8377;{row.original.rate}
                </div>
            ),
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'vendorName',
            header: 'Vendor Name',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'paymentTerm',
            header: 'Payment Term',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'specifications',
            header: 'Specifications',
            cell: ({ getValue }) => (
                <div className="max-w-[150px] break-words whitespace-normal px-2 text-sm">
                    {getValue() as string}
                </div>
            ),
        },
    ];

    return (
        <div>
            <Heading heading="Pending POs" subtext="View pending purchase orders">
                <ListTodo size={50} className="text-primary" />
            </Heading>
            <DataTable
                data={tableData}
                columns={columns}
                searchFields={['indentNo', 'date', 'product', 'vendorName', 'paymentTerm', 'specifications']}
                dataLoading={initialLoading}
                isSearching={searching}
                totalCount={total}
                currentPage={page}
                onPageChange={(newPage) => {
                    setPage(newPage);
                    fetchData(newPage, search, false);
                }}
                onSearchChange={debouncedSearch}
                pagination={true}
                pageSize={50}
                className="h-[80dvh]"
            />
        </div>
    );
};