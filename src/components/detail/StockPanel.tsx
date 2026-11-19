import { Stat, fmtQty, type StockInfo } from './DetailKit';

// Stock summary row used on the product page and the PO/indent item sections
export default function StockPanel({ stock, uom }: { stock: StockInfo & { incoming?: number }; uom?: string | null }) {
    const u = uom ? ` ${uom}` : '';
    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Available Stock" value={`${fmtQty(stock.current)}${u}`} tone={stock.current <= 0 ? 'red' : 'green'} />
            <Stat label="Incoming (open POs)" value={fmtQty(stock.incoming || 0)} tone="blue" />
            <Stat label="Indented" value={fmtQty(stock.indented)} />
            <Stat label="Approved" value={fmtQty(stock.approved)} />
            <Stat label="Purchased" value={fmtQty(stock.purchased)} />
            <Stat label="Store Out" value={fmtQty(stock.storeOut)} />
            <Stat label="Loan Out" value={fmtQty(stock.loanOut)} />
        </div>
    );
}
