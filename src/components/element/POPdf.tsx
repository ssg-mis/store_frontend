import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: {
        padding: 20,
        fontSize: 10,
    },
    mainContainer: {
        border: '1 solid black',
        fontSize: '.7rem',
        gap: '10px',
        paddingBottom: '10px',
    },
    header: {
        textAlign: 'center',
        gap: '2',
        justifyContent: 'center',
        alignItems: 'center',
        fontWeight: 'bold',
        backgroundColor: "#cfe2f3",
        paddingVertical: "12px",
    },
    companyName: {
        fontSize: '1.2rem',
        maxWidth: '30rem',
    },
    divider: {
        borderBottom: '1 solid black',
    },
    purchaseOrderTitle: {
        textAlign: 'center',
        gap: '2',
        justifyContent: 'center',
        alignItems: 'center',
        fontWeight: 'semibold',
        fontSize: '1rem',
    },
    detailsContainer: {
        paddingHorizontal: '20px',
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: '5rem',
    },
    detailsSection: {
        gap: '7px',
    },
    detailRow: {
        flexDirection: 'row',
        gap: '.3rem',
    },
    detailLabel: {
        fontWeight: 'semibold',
    },
    detailValue: {
        width: 150,
    },
    commercialContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: '2rem',
        marginHorizontal: 10,
    },
    commercialHeader: {
        alignItems: 'center',
        borderBottom: '1 solid black',
        textAlign: 'center',
        width: '150',
    },
    commercialHeaderText: {
        fontWeight: 'semibold',
        fontSize: '.8rem',
        paddingBottom: '1px',
    },
    commercialContent: {
        padding: '3px',
        justifyContent: 'center',
        alignItems: 'center',
    },
    commercialText: {
        width: 150,
        textAlign: 'center',
    },
    addressText: {
        textAlign: 'center',
        width: 150,
    },
    description: {
        marginHorizontal: '10px',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        borderBottom: '1pt solid black',
        borderTop: '1pt solid black',
    },
    tableCell1: {
        width: '4%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell2: {
        width: '10%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell3: {
        width: '12%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell4: {
        width: '22%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell5: {
        width: '6%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell6: {
        width: '6%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell7: {
        width: '8%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell8: {
        width: '8%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell9: {
        width: '8%',
        borderRight: '1pt solid black',
        padding: 4,
    },
    tableCell10: {
        width: '16%',
        padding: 4,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '1pt solid black',
    },
    tableTotalCell: {
        width: '84%',
        borderRight: '1pt solid black',
        padding: 4,
        textAlign: 'right',
    },
    tableTotalCellBold: {
        width: '84%',
        borderRight: '1pt solid black',
        padding: 4,
        textAlign: 'right',
        fontWeight: 'semibold',
    },
    tableTotalValue: {
        width: '16%',
        padding: 4,
    },
    termsContainer: {
        paddingHorizontal: '10px',
        gap: '.5rem',
        flexGrow: 1,
    },
    termsHeader: {
        fontSize: '.8rem',
        fontWeight: 'semibold',
    },
    termsText: {
        fontSize: '.8rem',
    },
    acknowledgement: {
        fontWeight: 'semibold',
        paddingHorizontal: '10px',
    },
    signatureContainer: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
    },
    signatureSection: {
        gap: '3px',
        alignItems: 'center',
    },
    signatureLabel: {
        fontWeight: 'semibold',
    },
    companySignature: {
        width: '20%',
        textAlign: 'center',
        fontWeight: 'semibold',
    },
    systemGenerated: {
        textAlign: 'center',
        fontSize: 7,
        color: 'gray',
        marginTop: 5,
        borderTop: '0.5 solid #eee',
        paddingTop: 3,
    },
});

interface Item {
    internalCode: string;
    product: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    gst: number;
    discount: number;
    amount: number;
}

export interface POPdfProps {
    companyName: string;
    companyPhone: string;
    companyGstin: string;
    companyPan: string;
    companyAddress: string;
    billingAddress: string;
    destinationAddress: string;
    supplierName: string;
    supplierAddress: string;
    supplierGstin: string;
    orderNumber: string;
    orderDate: string;
    quotationNumber: string;
    quotationDate: string;
    enqNo: string;
    enqDate: string;
    description: string;
    items: Item[];
    total: number;
    gstAmount: number;
    grandTotal: number;
    terms: string[];
    preparedBy: string;
    approvedBy: string;
}

