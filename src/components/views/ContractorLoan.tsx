import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PackageOpen } from 'lucide-react';
import Heading from '../element/Heading';
import DataTable from '../element/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchFromSupabasePaginated } from '@/lib/fetchers';
import { debounce, formatDate, formatFirmName } from '@/lib/utils';

interface Row {
    id: number;
    indentNo: string;
    date: string;
    contractor: string;
    firm: string;
    department: string;
    indenter: string;
    product: string;
    quantity: number;
    uom: string;
}

const TYPES = {
    'contractor-loan-out': { type: 'Contractor Loan Out', title: 'Contractor Loan Out', subtext: 'Material issued to contractors', qtyHeader: 'Issued Qty' },
    'contractor-loan-in': { type: 'Contractor Loan In', title: 'Contractor Loan In', subtext: 'Material returned by contractors', qtyHeader: 'Returned Qty' },
} as const;

type TabKey = keyof typeof TYPES;

function ContractorTable({ tab }: { tab: TabKey }) {
    const cfg = TYPES[tab];
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const load = useCallback(
        async (pageValue = 1, query = '') => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setSearching(true);
            try {
                const data: any = await fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'createdAt', options: { ascending: false } },
                    undefined,
                    undefined,
                    { page: pageValue, limit: 50, search: query, indentType: [cfg.type], abortSignal: controller.signal }
                );
                if (controller.signal.aborted) return;
                if (data?.items) {
                    setRows(
                        data.items.map((r: any) => ({
                            id: r.id,
                            indentNo: r.indentNumber || '',
                            date: r.createdAt ? formatDate(new Date(r.createdAt)) : '',
                            contractor: r.contractorName || '',
                            firm: r.firm || 'N/A',
                            department: r.department || '',
                            indenter: r.indenterName || '',
                            product: r.productName || '',
                            quantity: r.quantity || 0,
                            uom: r.uom || '',
                        }))
                    );
                    setTotal(data.total ?? data.items.length);
                }
            } catch (e: any) {
                if (e?.name !== 'AbortError') console.error('Error loading contractor loan list:', e);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setSearching(false);
                }
            }
        },
        [cfg.type]
    );

    useEffect(() => {
        setPage(1);
        load(1, search);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const debouncedSearch = useMemo(
        () =>
            debounce((q: string) => {
                setSearch(q);
                setPage(1);
                load(1, q);
            }, 400),
        [load]
    );

    const columns: ColumnDef<Row>[] = [
        { accessorKey: 'indentNo', header: 'Indent No.' },
        { accessorKey: 'date', header: 'Date' },
        { accessorKey: 'contractor', header: 'Contractor', cell: ({ getValue }: any) => getValue() || '-' },
        { accessorKey: 'firm', header: 'Firm', cell: ({ getValue }: any) => <span title={getValue()}>{formatFirmName(getValue())}</span> },
        { accessorKey: 'department', header: 'Department' },
        { accessorKey: 'indenter', header: 'Indenter' },
        { accessorKey: 'product', header: 'Product' },
        { accessorKey: 'quantity', header: cfg.qtyHeader },
        { accessorKey: 'uom', header: 'UOM' },
    ];

    return (
        <DataTable
            data={rows}
            columns={columns}
            searchFields={['indentNo', 'contractor', 'product', 'department', 'indenter', 'firm']}
            dataLoading={loading}
            isSearching={searching}
            totalCount={total}
            currentPage={page}
            onPageChange={(p: number) => {
                setPage(p);
                load(p, search);
            }}
            onSearchChange={debouncedSearch}
            pagination={true}
            pageSize={50}
        />
    );
}

export default function ContractorLoan({ initialTab = 'contractor-loan-out' }: { initialTab?: string }) {
    const [tab, setTab] = useState<TabKey>(initialTab in TYPES ? (initialTab as TabKey) : 'contractor-loan-out');
    useEffect(() => {
        if (initialTab in TYPES) setTab(initialTab as TabKey);
    }, [initialTab]);

    return (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
            <div className="px-5 pt-4">
                <TabsList className="grid w-full grid-cols-2 shadow-sm border">
                    <TabsTrigger value="contractor-loan-out">Contractor Loan Out</TabsTrigger>
                    <TabsTrigger value="contractor-loan-in">Contractor Loan In</TabsTrigger>
                </TabsList>
            </div>
            {(Object.keys(TYPES) as TabKey[]).map((k) => (
                <TabsContent key={k} value={k}>
                    <Heading heading={TYPES[k].title} subtext={TYPES[k].subtext}>
                        <PackageOpen size={50} className="text-primary" />
                    </Heading>
                    <ContractorTable tab={k} />
                </TabsContent>
            ))}
        </Tabs>
    );
}
