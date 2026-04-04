import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
    SidebarFooter,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import type { RouteAttributes, UserPermissions } from '@/types';
import { LogOut, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Logo from './Logo';
import { useMemo } from 'react';

export default ({ items, variant, collapsible }: { items: RouteAttributes[]; variant?: 'sidebar' | 'floating' | 'inset'; collapsible?: 'offcanvas' | 'icon' | 'none' }) => {
    const navigate = useNavigate();
    const { indentSheet, updateAll, allLoading } = useSheets();
    const { user, logout } = useAuth();

    // Memoize the permission checking function to avoid re-creation on every render
    // Fix the permission checking logic
    const hasPermission = useMemo(() => {
        return (routeItem: RouteAttributes) => {
            // In the Sidebar component, update the pathToPermissionMap:

            const pathToPermissionMap: Record<string, keyof UserPermissions> = {
                '': 'dashboard', // Dashboard route
                'dashboard': 'dashboard',
                'inventory': 'inventory',
                'setting': 'setting',
                'create-indent': 'createIndent',
                // 'all-indent': 'allIndent',
                'create-po': 'createPo',
                'get-purchase': 'getPurchase',
                'approve-indent': 'indentApprovalView',
                'po-history': 'ordersView',
                'po-master': 'poMaster',
                'pending-pos': 'pendingIndentsView',
                'receive-items': 'receiveItemView',
                'store-out-approval': 'storeOutApprovalView',
                'quotation': 'quotation',
                'three-party-approval': 'threePartyApprovalView',
                'vendor-rate-update': 'updateVendorView',
            };

            const permissionKey = pathToPermissionMap[routeItem.path];
            if (!permissionKey) return true; // Show by default if no mapping found

            // Fix: Handle both string and boolean values safely with type assertion
            const userPermission = (user as any)?.[permissionKey];

            // Handle string values like 'TRUE', 'FALSE', 'No Access'
            if (typeof userPermission === 'string') {
                return userPermission.toUpperCase() === 'TRUE';
            }

            // Handle boolean values
            if (typeof userPermission === 'boolean') {
                return userPermission;
            }

            // Handle numbers (0 = false, 1 = true) or other types
            if (typeof userPermission === 'number') {
                return userPermission !== 0;
            }

            // Default to false if undefined or null
            return false;
        };
    }, [user]);

    // Memoize filtered items to prevent unnecessary re-renders
    const filteredItems = useMemo(() => {
        if (!user) return [];

        return items.filter((item) => {
            // First check existing gateKey condition
            if (item.gateKey && (user as any)[item.gateKey] === 'No Access') {
                return false;
            }

            // Then check new permission-based condition
            return hasPermission(item);
        });
    }, [items, user, hasPermission]);

    // Early return if user is not loaded
    if (!user) {
        return null;
    }

    return (
        <Sidebar side="left" variant={variant || 'inset'} collapsible={collapsible || 'offcanvas'}>
            <SidebarHeader className="p-3 border-b-1">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        <Logo />
                        <div className="group-data-[collapsible=icon]:hidden">
                            <h2 className="text-xl font-bold">Store App</h2>
                            <p className="text-sm">Management System</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        className="size-7 group-data-[collapsible=icon]:hidden"
                        onClick={() => updateAll()}
                        disabled={allLoading}
                    >
                    </Button>
                </div>
                <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
                <div className="flex justify-between items-center px-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    <div>
                        <p>
                            Name: <span className="font-semibold">{user.name}</span>
                        </p>
                        <p>
                            Username: <span className="font-semibold">{user.username}</span>
                        </p>
                    </div>
                    <Button variant="outline" className="size-8" onClick={() => logout()}>
                        <LogOut />
                    </Button>
                </div>
            </SidebarHeader>
            <SidebarContent className="py-2 border-b-1">
                <SidebarGroup className="px-3">
                    <SidebarMenu className="gap-2">
                        {filteredItems.map((item, i) => (
                            <SidebarMenuItem key={`${item.path}-${i}`}>
                                <SidebarMenuButton
                                    className="transition-colors duration-200 rounded-md py-5 font-medium text-secondary-foreground [&>svg]:size-5"
                                    onClick={() => navigate(item.path)}
                                    isActive={window.location.pathname.slice(1) === item.path}
                                    tooltip={item.name}
                                >
                                    {item.icon}
                                    <span className="group-data-[collapsible=icon]:hidden truncate">
                                        {item.name}
                                    </span>
                                    {item.notifications && item.notifications(indentSheet || []) !== 0 && (
                                        <div className="ml-auto group-data-[collapsible=icon]:hidden bg-destructive text-secondary w-[1.3rem] h-[1.3rem] rounded-full text-xs grid place-items-center text-center">
                                            {item.notifications(indentSheet || [])}
                                        </div>
                                    )}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="group-data-[collapsible=icon]:hidden">
                <div className="p-2 text-center text-sm">
                    Powered by &#8208;{' '}
                    <a className="text-primary" href="https://botivate.in" target="_blank" rel="noopener noreferrer">
                        Botivate
                    </a>
                </div>
            </SidebarFooter>
        </Sidebar>
    );
};