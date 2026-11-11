import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, FilterX, ListChecks, Package, ShoppingCart, Sigma, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SearchableSelectContent } from './SearchableSelectContent';
import { cn, formatDate, formatFirmName } from '@/lib/utils';
import type { IndentSheet } from '@/types';

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
const text = (value?: string | null) => (value && String(value).trim() ? value : '—');

// Where the indent currently is in the purchase flow (mirrors the backend's stage logic).
export function indentStage(i: IndentSheet): string {
    const a: any = i;
    const approved = a.approvedIndents?.[0];
    if (!approved) return 'Pending approval';
    if (approved.vendorType === 'Reject') return 'Rejected';
    if (i.indentType !== 'Purchase') return a.actual6 || a.actual_6 ? 'Issued' : 'Store out pending';
    if (!(a.vendorRateUpdates || []).length && !(a.threePartyApproval || []).length) return 'Rate update pending';
    if (!(a.poMasters || []).length) return 'Awaiting PO';
    if (!(a.actual5 || a.actual_5)) return 'Awaiting receipt';
    return 'Received';
}

const STAGE_TONE: Record<string, string> = {
    'Pending approval': 'bg-amber-50 text-amber-700 ring-amber-200',
    Rejected: 'bg-red-50 text-red-700 ring-red-200',
    'Rate update pending': 'bg-blue-50 text-blue-700 ring-blue-200',
    'Awaiting PO': 'bg-blue-50 text-blue-700 ring-blue-200',
    'Awaiting receipt': 'bg-violet-50 text-violet-700 ring-violet-200',
    'Store out pending': 'bg-violet-50 text-violet-700 ring-violet-200',
    Received: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Issued: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const StatCard = ({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: ReactNode; tint: string }) => (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-xs">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tint)}><Icon size={18} /></div>
        <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="truncate text-lg font-bold tabular-nums leading-tight text-slate-900">{value}</p>
        </div>
    </div>
);

const FieldLabel = ({ children }: { children: ReactNode }) => (
    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>
);

type Row = IndentSheet & { _date: string; _stage: string };
type Column = { header: string; align?: 'right'; className?: string; cell: (r: Row) => ReactNode };

const BASE_COLUMNS: Column[] = [
    { header: 'Indent No', className: 'font-mono text-[11px] font-semibold text-slate-700', cell: (r) => r.indentNumber },
    { header: 'Date', cell: (r) => showDate(r._date) },
    { header: 'Stage', cell: (r) => (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', STAGE_TONE[r._stage] || 'bg-slate-50 text-slate-600 ring-slate-200')}>{r._stage}</span>
    ) },
    { header: 'Department', cell: (r) => text(r.department) },
    { header: 'Indenter', cell: (r) => text(r.indenterName) },
    { header: 'Product', className: 'max-w-[240px] truncate font-medium text-slate-900', cell: (r) => <span title={r.productName}>{text(r.productName)}</span> },
    { header: 'Qty', align: 'right', cell: (r) => num(r.quantity).toLocaleString('en-IN') },
    { header: 'UOM', cell: (r) => text(r.uom) },
    { header: 'Approved Qty', align: 'right', cell: (r) => ((r as any).approvedIndents?.[0] ? num((r as any).approvedIndents[0].approvedQuantity).toLocaleString('en-IN') : '—') },
    { header: 'Indent Type', cell: (r) => text(r.indentType) },
    { header: 'Vendor Type', cell: (r) => { const v = (r as any).approvedIndents?.[0]?.vendorType; return v === 'Three Party' ? 'Multi-Party' : text(v); } },
    { header: 'PO Number', cell: (r) => { const pos = ((r as any).poMasters || []).map((p: any) => p.poNumber).filter(Boolean); return pos.length ? Array.from(new Set(pos)).join(', ') : '—'; } },
    { header: 'Area of Use', cell: (r) => text(r.areaOfUse) },
    { header: 'Specifications', className: 'max-w-[220px] truncate', cell: (r) => <span title={r.specifications}>{text(r.specifications)}</span> },
];

const COMPANY_COLUMN: Column = { header: 'Company', cell: (r) => formatFirmName(r.firm || '') || '—' };

export default function IndentsDialog({ open, onOpenChange, records }: { open: boolean; onOpenChange: (open: boolean) => void; records: IndentSheet[] }) {
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [company, setCompany] = useState(ALL);
    const [department, setDepartment] = useState(ALL);
    const [indentType, setIndentType] = useState(ALL);
    const [stage, setStage] = useState(ALL);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const rows: Row[] = useMemo(
        () => records
            .map((r) => ({ ...r, _date: (r as any).createdAt || r.timestamp, _stage: indentStage(r) }))
            .sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime()),
        [records]
    );
    const opts = (get: (r: Row) => string | undefined) => Array.from(new Set(rows.map(get).filter((v): v is string => !!v && v !== 'N/A'))).sort();
    const companyOptions = useMemo(() => opts((r) => r.firm), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
    const departmentOptions = useMemo(() => opts((r) => r.department), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
    const typeOptions = useMemo(() => opts((r) => r.indentType), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
    const stageOptions = useMemo(() => opts((r) => r._stage), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    // The Dashboard already scopes records to the selected firm; only offer a Company filter
    // when the list really spans several firms ("All Firms").
    const showCompany = companyOptions.length > 1;

    const COLUMNS = useMemo(() => (showCompany ? [...BASE_COLUMNS.slice(0, 3), COMPANY_COLUMN, ...BASE_COLUMNS.slice(3)] : BASE_COLUMNS), [showCompany]);

    const q = query.toLowerCase().replace(/\s+/g, '');
    const filtered = useMemo(
        () => rows.filter((r) => {
            const day = toDateKey(r._date);
            if (fromDate && day < fromDate) return false;
            if (toDate && day > toDate) return false;
            if (showCompany && company !== ALL && r.firm !== company) return false;
            if (department !== ALL && r.department !== department) return false;
            if (indentType !== ALL && r.indentType !== indentType) return false;
            if (stage !== ALL && r._stage !== stage) return false;
            if (q && !`${r.indentNumber} ${r.productName} ${r.indenterName}`.toLowerCase().replace(/\s+/g, '').includes(q)) return false;
            return true;
        }),
        [rows, fromDate, toDate, company, department, indentType, stage, q]
    );
    useEffect(() => setPage(1), [fromDate, toDate, company, department, indentType, stage, q]);

    const totalQty = filtered.reduce((s, r) => s + num(r.quantity), 0);
    const pending = filtered.filter((r) => r._stage === 'Pending approval').length;
    const purchase = filtered.filter((r) => r.indentType === 'Purchase').length;
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const activeFilterCount = [fromDate, toDate, showCompany && company !== ALL, department !== ALL, indentType !== ALL, stage !== ALL, q].filter(Boolean).length;
    const clearFilters = () => { setFromDate(''); setToDate(''); setCompany(ALL); setDepartment(ALL); setIndentType(ALL); setStage(ALL); setQuery(''); };

    const pick = (label: string, value: string, set: (v: string) => void, options: string[], allLabel: string, fmt?: (v: string) => string) => (
        <div className="min-w-0 space-y-1.5">
            <FieldLabel>{label}</FieldLabel>
            <Select value={value} onValueChange={set}>
                <SelectTrigger size="sm" className="w-full min-w-0"><SelectValue placeholder={allLabel} /></SelectTrigger>
                <SearchableSelectContent searchPlaceholder={`Search ${label.toLowerCase()}...`}>
                    <SelectItem value={ALL}>{allLabel}</SelectItem>
                    {options.map((o) => <SelectItem key={o} value={o}>{fmt ? fmt(o) : o}</SelectItem>)}
                </SearchableSelectContent>
            </Select>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[97vw] sm:max-w-[97vw] w-[97vw] h-[94vh] p-0 gap-0 flex flex-col overflow-hidden bg-slate-50/60">
                <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-gradient-to-r from-blue-50 via-white to-white px-5 py-4 text-left">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200"><ClipboardList size={22} /></div>
                    <div className="min-w-0">
                        <DialogTitle className="text-xl font-bold text-slate-900">Indent History</DialogTitle>
                        <DialogDescription className="text-xs">Every indent with its date, quantity, current stage and linked PO.</DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard icon={ListChecks} label="Indents" value={filtered.length} tint="bg-blue-100 text-blue-700" />
                        <StatCard icon={Sigma} label="Total Qty" value={Math.floor(totalQty).toLocaleString('en-IN')} tint="bg-violet-100 text-violet-700" />
                        <StatCard icon={ShoppingCart} label="Purchase Indents" value={purchase} tint="bg-emerald-100 text-emerald-700" />
                        <StatCard icon={ClipboardList} label="Pending Approval" value={pending} tint="bg-amber-100 text-amber-700" />
                    </div>

                    <div className={`grid grid-cols-2 items-end gap-3 rounded-xl border bg-background p-3 shadow-xs ${showCompany ? 'lg:grid-cols-[minmax(0,1.2fr)_150px_150px_repeat(4,minmax(0,1fr))_auto]' : 'lg:grid-cols-[minmax(0,1.2fr)_150px_150px_repeat(3,minmax(0,1fr))_auto]'}`}>
                        <div className="col-span-2 min-w-0 space-y-1.5 lg:col-span-1">
                            <FieldLabel>Search</FieldLabel>
                            <Input className="h-9" placeholder="Indent no, product, indenter..." value={query} onChange={(e) => setQuery(e.target.value)} />
                        </div>
                        <div className="space-y-1.5"><FieldLabel>From</FieldLabel><Input type="date" className="h-9" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} /></div>
                        <div className="space-y-1.5"><FieldLabel>To</FieldLabel><Input type="date" className="h-9" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} /></div>
                        {showCompany && pick('Company', company, setCompany, companyOptions, 'All Companies', formatFirmName)}
                        {pick('Department', department, setDepartment, departmentOptions, 'All Departments')}
                        {pick('Indent Type', indentType, setIndentType, typeOptions, 'All Types')}
                        {pick('Stage', stage, setStage, stageOptions, 'All Stages')}
                        <Button variant="outline" onClick={clearFilters} disabled={!activeFilterCount} className="col-span-2 h-9 gap-1.5 lg:col-span-1">
                            <FilterX size={15} /> Clear
                            {activeFilterCount > 0 && <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
                        </Button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
                                <thead className="sticky top-0 z-20">
                                    <tr>
                                        {COLUMNS.map((col, i) => (
                                            <th key={col.header} className={cn('whitespace-nowrap border-b bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-slate-600', col.align === 'right' && 'text-right', i === 0 && 'sticky left-0 z-30 border-r bg-slate-100')}>{col.header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.length ? pageRows.map((r) => (
                                        <tr key={r.id} className="transition-colors odd:bg-background even:bg-slate-50 hover:!bg-blue-50">
                                            {COLUMNS.map((col, i) => (
                                                <td key={col.header} className={cn('whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700', col.align === 'right' && 'text-right tabular-nums', col.className, i === 0 && 'sticky left-0 z-10 border-r bg-inherit')}>{col.cell(r)}</td>
                                            ))}
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={COLUMNS.length} className="py-20">
                                                <div className="sticky left-0 flex w-[calc(97vw-3rem)] flex-col items-center gap-2 text-muted-foreground">
                                                    <div className="flex size-14 items-center justify-center rounded-full bg-slate-100"><Package size={28} className="text-slate-400" /></div>
                                                    <p className="font-semibold text-slate-600">No indents match these filters</p>
                                                    {activeFilterCount > 0 && <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                            <span>
                                Showing <span className="font-semibold text-slate-800">{filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)}</span> of <span className="font-semibold text-slate-800">{filtered.length}</span>
                            </span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
                                <span className="px-2">Page {page} / {pageCount}</span>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
