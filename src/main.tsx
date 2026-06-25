import '@/index.css';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '@/context/AuthContext.tsx';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Login from './components/views/Login';
import CreateIndent from './components/views/CreateIndent';
import Dashboard from './components/views/Dashboard';
import App from './App';
import ApproveIndent from '@/components/views/ApproveIndent';
import { SheetsProvider } from './context/SheetsContext';
import VendorRateUpdate from './components/views/VendorRateUpdate';
import ThreePartyApproval from './components/views/ThreePartyApproval';
import ReceiveItems from './components/views/ReceiveItems';
import StoreOutApproval from './components/views/StoreOutApproval';
import TrainnigVideo from './components/views/TrainingVideo';
import License from './components/views/License';
import AllIndent from './components/views/AllIndent';
import Quotation from './components/views/Quotation';
import MasterData from './components/views/MasterData';
import type { RouteAttributes } from './types';

import {
    LayoutDashboard,
    ClipboardList,
    UserCheck,
    Users,
    ClipboardCheck,
    Truck,
    PackageCheck,
    ShieldUser,
    FilePlus2,
    ListTodo,
    Package2,
    Store,
    Video,
    KeyRound,
    Settings,
    Database,

} from 'lucide-react';
import type { UserPermissions } from './types/sheets';
import Loading from './components/views/Loading';
import Setting from './components/views/Setting';
import CreatePO from './components/views/CreatePO';
import ApprovalPO from './components/views/ApprovalPO';
import PendingPOs from './components/views/PendingPOs';
import Order from './components/views/Order';
import Inventory from './components/views/Inventory';
import POMaster from './components/views/POMaster';
import ViewOnlyGuard from './components/element/ViewOnlyGuard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { loggedIn, loading } = useAuth();
    if (loading) return <Loading />;
    return loggedIn ? children : <Navigate to="/login" />;
}

function GatedRoute({
    children,
    identifier,
    roleKey,
}: {
    children: React.ReactNode;
    identifier?: keyof UserPermissions;
    roleKey?: string;
}) {
    const { user } = useAuth();

    // Role-based gate: if roleKey is set, user.role must match
    if (roleKey) {
        if (!user || (user as any).role !== roleKey) {
            return <Navigate to="/" replace />;
        }
    }

    if (!identifier) return children;

    const permissionValue = (user as any)[identifier];

    // Check permission
    if (typeof permissionValue === 'string') {
        if (permissionValue.toUpperCase() !== 'TRUE') {
            return <Navigate to="/" replace />;
        }
    } else if (typeof permissionValue === 'boolean') {
        if (!permissionValue) {
            return <Navigate to="/" replace />;
        }
    } else if (typeof permissionValue === 'number') {
        if (permissionValue === 0) {
            return <Navigate to="/" replace />;
        }
    } else {
        return <Navigate to="/" replace />;
    }

    return children;
}

function DefaultRoute({ routes }: { routes: RouteAttributes[] }) {
    const { user } = useAuth();

    if (!user) return <Navigate to="/login" />;

    // Find first accessible route
    const firstAccessibleRoute = routes.find(route => {
        // Skip routes that require a role the user doesn't have
        if (route.roleKey && (user as any).role !== route.roleKey) return false;

        // Skip routes without gateKey (always accessible)
        if (!route.gateKey) return true;

        const permissionValue = (user as any)[route.gateKey];

        // Check if user has access
        if (typeof permissionValue === 'string') {
            return permissionValue.toUpperCase() === 'TRUE';
        }
        if (typeof permissionValue === 'boolean') {
            return permissionValue;
        }
        if (typeof permissionValue === 'number') {
            return permissionValue !== 0;
        }
        return false;
    });

    if (firstAccessibleRoute) {
        return <Navigate to={`/${firstAccessibleRoute.path}`} replace />;
    }

    // If no accessible routes, logout or show error
    return <Navigate to="/login" replace />;
}

