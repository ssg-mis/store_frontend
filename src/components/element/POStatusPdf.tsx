import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface StatusItem {
    product: string;
    unit: string;
    poQuantity: number;
    receivedQuantity: number;
    balanceQuantity: number;
}

export interface POStatusPdfProps {
    poNumber: string;
    poDate: string;
    vendor: string;
    firm: string;
    trackingStatus: string;
    trackingRemarks?: string | null;
    items: StatusItem[];
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 24,
        paddingHorizontal: 24,
        paddingBottom: 24,
        fontSize: 9,
        fontFamily: 'Helvetica',
        color: '#111',
    },
    title: {
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    metaLabel: {
        width: 100,
        color: '#444',
    },
    metaValue: {
        fontFamily: 'Helvetica-Bold',
    },
    table: {
        border: '1 solid #111',
        marginTop: 14,
    },
    headerRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        backgroundColor: '#f0f0f0',
        minHeight: 24,
    },
    row: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        minHeight: 20,
    },
    cell: {
        paddingHorizontal: 5,
        paddingVertical: 4,
        borderRight: '1 solid #111',
        justifyContent: 'center',
    },
    cellLast: {
        paddingHorizontal: 5,
        paddingVertical: 4,
        justifyContent: 'center',
    },
    bold: {
        fontFamily: 'Helvetica-Bold',
    },
    product: {
        width: '34%',
    },
    unit: {
        width: '12%',
        textAlign: 'center',
    },
    qty: {
        width: '18%',
        textAlign: 'right',
    },
    remarksBlock: {
        marginTop: 16,
        border: '1 solid #111',
        padding: 8,
        minHeight: 50,
    },
    remarksLabel: {
        fontFamily: 'Helvetica-Bold',
        marginBottom: 4,
    },
});

function formatQty(value: number, unit: string) {
    return `${Number(value || 0).toFixed(2)} ${unit || ''}`.trim();
}

export default ({ poNumber, poDate, vendor, firm, trackingStatus, trackingRemarks, items }: POStatusPdfProps) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <Text style={styles.title}>PO Status Report</Text>

            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>PO Number</Text>
                <Text style={styles.metaValue}>{poNumber || '-'}</Text>
            </View>
            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>PO Date</Text>
                <Text style={styles.metaValue}>{poDate || '-'}</Text>
            </View>
            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Vendor</Text>
                <Text style={styles.metaValue}>{vendor || '-'}</Text>
            </View>
            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Firm</Text>
                <Text style={styles.metaValue}>{firm || '-'}</Text>
            </View>
            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Status</Text>
                <Text style={styles.metaValue}>{trackingStatus || '-'}</Text>
            </View>

            <View style={styles.table}>
                <View style={styles.headerRow}>
                    <Text style={[styles.cell, styles.product, styles.bold]}>Product</Text>
                    <Text style={[styles.cell, styles.unit, styles.bold]}>Unit</Text>
                    <Text style={[styles.cell, styles.qty, styles.bold]}>PO Qty</Text>
                    <Text style={[styles.cell, styles.qty, styles.bold]}>Received Qty</Text>
                    <Text style={[styles.cellLast, styles.qty, styles.bold]}>Balance Qty</Text>
                </View>

                {items.map((item, index) => (
                    <View style={styles.row} key={`${item.product}-${index}`}>
                        <Text style={[styles.cell, styles.product]}>{item.product}</Text>
                        <Text style={[styles.cell, styles.unit]}>{item.unit}</Text>
                        <Text style={[styles.cell, styles.qty]}>{formatQty(item.poQuantity, item.unit)}</Text>
                        <Text style={[styles.cell, styles.qty]}>{formatQty(item.receivedQuantity, item.unit)}</Text>
                        <Text style={[styles.cellLast, styles.qty]}>{formatQty(item.balanceQuantity, item.unit)}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.remarksBlock}>
                <Text style={styles.remarksLabel}>Remarks</Text>
                <Text>{trackingRemarks || '-'}</Text>
            </View>
        </Page>
    </Document>
);
