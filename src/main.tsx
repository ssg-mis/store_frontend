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
import VendorUpdate from './components/views/VendorUpdate';
import RateApproval from './components/views/RateApproval';
import ReceiveItems from './components/views/ReceiveItems';
import StoreOutApproval from './components/views/StoreOutApproval';
import GetPurchase from './components/views/getPurchase';
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
import PendingIndents from './components/views/PendingIndents';
import Order from './components/views/Order';
import Inventory from './components/views/Inventory';
import POMaster from './components/views/POMaster';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { loggedIn, loading } = useAuth();
    if (loading) return <Loading />;
    return loggedIn ? children : <Navigate to="/login" />;
}

function GatedRoute({
    children,
    identifier,
}: {
    children: React.ReactNode;
    identifier?: keyof UserPermissions;
}) {
    const { user } = useAuth();
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
        notifications: (sheets) =>
            sheets.filter(
                (sheet) =>
                    (sheet.planned1 && sheet.planned1 !== '') &&
                    (!sheet.actual1 || sheet.actual1 === '') &&
                    sheet.indentType === 'Purchase'
            ).length,
    },
    {
        path: 'vendor-rate-update',
        gateKey: 'updateVendorView',
        name: 'Vendor Rate Update',
        icon: <UserCheck size={20} />,
        element: <VendorUpdate />,
        notifications: (sheets) =>
            sheets.filter((sheet) => (sheet.planned2 && sheet.planned2 !== '') && (!sheet.actual2 || sheet.actual2 === '')).length,
    },
    {
        path: 'three-party-approval',
        gateKey: 'threePartyApprovalView',
        name: 'Three Party Approval',
        icon: <Users size={20} />,
        element: <RateApproval />,
        notifications: (sheets) =>
            sheets.filter(
                (sheet) =>
                    (sheet.planned3 && sheet.planned3 !== '') &&
                    (!sheet.actual3 || sheet.actual3 === '') &&
                    sheet.vendorType === 'Three Party'
            ).length,
    },
    {
        path: 'pending-pos',
        gateKey: 'pendingIndentsView',
        name: 'Pending POs',
        icon: <ListTodo size={20} />,
        element: <PendingIndents />,
        notifications: (sheets) =>
            sheets.filter((sheet) => (sheet.planned4 && sheet.planned4 !== '') && (!sheet.actual4 || sheet.actual4 === '')).length,
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
        path: 'get-purchase',
        gateKey: 'getPurchase',
        name: 'Get Purchase',
        icon: <Package2 size={20} />,
        element: <GetPurchase />,
        notifications: () => 0,
    },
    {
        path: 'receive-items',
        gateKey: 'receiveItemView',
        name: 'Receive Items',
        icon: <Truck size={20} />,
        element: <ReceiveItems />,
        notifications: (sheets) =>
            sheets.filter((sheet) => (sheet.planned5 && sheet.planned5 !== '') && (!sheet.actual5 || sheet.actual5 === '')).length,
    },
    {
        path: 'store-out-approval',
        gateKey: 'storeOutApprovalView',
        name: 'Store Out Approval',
        icon: <PackageCheck size={20} />,
        element: <StoreOutApproval />,
        notifications: (sheets) =>
            sheets.filter(
                (sheet) =>
                    (sheet.planned6 && sheet.planned6 !== '') &&
                    (!sheet.actual6 || sheet.actual6 === '') &&
                    sheet.indentType === 'Store Out'
            ).length,
    },
    // {
    //     path: 'quotation',
    //     gateKey: 'quotation',
    //     name: 'Quotation',
    //     icon: <ClipboardList size={20} />,
    //     element: <Quotation />,
    //     notifications: () => 0,
    // },
    {
        path: 'master-data',
        name: 'Master Data',
        icon: <Database size={20} />,
        element: <MasterData />,
        notifications: () => 0,
    },
    {
        path: 'setting',
        gateKey: 'setting',
        name: 'Setting',
        icon: <Settings size={20} />,
        element: <Setting />,
        notifications: () => 0,
    },
    {
        path: 'training-video',
        name: 'Training Video',
        icon: <Video size={20} />,
        element: <TrainnigVideo />,
        notifications: () => 0,
    },
    {
        path: 'license',
        name: 'License',
        icon: <KeyRound size={20} />,
        element: <License />,
        notifications: () => 0,
    },
];

createRoot(document.getElementById('root')!).render(
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
                        {routes.map(({ path, element, gateKey }, index) => {
                            return <Route
                                key={`${path}-${index}`}
                                path={path}
                                element={<GatedRoute identifier={gateKey}>{element}</GatedRoute>}
                            />
                        })}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    </StrictMode>
);