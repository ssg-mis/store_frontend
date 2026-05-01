
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
import { ClipboardList, Trash, Search } from 'lucide-react';
import { uploadFile } from '@/lib/fetchers';
import type { IndentSheet } from '@/types';
import { useSheets } from '@/context/SheetsContext';
import { fetchIndentMasterData, postToSheet, fetchFromSupabasePaginated, fetchUOMs, fetchProductCategories, fetchUsers } from '@/lib/fetchers';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { useEffect, useState } from 'react';




export default () => {
    const { user } = useAuth();
    const isAdmin = (user as any)?.role === 'ADMIN';

    const { indentSheet: sheet, updateIndentSheet, inventorySheet, updateInventorySheet } = useSheets();
    const [indentSheet, setIndentSheet] = useState<IndentSheet[]>([]);
    const [master, setMaster] = useState<any>(null);
    const [users, setUsers] = useState<{ id: number; name: string; username: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermGroupHead, setSearchTermGroupHead] = useState('');
    const [searchTermProductName, setSearchTermProductName] = useState('');
    const [uoms, setUoms] = useState<{ uom_id: number; uom_name: string }[]>([]);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number; product_category_name: string }[]>([]);
    const [stockError, setStockError] = useState<string>('');

    const refreshMaster = async () => {
        const data = await fetchIndentMasterData();
        setMaster(data);
    };

    useEffect(() => {
        setIndentSheet(sheet);
    }, [sheet]);

    useEffect(() => {
        fetchIndentMasterData().then(setMaster);
        fetchUOMs().then(setUoms);
        fetchProductCategories().then(setProductCategories);
        updateInventorySheet(true); // silent refresh so stock check uses latest data
    }, []);

    useEffect(() => {
        if (isAdmin) {
            fetchUsers().then(setUsers);
        }
    }, [isAdmin]);

    const schema = z.object({
        firm: z.string().nonempty('Select a firm'),
        indenterName: z.string().nonempty(),
        indentType: z.enum(['Purchase', 'Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'], { required_error: 'Select a status' }),
        validityDate: z.string().optional(),
        products: z
            .array(
                z.object({
                    department: z.string().nonempty(),
                    createGroupHead: z.string().nonempty(),
                    productName: z.string().nonempty(),
                    quantity: z.coerce.number().gt(0, 'Must be greater than 0'),
                    uom: z.string().nonempty(),
                    areaOfUse: z.string().nonempty(),
                    productCategory: z.string().optional(),
                    attachment: z.instanceof(File).optional(),
                    specifications: z.string().optional(),
                })
            )
            .min(1, 'At least one product is required'),
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            firm: '',
            indenterName: isAdmin ? '' : ((user as any)?.name || ''),
            indentType: '' as any,
            validityDate: '',
            products: [
                {
                    attachment: undefined,
                    uom: '',
                    productName: '',
                    productCategory: '',
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
    const indentType = form.watch('indentType');
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'products',
    });

    // Helper: get current stock for a product
    function getStock(productName: string, groupHead: string): number {
        if (!productName) return 0;
        const item = inventorySheet.find(
            i =>
                i.itemName?.toLowerCase().trim() === productName.toLowerCase().trim() &&
                (!groupHead || i.groupHead?.toLowerCase().trim() === groupHead.toLowerCase().trim())
        );
        return Number(item?.current || 0);
    }

    // Auto-set indent type based on stock availability
    useEffect(() => {
        setStockError('');
        const filled = products.filter(p => p.productName);
        if (filled.length === 0) return;

        const allInStock = filled.every(p => {
            const stock = getStock(p.productName, p.createGroupHead);
            return stock >= Number(p.quantity || 0);
        });

        form.setValue('indentType', allInStock ? 'Store Out' : 'Purchase');
    }, [products, inventorySheet]);

    // Sync Department, Department Head, Area of Use from product[0] to all subsequent products
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (
                name === 'products.0.department' ||
                name === 'products.0.createGroupHead' ||
                name === 'products.0.areaOfUse'
            ) {
                const first = value.products?.[0];
                if (!first) return;
                const total = value.products?.length || 0;
                for (let i = 1; i < total; i++) {
                    form.setValue(`products.${i}.department` as any, first.department || '');
                    form.setValue(`products.${i}.createGroupHead` as any, first.createGroupHead || '');
                    form.setValue(`products.${i}.areaOfUse` as any, first.areaOfUse || '');
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    // Auto-fill UOM when productName changes
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (name?.endsWith('.productName')) {
                const parts = name.split('.');
                const index = parseInt(parts[1]);
                if (!isNaN(index)) {
                    const product = value.products?.[index];
                    const gh = product?.createGroupHead;
                    const pn = product?.productName;
                    if (gh && pn && master?.uomLookup) {
                        const uom = master.uomLookup[gh]?.[pn];
                        if (uom) {
                            form.setValue(`products.${index}.uom` as any, uom);
                        }
                    }
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form, master]);

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




    async function onSubmit(data: z.infer<typeof schema>) {
        // Validate stock for store-out type indents
        const isStoreOutType = ['Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'].includes(data.indentType);
        if (isStoreOutType) {
            const shortProducts = data.products
                .filter(p => p.productName)
                .filter(p => {
                    const stock = getStock(p.productName, p.createGroupHead);
                    return stock < Number(p.quantity || 0);
                });

            if (shortProducts.length > 0) {
                const messages = shortProducts.map(p => {
                    const stock = getStock(p.productName, p.createGroupHead);
                    return `${p.productName}: need ${p.quantity}, available ${stock}`;
                });
                setStockError(`Insufficient stock for ${data.indentType} — ${messages.join(' | ')}`);
                return;
            }
        }

        setStockError('');
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
            const currentIndentNumber = await getNextIndentNumber();

            for (let i = 0; i < data.products.length; i++) {
                const product = data.products[i];

                const row = {
                    createdAt: createdAt,
                    indentNumber: currentIndentNumber,
                    firm: data.firm,
                    indenterName: data.indenterName,
                    department: product.department,
                    areaOfUse: product.areaOfUse,
                    groupHead: product.createGroupHead,
                    productName: product.productName,
                    productCategory: product.productCategory || null,
                    quantity: product.quantity,
                    uom: product.uom,
                    specifications: product.specifications || '',
                    indentType: data.indentType,
                    validityDate: (['Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'].includes(data.indentType)) ? (data.validityDate ? new Date(data.validityDate).toISOString() : null) : null,
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
                firm: '',
                indenterName: isAdmin ? '' : ((user as any)?.name || ''),
                indentType: '' as any,
                validityDate: '',
                products: [
                    {
                        attachment: undefined,
                        uom: '',
                        productName: '',
                        productCategory: '',
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <FormField
                            control={form.control}
                            name="firm"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Firm
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select firm" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {master?.firms?.map((firm: string, i: number) => (
                                                <SelectItem key={i} value={firm}>
                                                    {firm}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="indenterName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Indenter Name
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    {isAdmin ? (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select indenter" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {users.map((u) => (
                                                    <SelectItem key={u.id} value={u.name}>
                                                        {u.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <FormControl>
                                            <Input {...field} disabled />
                                        </FormControl>
                                    )}
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
                                            <SelectItem value="Store Out Return">Store Out Return</SelectItem>
                                            <SelectItem value="Loan Out">Loan Out</SelectItem>
                                            <SelectItem value="Loan Out Return">Loan Out Return</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                                onClick={() => {
                                    const lastProduct = products[products.length - 1] || {};
                                    append({
                                        department: lastProduct.department || '',
                                        createGroupHead: lastProduct.createGroupHead || '',
                                        productName: '',
                                        productCategory: lastProduct.productCategory || '',
                                        quantity: 1,
                                        uom: lastProduct.uom || '',
                                        areaOfUse: lastProduct.areaOfUse || '',
                                        attachment: undefined,
                                        specifications: '',
                                    });
                                }}
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
                                                            <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        {index === 0 ? (
                                                            <Select
                                                                onValueChange={(value) => {
                                                                    field.onChange(value);
                                                                    // Auto-fill Department Head
                                                                    const gh = master?.departmentToGroupHead?.[value];
                                                                    if (gh) {
                                                                        form.setValue(`products.0.createGroupHead` as any, gh);
                                                                    }
                                                                }}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select department" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <div className="flex items-center border-b px-3 pb-3">
                                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                        <input
                                                                            placeholder="Search departments..."
                                                                            value={searchTerm}
                                                                            onChange={(e) => setSearchTerm(e.target.value)}
                                                                            onKeyDown={(e) => e.stopPropagation()}
                                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                        />
                                                                    </div>
                                                                    <div className="max-h-[300px] overflow-y-auto">
                                                                        {master?.departments?.filter((dep: string) => dep.toLowerCase().includes(searchTerm.toLowerCase())).map((dep: string, i: number) => (
                                                                            <SelectItem key={i} value={dep}>{dep}</SelectItem>
                                                                        ))}
                                                                    </div>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed">
                                                                {products[0]?.department || '—'}
                                                            </div>
                                                        )}
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.createGroupHead`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Department Head
                                                            <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        {index === 0 ? (
                                                            <Select
                                                                onValueChange={(value) => {
                                                                    field.onChange(value);
                                                                    // Auto-fill Department
                                                                    const dep = master?.groupHeadToDepartment?.[value];
                                                                    if (dep) {
                                                                        form.setValue(`products.0.department` as any, dep);
                                                                    }
                                                                }}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select category" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <div className="flex items-center border-b px-3 pb-3">
                                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                        <input
                                                                            placeholder="Search categories..."
                                                                            value={searchTermGroupHead}
                                                                            onChange={(e) => setSearchTermGroupHead(e.target.value)}
                                                                            onKeyDown={(e) => e.stopPropagation()}
                                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                        />
                                                                    </div>
                                                                    <div className="max-h-[300px] overflow-y-auto">
                                                                        {master?.createGroupHeads?.filter((gh: string) => gh.toLowerCase().includes(searchTermGroupHead.toLowerCase())).map((gh: string, i: number) => (
                                                                            <SelectItem key={i} value={gh}>{gh}</SelectItem>
                                                                        ))}
                                                                    </div>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed">
                                                                {products[0]?.createGroupHead || '—'}
                                                            </div>
                                                        )}
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
                                                            <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        {index === 0 ? (
                                                            <FormControl>
                                                                <Input placeholder="Enter area of use" {...field} />
                                                            </FormControl>
                                                        ) : (
                                                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed">
                                                                {products[0]?.areaOfUse || '—'}
                                                            </div>
                                                        )}
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.productCategory`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product Category</FormLabel>
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
                                                                {productCategories.map((c) => (
                                                                    <SelectItem
                                                                        key={c.product_category_id}
                                                                        value={c.product_category_name}
                                                                    >
                                                                        {c.product_category_name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.productName`}
                                                render={({ field }) => {
                                                    const stock = getStock(field.value, createGroupHead);
                                                    const qty = Number(products[index]?.quantity || 0);
                                                    const hasProduct = !!field.value;
                                                    const stockOk = hasProduct && stock >= qty;
                                                    return (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Product Name
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={(value) => {
                                                                field.onChange(value);
                                                                const uom = master?.uomLookup?.[createGroupHead]?.[value];
                                                                if (uom) {
                                                                    form.setValue(`products.${index}.uom` as any, uom);
                                                                }
                                                            }}
                                                            value={field.value}
                                                            disabled={!createGroupHead}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select product" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
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
                                                        {hasProduct && (
                                                            <p className={`text-xs mt-1 ${stockOk ? 'text-green-600' : 'text-destructive'}`}>
                                                                Current stock: {stock} {products[index]?.uom || ''}{!stockOk && qty > 0 ? ` — need ${qty}, short by ${qty - stock}` : ''}
                                                            </p>
                                                        )}
                                                    </FormItem>
                                                    );
                                                }}
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
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select UOM" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {uoms.map((u) => (
                                                                    <SelectItem
                                                                        key={u.uom_id}
                                                                        value={u.uom_name}
                                                                    >
                                                                        {u.uom_name}
                                                                    </SelectItem>
                                                                ))}
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

                    <div className="space-y-2">
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
                        {stockError && (
                            <p className="text-sm text-destructive font-medium text-center">
                                {stockError}
                            </p>
                        )}
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

