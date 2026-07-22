import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface IndentPdfItem {
    particulars: string;
    quantity: number | string;
    uom?: string;
    remarks?: string;
}

export interface IndentPdfProps {
    division: string;
    departmentName: string;
    indentNo: string;
    indentDate: string;
    indentType: string;
    siteToBeUsed: string;
    indenterName: string;
    items: IndentPdfItem[];
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 30,
        paddingHorizontal: 32,
        paddingBottom: 24,
        fontSize: 10,
        fontFamily: 'Helvetica',
        color: '#111',
    },
    title: {
        textAlign: 'center',
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        textDecoration: 'underline',
        marginBottom: 24,
    },
    metaBlock: {
        marginBottom: 20,
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    metaCol: {
        width: '50%',
        flexDirection: 'row',
    },
    metaLabel: {
        fontFamily: 'Helvetica-Bold',
    },
    metaValue: {
        marginLeft: 4,
    },
    table: {
        border: '1 solid #111',
    },
    headerRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        backgroundColor: '#f2f2f2',
    },
    row: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        minHeight: 22,
    },
    cell: {
        paddingHorizontal: 5,
        paddingVertical: 5,
        borderRight: '1 solid #111',
    },
    cellLast: {
        paddingHorizontal: 5,
        paddingVertical: 5,
    },
    headerCell: {
        paddingHorizontal: 5,
        paddingVertical: 6,
        borderRight: '1 solid #111',
        fontFamily: 'Helvetica-Bold',
    },
    headerCellLast: {
        paddingHorizontal: 5,
        paddingVertical: 6,
        fontFamily: 'Helvetica-Bold',
    },
    sl: { width: '8%', textAlign: 'center' },
    particulars: { width: '52%' },
    qty: { width: '18%', textAlign: 'center' },
    remarks: { width: '22%' },
});

function formatQty(value: number | string, uom?: string) {
    if (value === undefined || value === null || value === '') return '';
    return `${value}${uom ? ` ${uom}` : ''}`;
}

export default ({
    division,
    departmentName,
    indentNo,
    indentDate,
    indentType,
    siteToBeUsed,
    indenterName,
    items,
}: IndentPdfProps) => {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>Indent</Text>

                <View style={styles.metaBlock}>
                    <View style={styles.metaRow}>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Division –</Text>
                            <Text style={styles.metaValue}>{division || '-'}</Text>
                        </View>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Indent Type –</Text>
                            <Text style={styles.metaValue}>{indentType || '-'}</Text>
                        </View>
                    </View>
                    <View style={styles.metaRow}>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Department Name –</Text>
                            <Text style={styles.metaValue}>{departmentName || '-'}</Text>
                        </View>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Site To Be Used –</Text>
                            <Text style={styles.metaValue}>{siteToBeUsed || '-'}</Text>
                        </View>
                    </View>
                    <View style={styles.metaRow}>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Indent No –</Text>
                            <Text style={styles.metaValue}>{indentNo || '-'}</Text>
                        </View>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Indenter Name –</Text>
                            <Text style={styles.metaValue}>{indenterName || '-'}</Text>
                        </View>
                    </View>
                    <View style={styles.metaRow}>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Indent Date –</Text>
                            <Text style={styles.metaValue}>{indentDate || '-'}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.table}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.headerCell, styles.sl]}>S.NO</Text>
                        <Text style={[styles.headerCell, styles.particulars]}>PARTICULARS</Text>
                        <Text style={[styles.headerCell, styles.qty]}>QTY</Text>
                        <Text style={[styles.headerCellLast, styles.remarks]}>REMARKS</Text>
                    </View>
                    {items.map((item, index) => (
                        <View style={styles.row} key={index}>
                            <Text style={[styles.cell, styles.sl]}>{index + 1}</Text>
                            <Text style={[styles.cell, styles.particulars]}>{item.particulars || '-'}</Text>
                            <Text style={[styles.cell, styles.qty]}>{formatQty(item.quantity, item.uom)}</Text>
                            <Text style={[styles.cellLast, styles.remarks]}>{item.remarks || ''}</Text>
                        </View>
                    ))}
                </View>
            </Page>
        </Document>
    );
};
