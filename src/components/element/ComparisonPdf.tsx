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
        minHeight: 25,
        alignItems: 'center',
    },
    tableRowAlt: {
        flexDirection: 'row',
        borderBottom: '1 solid #cccccc',
        backgroundColor: '#f9f9f9',
        minHeight: 25,
        alignItems: 'center',
    },

    // Columns
    colSn: { width: '4%', borderRight: '1 solid black', padding: 4 },
    colItem: { width: '26%', borderRight: '1 solid black', padding: 4 },
    colQty: { width: '8%', borderRight: '1 solid black', padding: 4, textAlign: 'center' },
    colVendor: { width: '20%', borderRight: '1 solid black', padding: 4, textAlign: 'center' },

    headerText: { fontFamily: 'Helvetica-Bold', fontSize: 7, textAlign: 'center' },
    cellText: { fontSize: 7 },
    boldText: { fontFamily: 'Helvetica-Bold' },

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

    totalRow: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        borderBottom: '1 solid black',
        minHeight: 25,
        alignItems: 'center',
    }
});

export interface ComparisonVendorOffer {
    vendorName: string;
    rate: number;
    paymentTerm: string;
    deliveryTime?: number;
}

export interface ComparisonProduct {
    name: string;
    quantity: number;
    uom: string;
    offers: ComparisonVendorOffer[];
}

export interface ComparisonPdfProps {
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    indentNo: string;
    department: string;
    indenter: string;
    date: string;
    products: ComparisonProduct[];
    vendorNames: string[];
    recommendedVendor?: string;
    preparedBy?: string;
    approvedBy?: string;
}

export default ({
    companyName,
    companyAddress,
    companyPhone,
    indentNo,
    department,
    indenter,
    date,
    products,
    vendorNames,
    recommendedVendor,
    preparedBy,
    approvedBy,
}: ComparisonPdfProps) => {

    // Calculate totals per vendor
    const vendorTotals: Record<string, number> = {};
    vendorNames.forEach(v => vendorTotals[v] = 0);

    products.forEach(p => {
        p.offers.forEach(o => {
            if (vendorTotals[o.vendorName] !== undefined) {
                vendorTotals[o.vendorName] += o.rate;
            }
        });
    });

    const minTotal = Math.min(...Object.values(vendorTotals).filter(t => t > 0));
    const vendorWidth = 62 / vendorNames.length; // Remaining width for vendor columns

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
                    <Text style={styles.title}>Comparative Statement of Rates</Text>

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
                            <Text style={[styles.colSn, styles.headerText]}>S/N</Text>
                            <Text style={[styles.colItem, styles.headerText]}>Item / Product Description</Text>
                            <Text style={[styles.colQty, styles.headerText]}>Qty / UOM</Text>
                            {vendorNames.map(v => (
                                <Text key={v} style={[styles.headerText, { width: `${vendorWidth}%`, borderRight: '1 solid black', padding: 4 }]}>
                                    {v}
                                </Text>
                            ))}
                        </View>

                        {/* Product rows */}
                        {products.map((product, idx) => (
                            <View key={idx} style={idx % 2 === 1 ? styles.tableRowAlt : styles.tableRow}>
                                <Text style={[styles.colSn, styles.cellText]}>{idx + 1}</Text>
                                <Text style={[styles.colItem, styles.cellText]}>{product.name}</Text>
                                <Text style={[styles.colQty, styles.cellText]}>{product.quantity} {product.uom}</Text>
                                {vendorNames.map(vName => {
                                    const offer = product.offers.find(o => o.vendorName === vName);
                                    return (
                                        <View key={vName} style={{ width: `${vendorWidth}%`, borderRight: '1 solid black', padding: 4, height: '100%', justifyContent: 'center' }}>
                                            {offer ? (
                                                <>
                                                    <Text style={[styles.cellText, { textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>₹{offer.rate.toLocaleString()}</Text>
                                                    <Text style={[styles.cellText, { textAlign: 'center', fontSize: 6, color: '#666' }]}>{offer.paymentTerm}</Text>
                                                    {offer.deliveryTime != null && (
                                                        <Text style={[styles.cellText, { textAlign: 'center', fontSize: 6, color: '#666' }]}>{offer.deliveryTime} days</Text>
                                                    )}
                                                </>
                                            ) : (
                                                <Text style={[styles.cellText, { textAlign: 'center', color: '#ccc' }]}>-</Text>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        ))}

                        {/* Totals Row */}
                        <View style={styles.totalRow}>
                            <Text style={{ width: '38%', padding: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>GROSS TOTAL AMOUNT (₹)</Text>
                            {vendorNames.map(vName => {
                                const total = vendorTotals[vName];
                                const isL1 = total === minTotal && total > 0;
                                return (
                                    <View key={vName} style={{ width: `${vendorWidth}%`, borderRight: '1 solid black', padding: 4, height: '100%', justifyContent: 'center', backgroundColor: isL1 ? '#e6ffed' : 'transparent' }}>
                                        <Text style={[styles.cellText, { textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 8, color: isL1 ? '#1a7a1a' : '#000' }]}>
                                            ₹{total.toLocaleString()}
                                        </Text>
                                        {isL1 && <Text style={[styles.cellText, { textAlign: 'center', fontSize: 6, color: '#1a7a1a' }]}>L1 (LOWEST)</Text>}
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* Recommendation note */}
                    {recommendedVendor && (
                        <Text style={styles.footerNote}>
                            Decision: Selected {recommendedVendor} as approved vendor.
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
