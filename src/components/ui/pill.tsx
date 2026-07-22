import * as React from 'react';

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const pillVariants = cva('rounded-full text-xs px-3 py-1 border', {
    variants: {
        variant: {
            pending: 'bg-yellow-100 text-yellow-700 border-yellow-700',
            primary: 'bg-sky-100 text-sky-700 border-sky-700',
            secondary: 'bg-green-100 text-green-700 border-green-700',
            default: 'bg-accent text-accent-foreground  border-accent-foreground',
            reject: 'bg-red-100 text-red-700 border-red-700',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
});

function Pill({
    className,
    variant,
    children,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof pillVariants>) {
    return (
        <span {...props} className={cn(pillVariants({ variant, className }))}>
            {children}
        </span>
    );
}

export { Pill };
