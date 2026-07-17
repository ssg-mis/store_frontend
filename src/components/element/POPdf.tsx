import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

interface Item {
    internalCode: string;
    firm: string;
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
    companyLogo?: string;
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
    transportationType: string;
    firm: string;
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 16,
        paddingHorizontal: 18,
        paddingBottom: 14,
        fontSize: 8.5,
        fontFamily: 'Helvetica',
        color: '#111',
    },
    letterheadHeader: {
        minHeight: 86,
        marginBottom: 2,
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
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    letterheadLine: {
        fontSize: 8,
        lineHeight: 1.2,
    },
    letterheadMeta: {
        marginTop: 4,
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
    },
    letterheadFooter: {
        marginTop: 4,
        borderTop: '1 solid #111',
        paddingTop: 4,
        textAlign: 'center',
        fontSize: 7,
        color: '#222',
    },
    table: {
        border: '1 solid #111',
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
    },
    lastRow: {
        flexDirection: 'row',
    },
    cell: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        borderRight: '1 solid #111',
        minHeight: 18,
    },
    cellLast: {
        paddingHorizontal: 4,
        paddingVertical: 3,
        minHeight: 18,
    },
    title: {
        textAlign: 'center',
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        paddingVertical: 5,
    },
    label: {
        fontSize: 7,
        color: '#222',
    },
    bold: {
        fontFamily: 'Helvetica-Bold',
    },
    supplierCell: {
        width: '50%',
        minHeight: 104,
    },
    rightCell: {
        width: '50%',
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    metaRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
    },
    metaCell: {
        width: '50%',
        paddingHorizontal: 4,
        paddingVertical: 3,
        minHeight: 26,
        borderRight: '1 solid #111',
    },
    metaCellLast: {
        width: '50%',
        paddingHorizontal: 4,
        paddingVertical: 3,
        minHeight: 26,
    },
    addressBlock: {
        lineHeight: 1.25,
    },
    itemHeader: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        minHeight: 26,
    },
    itemRow: {
        flexDirection: 'row',
        borderBottom: '1 solid #111',
        minHeight: 22,
    },
    sl: {
        width: '6%',
        textAlign: 'center',
    },
    desc: {
        width: '38%',
    },
    qty: {
        width: '13%',
        textAlign: 'right',
    },
    rate: {
        width: '10%',
        textAlign: 'right',
    },
    discount: {
        width: '9%',
        textAlign: 'right',
    },
    per: {
        width: '7%',
        textAlign: 'center',
    },
    amount: {
        width: '17%',
        textAlign: 'right',
    },
    totalLabel: {
        width: '44%',
        textAlign: 'right',
    },
    totalQty: {
        width: '13%',
        textAlign: 'right',
    },
    totalRate: {
        width: '10%',
    },
    totalDiscount: {
        width: '9%',
    },
    totalPer: {
        width: '7%',
    },
    totalAmount: {
        width: '17%',
        textAlign: 'right',
    },
    summaryLabel: {
        width: '83%',
        textAlign: 'right',
    },
    summaryValue: {
        width: '17%',
        textAlign: 'right',
    },
    wordsLeft: {
        width: '62%',
        minHeight: 40,
    },
    wordsRight: {
        width: '38%',
        minHeight: 40,
        textAlign: 'center',
        justifyContent: 'center',
    },
    termsCell: {
        minHeight: 88,
        paddingHorizontal: 5,
        paddingVertical: 5,
    },
    termsLine: {
        marginTop: 2,
    },
    signatureCell: {
        width: '33.33%',
        minHeight: 34,
        justifyContent: 'flex-end',
        textAlign: 'center',
        fontFamily: 'Helvetica-Bold',
    },
});

function formatMoney(value: number) {
    return Number(value || 0).toFixed(2);
}

function formatQty(value: number, unit: string) {
    return `${Number(value || 0).toFixed(3)} ${unit || ''}`.trim();
}

