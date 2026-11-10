import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    FileText,
    FilterX,
    IndianRupee,
    ListChecks,
    Package,
    PackageCheck,
    Truck,
    type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SearchableSelectContent } from './SearchableSelectContent';
import { cn, formatDate, formatFirmName } from '@/lib/utils';

// Shape of a row from GET /received (flattened with firm, orderQuantity and indent).
export interface ReceivedRecord {
    id: number;
    createdAt: string;
    grnNumber?: string | null;
    poNumber: string;
    poDate?: string | null;
    vendor: string;
    product?: string | null;
    uom: string;
    firm?: string;
    orderQuantity?: number;
    receivedQuantity: number;
    damagedQuantity?: number | null;
    purchaseReturn?: number | null;
    receiveType?: string | null;
    remark?: string | null;
    billStatus?: string | null;
    billNumber?: string | null;
    billAmount?: number | string | null;
    typeOfBill?: string | null;
    paymentType?: string | null;
    discountAmount?: number | string | null;
    advanceAmount?: number | string | null;
    leadTimeToLiftMaterial?: string | null;
    photoOfProduct?: string | null;
    photoOfBill?: string | null;
    expectedWeight?: number | null;
    actualReceivedWeight?: number | null;
    weightVariance?: number | null;
    weightVariancePercent?: number | null;
    varianceReason?: string | null;
    indent?: {
        indentNumber?: string;
        productCode?: string;
        department?: string;
        indenterName?: string;
    } | null;
}

const ALL = '__all__';
const PAGE_SIZE = 100;

const toDateKey = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const showDate = (value?: string | null) => (value ? formatDate(new Date(value)) : '—');
const num = (value: unknown) => Number(value) || 0;
const rupees = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const money = (value: unknown) => (num(value) ? rupees(num(value)) : '—');
const text = (value?: string | null) => (value && String(value).trim() ? value : '—');
const kg = (value?: number | null) => (value != null ? `${value} kg` : '—');

const formatVariance = (variance?: number | null, percent?: number | null) => {
    if (variance === null || variance === undefined) return '—';
    const sign = variance > 0 ? '+' : '';
    return `${sign}${variance} kg${percent !== null && percent !== undefined ? ` (${sign}${percent}%)` : ''}`;
};

const Badge = ({
    tone,
    children,
}: {
    tone: 'green' | 'amber' | 'blue' | 'slate' | 'red';
    children: ReactNode;
}) => (
    <span
        className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
            tone === 'green' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
            tone === 'amber' && 'bg-amber-50 text-amber-700 ring-amber-200',
            tone === 'blue' && 'bg-blue-50 text-blue-700 ring-blue-200',
            tone === 'red' && 'bg-red-50 text-red-700 ring-red-200',
            tone === 'slate' && 'bg-slate-50 text-slate-600 ring-slate-200'
        )}
    >
        {children}
    </span>
);

const PhotoLink = ({ url }: { url?: string | null }) =>
    url ? (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
            View
        </a>
    ) : (
        <span className="text-muted-foreground/60">—</span>
    );

type Column = {
    header: string;
    group: string;
    align?: 'right';
    className?: string;
    cell: (r: ReceivedRecord) => ReactNode;
};

