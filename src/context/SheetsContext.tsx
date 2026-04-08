import { fetchSheet } from '@/lib/fetchers';
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
    updateApprovedIndentSheet: () => void;
    updateRateUpdateSheet: () => void;
    updateThreePartyApprovalSheet: () => void;
    updateGetPurchaseSheet: () => void;

    indentSheet: IndentSheet[];
    poMasterSheet: PoMasterSheet[];
    receivedSheet: ReceivedSheet[];
    inventorySheet: InventorySheet[];
    masterSheet: MasterConfigSheet | undefined;
    getPurchaseSheet: any[];
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

export const SheetsProvider = ({ children }: { children: React.ReactNode }) => {
    const [indentSheet, setIndentSheet] = useState<IndentSheet[]>([]);
    const [receivedSheet, setReceivedSheet] = useState<ReceivedSheet[]>([]);
    const [poMasterSheet, setPoMasterSheet] = useState<PoMasterSheet[]>([]);
    const [inventorySheet, setInventorySheet] = useState<InventorySheet[]>([]);
    const [masterSheet, setMasterSheet] = useState<MasterConfigSheet>();
    const [getPurchaseSheet, setGetPurchaseSheet] = useState<any[]>([]);
    const [rateUpdateSheet, setRateUpdateSheet] = useState<any[]>([]);
    const [threePartyApprovalSheet, setThreePartyApprovalSheet] = useState<any[]>([]);
    const [approvedIndentSheet, setApprovedIndentSheet] = useState<any[]>([]);

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

    function updateGetPurchaseSheet() {
        fetchSheet('GET_PURCHASE').then((res) => setGetPurchaseSheet(res as any[]));
    }

    function updateRateUpdateSheet() {
        fetchSheet('VENDOR_RATE_UPDATE').then((res) => setRateUpdateSheet(res as any[]));
    }

    function updateThreePartyApprovalSheet() {
        fetchSheet('THREE_PARTY_APPROVAL').then((res) => setThreePartyApprovalSheet(res as any[]));
    }

    function updateApprovedIndentSheet() {
        fetchSheet('APPROVED_INDENT').then((res) => setApprovedIndentSheet(res as any[]));
    }

    // Refresh all relational badge sheets at once (call after mutations)
    function updateRelatedSheets() {
        updateGetPurchaseSheet();
        updateRateUpdateSheet();
        updateThreePartyApprovalSheet();
        updateApprovedIndentSheet();
        updateReceivedSheet();
        updatePoMasterSheet();
    }

    function updateAll() {
        setAllLoading(true);
        updateMasterSheet();
        updateReceivedSheet();
        updateIndentSheet();
        updatePoMasterSheet();
        updateInventorySheet();
        
        // Fetch additional sheets silently
        updateGetPurchaseSheet();
        updateRateUpdateSheet();
        updateThreePartyApprovalSheet();
        updateApprovedIndentSheet();

        setAllLoading(false);
    }

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
                updateThreePartyApprovalSheet,
                updateGetPurchaseSheet,
                indentSheet,
                poMasterSheet,
                inventorySheet,
                receivedSheet,
                getPurchaseSheet,
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