function formatDiscount(value: number) {
    const discount = Number(value || 0);
    return discount ? `${discount}%` : '-';
}

function lineTaxableAmount(item: Item) {
    const base = Number(item.rate || 0) * Number(item.quantity || 0);
    const discount = base * Number(item.discount || 0) / 100;
    return Number((base - discount).toFixed(2));
}

function gstGroups(items: Item[]) {
    const groups = new Map<number, number>();
    items.forEach((item) => {
        const taxable = lineTaxableAmount(item);
        const gst = Number(item.gst || 0);
        if (gst <= 0) return;
        groups.set(gst, Number(((groups.get(gst) || 0) + taxable * gst / 100).toFixed(2)));
    });
    return Array.from(groups.entries()).sort(([a], [b]) => b - a);
}

function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const belowHundred = (n: number) => {
        if (n < 20) return ones[n];
        return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
    };

    const belowThousand = (n: number) => {
        if (n < 100) return belowHundred(n);
        return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${belowHundred(n % 100)}` : ''}`;
    };

    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;

    return [
        crore ? `${belowThousand(crore)} Crore` : '',
        lakh ? `${belowThousand(lakh)} Lakh` : '',
        thousand ? `${belowThousand(thousand)} Thousand` : '',
        num ? belowThousand(num) : '',
    ].filter(Boolean).join(' ');
}

function amountInWords(value: number) {
    const rupees = Math.floor(Number(value || 0));
    const paise = Math.round((Number(value || 0) - rupees) * 100);
    return `INR ${numberToWords(rupees)}${paise ? ` and ${numberToWords(paise)} Paise` : ''} Only`;
}