const routes: RouteAttributes[] = [
    {
        path: 'dashboard',
        name: 'Dashboard',
        icon: <LayoutDashboard size={20} />,
        element: <Dashboard />,
        gateKey: 'dashboard',
        notifications: () => 0,
    },
    {
        path: 'inventory',
        name: 'Inventory',
        icon: <Store size={20} />,
        element: <Inventory />,
        gateKey: 'inventory',
        notifications: () => 0,
    },
    {
        path: 'create-indent',
        gateKey: 'createIndent',
        name: 'Create Indent',
        icon: <ClipboardList size={20} />,
        element: <CreateIndent />,
        notifications: () => 0,
    },


    // {
    //     path: 'all-indent',
    //     gateKey: 'allIndent',
    //     name: 'All Indent',
    //     icon: <ClipboardList size={20} />,
    //     element: <AllIndent />,
    //     notifications: () => 0,
    // },
    {
        path: 'approve-indent',
        gateKey: 'indentApprovalView',
        name: 'Approve Indent',
        icon: <ClipboardCheck size={20} />,
        element: <ApproveIndent />,
        notifications: () => 0,
    },
    {
        path: 'quotation',
        gateKey: 'quotation',
        name: 'Request of Quotation',
        icon: <ClipboardList size={20} />,
        element: <Quotation />,
        notifications: () => 0,
    },
    {
        path: 'vendor-rate-update',
        gateKey: 'updateVendorView',
        name: 'Vendor Rate Update',
        icon: <UserCheck size={20} />,
        element: <VendorRateUpdate />,
        notifications: () => 0,
    },
    {
        path: 'multi-party-approval',
        gateKey: 'threePartyApprovalView',
        name: 'Multi-Party Approval',
        icon: <Users size={20} />,
        element: <ThreePartyApproval />,
        notifications: () => 0,
    },
    {
        path: 'pending-pos',
        gateKey: 'pendingIndentsView',
        name: 'Pending for PO',
        icon: <ListTodo size={20} />,
        element: <PendingPOs />,
        notifications: () => 0,
    },
    {
        path: 'create-po',
        gateKey: 'createPo',
        name: 'Create PO',
        icon: <FilePlus2 size={20} />,
        element: <CreatePO />,
        notifications: () => 0,
    },
    {
        path: 'approval-po',
        gateKey: 'poApprovalView',
        name: 'Approval of PO',
        icon: <ClipboardCheck size={20} />,
        element: <ApprovalPO />,
        notifications: () => 0,
    },
    {
        path: 'po-master',
        gateKey: 'poMaster',
        name: 'PO Master',
        icon: <Users size={20} />,
        element: <POMaster />,
        notifications: () => 0,
    },
    // {
    //     path: 'po-history',
    //     gateKey: 'ordersView',
    //     name: 'PO History',
    //     icon: <Package2 size={20} />,
    //     element: <Order />,
    //     notifications: () => 0,
    // },
    {
        path: 'receive-items',
        gateKey: 'receiveItemView',
        name: 'Receive Items',
        icon: <Truck size={20} />,
        element: <ReceiveItems />,
        notifications: (data) => {
            const receivedMap = new Map();
            data.received.forEach((r: any) => {
                const key = String(r.indentId || r.indent_id || '').trim();
                receivedMap.set(key, (receivedMap.get(key) || 0) + (Number(r.receivedQuantity || r.received_quantity) || 0));
            });

            const poMap = new Map();
            data.poMasters.forEach((po: any) => {
                const key = String(po.indentId || po.indent_id || '').trim();
                poMap.set(key, Number(po.quantity) || 0);
            });

            const pendingIndents = new Set();
            data.indents.forEach((indent: any) => {
                if (indent.indentType === 'Purchase' && poMap.has(String(indent.id))) {
                    const poQty = poMap.get(String(indent.id));
                    const totalReceived = receivedMap.get(String(indent.id)) || 0;
                    
                    if ((poQty - totalReceived) > 0) {
                        pendingIndents.add(String(indent.indentNumber || indent.indent_number || '').trim());
                    }
                }
            });
            return pendingIndents.size;
        },
    },
    {
        path: 'store-out-approval',
        gateKey: 'storeOutApprovalView',
        name: 'Store Out / Approval',
        icon: <PackageCheck size={20} />,
        element: <StoreOutApproval mode="store-out" />,
        notifications: (data) => {
            const pendingIndents = new Set();
            data.indents.forEach((sheet) => {
                const isStoreOutType = ['Store Out', 'Store Out Return'].includes(sheet.indentType);
                const isPending = (isStoreOutType && sheet.status === 'Approved') && (!sheet.actual6 || sheet.actual6 === '');
                if (isPending) {
                    pendingIndents.add(String(sheet.indentNumber || sheet.indent_number || '').trim());
                }
            });
            return pendingIndents.size;
        },
    },
    {
        path: 'loan-out-approval',
        gateKey: 'storeOutApprovalView',
        name: 'Loan Out / Approval',
        icon: <PackageCheck size={20} />,
        element: <StoreOutApproval mode="loan" />,
        notifications: (data) => {
            const pendingIndents = new Set();
            data.indents.forEach((sheet) => {
                const isLoanType = ['Loan Out', 'Loan Out Return'].includes(sheet.indentType);
                const isPending = (isLoanType && sheet.status === 'Approved') && (!sheet.actual6 || sheet.actual6 === '');
                if (isPending) {
                    pendingIndents.add(String(sheet.indentNumber || sheet.indent_number || '').trim());
                }
            });
            return pendingIndents.size;
        },
    },
    {
        path: 'master-data',
        gateKey: 'masterData',
        name: 'Master Data',
        icon: <Database size={20} />,
        element: <MasterData />,
        notifications: () => 0,
    },
    {
        path: 'setting',
        roleKey: 'ADMIN',
        name: 'Setting',
        icon: <Settings size={20} />,
        element: <Setting />,
        notifications: () => 0,
    },
    // {
    //     path: 'training-video',
    //     name: 'Training Video',
    //     icon: <Video size={20} />,
    //     element: <TrainnigVideo />,
    //     notifications: () => 0,
    // },
    {
        path: 'license',
        name: 'License',
        icon: <KeyRound size={20} />,
        element: <License />,
        notifications: () => 0,
    },
];

// Globally disable mouse-wheel scroll changing number input values
document.addEventListener('wheel', () => {
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
    }
}, { passive: true });

// Globally select-all on focus for number inputs so existing value is replaced on type
document.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.target.select();
    }
});

const rootElement = document.getElementById('root')!;

// HMR guard: reuse the existing root on hot-reloads instead of creating a second one
declare global { interface Window { __reactRoot?: ReturnType<typeof createRoot> } }
if (!window.__reactRoot) {
    window.__reactRoot = createRoot(rootElement);
}

window.__reactRoot.render(
    <StrictMode>
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <SheetsProvider>
                                    <App routes={routes} />
                                </SheetsProvider>
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<DefaultRoute routes={routes} />} />
                        {routes.map(({ path, element, gateKey, roleKey }, index) => {
                            return <Route
                                key={`${path}-${index}`}
                                path={path}
                                element={
                                    <GatedRoute identifier={gateKey} roleKey={roleKey}>
                                        <ViewOnlyGuard>{element}</ViewOnlyGuard>
                                    </GatedRoute>
                                }
                            />;
                        })}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    </StrictMode>
);
