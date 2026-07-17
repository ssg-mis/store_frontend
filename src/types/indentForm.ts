import { z } from 'zod';
import type { UseFormReturn, UseFieldArrayRemove } from 'react-hook-form'; // Import necessary types

// Zod schema definitions
export const productSchema = z.object({
    department: z.string().nonempty(),
    groupHead: z.string().nonempty(),
    productName: z.string().nonempty(),
    quantity: z.coerce.number().gt(0, 'Must be greater than 0'),
    uom: z.string().nonempty(),
    areaOfUse: z.string().nonempty(),
    priority: z.enum(['Low', 'Normal', 'High', 'Urgent'], {
        required_error: 'Select priority',
    }),
    attachment: z.instanceof(File).optional().nullable(), // Allow null for attachment
    specifications: z.string().optional(),
});

export const formSchema = z.object({
    indenterName: z.string().nonempty(),
    approvedByWhom: z.string().nonempty(),
    status: z.enum(['Purchase', 'Store Out'], {
        required_error: 'Select a status',
    }),
    products: z.array(productSchema).min(1, 'At least one product is required'),
});

// TypeScript inferred types from Zod schemas
export type ProductFormValues = z.infer<typeof productSchema>;
export type FormValues = z.infer<typeof formSchema>;

// Types for your options data
export type ProductOptionTuple = [string, string]; // e.g., ["Laptop", "Pcs"]

export type GroupOptions = {
    [groupName: string]: ProductOptionTuple[];
};

export interface Options {
    department: string[];
    groups: GroupOptions;
}

// Type for the `MasterSheet` data (assuming it's external)
export interface MasterSheet {
    department: string[];
    groupHead: string[];
    itemName: string[];
    uom: string[];
    // Add other fields from your MasterSheet if they exist
}

// Props interface for the ProductItem component
export interface ProductItemProps {
    field: ProductFormValues & { id: string }; // 'field' from useFieldArray includes 'id'
    index: number;
    form: UseFormReturn<FormValues>; // Pass the full form object type
    remove: UseFieldArrayRemove; // Type for the remove function
    fieldsLength: number;
    options: Options; // Pass options to the sub-component
}
