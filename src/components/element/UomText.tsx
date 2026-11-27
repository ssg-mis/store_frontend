import { useEffect, useReducer } from 'react';
import { fetchUOMs } from '@/lib/fetchers';

// ── Alternate UOM lookup ──────────────────────────────────────────────────────
// Alternate UOMs are configured per base UOM in Master Data (uom_conversion).
// Loaded once from GET /uom and shared by every <UomText>.
// Map key: normalized UOM name → lines like "1 TON = 1000 KG".

type AltMap = Map<string, string[]>;

let cache: AltMap | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

const formatFactor = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return String(Number(n.toFixed(6)));
};

function buildMap(rows: any[]): AltMap {
    const map: AltMap = new Map();
    const add = (key: string, line: string) => {
        if (!key) return;
        const list = map.get(key) || [];
        if (!list.includes(line)) list.push(line);
        map.set(key, list);
    };
    rows.forEach((uom) => {
        const baseName = String(uom?.uom_name || '').trim();
        if (!baseName || uom?.isActive === false) return;
        (uom.baseConversions || []).forEach((c: any) => {
            const altName = String(c?.alternateUom?.uom_name || '').trim();
            if (!altName || c?.isActive === false) return;
            const line = `1 ${altName} = ${formatFactor(c.conversionToBase)} ${baseName}`;
            add(norm(baseName), line); // shown next to the base UOM
            add(norm(altName), line);  // and next to the alternate UOM itself
        });
    });
    return map;
}

function load() {
    if (cache || loading) return;
    loading = fetchUOMs()
        .then((rows: any) => {
            if (Array.isArray(rows) && rows.length > 0) {
                cache = buildMap(rows);
                listeners.forEach((l) => l());
            }
        })
        .catch(() => { /* keep showing plain UOM */ })
        .finally(() => { loading = null; });
}

/** Re-fetch conversions (e.g. after UOMs are edited in Master Data). */
export function invalidateUomAlternates() {
    cache = null;
    load();
}

export function useUomAlternates(): AltMap | null {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(force);
        load();
        return () => { listeners.delete(force); };
    }, []);
    return cache;
}

/** Alternate-UOM lines for a UOM name (empty if none configured). */
export function getUomAlternates(map: AltMap | null, uom: unknown): string[] {
    if (!map) return [];
    return map.get(norm(uom)) || [];
}

/**
 * Shows a UOM plus its alternate UOM(s), e.g.  KG
 *                                            Alt: 1 TON = 1000 KG
 * Renders the UOM exactly as before when no alternate is configured.
 * `inline` keeps everything on one line (for "10 KG"-style text).
 */
export default function UomText({ uom, inline = false, className }: { uom: unknown; inline?: boolean; className?: string }) {
    const map = useUomAlternates();
    const text = uom === null || uom === undefined ? '' : String(uom);
    const alts = text ? getUomAlternates(map, text) : [];

    if (alts.length === 0) return <>{text}</>;

    const altText = alts.join(', ');
    if (inline) {
        return (
            <span className={className} title={`Alternate UOM: ${altText}`}>
                {text} <span className="text-[10px] text-muted-foreground whitespace-nowrap">(Alt: {altText})</span>
            </span>
        );
    }
    return (
        <span className={`inline-flex flex-col leading-tight ${className || ''}`} title={`Alternate UOM: ${altText}`}>
            <span>{text}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Alt: {altText}</span>
        </span>
    );
}
