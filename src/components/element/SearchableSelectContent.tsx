import { useState, Children, isValidElement, cloneElement, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { SelectContent, SelectItem } from '../ui/select';

/* Drop-in replacement for <SelectContent> that adds a search box and filters
   its <SelectItem> children by their visible text. Non-SelectItem children
   (e.g. inline "add new" rows, empty-state messages) are always kept. */

function getNodeText(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join(' ');
    if (isValidElement(node)) return getNodeText((node.props as any).children);
    return '';
}

function filterSelectItems(nodes: ReactNode, query: string): ReactNode {
    if (!query) return nodes;
    return Children.map(nodes, (child) => {
        if (!isValidElement(child)) return child;
        if (child.type === SelectItem) {
            return getNodeText((child.props as any).children).toLowerCase().includes(query) ? child : null;
        }
        const inner = (child.props as any)?.children;
        if (inner != null) {
            return cloneElement(child, { ...(child.props as any) }, filterSelectItems(inner, query));
        }
        return child;
    });
}

export function SearchableSelectContent({
    children,
    searchPlaceholder = 'Search...',
    className,
}: {
    children: ReactNode;
    searchPlaceholder?: string;
    className?: string;
}) {
    const [search, setSearch] = useState('');
    const query = search.trim().toLowerCase();
    return (
        <SelectContent className={className}>
            <div className="flex items-center border-b px-3 pb-2 pt-1" onKeyDown={(e) => e.stopPropagation()}>
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="flex h-9 w-full rounded-md border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </div>
            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                {filterSelectItems(children, query)}
            </div>
        </SelectContent>
    );
}
