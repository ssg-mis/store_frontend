import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export interface ComparisonItem {
    internalCode: string;
    product: string;
    description?: string | null;
    quantity: number;
    unit: string;
    rate?: number;
    amount?: number;
    make?: string | null;
}

export interface ComparisonQuote {
    slot: number;
    vendorName: string | null;
    rate: number | null;
    paymentTerm: string | null;
    deliveryTime: number | null;
    comparisonSheet?: string | null;
}

export interface POComparisonPdfProps {
    companyLogo?: string;
    companyName: string;
    companyAddress: string;
    companyGstin: string;
    companyPan: string;
    companyPhone: string;
    poNumber: string;
    orderDate: string;
    preparedBy: string;
    approvedVendorName: string;
    firm: string;
    department?: string;
    items: ComparisonItem[];
    quotes: ComparisonQuote[];
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 16,
        paddingHorizontal: 18,
        paddingBottom: 16,
        fontSize: 8.5,
        fontFamily: 'Helvetica',
        color: '#111',
    },
    // Letterhead format matching POPdf / Image 2
    letterheadHeader: {
        minHeight: 80,
        marginBottom: 0,
        border: '1 solid #111',
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    letterheadLogoWrap: {
        width: 58,
        height: 58,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    letterheadLogo: {
        width: 54,
        height: 54,
        objectFit: 'contain',
    },
    letterheadBody: {
        flex: 1,
        textAlign: 'center',
    },
    letterheadCompany: {
        fontSize: 15,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        marginBottom: 3,
    },
    letterheadLine: {
        fontSize: 8,
        lineHeight: 1.2,
        color: '#222',
    },
    letterheadMeta: {
        marginTop: 4,
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
    },
    // Title Box
    titleBox: {
        border: '1 solid #111',
        borderTop: 0,
        paddingVertical: 5,
        backgroundColor: '#f8fafc',
    },
    title: {
        textAlign: 'center',
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Meta section
    metaContainer: {
        border: '1 solid #111',
        borderTop: 0,
        paddingHorizontal: 8,
        paddingVertical: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
    },
    metaCol: {
        width: '49%',
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    metaLabel: {
        width: 95,
        fontFamily: 'Helvetica-Bold',
        fontSize: 8,
        color: '#333',
    },
    metaValue: {
        flex: 1,
        fontSize: 8,
        color: '#111',
    },
    metaValueBold: {
        flex: 1,
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: '#111',
    },
    // Section header bar
    sectionHeader: {
        border: '1 solid #111',
        borderTop: 0,
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        color: '#1e293b',
    },
    sectionSub: {
        fontSize: 7.5,
        color: '#64748b',
    },
    // Table styling
    table: {
        border: '1 solid #111',
        borderTop: 0,
        width: '100%',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
        borderBottom: '1 solid #111',
        minHeight: 20,
        alignItems: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #ccc',
        minHeight: 22,
        alignItems: 'center',
    },
    tableRowLast: {
        flexDirection: 'row',
        minHeight: 22,
        alignItems: 'center',
    },
    tableRowSelected: {
        flexDirection: 'row',
        borderBottom: '1 solid #86efac',
        backgroundColor: '#f0fdf4',
        minHeight: 22,
        alignItems: 'center',
    },
    tableRowSelectedLast: {
        flexDirection: 'row',
        backgroundColor: '#f0fdf4',
        minHeight: 22,
        alignItems: 'center',
    },
    // Cell helpers
    thCell: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        borderRight: '1 solid #111',
    },
    thCellLast: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
    },
    tdCell: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        fontSize: 7.5,
        borderRight: '1 solid #ccc',
    },
    tdCellLast: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        fontSize: 7.5,
    },
    // Footer / Decision box
    decisionBox: {
        border: '1 solid #111',
        borderTop: 0,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: '#fafafa',
    },
    decisionText: {
        fontSize: 7.5,
        lineHeight: 1.3,
        color: '#334155',
    },
    footerNote: {
        marginTop: 16,
        fontSize: 6.5,
        color: '#94a3b8',
        textAlign: 'center',
    },
});

