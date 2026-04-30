import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica' },
    mainContainer: { border: '1 solid black', paddingBottom: 12 },

    // Header
    header: {
        textAlign: 'center',
        alignItems: 'center',
        backgroundColor: '#cfe2f3',
        paddingVertical: 10,
        borderBottom: '1 solid black',
    },
    companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
    headerSub: { fontSize: 8 },

    // Title
    title: {
        textAlign: 'center',
        fontFamily: 'Helvetica-Bold',
        fontSize: 11,
        paddingVertical: 6,
        borderBottom: '1 solid black',
    },

    // Meta info row
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderBottom: '1 solid black',
        fontSize: 8,
    },
    metaItem: { flexDirection: 'row', gap: 3 },
    metaLabel: { fontFamily: 'Helvetica-Bold' },

    // Comparison table
    table: { marginHorizontal: 8, marginTop: 10 },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#e8f0fe',
        borderTop: '1 solid black',
        borderBottom: '1 solid black',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #cccccc',
        minHeight: 20,
    },
    tableRowAlt: {
        flexDirection: 'row',
        borderBottom: '1 solid #cccccc',
        backgroundColor: '#f9f9f9',
        minHeight: 20,
    },

    // Columns
    colSn:       { width: '4%',  borderRight: '1 solid black', padding: 4 },
    colItem:     { width: '20%', borderRight: '1 solid black', padding: 4 },
    colQty:      { width: '8%',  borderRight: '1 solid black', padding: 4, textAlign: 'center' },
    colUom:      { width: '6%',  borderRight: '1 solid black', padding: 4, textAlign: 'center' },
    colVendor:   { width: '18%', borderRight: '1 solid black', padding: 4 },
    colRate:     { width: '10%', borderRight: '1 solid black', padding: 4, textAlign: 'right' },
    colPayment:  { width: '14%', borderRight: '1 solid black', padding: 4 },
    colAmount:   { width: '12%', borderRight: '0',             padding: 4, textAlign: 'right' },

    headerText:  { fontFamily: 'Helvetica-Bold', fontSize: 8 },
    cellText:    { fontSize: 8 },

    // Divider between vendor rows
    vendorDivider: { borderTop: '0.5 solid #bbbbbb' },

    // Footer
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingTop: 16,
        fontSize: 8,
    },
    footerSignature: { alignItems: 'center', gap: 2 },
    footerLabel: { fontFamily: 'Helvetica-Bold', borderTop: '1 solid black', paddingTop: 2, width: 80, textAlign: 'center' },
    footerNote: { fontSize: 7, color: '#666666', paddingHorizontal: 10, paddingTop: 4 },
});

export interface ComparisonVendor {
    name: string;
    rate: number | null;
    paymentTerm: string;
}

export interface ComparisonPdfProps {
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    indentNo: string;
    product: string;
    department: string;
    indenter: string;
    quantity: number;
    uom: string;
    date: string;
    vendors: ComparisonVendor[]; // up to 3
    recommendedVendor?: string;
    preparedBy?: string;
    approvedBy?: string;
}

export default ({
    companyName,
    companyAddress,
    companyPhone,
    indentNo,
    product,
    department,
    indenter,
    quantity,
    uom,
    date,
    vendors,
    recommendedVendor,
    preparedBy,
    approvedBy,
}: ComparisonPdfProps) => {
    // Determine lowest-rate vendor
    const validVendors = vendors.filter(v => v.name && v.rate !== null && v.rate !== undefined && v.rate > 0);
    const lowestRate = validVendors.length > 0 ? Math.min(...validVendors.map(v => v.rate!)) : null;

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.mainContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.companyName}>{companyName}</Text>
                        <Text style={styles.headerSub}>{companyAddress}</Text>
                        <Text style={styles.headerSub}>Phone: {companyPhone}</Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>Vendor Comparison Statement</Text>

                    {/* Meta */}
                    <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>Indent No.:</Text>
                            <Text>{indentNo}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>Department:</Text>
                            <Text>{department}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>Indenter:</Text>
                            <Text>{indenter}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>Date:</Text>
                            <Text>{date}</Text>
                        </View>
                    </View>

                    {/* Comparison Table */}
                    <View style={styles.table}>
                        {/* Header Row */}
                        <View style={styles.tableHeaderRow}>
                            <Text style={[styles.colSn,    styles.headerText]}>S/N</Text>
                            <Text style={[styles.colItem,  styles.headerText]}>Item / Product</Text>
                            <Text style={[styles.colQty,   styles.headerText]}>Qty</Text>
                            <Text style={[styles.colUom,   styles.headerText]}>UOM</Text>
                            <Text style={[styles.colVendor,styles.headerText]}>Vendor Name</Text>
                            <Text style={[styles.colRate,  styles.headerText]}>Rate (₹)</Text>
                            <Text style={[styles.colPayment,styles.headerText]}>Payment Terms</Text>
                            <Text style={[styles.colAmount,styles.headerText]}>Total Amount (₹)</Text>
                        </View>

                        {/* Vendor rows — one row per vendor */}
                        {vendors.map((vendor, idx) => {
                            const isLowest = lowestRate !== null && vendor.rate === lowestRate && vendor.rate > 0;
                            const totalAmt = vendor.rate && quantity ? (vendor.rate * quantity).toFixed(2) : '-';
                            const isAlt = idx % 2 === 1;
                            const rowStyle = isAlt ? styles.tableRowAlt : styles.tableRow;

                            return (
                                <View key={idx} style={rowStyle}>
                                    <Text style={[styles.colSn,     styles.cellText]}>{idx + 1}</Text>
                                    <Text style={[styles.colItem,   styles.cellText]}>{idx === 0 ? product : ''}</Text>
                                    <Text style={[styles.colQty,    styles.cellText]}>{idx === 0 ? String(quantity) : ''}</Text>
                                    <Text style={[styles.colUom,    styles.cellText]}>{idx === 0 ? uom : ''}</Text>
                                    <Text style={[styles.colVendor, styles.cellText, isLowest ? { color: '#1a7a1a' } : {}]}>
                                        {vendor.name || '—'}
                                        {isLowest ? ' ✓ (L1)' : ''}
                                    </Text>
                                    <Text style={[styles.colRate,   styles.cellText]}>
                                        {vendor.rate ? vendor.rate.toFixed(2) : '—'}
                                    </Text>
                                    <Text style={[styles.colPayment,styles.cellText]}>{vendor.paymentTerm || '—'}</Text>
                                    <Text style={[styles.colAmount, styles.cellText, isLowest ? { color: '#1a7a1a' } : {}]}>
                                        {totalAmt}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* Recommendation note */}
                    {recommendedVendor && (
                        <Text style={styles.footerNote}>
                            Recommended Vendor: {recommendedVendor}
                        </Text>
                    )}

                    {/* Signature Footer */}
                    <View style={styles.footer}>
                        <View style={styles.footerSignature}>
                            <Text style={styles.footerLabel}>{preparedBy || 'Prepared By'}</Text>
                        </View>
                        <View style={styles.footerSignature}>
                            <Text style={styles.footerLabel}>{approvedBy || 'Checked By'}</Text>
                        </View>
                        <View style={styles.footerSignature}>
                            <Text style={styles.footerLabel}>Authorised By</Text>
                        </View>
                    </View>
                </View>
            </Page>
        </Document>
    );
};
