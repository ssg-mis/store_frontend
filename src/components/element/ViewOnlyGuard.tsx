import { useRef, type ReactNode, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

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
    const lastToastAt = useRef(0);
    const access = String(user?.modifyAccess || user?.modify_access || 'EDIT').toUpperCase();
    const isViewOnly = access === 'VIEW';

    function notify() {
        const now = Date.now();
        if (now - lastToastAt.current < 2000) return;
        lastToastAt.current = now;
        toast.info('View-only access: editing and submitting are disabled for this user.');
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
