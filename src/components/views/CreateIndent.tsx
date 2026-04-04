
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { ClipLoader as Loader } from 'react-spinners';
import { ClipboardList, Trash, Search, Plus } from 'lucide-react'; // Plus ko import karo
import { uploadFile } from '@/lib/fetchers';
import type { IndentSheet } from '@/types';
import { useSheets } from '@/context/SheetsContext';
import { fetchIndentMasterData, postToSheet, fetchFromSupabasePaginated } from '@/lib/fetchers';
import Heading from '../element/Heading';
import { useEffect, useState } from 'react';

const AddMasterDataSection = ({
    placeholder,
    onAdd,
}: {
    placeholder: string;
    onAdd: (name: string) => Promise<void>;
}) => {
    const [name, setName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        if (!name.trim()) {
            toast.error(`${placeholder} name cannot be empty`);
            return;
        }
        setIsAdding(true);
        try {
            await onAdd(name.trim());
            toast.success(`${placeholder} added successfully`);
            setName('');
        } catch (error: any) {
            toast.error('Failed to add: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div
            className="flex items-center gap-2 p-2 border-b sticky top-0 bg-popover z-10"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <Input
                placeholder={`Add new ${placeholder.toLowerCase()}...`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAdd();
                    }
                }}
                className="h-8"
            />
            <Button
                size="icon"
                variant="ghost"
                type="button"
                disabled={isAdding}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd();
                }}
                className="h-8 w-8"
            >
                {isAdding ? <Loader size={12} color="currentColor" /> : <Plus className="h-4 w-4" />}
            </Button>
        </div>
    );
};


