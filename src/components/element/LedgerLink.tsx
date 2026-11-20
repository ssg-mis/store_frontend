import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import InventoryHistoryDialog from './InventoryHistoryDialog';

// "Ledger" hyperlink: opens the product's Item Ledger (IN: GRN / PO links, OUT: store out slips).
export default function LedgerLink({ inventoryId }: { inventoryId?: number | null }) {
    const [open, setOpen] = useState(false);
    if (!inventoryId) return <span className="text-muted-foreground" title="No inventory record yet">—</span>;
    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline decoration-dotted underline-offset-4 hover:text-primary/70"
            >
                <BookOpen className="h-3.5 w-3.5" /> Ledger
            </button>
            <InventoryHistoryDialog inventoryId={open ? inventoryId : null} onClose={() => setOpen(false)} initialScope="all" initialTab="ledger" />
        </>
    );
}
