import type { JSX } from "react";
import type { IndentSheet, UserPermissions, PoMasterSheet, ReceivedSheet } from "./sheets";

export interface NotificationsData {
    indents: IndentSheet[];
    poMasters: PoMasterSheet[];
    received: ReceivedSheet[];
    getPurchases: any[];
    rateUpdates: any[];
    threePartyApprovals: any[];
    approvedIndents: any[];
}

export interface RouteAttributes {
    name: string;
    element: JSX.Element;
    path: string;
    icon: JSX.Element;
    gateKey?: keyof UserPermissions;
    notifications: (data: NotificationsData) => number
}
