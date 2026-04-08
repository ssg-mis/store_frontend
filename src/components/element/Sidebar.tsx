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
import type { RouteAttributes } from '@/types';
import { LogOut, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Logo from './Logo';
import { useMemo } from 'react';

export default ({ items, variant, collapsible }: { items: RouteAttributes[]; variant?: 'sidebar' | 'floating' | 'inset'; collapsible?: 'offcanvas' | 'icon' | 'none' }) => {
    const navigate = useNavigate();
    const { 
        indentSheet, 
        poMasterSheet,
        receivedSheet,
        getPurchaseSheet,
        rateUpdateSheet,
        threePartyApprovalSheet,
        approvedIndentSheet,
        updateAll, 
        allLoading 
    } = useSheets();
    const { user, logout } = useAuth();

    // The logic to check if a user has permission for a specific route item
    const hasPermission = useMemo(() => {
        return (routeItem: RouteAttributes) => {
            // Priority 1: If the item has no gateKey, it's a public/master page, show it by default
            if (!routeItem.gateKey) return true;

            // Priority 2: Check the permission value from the user object (synced from DB)
            const userPermission = (user as any)?.[routeItem.gateKey];

            // If the permission data is missing entirely from the DB JSON, hide it as requested
            if (userPermission === undefined || userPermission === null) {
                return false;
            }

            // Handle string values like 'TRUE', 'FALSE', 'No Access'
            if (typeof userPermission === 'string') {
                return userPermission.toUpperCase() === 'TRUE';
            }

            // Handle boolean values (like inventory: false)
            if (typeof userPermission === 'boolean') {
                return userPermission;
            }

            // Handle numbers (0 = false, 1 = true)
            if (typeof userPermission === 'number') {
                return userPermission !== 0;
            }

            // Default to false for any other non-truthy values
            return !!userPermission;
        };
    }, [user]);

    // Filter items based on the permission logic
    const filteredItems = useMemo(() => {
        if (!user) return [];

        return items.filter((item) => {
            // Check legacy gateKey 'No Access' condition first if applicable
            if (item.gateKey && (user as any)[item.gateKey] === 'No Access') {
                return false;
            }

            // Apply the new refined permission check
            const allowed = hasPermission(item);
            return allowed;
        });
    }, [items, user, hasPermission]);

    // Early return if user context is missing
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
                        <RotateCw className={`size-4 ${allLoading ? 'animate-spin' : ''}`} />
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
                                    {item.notifications && item.notifications({
                                        indents: indentSheet || [],
                                        poMasters: poMasterSheet || [],
                                        received: receivedSheet || [],
                                        getPurchases: getPurchaseSheet || [],
                                        rateUpdates: rateUpdateSheet || [],
                                        threePartyApprovals: threePartyApprovalSheet || [],
                                        approvedIndents: approvedIndentSheet || []
                                    }) !== 0 && (
                                        <div className="ml-auto group-data-[collapsible=icon]:hidden bg-destructive text-secondary w-[1.3rem] h-[1.3rem] rounded-full text-xs grid place-items-center text-center">
                                            {item.notifications({
                                                indents: indentSheet || [],
                                                poMasters: poMasterSheet || [],
                                                received: receivedSheet || [],
                                                getPurchases: getPurchaseSheet || [],
                                                rateUpdates: rateUpdateSheet || [],
                                                threePartyApprovals: threePartyApprovalSheet || [],
                                                approvedIndents: approvedIndentSheet || []
                                            })}
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