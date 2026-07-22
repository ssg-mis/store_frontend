import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import Sidebar from '@/components/element/Sidebar';
import { Outlet } from 'react-router-dom';
import type { RouteAttributes } from './types';

export default ({ routes }: { routes: RouteAttributes[] }) => {
    return (
        <div className="flex w-full h-screen overflow-hidden bg-white">
            <SidebarProvider>
                <Sidebar items={routes} variant="sidebar" collapsible="icon" />
                <SidebarInset className="min-w-0 flex flex-col h-screen overflow-hidden bg-white">
                    <div className="flex-1 w-full h-full overflow-y-auto p-4 md:p-6 pb-10">
                        <Outlet />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
};