export default ({
    companyName,
    companyPhone,
    companyGstin,
    companyPan,
    companyAddress,
    billingAddress,
    destinationAddress,
    supplierName,
    supplierAddress,
    supplierGstin,
    orderNumber,
    orderDate,
    quotationNumber,
    quotationDate,
    enqNo,
    enqDate,
    description,
    items,
    total,
    gstAmount,
    grandTotal,
    terms,
    preparedBy,
    approvedBy,
}: POPdfProps) => {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.mainContainer}>
                    <View>
                        <View style={styles.header}>
                            <Text style={styles.companyName}>{companyName}</Text>
                            <Text>{companyAddress}</Text>
                            <Text>Phone: +{companyPhone}</Text>
                        </View>

                        <View style={styles.divider} />
                    </View>

                    <Text style={styles.purchaseOrderTitle}>Purchase Order</Text>

                    <View style={styles.divider} />

                    <View style={styles.detailsContainer}>
                        <View style={styles.detailsSection}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Supplier Name:</Text>
                                <Text style={styles.detailValue}>{supplierName}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Supplier Address:</Text>
                                <Text style={styles.detailValue}>{supplierAddress}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>GSTIN:</Text>
                                <Text style={styles.detailValue}>{supplierGstin}</Text>
                            </View>
                        </View>
                        <View style={styles.detailsSection}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Order No:</Text>
                                <Text style={styles.detailValue}>{orderNumber}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>PO Date:</Text>
                                <Text style={styles.detailValue}>{orderDate}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.commercialContainer}>
                        <View>
                            <View style={styles.commercialHeader}>
                                <Text style={styles.commercialHeaderText}>
                                    Our Commercial Details
                                </Text>
                            </View>
                            <View style={styles.commercialContent}>
                                <Text style={styles.commercialText}>
                                    <Text style={styles.detailLabel}>GSTIN </Text>
                                    {companyGstin}
                                </Text>
                                <Text style={styles.commercialText}>
                                    <Text style={styles.detailLabel}>PAN No. </Text>
                                    {companyPan}
                                </Text>
                            </View>
                        </View>
                        <View>
                            <View style={styles.commercialHeader}>
                                <Text style={styles.commercialHeaderText}>Billing Address</Text>
                            </View>
                            <View style={styles.commercialContent}>
                                <Text style={styles.addressText}>M/S JAY {companyName}</Text>
                                <Text style={styles.addressText}>{billingAddress}</Text>
                            </View>
                        </View>
                        <View>
                            <View style={styles.commercialHeader}>
                                <Text style={styles.commercialHeaderText}>Destination Address</Text>
                            </View>
                            <View style={styles.commercialContent}>
                                <Text style={styles.addressText}>M/S {companyName}</Text>
                                <Text style={styles.addressText}>{destinationAddress}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.description}>
                        {description.split('\n').map((line, index) => (
                            <Text key={index}>
                                {line}
                                {'\n'}
                            </Text>
                        ))}
                    </Text>

                    <View style={styles.divider} />

                    <View>
                        <View style={styles.tableHeaderRow}>
                            <Text style={styles.tableCell1}>S/N</Text>
                            <Text style={styles.tableCell2}>Internal Code</Text>
                            <Text style={styles.tableCell3}>Product</Text>
                            <Text style={styles.tableCell4}>Description</Text>
                            <Text style={styles.tableCell5}>Qty</Text>
                            <Text style={styles.tableCell6}>Unit</Text>
                            <Text style={styles.tableCell7}>Rate</Text>
                            <Text style={styles.tableCell8}>GST (%)</Text>
                            <Text style={styles.tableCell9}>Discount (%)</Text>
                            <Text style={styles.tableCell10}>Amount</Text>
                        </View>

                        {items.map((item, i) => (
                            <View style={styles.tableRow} key={i}>
                                <Text style={styles.tableCell1}>{i + 1}</Text>
                                <Text style={styles.tableCell2}>{item.internalCode}</Text>
                                <Text style={styles.tableCell3}>{item.product}</Text>
                                <Text style={styles.tableCell4}>{item.description}</Text>
                                <Text style={styles.tableCell5}>{item.quantity}</Text>
                                <Text style={styles.tableCell6}>{item.unit}</Text>
                                <Text style={styles.tableCell7}>{item.rate}</Text>
                                <Text style={styles.tableCell8}>{item.gst} %</Text>
                                <Text style={styles.tableCell9}>{item.discount} %</Text>
                                <Text style={styles.tableCell10}>{item.amount}</Text>
                            </View>
                        ))}
                        <View style={styles.tableRow}>
                            <Text style={styles.tableTotalCell}>Total</Text>
                            <Text style={styles.tableTotalValue}>{total}</Text>
                        </View>
                        <View style={styles.tableRow}>
                            <Text style={styles.tableTotalCell}>GST Amount</Text>
                            <Text style={styles.tableTotalValue}>{gstAmount}</Text>
                        </View>
                        <View style={styles.tableRow}>
                            <Text style={styles.tableTotalCellBold}>Grand Total</Text>
                            <Text style={styles.tableTotalValue}>{grandTotal}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.termsContainer}>
                        <Text style={styles.termsHeader}>The Above</Text>
                        {terms.map((term, i) => (
                            <Text style={styles.termsText} key={i}>
                                {i + 1}. {term}
                            </Text>
                        ))}
                    </View>
                    <Text style={styles.acknowledgement}>
                        Kindly Acknowlage Receipt Or This Purchase Order Along With Its Enclousers
                        &amp; Ensure Timely Execution Of The Orderd Material
                    </Text>

                    <View style={styles.divider} />

                    <View style={styles.signatureContainer}>
                        <View style={styles.signatureSection}>
                            <Text style={styles.signatureLabel}>Prepared By</Text>
                            <Text>{preparedBy}</Text>
                        </View>
                        <View style={styles.signatureSection}>
                            <Text style={styles.signatureLabel}>Approved By</Text>
                            <Text>{approvedBy}</Text>
                        </View>
                        <Text style={styles.companySignature}>For {companyName}</Text>
                    </View>
                    <Text style={styles.systemGenerated}>This is a system generated document.</Text>
                </View>
            </Page>
        </Document>
    );
};
