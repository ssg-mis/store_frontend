import type { IndentSheet, InventorySheet, PoMasterSheet, ReceivedSheet } from '@/types';

export function analyzeData(
    {
        indentSheet,
        receivedSheet,
        poMasterSheet,
        inventorySheet,
    }: {
        indentSheet: IndentSheet[];
        receivedSheet: ReceivedSheet[];
        poMasterSheet?: PoMasterSheet[];
        inventorySheet?: InventorySheet[];
    }
) {
    // Map from indentNumber to productName and approvedVendorName
    const indentMap = new Map<string, { product: string; vendor: string }>();
    for (const indent of indentSheet) {
        indentMap.set(indent.indentNumber, {
            product: indent.productName,
            vendor: indent.approvedVendorName,
        });
    }

    // 1. Total Indents & Issued Indents
    const totalIndentedQuantity = indentSheet.reduce(
        (sum, i) => sum + (i.quantity ?? 0),
        0
    );

    const issuedIndents = indentSheet.filter(
        (i) => (i.issueStatus ?? '').toLowerCase() === 'issued'
    );

    const totalIssuedQuantity = issuedIndents.reduce(
        (sum, i) => sum + (i.issuedQuantity ?? 0),
        0
    );

    // 2. PO Analysis (From PO Master)
    const totalPOCount = poMasterSheet?.length || 0;
    const totalPOAmount = poMasterSheet?.reduce(
        (sum, po) => sum + Number(po.totalPOAmount || 0),
        0
    ) || 0;

    // 3. Received Analysis (Purchases)
    const totalPurchasedQuantity = receivedSheet.reduce(
        (sum, r) => sum + (r.receivedQuantity ?? 0),
        0
    );

    // 4. Inventory Alerts
    // Out of Stock: Current level is 0 or less
    const outOfStock = inventorySheet?.filter(i => (i.current || 0) <= 0).length || 0;
    // Low Stock: Current level is positive but below 10 (default threshold)
    const lowStock = inventorySheet?.filter(i => (i.current || 0) > 0 && (i.current || 0) < 10).length || 0;

    // 5. Top 10 Products (By frequency in Received Sheet)
    const productFrequencyMap = new Map<string, { freq: number; quantity: number }>();

    for (const r of receivedSheet) {
        const indentInfo = indentMap.get(r.indentNumber);
        const productName = indentInfo?.product || 'Unknown Product';
        
        if (!productFrequencyMap.has(productName)) {
            productFrequencyMap.set(productName, { freq: 0, quantity: 0 });
        }
        const entry = productFrequencyMap.get(productName)!;
        entry.freq += 1;
        entry.quantity += r.receivedQuantity;
    }

    const topProducts = [...productFrequencyMap.entries()]
        .sort((a, b) => b[1].freq - a[1].freq)
        .slice(0, 10)
        .map(([name, data]) => ({ name, ...data }));

    // 6. Top 10 Vendors (By order count in Received Sheet)
    const vendorMap = new Map<string, { orders: number; quantity: number }>();

    for (const r of receivedSheet) {
        if (!r.vendor) continue;
        const vendorName = r.vendor.trim();
        if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, { orders: 0, quantity: 0 });
        }
        const entry = vendorMap.get(vendorName)!;
        entry.orders += 1;
        entry.quantity += r.receivedQuantity;
    }

    const topVendors = [...vendorMap.entries()]
        .sort((a, b) => b[1].orders - a[1].orders)
        .slice(0, 10)
        .map(([name, data]) => ({ name, ...data }));

    return {
        totalIndentCount: indentSheet.length,
        totalIndentedQuantity,
        receivedPurchaseCount: receivedSheet.length,
        totalPurchasedQuantity,
        issuedIndentCount: issuedIndents.length,
        totalIssuedQuantity,
        totalPOCount,
        totalPOAmount,
        outOfStock,
        lowStock,
        topProducts,
        topVendors,
    };
}