export default () => {
    const { indentSheet: sheet, updateIndentSheet } = useSheets();
    const [indentSheet, setIndentSheet] = useState<IndentSheet[]>([]);
    const [master, setMaster] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermGroupHead, setSearchTermGroupHead] = useState('');
    const [searchTermProductName, setSearchTermProductName] = useState('');

    const refreshMaster = async () => {
        const data = await fetchIndentMasterData();
        setMaster(data);
    };

    useEffect(() => {
        setIndentSheet(sheet);
    }, [sheet]);

    useEffect(() => {
        fetchIndentMasterData().then(setMaster);
    }, []);

    const schema = z.object({
        indenterName: z.string().nonempty(),
        indentApproveBy: z.string().nonempty(),
        indentType: z.enum(['Purchase', 'Store Out'], { required_error: 'Select a status' }),
        products: z
            .array(
                z.object({
                    department: z.string().nonempty(),
                    createGroupHead: z.string().nonempty(),
                    productName: z.string().nonempty(),
                    quantity: z.coerce.number().gt(0, 'Must be greater than 0'),
                    uom: z.string().nonempty(),
                    areaOfUse: z.string().nonempty(),
                    attachment: z.instanceof(File).optional(),
                    specifications: z.string().optional(),
                })
            )
            .min(1, 'At least one product is required'),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            indenterName: '',
            indentApproveBy: '',
            indentType: '' as any, // Change from undefined to ''
            products: [
                {
                    attachment: undefined,
                    uom: '',
                    productName: '',
                    specifications: '',
                    quantity: 1,
                    areaOfUse: '',
                    createGroupHead: '',
                    department: '',
                },
            ],
        },
    });

    const products = form.watch('products');
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'products',
    });

    // Function to generate next indent number
    // Function to generate next indent number from dummy data
    const getNextIndentNumber = async () => {
        try {
            const indents = await fetchFromSupabasePaginated('indent', 'indentNumber', { column: 'indentNumber', options: { ascending: false } }, undefined, { from: 0, to: 0 });
            
            if (!indents || indents.length === 0) {
                return 'SI-0001';
            }

            const lastIndentNumber = indents[0].indentNumber || indents[0].indent_number;
            const lastNumber = parseInt(lastIndentNumber.replace('SI-', ''), 10);

            if (isNaN(lastNumber)) {
                return 'SI-0001';
            }

            const nextNumber = lastNumber + 1;
            return `SI-${String(nextNumber).padStart(4, '0')}`;
        } catch (err) {
            console.error('Error generating indent number:', err);
            return 'SI-0001';
        }
    };

    // Function to submit new product to master table
    const handleAddMasterData = async (columnName: string, value: string, additionalData: any = {}) => {
        const payload = {
            [columnName]: value,
            ...additionalData
        };
        const result = await postToSheet([payload], 'insert', 'MASTER');
        if (result.success) {
            await refreshMaster();
        } else {
            throw new Error('Failed to save to master');
        }
    };

    async function onSubmit(data: z.infer<typeof schema>) {
        try {
            const formatDate = (date: Date) => {
                const d = String(date.getDate()).padStart(2, '0');
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const y = date.getFullYear();
                const h = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                const s = String(date.getSeconds()).padStart(2, '0');
                return `${d}/${m}/${y} ${h}:${min}:${s}`;
            };

            const createdAt = new Date().toISOString();
            const plannedStr = formatDate(new Date()); // For the planned string field
            const rows: any[] = [];

            // Get the starting indent number
            let currentIndentNumber = await getNextIndentNumber();

            for (let i = 0; i < data.products.length; i++) {
                const product = data.products[i];

                // Generate unique indent number for each product
                if (i > 0) {
                    const lastNumber = parseInt(currentIndentNumber.replace('SI-', ''), 10);
                    currentIndentNumber = `SI-${String(lastNumber + 1).padStart(4, '0')}`;
                }

                const row = {
                    createdAt: createdAt,
                    indentNumber: currentIndentNumber,
                    indenterName: data.indenterName,
                    department: product.department,
                    areaOfUse: product.areaOfUse,
                    groupHead: product.createGroupHead,
                    productName: product.productName,
                    quantity: product.quantity,
                    uom: product.uom,
                    specifications: product.specifications || '',
                    indentApprovedBy: data.indentApproveBy,
                    indentType: data.indentType,
                    planned: plannedStr, // Store current date in same format as requested
                };

                if (product.attachment !== undefined) {
                    (row as any).attachment = await uploadFile(
                        product.attachment,
                        'indent_file',
                        'upload'
                    );
                }

                rows.push(row);
            }

            // Insert all rows via API
            const result = await postToSheet(rows, 'insert', 'INDENT');

            if (!result.success) throw new Error('API insertion failed');

            setTimeout(() => {
                fetchIndentData();
            }, 1000);

            toast.success('Indent created successfully');
            updateIndentSheet(); // Update context for sidebars

            form.reset({
                indenterName: '',
                indentApproveBy: '',
                indentType: '' as any,
                products: [
                    {
                        attachment: undefined,
                        uom: '',
                        productName: '',
                        specifications: '',
                        quantity: 1,
                        areaOfUse: '',
                        createGroupHead: '',
                        department: '',
                    },
                ],
            });

        } catch (_) {
            toast.error('Error while creating indent! Please try again');
        }
    }

    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div>
            <Heading heading="Indent Form" subtext="Create new Indent">
                <ClipboardList size={50} className="text-primary" />
            </Heading>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6 p-5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <FormField
                            control={form.control}
                            name="indenterName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Indenter Name
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter indenter name" {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="indentType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Indent Type
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Purchase">Purchase</SelectItem>
                                            <SelectItem value="Store Out">Store Out</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="indentApproveBy"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Approved By
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter approved by" {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Products</h2>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    append({
                                        department: '',
                                        createGroupHead: '',
                                        productName: '',
                                        quantity: 1,
                                        uom: '',
                                        areaOfUse: '',
                                        // @ts-ignore
                                        priority: undefined,
                                        attachment: undefined,
                                    })
                                }
                            >
                                Add Product
                            </Button>
                        </div>

                        {fields.map((field, index) => {

                            const createGroupHead = products[index]?.createGroupHead;

                            // Get products from the corrected master data structure
                            // The createGroupHead field in the form represents create_group_head
                            const productOptions = master?.groupHeadItems?.[createGroupHead] || [];

                            return (
                                <div
                                    key={field.id}
                                    className="flex flex-col gap-4 border p-4 rounded-lg"
                                >
                                    <div className="flex justify-between">
                                        <h3 className="text-md font-semibold">
                                            Product {index + 1}
                                        </h3>
                                        <Button
                                            variant="destructive"
                                            type="button"
                                            onClick={() => fields.length > 1 && remove(index)}
                                            disabled={fields.length === 1}
                                        >
                                            <Trash />
                                        </Button>
                                    </div>
                                    <div className="grid gap-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.department`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Department
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select department" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                 <AddMasterDataSection
                                                                    placeholder="Department"
                                                                    onAdd={async (val) => {
                                                                        await handleAddMasterData('department', val, {
                                                                            vendor_name: '-', 
                                                                            itemName: '-', 
                                                                            groupHead: '-', 
                                                                            group_head: '-', 
                                                                            inventoryStatus: 'Show'
                                                                        });
                                                                        form.setValue(`products.${index}.department`, val);
                                                                    }}
                                                                />
                                                                <div className="flex items-center border-b px-3 pb-3">
                                                                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                    <input
                                                                        placeholder="Search departments..."
                                                                        value={searchTerm}
                                                                        onChange={(e) =>
                                                                            setSearchTerm(
                                                                                e.target.value
                                                                            )
                                                                        }
                                                                        onKeyDown={(e) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                        className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                    />
                                                                </div>
                                                                <div className="max-h-[300px] overflow-y-auto">
                                                                    {master?.departments
                                                                        ?.filter((dep: string) =>
                                                                            dep
                                                                                .toLowerCase()
                                                                                .includes(
                                                                                    searchTerm.toLowerCase()
                                                                                )
                                                                        )
                                                                        .map((dep: string, i: number) => (
                                                                            <SelectItem
                                                                                key={i}
                                                                                value={dep}
                                                                            >
                                                                                {dep}
                                                                            </SelectItem>
                                                                        ))}
                                                                </div>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.createGroupHead`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                           Group Head
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select category" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                 <AddMasterDataSection
                                                                    placeholder="Category"
                                                                    onAdd={async (val) => {
                                                                        await handleAddMasterData('groupHead', val, {
                                                                            vendor_name: '-',
                                                                            group_head: val, // Keep both in sync
                                                                            itemName: '-', 
                                                                            department: '-',
                                                                            inventoryStatus: 'Show'
                                                                        });
                                                                        form.setValue(`products.${index}.createGroupHead`, val);
                                                                    }}
                                                                />
                                                                <div className="flex items-center border-b px-3 pb-3">
                                                                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                    <input
                                                                        placeholder="Search categories..."
                                                                        value={searchTermGroupHead}
                                                                        onChange={(e) =>
                                                                            setSearchTermGroupHead(
                                                                                e.target.value
                                                                            )
                                                                        }
                                                                        onKeyDown={(e) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                        className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                    />
                                                                </div>
                                                                <div className="max-h-[300px] overflow-y-auto">
                                                                    {master?.createGroupHeads
                                                                        ?.filter((gh: string) =>
                                                                            gh
                                                                                .toLowerCase()
                                                                                .includes(
                                                                                    searchTermGroupHead.toLowerCase()
                                                                                )
                                                                        )
                                                                        .map((gh: string, i: number) => (
                                                                            <SelectItem
                                                                                key={i}
                                                                                value={gh}
                                                                            >
                                                                                {gh}
                                                                            </SelectItem>
                                                                        ))}
                                                                </div>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.areaOfUse`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Area Of Use
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Enter area of use"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.productName`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Product Name
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                            disabled={!createGroupHead}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select product" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                 <AddMasterDataSection
                                                                    placeholder="Product"
                                                                    onAdd={async (val) => {
                                                                        if (!createGroupHead) {
                                                                            toast.error('Please select a category first');
                                                                            return;
                                                                        }
                                                                        await handleAddMasterData('itemName', val, {
                                                                            vendor_name: '-',
                                                                            groupHead: createGroupHead,
                                                                            group_head: createGroupHead,
                                                                            department: '-',
                                                                            inventoryStatus: 'Show'
                                                                        });
                                                                        form.setValue(`products.${index}.productName`, val);
                                                                    }}
                                                                />
                                                                <div className="flex items-center border-b px-3 pb-3">
                                                                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                    <input
                                                                        placeholder="Search products..."
                                                                        value={
                                                                            searchTermProductName
                                                                        }
                                                                        onChange={(e) =>
                                                                            setSearchTermProductName(
                                                                                e.target.value
                                                                            )
                                                                        }
                                                                        onKeyDown={(e) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                        className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                    />
                                                                </div>

                                                                <div className="max-h-[300px] overflow-y-auto">
                                                                    {productOptions
                                                                        ?.filter((dep: string) =>
                                                                            dep
                                                                                .toLowerCase()
                                                                                .includes(
                                                                                    searchTermProductName.toLowerCase()
                                                                                )
                                                                        )
                                                                        .map((dep: string, i: number) => (
                                                                            <SelectItem
                                                                                key={i}
                                                                                value={dep}
                                                                            >
                                                                                {dep}
                                                                            </SelectItem>
                                                                        ))}
                                                                </div>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Quantity
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                disabled={!createGroupHead}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.uom`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            UOM
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                disabled={!createGroupHead}
                                                                placeholder="e.g. Pcs, Kgs"
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name={`products.${index}.attachment`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Attachment</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            onChange={(e) =>
                                                                field.onChange(e.target.files?.[0])
                                                            }
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`products.${index}.specifications`}
                                            render={({ field }) => (
                                                <FormItem className="w-full">
                                                    <FormLabel>Specifications</FormLabel>
                                                    <FormControl>
                                                        <Textarea
                                                            placeholder="Enter specifications"
                                                            className="resize-y"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        <Button
                            className="w-full"
                            type="submit"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting && (
                                <Loader size={20} color="white" aria-label="Loading Spinner" />
                            )}
                            Create Indent
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
};;
async function fetchIndentData() {
    // This function should update the indent sheet context
    // Since we don't have access to the updateIndentSheet function here,
    // we'll leave it as a placeholder or remove it if not needed
    // The updateIndentSheet function is called directly from the context
}

