import { useRef, type ReactNode, type SyntheticEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

// Maps route path segment → pageModifyAccess key
const ROUTE_PAGE_KEY: Record<string, string> = {
    'inventory': 'inventory',
    'create-indent': 'createIndent',
    'approve-indent': 'approveIndent',
    'vendor-rate-update': 'vendorRateUpdate',
    'multi-party-approval': 'threePartyApproval',
    'pending-pos': 'pendingPos',
    'create-po': 'createPo',
    'po-master': 'poMaster',
    'receive-items': 'receiveItems',
    'store-out-approval': 'storeOutApproval',
    'loan-out-approval': 'storeOutApproval',
    'quotation': 'quotation',
    'master-data': 'masterData',
};

function resolveAccess(user: any, pathname: string): 'EDIT' | 'VIEW' {
    const routeSegment = pathname.split('/').filter(Boolean)[0] || '';
    const pageKey = ROUTE_PAGE_KEY[routeSegment];
    const pageModifyAccess = user?.pageModifyAccess as Record<string, 'EDIT' | 'VIEW'> | undefined;
    const effective = pageKey && pageModifyAccess?.[pageKey]
        ? String(pageModifyAccess[pageKey]).toUpperCase()
        : String(user?.modifyAccess || user?.modify_access || 'EDIT').toUpperCase();
    return effective === 'VIEW' ? 'VIEW' : 'EDIT';
}

export function usePageViewOnly(): boolean {
    const { user } = useAuth();
    const { pathname } = useLocation();
    return resolveAccess(user, pathname) === 'VIEW';
}

function isViewOnlyAllowed(target: HTMLElement | null) {
    return Boolean(
        target?.closest(
            'a[href], [data-view-only-allow="true"], [role="tab"], [data-radix-scroll-area-thumb]'
        )
    );
}

function isEditableTarget(target: HTMLElement | null) {
    return Boolean(
        target?.closest(
            'input, textarea, select, [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"]'
        )
    );
}

export default function ViewOnlyGuard({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const lastToastAt = useRef(0);

    const isViewOnly = resolveAccess(user, pathname) === 'VIEW';

    function notify() {
        const now = Date.now();
        if (now - lastToastAt.current < 2000) return;
        lastToastAt.current = now;
        toast.info('View-only access: editing and submitting are disabled for this page.');
    }

    function block(event: SyntheticEvent, showMessage = true) {
        event.preventDefault();
        event.stopPropagation();
        if (showMessage) notify();
    }

    if (!isViewOnly) {
        return <>{children}</>;
    }

    return (
        <div
            data-view-only="true"
            className="h-full"
            onSubmitCapture={block}
            onChangeCapture={(event) => {
                const target = event.target as HTMLElement | null;
                if (!isViewOnlyAllowed(target) && isEditableTarget(target)) {
                    block(event, false);
                }
            }}
            onInputCapture={(event) => {
                const target = event.target as HTMLElement | null;
                if (!isViewOnlyAllowed(target) && isEditableTarget(target)) {
                    block(event, false);
                }
            }}
        >
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
                View-only access: you can view data, but editing, filling forms, and submitting are disabled.
            </div>
            {children}
        </div>
    );
}
