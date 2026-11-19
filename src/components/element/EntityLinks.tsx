import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Clickable references that open the full detail page of an Indent / PO / Vendor / Product.
// They are real <a> links, so Ctrl/Cmd+click opens the page in a new tab.
const base = 'break-words font-semibold text-primary underline decoration-dotted decoration-1 underline-offset-4 hover:text-primary/70 hover:decoration-solid cursor-pointer';

type LinkProps = { children?: ReactNode; className?: string };
const stop = (e: React.MouseEvent) => e.stopPropagation();

export const indentPath = (no: string) => `/indent/${encodeURIComponent(no)}`;
export const poPath = (no: string) => `/po/${encodeURIComponent(no)}`;
export const vendorPath = (name: string) => `/vendor/${encodeURIComponent(name)}`;
export const productPath = (name: string) => `/product/${encodeURIComponent(name)}`;

function make(toPath: (v: string) => string, title: string) {
    return ({ value, children, className }: LinkProps & { value?: string | null }) => {
        const v = (value || '').trim();
        if (!v || v === '-' || v === '—') return <>{children ?? '—'}</>;
        return (
            <Link to={toPath(v)} onClick={stop} title={`${title}: ${v}`} className={cn(base, className)}>
                {children ?? v}
            </Link>
        );
    };
}

export const IndentLink = make(indentPath, 'Open indent');
export const POLink = make(poPath, 'Open PO');
export const VendorLink = make(vendorPath, 'Open vendor');
export const ProductLink = make(productPath, 'Open product & stock');

// Comma separated list of links (e.g. several PO numbers in one cell)
export function POLinks({ value }: { value?: string | string[] | null }) {
    const list = Array.isArray(value) ? value : String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return <>—</>;
    return <span className="inline-flex flex-wrap gap-x-2">{list.map((p) => <POLink key={p} value={p} />)}</span>;
}