function splitLines(value?: string) {
    return (value || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

export default ({
    companyLogo,
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
    terms,
    preparedBy,
    approvedBy,
    transportationType,
}: POPdfProps) => {
    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const primaryUnit = items[0]?.unit || '';
    const gstRows = gstGroups(items);
    const netAmount = items.reduce((sum, item) => sum + Number(item.rate || 0) * Number(item.quantity || 0), 0);
    const taxableAmount = items.reduce((sum, item) => sum + lineTaxableAmount(item), 0);
    const discountAmount = netAmount - taxableAmount;
    const cgstTotal = gstRows.reduce((sum, [, value]) => sum + value / 2, 0);
    const sgstTotal = cgstTotal;
    const grossAmount = taxableAmount + cgstTotal + sgstTotal;
    const displayedTerms = terms.length ? terms : splitLines(description);
    const addressLines = splitLines(companyAddress);
    const companyMeta = [
        companyGstin ? `GSTIN/UIN: ${companyGstin}` : '',
        companyPan ? `PAN: ${companyPan}` : '',
        companyPhone ? `Phone: ${companyPhone}` : '',
    ].filter(Boolean).join('   |   ');

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.letterheadHeader}>
                    {companyLogo ? (
                        <View style={styles.letterheadLogoWrap}>
                            <Image src={companyLogo} style={styles.letterheadLogo} />
                        </View>
                    ) : null}
                    <View style={styles.letterheadBody}>
                        <Text style={styles.letterheadCompany}>{companyName || '-'}</Text>
                        {addressLines.map((line, index) => (
                            <Text key={index} style={styles.letterheadLine}>{line}</Text>
                        ))}
                        {companyMeta ? <Text style={styles.letterheadMeta}>{companyMeta}</Text> : null}
                    </View>
                </View>

                <View style={styles.table}>
                    <View style={styles.row}>
                        <Text style={[styles.cellLast, styles.title]}>Purchase Order</Text>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.cell, styles.supplierCell]}>
                            <Text style={[styles.bold, { marginBottom: 3 }]}>TO</Text>
                            <Text style={[styles.bold, styles.addressBlock]}>{supplierName || '-'}</Text>
                            {splitLines(supplierAddress).map((line, index) => (
                                <Text key={index} style={styles.addressBlock}>{line}</Text>
                            ))}
                            <Text style={{ marginTop: 4 }}>GSTIN/UIN: {supplierGstin || '-'}</Text>
                        </View>

                        <View style={[styles.cellLast, styles.rightCell]}>
                            <View style={styles.metaRow}>
                                <View style={styles.metaCell}>
                                    <Text style={styles.label}>Purchase order no</Text>
                                    <Text style={styles.bold}>{orderNumber || '-'}</Text>
                                </View>
                                <View style={styles.metaCellLast}>
                                    <Text style={styles.label}>Dated</Text>
                                    <Text style={styles.bold}>{orderDate || '-'}</Text>
                                </View>
                            </View>
                            <View style={styles.metaRow}>
                                <View style={styles.metaCell}>
                                    <Text style={styles.label}>Mode/Terms of Payment</Text>
                                    <Text>{displayedTerms[0] || '-'}</Text>
                                </View>
                                <View style={styles.metaCellLast}>
                                    <Text style={styles.label}>Dispatched Through</Text>
                                    <Text>{transportationType || '-'}</Text>
                                </View>
                            </View>
                            <View style={styles.metaRow}>
                                <View style={styles.metaCell}>
                                    <Text style={styles.label}>Quotation No.</Text>
                                    <Text>{quotationNumber || '-'}</Text>
                                </View>
                                <View style={styles.metaCellLast}>
                                    <Text style={styles.label}>Quotation Date</Text>
                                    <Text>{quotationDate || '-'}</Text>
                                </View>
                            </View>
                            <View style={styles.lastRow}>
                                <View style={styles.metaCell}>
                                    <Text style={styles.label}>Enquiry No.</Text>
                                    <Text>{enqNo || '-'}</Text>
                                </View>
                                <View style={styles.metaCellLast}>
                                    <Text style={styles.label}>Enquiry Date / Freight</Text>
                                    <Text>{enqDate || '-'}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.cell, { width: '50%', minHeight: 56 }]}>
                            <Text style={[styles.bold, { marginBottom: 3 }]}>BUYER (BILL TO)</Text>
                            <Text style={styles.bold}>{companyName || '-'}</Text>
                            {splitLines(billingAddress || companyAddress).map((line, index) => (
                                <Text key={index}>{line}</Text>
                            ))}
                            <Text>GSTIN/UIN: {companyGstin || '-'}</Text>
                        </View>
                        <View style={[styles.cellLast, { width: '50%', minHeight: 56 }]}>
                            <Text style={[styles.bold, { marginBottom: 3 }]}>CONSIGNEE (SHIP TO)</Text>
                            <Text style={styles.bold}>{companyName || '-'}</Text>
                            {splitLines(destinationAddress || companyAddress).map((line, index) => (
                                <Text key={index}>{line}</Text>
                            ))}
                            <Text>GSTIN/UIN: {companyGstin || '-'}</Text>
                        </View>
                    </View>

                    <View style={styles.itemHeader}>
                        <Text style={[styles.cell, styles.sl, styles.bold]}>Sl{'\n'}No.</Text>
                        <Text style={[styles.cell, styles.desc, styles.bold]}>Description of Goods</Text>
                        <Text style={[styles.cell, styles.qty, styles.bold]}>Quantity</Text>
                        <Text style={[styles.cell, styles.rate, styles.bold]}>Rate</Text>
                        <Text style={[styles.cell, styles.discount, styles.bold]}>Discount</Text>
                        <Text style={[styles.cell, styles.per, styles.bold]}>Per</Text>
                        <Text style={[styles.cellLast, styles.amount, styles.bold]}>Amount</Text>
                    </View>

                    {items.map((item, index) => (
                        <View style={styles.itemRow} key={`${item.product}-${index}`}>
                            <Text style={[styles.cell, styles.sl]}>{index + 1}</Text>
                            <Text style={[styles.cell, styles.desc]}>
                                {item.product}
                                {item.description ? `\n${item.description}` : ''}
                            </Text>
                            <Text style={[styles.cell, styles.qty]}>{formatQty(item.quantity, item.unit)}</Text>
                            <Text style={[styles.cell, styles.rate]}>{formatMoney(item.rate)}</Text>
                            <Text style={[styles.cell, styles.discount]}>{formatDiscount(item.discount)}</Text>
                            <Text style={[styles.cell, styles.per]}>{item.unit}</Text>
                            <Text style={[styles.cellLast, styles.amount]}>{formatMoney(lineTaxableAmount(item))}</Text>
                        </View>
                    ))}

                    <View style={styles.row}>
                        <Text style={[styles.cell, styles.totalLabel, styles.bold]}>TOTAL</Text>
                        <Text style={[styles.cell, styles.totalQty, styles.bold]}>{formatQty(totalQty, primaryUnit)}</Text>
                        <Text style={[styles.cell, styles.totalRate]} />
                        <Text style={[styles.cell, styles.totalDiscount]} />
                        <Text style={[styles.cell, styles.totalPer]} />
                        <Text style={[styles.cellLast, styles.totalAmount, styles.bold]}>{formatMoney(taxableAmount)}</Text>
                    </View>

                    <View style={styles.row}>
                        <Text style={[styles.cell, styles.summaryLabel]}>Net Amount</Text>
                        <Text style={[styles.cellLast, styles.summaryValue]}>{formatMoney(netAmount)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={[styles.cell, styles.summaryLabel]}>Discount</Text>
                        <Text style={[styles.cellLast, styles.summaryValue]}>{discountAmount ? `(-) ${formatMoney(discountAmount)}` : formatMoney(0)}</Text>
                    </View>
                    {cgstTotal > 0 && (
                        <View style={styles.row}>
                            <Text style={[styles.cell, styles.summaryLabel]}>CGST</Text>
                            <Text style={[styles.cellLast, styles.summaryValue]}>{formatMoney(cgstTotal)}</Text>
                        </View>
                    )}
                    {sgstTotal > 0 && (
                        <View style={styles.row}>
                            <Text style={[styles.cell, styles.summaryLabel]}>SGST</Text>
                            <Text style={[styles.cellLast, styles.summaryValue]}>{formatMoney(sgstTotal)}</Text>
                        </View>
                    )}
                    <View style={styles.row}>
                        <Text style={[styles.cell, styles.summaryLabel, styles.bold]}>Gross Amount</Text>
                        <Text style={[styles.cellLast, styles.summaryValue, styles.bold]}>{formatMoney(grossAmount)}</Text>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.cell, styles.wordsLeft]}>
                            <Text style={styles.label}>Amount Chargeable (in words)</Text>
                            <Text style={[styles.bold, { marginTop: 8 }]}>{amountInWords(grossAmount)}</Text>
                        </View>
                        <View style={[styles.cellLast, styles.wordsRight]}>
                            <Text>for {companyName || 'Company'}</Text>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={[styles.cellLast, styles.termsCell]}>
                            <Text style={styles.bold}>TERMS AND CONDITIONS</Text>
                            {displayedTerms.map((term, index) => (
                                <Text key={index} style={styles.termsLine}>{index + 1}. {term}</Text>
                            ))}
                        </View>
                    </View>

                    <View style={styles.lastRow}>
                        <View style={[styles.cell, styles.signatureCell]}>
                            <Text>MADE BY</Text>
                            <Text>{preparedBy || '-'}</Text>
                        </View>
                        <View style={[styles.cell, styles.signatureCell]}>
                            <Text>CHECKED BY</Text>
                        </View>
                        <View style={[styles.cellLast, styles.signatureCell]}>
                            <Text>AUTHORISED BY</Text>
                            <Text>{approvedBy || '-'}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.letterheadFooter}>
                    <Text>{companyName || 'Company'}{companyPhone ? ` | Phone: ${companyPhone}` : ''}{companyGstin ? ` | GSTIN/UIN: ${companyGstin}` : ''}</Text>
                </View>
            </Page>
        </Document>
    );
};
