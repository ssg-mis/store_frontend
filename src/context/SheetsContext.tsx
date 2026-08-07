import { fetchSheet, type BadgeCounts } from '@/lib/fetchers';
import type { IndentSheet, InventorySheet, MasterConfigSheet, PoMasterSheet, ReceivedSheet } from '@/types/sheets';
import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface SheetsState {
    updateReceivedSheet: () => void;
    updatePoMasterSheet: () => void;
    updateIndentSheet: () => void;
    updateInventorySheet: (silent?: boolean) => void;
    updateMasterSheet: () => void;
    updateAll: () => void;
    updateRelatedSheets: () => void;
    updateThreePartyApprovalSheet: () => void;
    updateApprovedIndentSheet: () => void;
    updateRateUpdateSheet: () => void;
    updateCounts: () => void;
    badgeCounts: BadgeCounts;

    indentSheet: IndentSheet[];
    poMasterSheet: PoMasterSheet[];
    receivedSheet: ReceivedSheet[];
    inventorySheet: InventorySheet[];
    masterSheet: MasterConfigSheet | undefined;
    rateUpdateSheet: any[];
    threePartyApprovalSheet: any[];
    approvedIndentSheet: any[];

    indentLoading: boolean;
    poMasterLoading: boolean;
    receivedLoading: boolean;
    inventoryLoading: boolean;
    allLoading: boolean;
}

const SheetsContext = createContext<SheetsState | null>(null);

const EMPTY_BADGE_COUNTS: BadgeCounts = {
    approveIndent: 0,
    vendorRateUpdate: 0,
    threePartyApproval: 0,
    pendingPOs: 0,
    receiveItems: 0,
    storeOut: 0,
    loanOut: 0,
};

const normalizeKey = (value: unknown) => String(value ?? '').trim();
const hasRows = (value: unknown) => Array.isArray(value) && value.length > 0;
const hasValue = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
};

const getIndentKey = (indent: Partial<IndentSheet> & Record<string, any>) =>
    normalizeKey(indent.indentNumber ?? indent.indent_number ?? indent.indentNo ?? indent.id);

function computeBadgeCounts(indentSheet: IndentSheet[], receivedSheet: ReceivedSheet[], poMasterSheet: PoMasterSheet[]): BadgeCounts {
    const approveIndent = new Set<string>();
    const vendorRateUpdate = new Set<string>();
    const threePartyApproval = new Set<string>();
    const pendingPOs = new Set<string>();
    const receiveItems = new Set<string>();
    const storeOut = new Set<string>();
    const loanOut = new Set<string>();

    indentSheet.forEach((indent: IndentSheet & Record<string, any>) => {
        const key = getIndentKey(indent);
        if (!key) return;

        const isPurchase = indent.indentType === 'Purchase';
        const isApproved = indent.status === 'Approved' || hasRows(indent.approvedIndents);
        const actual6 = indent.actual6 ?? indent.actual_6;
        const planned4 = indent.planned4 ?? indent.planned_4;
        const actual4 = indent.actual4 ?? indent.actual_4;
        const planned5 = indent.planned5 ?? indent.planned_5;
        const actual5 = indent.actual5 ?? indent.actual_5;

        if (isPurchase && !hasRows(indent.approvedIndents)) {
            approveIndent.add(key);
        }

        if (isPurchase && hasRows(indent.approvedIndents) && !hasRows(indent.vendorRateUpdates) && !hasRows(indent.threePartyApproval)) {
            vendorRateUpdate.add(key);
        }

        if (isPurchase && hasRows(indent.vendorRateUpdates) && !hasRows(indent.threePartyApproval)) {
            threePartyApproval.add(key);
        }

        if (isPurchase && hasValue(planned4) && !hasValue(actual4)) {
            pendingPOs.add(key);
        }

        if (isPurchase && hasValue(planned5) && !hasValue(actual5)) {
            receiveItems.add(key);
        }

        if (['Store Out', 'Store Out Return'].includes(indent.indentType) && isApproved && !hasValue(actual6)) {
            storeOut.add(key);
        }

        if (['Loan Out', 'Loan Out Return'].includes(indent.indentType) && isApproved && !hasValue(actual6)) {
            loanOut.add(key);
        }
    });

    return {
        approveIndent: approveIndent.size,
        vendorRateUpdate: vendorRateUpdate.size,
        threePartyApproval: threePartyApproval.size,
        pendingPOs: pendingPOs.size,
        receiveItems: receiveItems.size,
        storeOut: storeOut.size,
        loanOut: loanOut.size,
    };
}

