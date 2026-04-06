export type Sheet = 'INDENT' | 'RECEIVED' | 'MASTER' | 'USER' | 'PO MASTER' | 'PO_MASTER' | 'INVENTORY' | 'QUOTATION HISTORY' | 'MASTER_DATA' | 'GET PURCHASE' | 'GET_PURCHASE' | 'STORE OUT APPROVAL' | 'THREE_PARTY_APPROVAL' | 'VENDOR_RATE_UPDATE';

export type IndentSheet = {
    timestamp: string;
    indentNumber: string;
    indenterName: string;
    department: string;
    areaOfUse: string;
    groupHead: string;
    productName: string;
    quantity: number;
    uom: string;
    specifications: string;
    indentApprovedBy: string;
    indentType: string;
    attachment: string;
    planned1: string;
    actual1: string;
    timeDelay1: string;
    vendorType: string;
    approvedQuantity: number;
    planned2: string;
    actual2: string;
    timeDelay2: string;
    vendorName1: string;
    rate1: number;
    paymentTerm1: string;
    vendorName2: string;
    rate2: number;
    paymentTerm2: string;
    vendorName3: string;
    rate3: number;
    paymentTerm3: string;
    comparisonSheet: string;
    planned3: string;
    actual3: string;
    timeDelay3: string;
    approvedVendorName: string;
    approvedRate: number;
    approvedPaymentTerm: string;
    approvedDate: string;
    planned4: string;
    actual4: string;
    timeDelay4: string;
    poNumber: string;
    poCopy: string;
    planned5: string;
    actual5: string;
    timeDelay5: string;
    receiveStatus: string;
    planned6: string;
    actual6: string;
    timeDelay6: string;
    issueApprovedBy: string;
    issueStatus: string;
    issuedQuantity: number;
    planned7: string;
    actual7: string;
    timeDelay7: string;
    billStatus: string;
    billNumber: string;
    qty: number;
    leadTimeToLiftMaterial: string;
    typeOfBill: string;
    billAmount: number;
    discountAmount: number;
    paymentType: string;
    advanceAmountIfAny: number;
    photoOfBill: string;
    rate: number;

    // Snake case equivalents for Supabase
    indent_number?: string;
    actual_7?: string;
    bill_status?: string;
    bill_number?: string;
    lead_time_to_lift_material?: string;
    type_of_bill?: string;
    bill_amount?: number;
    discount_amount?: number;
    payment_type?: string;
    advance_amount_if_any?: number;
    photo_of_bill?: string;
    product_name?: string;
    approved_quantity?: number;
};

export type ReceivedSheet = {
    timestamp: string;
    indentNumber: string;
    poDate: string;
    poNumber: string;
    vendor: string;
    receivedStatus: string;
    receivedQuantity: number;
    uom: string;
    photoOfProduct: string;
    warrantyStatus: string;
    endDate: string;
    billStatus: string;
    billNumber: string;
    billAmount: number;
    photoOfBill: string;
    anyTransportations: string;
    transporterName: string;
    transportingAmount: number;
};

export type InventorySheet = {
    groupHead: string;
    itemName: string;
    uom: string;
    maxLevel: number;
    opening: number;
    individualRate: number;
    indented: number;
    approved: number;
    purchaseQuantity: number;
    outQuantity: number;
    current: number;
    totalPrice: number;
    colorCode: string;
};

export type PoMasterSheet = {
    id?: number;
    timestamp: string | null;
    party_name: string;
    po_number: string | null;
    quotation_number: string | null;
    quotation_date: string | null;
    enquiry_number: string | null;
    enquiry_date: string | null;
    internal_code: string | null;
    product: string | null;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    rate: number | null;
    gst_percent: number | null;
    discount_percent: number | null;
    amount: number | null;
    total_po_amount: number | null;
    prepared_by: string | null;
    approved_by: string | null;
    pdf_url: string | null;
    term_1: string | null;
    term_2: string | null;
    term_3: string | null;
    term_4: string | null;
    term_5: string | null;
    term_6: string | null;
    term_7: string | null;
    term_8: string | null;
    term_9: string | null;
    term_10: string | null;
    email_send_status?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type Vendor = {
    vendorName: string;
    gstin: string;
    address: string;
    email: string;
};

export type MasterDataRow = {
    id?: number;
    vendor_name: string;
    vendor_gstin?: string | null;
    vendor_address?: string | null;
    vendor_email?: string | null;
    payment_term?: string | null;
    department?: string | null;
    group_head?: string | null;
    item_name?: string | null;
    created_at?: string | null;
};

export type MasterConfigSheet = {
    vendors: Vendor[];
    paymentTerms: string[];
    departments: string[];
    groupHeads: Record<string, string[]>; // category: items[]
    companyName: string;
    companyAddress: string;
    companyGstin: string;
    companyPhone: string;
    billingAddress: string;
    companyPan: string;
    destinationAddress: string;
    defaultTerms: string[];
};

export type UserPermissions = {
    id?: number;
    rowIndex?: number;
    username: string;
    password: string;
    name: string;

    administrate: boolean;
    createIndent: boolean;
    allIndent: boolean;
    createPo: boolean;
    indentApprovalView: boolean;
    indentApprovalAction: boolean;
    updateVendorView: boolean;
    updateVendorAction: boolean;
    threePartyApprovalView: boolean;
    threePartyApprovalAction: boolean;
    receiveItemView: boolean;
    receiveItemAction: boolean;
    storeOutApprovalView: boolean;
    storeOutApprovalAction: boolean;
    quotation: boolean;
    pendingIndentsView: boolean;
    ordersView: boolean;
    poMaster: boolean;
    getPurchase: boolean;

    // New permissions for Dashboard and Inventory
    dashboard: boolean;
    inventory: boolean;
    setting: boolean;
};

export const allPermissionKeys = [
    "administrate",
    "createIndent",
    "allIndent",
    "createPo",
    "indentApprovalView",
    "indentApprovalAction",
    "updateVendorView",
    "updateVendorAction",
    "threePartyApprovalView",
    "threePartyApprovalAction",
    "receiveItemView",
    "receiveItemAction",
    "storeOutApprovalView",
    "storeOutApprovalAction",
    "quotation",
    "pendingIndentsView",
    "ordersView",
    "poMaster",
    "getPurchase",
    "dashboard",
    "inventory",
    "setting",
] as const;


export type QuotationHistorySheet = {
    timestamp: string;
    quatationNo: string;      // Note: matches sheet spelling
    supplierName: string;
    adreess: string;          // Note: matches sheet spelling
    gst: string;
    indentNo: string;
    product: string;
    description: string;
    qty: string;
    unit: string;
    pdfLink: string;

};

export type SheetData = 
    | IndentSheet 
    | ReceivedSheet 
    | UserPermissions 
    | PoMasterSheet 
    | InventorySheet 
    | QuotationHistorySheet
    | MasterDataRow;