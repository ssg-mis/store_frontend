import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn, formatDate } from '@/lib/utils';

export const fmtDate = (v?: string | Date | null) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : formatDate(d);
};
export const fmtDateTime = (v?: string | Date | null) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return `${formatDate(d)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
export const fmtQty = (v?: number | null) => (v == null ? '—' : (Math.round(Number(v) * 1000) / 1000).toLocaleString('en-IN'));
export const fmtMoney = (v?: number | null) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const dash = (v?: string | number | null) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v));

export function useDetail<T>(load: () => Promise<T>, deps: unknown[]) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        load()
            .then((d) => alive && setData(d))
            .catch((e) => alive && setError(e?.message || 'Failed to load'))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
    return { data, error, loading };
}

export function DetailPage({
    kind, title, subtitle, actions, loading, error, children,
}: { kind: string; title: string; subtitle?: ReactNode; actions?: ReactNode; loading?: boolean; error?: string | null; children?: ReactNode }) {
    const navigate = useNavigate();
    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    <Button variant="outline" size="sm" className="mt-1 gap-1" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
                        <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{kind}</p>
                        <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                        {subtitle && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{subtitle}</div>}
                    </div>
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {loading ? (
                <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
            ) : error ? (
                <div className="flex h-60 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            ) : children}
        </div>
    );
}

export function Section({ title, right, children, className, flush }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
    return (
        <section className={cn('rounded-xl border bg-background shadow-xs', className)}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h2>
                {right}
            </div>
            <div className={flush ? '' : 'p-4'}>{children}</div>
        </section>
    );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue'; sub?: ReactNode }) {
    const color = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', blue: 'text-blue-600' }[tone || 'blue'];
    return (
        <div className="rounded-xl border bg-background p-4 shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums leading-tight', tone ? color : 'text-slate-900')}>{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
    );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{children}</div>
        </div>
    );
}

export function FieldGrid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

const TONES: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    slate: 'bg-slate-50 text-slate-600 ring-slate-200',
};
export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof TONES }) {
    return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', TONES[tone])}>{children}</span>;
}

export const statusTone = (s?: string | null): keyof typeof TONES => {
    const v = (s || '').toLowerCase();
    if (['completed', 'received', 'issued', 'approved', 'verified', 'good', 'ok'].some((k) => v.includes(k))) return 'green';
    if (['reject', 'cancel', 'delayed'].some((k) => v.includes(k))) return 'red';
    if (v.includes('partial') || v.includes('pending') || v.includes('awaiting')) return 'amber';
    if (v.includes('open') || v.includes('rate')) return 'blue';
    if (v.includes('store out')) return 'violet';
    return 'slate';
};
export const StatusBadge = ({ status }: { status?: string | null }) => <Badge tone={statusTone(status)}>{dash(status)}</Badge>;

export function Progress({ percent, className }: { percent: number; className?: string }) {
    const p = Math.max(0, Math.min(100, percent || 0));
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                <div className={cn('h-full rounded-full', p >= 100 ? 'bg-emerald-500' : p > 0 ? 'bg-amber-500' : 'bg-slate-300')} style={{ width: `${p}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-700">{p}%</span>
        </div>
    );
}

export interface StockInfo { current: number; indented?: number; approved?: number; incoming?: number; purchased?: number; stockIn?: number; storeOut?: number; loanOut?: number }

// Compact stock chip used inside tables (approval screens etc.)
export function StockChip({ stock, requested }: { stock?: { current: number; incoming?: number; found?: boolean } | null; requested?: number }) {
    if (!stock) return <span className="text-xs text-muted-foreground">…</span>;
    if (stock.found === false) return <span className="text-xs text-muted-foreground">Not in stock list</span>;
    const short = requested != null && stock.current < requested;
    return (
        <div className="flex flex-col leading-tight">
            <span className={cn('text-sm font-bold tabular-nums', stock.current <= 0 ? 'text-red-600' : short ? 'text-amber-600' : 'text-emerald-600')}>{fmtQty(stock.current)}</span>
            {!!stock.incoming && <span className="text-[10px] text-blue-600">+{fmtQty(stock.incoming)} incoming</span>}
            {short && requested != null && <span className="text-[10px] text-amber-600">short by {fmtQty(requested - stock.current)}</span>}
        </div>
    );
}