export default function POComparisonPdf({
    companyLogo,
    companyName,
    companyAddress,
    companyGstin,
    companyPan,
    companyPhone,
    poNumber,
    orderDate,
    preparedBy,
    approvedVendorName,
    firm,
    department,
    items = [],
    quotes = [],
}: POComparisonPdfProps) {
    const uniqueIndents = Array.from(new Set(items.map(i => i.internalCode).filter(Boolean)));
    const indentDisplay = uniqueIndents.length > 0 ? uniqueIndents.join(', ') : '—';
    const isIndentMode = Boolean(poNumber && poNumber.startsWith('SI-'));

    // Lowest valid quoted rate
    const validRates = quotes.map(q => Number(q.rate || 0)).filter(r => r > 0);
    const lowestRate = validRates.length > 0 ? Math.min(...validRates) : null;

    return (
        <Document>
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* ── 1. Top Letterhead Header (Image 2 style) ── */}
                <View style={styles.letterheadHeader}>
                    {companyLogo ? (
                        <View style={styles.letterheadLogoWrap}>
                            <Image src={companyLogo} style={styles.letterheadLogo} />
                        </View>
                    ) : null}
                    <View style={styles.letterheadBody}>
                        <Text style={styles.letterheadCompany}>{companyName || firm}</Text>
                        {companyAddress ? (
                            <Text style={styles.letterheadLine}>{companyAddress}</Text>
                        ) : null}
                        <Text style={styles.letterheadMeta}>
                            {[
                                companyGstin ? `GSTIN/UIN: ${companyGstin}` : '',
                                companyPan ? `PAN: ${companyPan}` : '',
                                companyPhone ? `Phone: ${companyPhone}` : '',
                            ].filter(Boolean).join('   |   ')}
                        </Text>
                    </View>
                </View>

                {/* ── 2. Title Box ── */}
                <View style={styles.titleBox}>
                    <Text style={styles.title}>Vendor Rate Comparison Sheet</Text>
                </View>

                {/* ── 3. Meta Reference Summary ── */}
                <View style={styles.metaContainer}>
                    <View style={styles.metaCol}>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>{isIndentMode ? 'Indent No:' : 'PO Number:'}</Text>
                            <Text style={styles.metaValueBold}>{poNumber}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>{isIndentMode ? 'Date:' : 'PO Date:'}</Text>
                            <Text style={styles.metaValue}>{orderDate || '—'}</Text>
                        </View>
                        {isIndentMode ? (
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Department:</Text>
                                <Text style={styles.metaValueBold}>{department || '—'}</Text>
                            </View>
                        ) : (
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Indent No(s):</Text>
                                <Text style={styles.metaValueBold}>{indentDisplay}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.metaCol}>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Selected Vendor:</Text>
                            <Text style={[styles.metaValueBold, { color: '#15803d' }]}>
                                {approvedVendorName || '—'}
                            </Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Prepared By:</Text>
                            <Text style={styles.metaValue}>{preparedBy || '—'}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Firm:</Text>
                            <Text style={styles.metaValue}>{firm || '—'}</Text>
                        </View>
                    </View>
                </View>

                {/* ── 4. Indent Items Table ── */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Procurement Item Details</Text>
                    <Text style={styles.sectionSub}>
                        {items.length} {items.length === 1 ? 'line item' : 'line items'}
                    </Text>
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: '6%', textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { width: '22%' }]}>Indent No.</Text>
                        <Text style={[styles.thCell, { width: '40%' }]}>Product / Description</Text>
                        <Text style={[styles.thCell, { width: '12%', textAlign: 'center' }]}>Make</Text>
                        <Text style={[styles.thCell, { width: '10%', textAlign: 'right' }]}>Qty</Text>
                        <Text style={[styles.thCellLast, { width: '10%', textAlign: 'center' }]}>Unit</Text>
                    </View>

                    {items.map((it, idx) => {
                        const isLast = idx === items.length - 1;
                        return (
                            <View key={idx} style={isLast ? styles.tableRowLast : styles.tableRow}>
                                <Text style={[styles.tdCell, { width: '6%', textAlign: 'center', color: '#64748b' }]}>
                                    {idx + 1}
                                </Text>
                                <Text style={[styles.tdCell, { width: '22%', fontFamily: 'Helvetica-Bold' }]}>
                                    {it.internalCode || '—'}
                                </Text>
                                <Text style={[styles.tdCell, { width: '40%' }]}>
                                    {it.product}
                                    {it.description ? ` (${it.description})` : ''}
                                </Text>
                                <Text style={[styles.tdCell, { width: '12%', textAlign: 'center', color: '#475569' }]}>
                                    {it.make || '—'}
                                </Text>
                                <Text style={[styles.tdCell, { width: '10%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                                    {it.quantity}
                                </Text>
                                <Text style={[styles.tdCellLast, { width: '10%', textAlign: 'center' }]}>
                                    {it.unit || '—'}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                {/* ── 5. Vendor Quotations & Rate Comparison Table ── */}
                <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                    <Text style={styles.sectionTitle}>Vendor Quotations & Rate Comparison</Text>
                    <Text style={styles.sectionSub}>
                        {quotes.length} {quotes.length === 1 ? 'vendor quoted' : 'vendors quoted'}
                    </Text>
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: '7%', textAlign: 'center' }]}>Slot</Text>
                        <Text style={[styles.thCell, { width: '32%' }]}>Vendor Name</Text>
                        <Text style={[styles.thCell, { width: '16%', textAlign: 'right', paddingRight: 6 }]}>Quoted Rate</Text>
                        <Text style={[styles.thCell, { width: '15%', textAlign: 'center' }]}>Payment Term</Text>
                        <Text style={[styles.thCell, { width: '14%', textAlign: 'center' }]}>Delivery Time</Text>
                        <Text style={[styles.thCellLast, { width: '16%', textAlign: 'center' }]}>Status / Remarks</Text>
                    </View>

                    {quotes.length === 0 ? (
                        <View style={styles.tableRowLast}>
                            <Text style={[styles.tdCellLast, { width: '100%', textAlign: 'center', color: '#64748b', paddingVertical: 8 }]}>
                                No vendor quotations found for this PO.
                            </Text>
                        </View>
                    ) : (
                        quotes.map((q, idx) => {
                            const isApproved = (q.vendorName || '').trim().toLowerCase() === approvedVendorName.trim().toLowerCase();
                            const isLowest = lowestRate !== null && Number(q.rate || 0) === lowestRate;
                            const isLast = idx === quotes.length - 1;

                            const rowStyle = isApproved
                                ? (isLast ? styles.tableRowSelectedLast : styles.tableRowSelected)
                                : (isLast ? styles.tableRowLast : styles.tableRow);

                            return (
                                <View key={q.slot || idx} style={rowStyle}>
                                    <Text style={[styles.tdCell, { width: '7%', textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>
                                        {q.slot}
                                    </Text>
                                    <Text style={[styles.tdCell, { width: '32%', fontFamily: isApproved ? 'Helvetica-Bold' : 'Helvetica', color: isApproved ? '#15803d' : '#111' }]}>
                                        {q.vendorName || '—'}
                                    </Text>
                                    <Text style={[styles.tdCell, { width: '16%', textAlign: 'right', paddingRight: 6, fontFamily: 'Helvetica-Bold', color: isLowest ? '#16a34a' : '#111' }]}>
                                        {q.rate != null ? `Rs. ${Number(q.rate).toFixed(2)}` : '—'}
                                    </Text>
                                    <Text style={[styles.tdCell, { width: '15%', textAlign: 'center', color: '#334155' }]}>
                                        {q.paymentTerm || '—'}
                                    </Text>
                                    <Text style={[styles.tdCell, { width: '14%', textAlign: 'center', color: '#334155' }]}>
                                        {q.deliveryTime != null ? `${q.deliveryTime} day${q.deliveryTime === 1 ? '' : 's'}` : '—'}
                                    </Text>
                                    <Text style={[styles.tdCellLast, { width: '16%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: isApproved ? '#15803d' : isLowest ? '#16a34a' : '#64748b' }]}>
                                        {isApproved ? 'SELECTED' : isLowest ? 'LOWEST (L1)' : 'QUOTED'}
                                    </Text>
                                </View>
                            );
                        })
                    )}
                </View>

                {/* ── 6. Evaluation Note / Decision Summary ── */}
                <View style={styles.decisionBox}>
                    <Text style={styles.decisionText}>
                        <Text style={{ fontFamily: 'Helvetica-Bold' }}>Evaluation & Decision Summary: </Text>
                        {approvedVendorName
                            ? `Vendor "${approvedVendorName}" was selected as the approved vendor based on competitive rate quotation, payment terms, and delivery capability.`
                            : 'Vendor selection is subject to final approval.'}
                    </Text>
                </View>

                {/* ── 7. Timestamp Footer ── */}
                <Text style={styles.footerNote}>
                    Generated from Store Management System • {isIndentMode ? `Indent: ${poNumber}` : `PO: ${poNumber}`} • Document: Comparative Statement of Vendor Rates
                </Text>
            </Page>
        </Document>
    );
}