const COLUMNS: Column[] = [
    {
        header: 'GRN No',
        group: '',
        className: 'font-mono text-[11px] font-semibold text-slate-700',
        cell: (r) => text(r.grnNumber),
    },
    { header: 'Received', group: 'Receipt & PO', cell: (r) => showDate(r.createdAt) },
    {
        header: 'PO Number',
        group: 'Receipt & PO',
        className: 'font-medium',
        cell: (r) => r.poNumber,
    },
    { header: 'PO Date', group: 'Receipt & PO', cell: (r) => showDate(r.poDate) },
    { header: 'Indent No', group: 'Receipt & PO', cell: (r) => text(r.indent?.indentNumber) },
    { header: 'Product Code', group: 'Receipt & PO', cell: (r) => text(r.indent?.productCode) },
    { header: 'Company', group: 'Receipt & PO', cell: (r) => formatFirmName(r.firm || '') || '—' },
    { header: 'Department', group: 'Receipt & PO', cell: (r) => text(r.indent?.department) },
    { header: 'Indenter', group: 'Receipt & PO', cell: (r) => text(r.indent?.indenterName) },
    {
        header: 'Vendor',
        group: 'Receipt & PO',
        className: 'max-w-[200px] truncate',
        cell: (r) => <span title={r.vendor}>{r.vendor}</span>,
    },
    {
        header: 'Product',
        group: 'Item & Quantity',
        className: 'max-w-[220px] truncate font-medium text-slate-900',
        cell: (r) => <span title={r.product || ''}>{text(r.product)}</span>,
    },
    { header: 'UOM', group: 'Item & Quantity', cell: (r) => r.uom },
    {
        header: 'PO Qty',
        group: 'Item & Quantity',
        align: 'right',
        cell: (r) => num(r.orderQuantity),
    },
    {
        header: 'Received',
        group: 'Item & Quantity',
        align: 'right',
        cell: (r) => num(r.receivedQuantity) + num(r.damagedQuantity) + num(r.purchaseReturn),
    },
    {
        header: 'Return',
        group: 'Item & Quantity',
        align: 'right',
        cell: (r) => (
            <span className={cn(num(r.purchaseReturn) > 0 && 'font-semibold text-orange-600')}>
                {num(r.purchaseReturn)}
            </span>
        ),
    },
    {
        header: 'Damaged',
        group: 'Item & Quantity',
        align: 'right',
        cell: (r) => (
            <span className={cn(num(r.damagedQuantity) > 0 && 'font-semibold text-red-600')}>
                {num(r.damagedQuantity)}
            </span>
        ),
    },
    {
        header: 'Okay Qty',
        group: 'Item & Quantity',
        align: 'right',
        className: 'font-semibold text-emerald-700',
        cell: (r) => num(r.receivedQuantity),
    },
    {
        header: 'Receive Type',
        group: 'Item & Quantity',
        cell: (r) =>
            r.receiveType === 'Full' ? (
                <Badge tone="green">Fully</Badge>
            ) : r.receiveType === 'Partial' ? (
                <Badge tone="amber">Partially</Badge>
            ) : (
                '—'
            ),
    },
    {
        header: 'Remark',
        group: 'Item & Quantity',
        className: 'max-w-[200px] truncate',
        cell: (r) => <span title={r.remark || ''}>{text(r.remark)}</span>,
    },
    { header: 'Ordered', group: 'Weight', align: 'right', cell: (r) => kg(r.expectedWeight) },
    { header: 'Actual', group: 'Weight', align: 'right', cell: (r) => kg(r.actualReceivedWeight) },
    {
        header: 'Variance',
        group: 'Weight',
        align: 'right',
        cell: (r) =>
            r.weightVariance == null ? (
                '—'
            ) : (
                <Badge tone={r.varianceReason ? 'red' : 'green'}>
                    {formatVariance(r.weightVariance, r.weightVariancePercent)}
                </Badge>
            ),
    },
    {
        header: 'Reason',
        group: 'Weight',
        className: 'max-w-[200px] truncate',
        cell: (r) => <span title={r.varianceReason || ''}>{text(r.varianceReason)}</span>,
    },
    {
        header: 'Bill Status',
        group: 'Billing',
        cell: (r) =>
            r.billStatus ? (
                <Badge tone={r.billStatus === 'Received' ? 'blue' : 'slate'}>{r.billStatus}</Badge>
            ) : (
                '—'
            ),
    },
    { header: 'Bill No', group: 'Billing', cell: (r) => text(r.billNumber) },
    {
        header: 'Bill Amount',
        group: 'Billing',
        align: 'right',
        className: 'font-semibold text-slate-900',
        cell: (r) => money(r.billAmount),
    },
    { header: 'Type of Bill', group: 'Billing', cell: (r) => text(r.typeOfBill) },
    { header: 'Payment', group: 'Billing', cell: (r) => text(r.paymentType) },
    { header: 'Discount', group: 'Billing', align: 'right', cell: (r) => money(r.discountAmount) },
    { header: 'Advance', group: 'Billing', align: 'right', cell: (r) => money(r.advanceAmount) },
    { header: 'Lead Time', group: 'Billing', cell: (r) => text(r.leadTimeToLiftMaterial) },
    { header: 'Item', group: 'Photos', cell: (r) => <PhotoLink url={r.photoOfProduct} /> },
    { header: 'Bill', group: 'Photos', cell: (r) => <PhotoLink url={r.photoOfBill} /> },
];

