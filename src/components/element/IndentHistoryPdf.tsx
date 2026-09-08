import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export interface IndentHistoryRowData {
    id?: number | string;
    productName: string;
    indenterName?: string | null;
    department?: string | null;
    areaOfUse?: string | null;
    quantity: number | string;
    uom?: string | null;
    createdAt?: string | null;
    approvedQuantity?: number | string | null;
    plannedDate?: string | null;
    quotesText?: string | null;
    approvedVendorName?: string | null;
    approvedRate?: number | string | null;
    approvedDate?: string | null;
    poList?: Array<{
        poNumber: string;
        quantity: number | string;
        unit?: string | null;
        createdAt?: string | null;
    }>;
    grnList?: Array<{
        grnNumber?: string | null;
        receivedQuantity: number | string;
        createdAt?: string | null;
    }>;
    storeOutList?: Array<{
        issue_status?: string | null;
        issued_quantity?: number | string | null;
        createdAt?: string | null;
    }>;
}

export interface IndentHistoryPdfProps {
    companyLogo?: string;
    companyName: string;
    companyAddress: string;
    companyGstin: string;
    companyPan: string;
    companyPhone: string;
    indentNumber: string;
    requestedDate?: string | null;
    firm: string;
    department?: string | null;
    indenterName?: string | null;
    rows: IndentHistoryRowData[];
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 16,
        paddingHorizontal: 18,
        paddingBottom: 16,
        fontSize: 8,
        fontFamily: 'Helvetica',
        color: '#111',
    },
    // Top Letterhead (Image 2 style)
    letterheadHeader: {
        minHeight: 70,
        border: '1 solid #111',
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    letterheadLogoWrap: {
        width: 52,
        height: 52,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    letterheadLogo: {
        width: 48,
        height: 48,
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
        marginBottom: 2,
    },
    letterheadLine: {
        fontSize: 7.5,
        lineHeight: 1.2,
        color: '#222',
    },
    letterheadMeta: {
        marginTop: 3,
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
    },
    // Title Box
    titleBox: {
        border: '1 solid #111',
        borderTop: 0,
        paddingVertical: 4,
        backgroundColor: '#f8fafc',
    },
    title: {
        textAlign: 'center',
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Meta Summary
    metaContainer: {
        border: '1 solid #111',
        borderTop: 0,
        paddingHorizontal: 8,
        paddingVertical: 5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
    },
    metaCol: {
        width: '32%',
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    metaLabel: {
        width: 80,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        color: '#333',
    },
    metaValue: {
        flex: 1,
        fontSize: 7.5,
        color: '#111',
    },
    metaValueBold: {
        flex: 1,
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: '#111',
    },
    // Table
    table: {
        border: '1 solid #111',
        borderTop: 0,
        width: '100%',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderBottom: '1 solid #111',
        minHeight: 20,
        alignItems: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #ccc',
        minHeight: 24,
        alignItems: 'flex-start',
    },
    tableRowLast: {
        flexDirection: 'row',
        minHeight: 24,
        alignItems: 'flex-start',
    },
    thCell: {
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7,
        borderRight: '1 solid #111',
    },
    thCellLast: {
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7,
    },
    tdCell: {
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontSize: 7,
        borderRight: '1 solid #ccc',
    },
    tdCellLast: {
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontSize: 7,
    },
    subText: {
        fontSize: 6,
        color: '#64748b',
        marginTop: 1,
    },
    greenBold: {
        color: '#15803d',
        fontFamily: 'Helvetica-Bold',
        fontSize: 6.5,
        marginTop: 1,
    },
    footerNote: {
        marginTop: 10,
        fontSize: 6.5,
        color: '#94a3b8',
        textAlign: 'center',
    },
});

export default function IndentHistoryPdf({
    companyLogo,
    companyName,
    companyAddress,
    companyGstin,
    companyPan,
    companyPhone,
    indentNumber,
    requestedDate,
    firm,
    department,
    indenterName,
    rows = [],
}: IndentHistoryPdfProps) {
    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
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
                    <Text style={styles.title}>Indent History & Lifecycle Status Report</Text>
                </View>

                {/* ── 3. Meta Information Bar ── */}
                <View style={styles.metaContainer}>
                    <View style={styles.metaCol}>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Indent Number:</Text>
                            <Text style={styles.metaValueBold}>{indentNumber}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Requested Date:</Text>
                            <Text style={styles.metaValue}>{requestedDate || '—'}</Text>
                        </View>
                    </View>

                    <View style={styles.metaCol}>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Indenter Name:</Text>
                            <Text style={styles.metaValue}>{indenterName || rows[0]?.indenterName || '—'}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Department:</Text>
                            <Text style={styles.metaValue}>{department || rows[0]?.department || '—'}</Text>
                        </View>
                    </View>

                    <View style={styles.metaCol}>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Firm:</Text>
                            <Text style={styles.metaValue}>{firm || '—'}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Total Items:</Text>
                            <Text style={styles.metaValue}>{rows.length} {rows.length === 1 ? 'item' : 'items'}</Text>
                        </View>
                    </View>
                </View>

                {/* ── 4. Comprehensive Indent Lifecycle Table ── */}
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: '3%', textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { width: '13%' }]}>Product Name</Text>
                        <Text style={[styles.thCell, { width: '11%' }]}>Indenter / Dept</Text>
                        <Text style={[styles.thCell, { width: '10%' }]}>Area of Use</Text>
                        <Text style={[styles.thCell, { width: '9%' }]}>Indented Qty</Text>
                        <Text style={[styles.thCell, { width: '9%' }]}>Approved Qty</Text>
                        <Text style={[styles.thCell, { width: '16%' }]}>Rate Comparison</Text>
                        <Text style={[styles.thCell, { width: '13%' }]}>PO Status</Text>
                        <Text style={[styles.thCell, { width: '8%' }]}>GRN Status</Text>
                        <Text style={[styles.thCellLast, { width: '8%' }]}>Issue Status</Text>
                    </View>

                    {rows.length === 0 ? (
                        <View style={styles.tableRowLast}>
                            <Text style={[styles.tdCellLast, { width: '100%', textAlign: 'center', color: '#64748b', paddingVertical: 8 }]}>
                                No indent history details found.
                            </Text>
                        </View>
                    ) : (
                        rows.map((row, idx) => {
                            const isLast = idx === rows.length - 1;
                            const rowStyle = isLast ? styles.tableRowLast : styles.tableRow;

                            return (
                                <View key={idx} style={rowStyle}>
                                    {/* # */}
                                    <Text style={[styles.tdCell, { width: '3%', textAlign: 'center', color: '#64748b' }]}>
                                        {idx + 1}
                                    </Text>

                                    {/* Product Name */}
                                    <View style={[styles.tdCell, { width: '13%' }]}>
                                        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{row.productName || '—'}</Text>
                                    </View>

                                    {/* Indenter & Dept */}
                                    <View style={[styles.tdCell, { width: '11%' }]}>
                                        <Text>{row.indenterName || '—'}</Text>
                                        {row.department ? (
                                            <Text style={styles.subText}>{row.department}</Text>
                                        ) : null}
                                    </View>

                                    {/* Area of Use */}
                                    <View style={[styles.tdCell, { width: '10%' }]}>
                                        <Text>{row.areaOfUse || '—'}</Text>
                                    </View>

                                    {/* Indented Qty */}
                                    <View style={[styles.tdCell, { width: '9%' }]}>
                                        <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                                            {row.quantity} {row.uom || ''}
                                        </Text>
                                        {row.createdAt ? (
                                            <Text style={styles.subText}>{row.createdAt}</Text>
                                        ) : null}
                                    </View>

                                    {/* Approved Qty */}
                                    <View style={[styles.tdCell, { width: '9%' }]}>
                                        {row.approvedQuantity != null ? (
                                            <>
                                                <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                                                    {row.approvedQuantity} {row.uom || ''}
                                                </Text>
                                                {row.plannedDate ? (
                                                    <Text style={styles.subText}>Planned: {row.plannedDate}</Text>
                                                ) : null}
                                            </>
                                        ) : (
                                            <Text style={{ color: '#94a3b8' }}>Pending</Text>
                                        )}
                                    </View>

                                    {/* Rate Comparison */}
                                    <View style={[styles.tdCell, { width: '16%' }]}>
                                        {row.quotesText ? (
                                            <Text style={styles.subText}>{row.quotesText}</Text>
                                        ) : null}
                                        {row.approvedVendorName ? (
                                            <Text style={styles.greenBold}>
                                                Selected: {row.approvedVendorName} (Rs. {row.approvedRate || 0})
                                            </Text>
                                        ) : (
                                            <Text style={{ color: '#94a3b8' }}>—</Text>
                                        )}
                                        {row.approvedDate ? (
                                            <Text style={styles.subText}>{row.approvedDate}</Text>
                                        ) : null}
                                    </View>

                                    {/* PO Status */}
                                    <View style={[styles.tdCell, { width: '13%' }]}>
                                        {row.poList && row.poList.length > 0 ? (
                                            row.poList.map((po, pIdx) => (
                                                <View key={pIdx} style={{ marginBottom: 2 }}>
                                                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>
                                                        {po.poNumber}
                                                    </Text>
                                                    <Text style={styles.subText}>
                                                        ({po.quantity} {po.unit || row.uom || ''}) {po.createdAt || ''}
                                                    </Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={{ color: '#94a3b8' }}>—</Text>
                                        )}
                                    </View>

                                    {/* GRN Status */}
                                    <View style={[styles.tdCell, { width: '8%' }]}>
                                        {row.grnList && row.grnList.length > 0 ? (
                                            row.grnList.map((grn, gIdx) => (
                                                <View key={gIdx} style={{ marginBottom: 2 }}>
                                                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>
                                                        {grn.grnNumber || 'GRN'}
                                                    </Text>
                                                    <Text style={styles.subText}>
                                                        ({grn.receivedQuantity} {row.uom || ''})
                                                    </Text>
                                                    {grn.createdAt ? (
                                                        <Text style={styles.subText}>{grn.createdAt}</Text>
                                                    ) : null}
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={{ color: '#94a3b8' }}>—</Text>
                                        )}
                                    </View>

                                    {/* Issue Status */}
                                    <View style={[styles.tdCellLast, { width: '8%' }]}>
                                        {row.storeOutList && row.storeOutList.length > 0 ? (
                                            row.storeOutList.map((so, sIdx) => (
                                                <View key={sIdx} style={{ marginBottom: 2 }}>
                                                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>
                                                        {so.issue_status || 'Issued'}
                                                    </Text>
                                                    <Text style={styles.subText}>
                                                        ({so.issued_quantity || 0} {row.uom || ''})
                                                    </Text>
                                                    {so.createdAt ? (
                                                        <Text style={styles.subText}>{so.createdAt}</Text>
                                                    ) : null}
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={{ color: '#94a3b8' }}>—</Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

                {/* ── 5. Timestamp Footer ── */}
                <Text style={styles.footerNote}>
                    Generated from Store Management System • Indent: {indentNumber} • Lifecycle Tracking & Audit Report
                </Text>
            </Page>
        </Document>
    );
}