export const SheetsProvider = ({ children }: { children: React.ReactNode }) => {
    const [indentSheet, setIndentSheet] = useState<IndentSheet[]>([]);
    const [receivedSheet, setReceivedSheet] = useState<ReceivedSheet[]>([]);
    const [poMasterSheet, setPoMasterSheet] = useState<PoMasterSheet[]>([]);
    const [inventorySheet, setInventorySheet] = useState<InventorySheet[]>([]);
    const [masterSheet, setMasterSheet] = useState<MasterConfigSheet>();
    const [rateUpdateSheet, setRateUpdateSheet] = useState<any[]>([]);
    const [threePartyApprovalSheet, setThreePartyApprovalSheet] = useState<any[]>([]);
    const [approvedIndentSheet, setApprovedIndentSheet] = useState<any[]>([]);
    const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>(EMPTY_BADGE_COUNTS);

    const [indentLoading, setIndentLoading] = useState(true);
    const [poMasterLoading, setPoMasterLoading] = useState(true);
    const [receivedLoading, setReceivedLoading] = useState(true);
    const [inventoryLoading, setInventoryLoading] = useState(true);
    const [allLoading, setAllLoading] = useState(true);

    function updateIndentSheet() {
        setIndentLoading(true);
        fetchSheet('INDENT').then((res) => {
            setIndentSheet(res as IndentSheet[]);
            setIndentLoading(false);
        });
    }
    function updateReceivedSheet() {
        setReceivedLoading(true);
        fetchSheet('RECEIVED').then((res) => {
            setReceivedSheet(res as ReceivedSheet[]);
            setReceivedLoading(false);
        });
    }

    function updatePoMasterSheet() {
        setPoMasterLoading(true);
        fetchSheet('PO MASTER').then((res) => {
            setPoMasterSheet(res as PoMasterSheet[]);
            setPoMasterLoading(false);
        });
    }

    function updateInventorySheet(silent: boolean = false) {
        if (!silent) setInventoryLoading(true);
        fetchSheet('INVENTORY').then((res) => {
            setInventorySheet(res as InventorySheet[]);
            if (!silent) setInventoryLoading(false);
        });
    }
    function updateMasterSheet() {
        fetchSheet('MASTER').then((res) => {
            setMasterSheet(res as MasterConfigSheet);
        });
    }


    function updateRateUpdateSheet() {
        fetchSheet('VENDOR_RATE_UPDATE').then((res) => setRateUpdateSheet(res as any[]));
    }

    function updateCounts() {
        // Counts are recomputed reactively by the useEffect below; this is a no-op kept for interface compatibility.
    }

    function updateThreePartyApprovalSheet() {
        fetchSheet('THREE_PARTY_APPROVAL').then((res) => setThreePartyApprovalSheet(res as any[]));
    }

    function updateApprovedIndentSheet() {
        fetchSheet('APPROVED_INDENT').then((res) => setApprovedIndentSheet(res as any[]));
    }

    // Refresh all relational badge sheets at once (call after mutations)
    function updateRelatedSheets() {
        updateIndentSheet();
        updateRateUpdateSheet();
        updateThreePartyApprovalSheet();
        updateApprovedIndentSheet();
        updateReceivedSheet();
        updatePoMasterSheet();
        updateInventorySheet(true);
    }

    function updateAll() {
        setAllLoading(true);
        updateMasterSheet();
        updateReceivedSheet();
        updateIndentSheet();
        updatePoMasterSheet();
        updateInventorySheet();
        updateRateUpdateSheet();
        updateThreePartyApprovalSheet();
        updateApprovedIndentSheet();
        setAllLoading(false);
    }

    useEffect(() => {
        setBadgeCounts(computeBadgeCounts(indentSheet, receivedSheet, poMasterSheet));
    }, [indentSheet, receivedSheet, poMasterSheet]);

    useEffect(() => {
        try {
            updateAll();
            toast.success('Fetched all the data');
        } catch (e) {
            toast.error('Something went wrong while fetching data');
        } finally {
        }
    }, []);

    return (
        <SheetsContext.Provider
            value={{
                updateIndentSheet,
                updateInventorySheet,
                updateMasterSheet,
                updatePoMasterSheet,
                updateReceivedSheet,
                updateAll,
                updateRelatedSheets,
                updateApprovedIndentSheet,
                updateRateUpdateSheet,
                updateCounts,
                badgeCounts,
                updateThreePartyApprovalSheet,
                indentSheet,
                poMasterSheet,
                inventorySheet,
                receivedSheet,
                rateUpdateSheet,
                threePartyApprovalSheet,
                approvedIndentSheet,
                indentLoading,
                masterSheet,
                poMasterLoading,
                receivedLoading,
                inventoryLoading,
                allLoading,
            }}
        >
            {children}
        </SheetsContext.Provider>
    );
};

export const useSheets = () => useContext(SheetsContext)!;