// Consecutive columns sharing a group become one header band.
const GROUPS = COLUMNS.reduce<{ name: string; span: number }[]>((acc, col) => {
    const last = acc[acc.length - 1];
    if (last && last.name === col.group) last.span++;
    else acc.push({ name: col.group, span: 1 });
    return acc;
}, []);

const GROUP_TINT: Record<string, string> = {
    'Receipt & PO': 'bg-blue-50 text-blue-700',
    'Item & Quantity': 'bg-emerald-50 text-emerald-700',
    Weight: 'bg-amber-50 text-amber-700',
    Billing: 'bg-violet-50 text-violet-700',
    Photos: 'bg-slate-100 text-slate-600',
};

const StatCard = ({
    icon: Icon,
    label,
    value,
    tint,
}: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    tint: string;
}) => (
    <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-xs transition-shadow hover:shadow-md">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tint)}>
            <Icon size={18} />
        </div>
        <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <p className="truncate text-lg font-bold tabular-nums leading-tight text-slate-900">
                {value}
            </p>
        </div>
    </div>
);

const FieldLabel = ({ children }: { children: ReactNode }) => (
    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
    </label>
);

export default function ReceivedItemsDialog({
    open,
    onOpenChange,
    records,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    records: ReceivedRecord[];
}) {
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [company, setCompany] = useState(ALL);
    const [poNumber, setPoNumber] = useState(ALL);
    const [product, setProduct] = useState(ALL);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const sorted = useMemo(
        () =>
            [...records].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        [records]
    );

    const companyOptions = useMemo(
        () =>
            Array.from(
                new Set(sorted.map((r) => r.firm).filter((f): f is string => !!f && f !== 'N/A'))
            ).sort(),
        [sorted]
    );

    // PO list follows the chosen company so the dropdown stays short.
    const poOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    sorted
                        .filter((r) => company === ALL || r.firm === company)
                        .map((r) => r.poNumber)
                        .filter(Boolean)
                )
            ).sort(),
        [sorted, company]
    );

    // Product list narrows to the chosen company and PO.
    const productOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    sorted
                        .filter((r) => company === ALL || r.firm === company)
                        .filter((r) => poNumber === ALL || r.poNumber === poNumber)
                        .map((r) => r.product)
                        .filter((p): p is string => !!p && !!p.trim())
                )
            ).sort(),
        [sorted, company, poNumber]
    );

    const q = query.toLowerCase().replace(/\s+/g, '');

    const filtered = useMemo(
        () =>
            sorted.filter((r) => {
                const day = toDateKey(r.createdAt);
                if (fromDate && day < fromDate) return false;
                if (toDate && day > toDate) return false;
                if (company !== ALL && r.firm !== company) return false;
                if (poNumber !== ALL && r.poNumber !== poNumber) return false;
                if (product !== ALL && r.product !== product) return false;
                if (q) {
                    const hay = `${r.grnNumber ?? ''} ${r.poNumber ?? ''} ${r.vendor ?? ''} ${r.product ?? ''}`
                        .toLowerCase()
                        .replace(/\s+/g, '');
                    if (!hay.includes(q)) return false;
                }
                return true;
            }),
        [sorted, fromDate, toDate, company, poNumber, product, q]
    );

    useEffect(() => setPage(1), [fromDate, toDate, company, poNumber, product, q]);

    const totals = useMemo(
        () => ({
            okayQty: filtered.reduce((s, r) => s + num(r.receivedQuantity), 0),
            billAmount: filtered.reduce((s, r) => s + num(r.billAmount), 0),
            poCount: new Set(filtered.map((r) => r.poNumber)).size,
        }),
        [filtered]
    );

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // First, last and neighbours of the current page; null marks a gap.
    const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1)
        .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
        .reduce<(number | null)[]>((acc, n) => {
            const prev = acc[acc.length - 1];
            if (typeof prev === 'number' && n - prev > 1) acc.push(null);
            acc.push(n);
            return acc;
        }, []);

    const activeFilterCount = [
        fromDate,
        toDate,
        company !== ALL,
        poNumber !== ALL,
        product !== ALL,
        q,
    ].filter(Boolean).length;
    const clearFilters = () => {
        setFromDate('');
        setToDate('');
        setCompany(ALL);
        setPoNumber(ALL);
        setProduct(ALL);
        setQuery('');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[97vw] sm:max-w-[97vw] w-[97vw] h-[94vh] p-0 gap-0 flex flex-col overflow-hidden bg-slate-50/60">
                {/* Header */}
                <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-gradient-to-r from-orange-50 via-white to-white px-5 py-4 text-left">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-200">
                        <Truck size={22} />
                    </div>
                    <div className="min-w-0">
                        <DialogTitle className="text-xl font-bold text-slate-900">
                            Received Items
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Every received entry with PO, quantity, weight and billing details.
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
                    {/* Totals for the current filter */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard
                            icon={ListChecks}
                            label="Entries"
                            value={filtered.length}
                            tint="bg-blue-100 text-blue-700"
                        />
                        <StatCard
                            icon={FileText}
                            label="Purchase Orders"
                            value={totals.poCount}
                            tint="bg-violet-100 text-violet-700"
                        />
                        <StatCard
                            icon={PackageCheck}
                            label="Okay Qty"
                            value={Math.floor(totals.okayQty).toLocaleString('en-IN')}
                            tint="bg-emerald-100 text-emerald-700"
                        />
                        <StatCard
                            icon={IndianRupee}
                            label="Bill Amount"
                            value={rupees(Math.round(totals.billAmount))}
                            tint="bg-amber-100 text-amber-700"
                        />
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-2 items-end gap-3 rounded-xl border bg-background p-3 shadow-xs lg:grid-cols-[minmax(0,1.2fr)_150px_150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="col-span-2 min-w-0 space-y-1.5 lg:col-span-1">
                            <FieldLabel>Search GRN / PO</FieldLabel>
                            <Input
                                className="h-9"
                                placeholder="GRN no, PO no, vendor..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>From</FieldLabel>
                            <Input
                                type="date"
                                className="h-9"
                                value={fromDate}
                                max={toDate || undefined}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>To</FieldLabel>
                            <Input
                                type="date"
                                className="h-9"
                                value={toDate}
                                min={fromDate || undefined}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <FieldLabel>Company</FieldLabel>
                            <Select
                                value={company}
                                onValueChange={(v) => {
                                    setCompany(v);
                                    setPoNumber(ALL);
                                    setProduct(ALL);
                                }}
                            >
                                <SelectTrigger size="sm" className="w-full min-w-0">
                                    <SelectValue placeholder="All Companies" />
                                </SelectTrigger>
                                <SearchableSelectContent searchPlaceholder="Search company...">
                                    <SelectItem value={ALL}>All Companies</SelectItem>
                                    {companyOptions.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {formatFirmName(c)}
                                        </SelectItem>
                                    ))}
                                </SearchableSelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <FieldLabel>PO Number</FieldLabel>
                            <Select
                                value={poNumber}
                                onValueChange={(v) => {
                                    setPoNumber(v);
                                    setProduct(ALL);
                                }}
                            >
                                <SelectTrigger size="sm" className="w-full min-w-0">
                                    <SelectValue placeholder="All PO Numbers" />
                                </SelectTrigger>
                                <SearchableSelectContent searchPlaceholder="Search PO number...">
                                    <SelectItem value={ALL}>All PO Numbers</SelectItem>
                                    {poOptions.map((po) => (
                                        <SelectItem key={po} value={po}>
                                            {po}
                                        </SelectItem>
                                    ))}
                                </SearchableSelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <FieldLabel>Product</FieldLabel>
                            <Select value={product} onValueChange={setProduct}>
                                <SelectTrigger size="sm" className="w-full min-w-0">
                                    <SelectValue placeholder="All Products" />
                                </SelectTrigger>
                                <SearchableSelectContent searchPlaceholder="Search product...">
                                    <SelectItem value={ALL}>All Products</SelectItem>
                                    {productOptions.map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SearchableSelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            onClick={clearFilters}
                            disabled={!activeFilterCount}
                            className="col-span-2 h-9 gap-1.5 lg:col-span-1"
                        >
                            <FilterX size={15} /> Clear
                            {activeFilterCount > 0 && (
                                <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                    </div>

                    {/* Table fills the remaining height; header and GRN column stay pinned while scrolling */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
                                <thead className="sticky top-0 z-20">
                                    <tr>
                                        {GROUPS.map((g, i) => (
                                            <th
                                                key={`${g.name}-${i}`}
                                                colSpan={g.span}
                                                className={cn(
                                                    'border-b px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest',
                                                    g.name
                                                        ? GROUP_TINT[g.name]
                                                        : 'sticky left-0 z-30 bg-slate-100',
                                                    i > 0 && 'border-l'
                                                )}
                                            >
                                                {g.name}
                                            </th>
                                        ))}
                                    </tr>
                                    <tr>
                                        {COLUMNS.map((col, i) => (
                                            <th
                                                key={`${col.group}-${col.header}`}
                                                className={cn(
                                                    'whitespace-nowrap border-b bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-slate-600',
                                                    col.align === 'right' && 'text-right',
                                                    i === 0 &&
                                                        'sticky left-0 z-30 border-r bg-slate-100'
                                                )}
                                            >
                                                {col.header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.length ? (
                                        pageRows.map((r) => (
                                            <tr
                                                key={r.id}
                                                className="group transition-colors odd:bg-background even:bg-slate-50 hover:!bg-orange-50"
                                            >
                                                {COLUMNS.map((col, i) => (
                                                    <td
                                                        key={`${col.group}-${col.header}`}
                                                        className={cn(
                                                            'whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700',
                                                            col.align === 'right' &&
                                                                'text-right tabular-nums',
                                                            col.className,
                                                            i === 0 &&
                                                                'sticky left-0 z-10 border-r bg-inherit'
                                                        )}
                                                    >
                                                        {col.cell(r)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={COLUMNS.length} className="py-20">
                                                <div className="sticky left-0 flex w-[calc(97vw-3rem)] flex-col items-center gap-2 text-muted-foreground">
                                                    <div className="flex size-14 items-center justify-center rounded-full bg-slate-100">
                                                        <Package
                                                            size={28}
                                                            className="text-slate-400"
                                                        />
                                                    </div>
                                                    <p className="font-semibold text-slate-600">
                                                        No received items match these filters
                                                    </p>
                                                    {activeFilterCount > 0 && (
                                                        <Button
                                                            variant="link"
                                                            size="sm"
                                                            onClick={clearFilters}
                                                        >
                                                            Clear filters
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination bar, attached to the table card */}
                        <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                            <span>
                                Showing{' '}
                                <span className="font-semibold text-slate-800">
                                    {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
                                    {Math.min(page * PAGE_SIZE, filtered.length)}
                                </span>{' '}
                                of{' '}
                                <span className="font-semibold text-slate-800">
                                    {filtered.length}
                                </span>
                            </span>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                >
                                    <ChevronLeft size={14} />
                                </Button>
                                {pageNumbers.map((n, idx) =>
                                    n === null ? (
                                        <span key={`gap-${idx}`} className="px-1 text-slate-400">
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setPage(n)}
                                            className={cn(
                                                'h-7 min-w-7 rounded-md px-2 font-medium transition-colors',
                                                n === page
                                                    ? 'bg-orange-500 text-white shadow-sm'
                                                    : 'text-slate-600 hover:bg-slate-200/70'
                                            )}
                                        >
                                            {n}
                                        </button>
                                    )
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={page >= pageCount}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    <ChevronRight size={14} />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
