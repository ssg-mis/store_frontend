
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
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




type UOMConversionRow = {
    conversion_id: number;
    conversionToBase: string | number;
    alternateUom?: {
        uom_id: number;
        uom_name: string;
    };
};

type UOMRow = {
    uom_id: number;
    uom_name: string;
    isActive?: boolean;
    baseConversions?: UOMConversionRow[];
};

export default () => {
    const { user } = useAuth();
    const isAdmin = (user as any)?.role === 'ADMIN';
    const today = new Date().toISOString().split('T')[0];

    const { indentSheet: sheet, updateIndentSheet, inventorySheet, updateInventorySheet, receivedSheet, poMasterSheet } = useSheets();
    const [indentSheet, setIndentSheet] = useState<IndentSheet[]>([]);
    const [master, setMaster] = useState<any>(null);
    const [users, setUsers] = useState<{ id: number; name: string; username: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermDepartmentHead, setSearchTermDepartmentHead] = useState('');
    const [searchTermProductName, setSearchTermProductName] = useState('');
    const [productGroupFilters, setProductGroupFilters] = useState<(number | null)[]>([null]);
    const [uoms, setUoms] = useState<UOMRow[]>([]);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number; product_category_name: string; isActive?: boolean }[]>([]);

    const refreshMaster = async () => {
        const data = await fetchIndentMasterData();
        setMaster(data);
    };

    useEffect(() => {
        setIndentSheet(sheet);
    }, [sheet]);

    useEffect(() => {
        fetchIndentMasterData().then(setMaster);
        fetchUOMs().then((data) => setUoms(data.filter((u) => u.isActive !== false)));
        fetchProductCategories().then((data) => setProductCategories(data.filter((c) => c.isActive !== false)));
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
        indenterUserId: z.coerce.number().optional(),
        indentType: z.enum(['Purchase', 'Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'], { required_error: 'Select a status' }),
        validityDate: z.string().optional(),
        coolOffPeriod: z.string().optional(),
        products: z
            .array(
                z.object({
                    department: z.string().nonempty(),
                    departmentHead: z.string().nonempty(),
                    productName: z.string().nonempty(),
                    quantity: z.coerce.number().gt(0, 'Must be greater than 0'),
                    uom: z.string().nonempty(),
                    areaOfUse: z.string().nonempty(),
                    productCategory: z.string().nonempty('Product category is required'),
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
            indenterUserId: isAdmin ? undefined : (user as any)?.id,
            indentType: '' as any,
            validityDate: '',
            coolOffPeriod: '',
            products: [
                {
                    attachment: undefined,
                    uom: '',
                    productName: '',
                    productCategory: '',
                    specifications: '',
                    quantity: 1,
                    areaOfUse: '',
                    departmentHead: '',
                    department: '',
                },
            ],
        },
    });

    const products = form.watch('products');
    const indentType = form.watch('indentType');
    const { fields, append: _append, remove: _remove } = useFieldArray({
        control: form.control,
        name: 'products',
    });

    const append = (data: any) => {
        _append(data);
        setProductGroupFilters(prev => [...prev, null]);
    };
    const remove = (index: number) => {
        _remove(index);
        setProductGroupFilters(prev => prev.filter((_, i) => i !== index));
    };

    const getStock = (itemName: string, departmentHead: string) => {
        const item = inventorySheet?.find(
            (i) =>
                i.itemName?.toLowerCase().trim() === itemName?.toLowerCase().trim() &&
                (!departmentHead || i.departmentHead?.toLowerCase().trim() === departmentHead?.toLowerCase().trim())
        );
        return Number(item?.current || 0);
    };

    const normalizeLookupValue = (value?: string | null) => value?.toLowerCase().trim() || '';

    const getUOMOptionsForProduct = (itemName: string, departmentHead: string) => {
        if (!itemName) return uoms;

        const allowedUOMNames = [
            ...new Set(
                (inventorySheet || [])
                    .filter((item) =>
                        normalizeLookupValue(item.itemName) === normalizeLookupValue(itemName) &&
                        (!departmentHead || normalizeLookupValue(item.departmentHead) === normalizeLookupValue(departmentHead)) &&
                        item.uom &&
                        item.uom !== '-'
                    )
                    .map((item) => item.uom.trim())
            ),
        ];

        if (allowedUOMNames.length === 0) return uoms;

        const allowedSet = new Set(allowedUOMNames.map(normalizeLookupValue));
        const options = new Map<string, UOMRow>();

        uoms
            .filter((uom) => allowedSet.has(normalizeLookupValue(uom.uom_name)))
            .forEach((uom) => {
                options.set(normalizeLookupValue(uom.uom_name), uom);

                (uom.baseConversions || [])
                    .filter((conversion) => conversion.alternateUom?.uom_name)
                    .forEach((conversion) => {
                        const alternateName = conversion.alternateUom!.uom_name;
                        options.set(normalizeLookupValue(alternateName), {
                            uom_id: conversion.alternateUom!.uom_id,
                            uom_name: alternateName,
                        });
                    });
            });

        allowedUOMNames
            .filter((name) => !options.has(normalizeLookupValue(name)))
            .forEach((name, i) => {
                options.set(normalizeLookupValue(name), { uom_id: -i - 1, uom_name: name });
            });

        return Array.from(options.values());
    };

    useEffect(() => {
        products.forEach((product, index) => {
            const productName = product?.productName || '';
            const currentUOM = product?.uom || '';

            if (!productName) {
                if (currentUOM) form.setValue(`products.${index}.uom` as any, '');
                return;
            }

            const departmentHead = product?.departmentHead || '';
            const uomOptions = getUOMOptionsForProduct(productName, departmentHead);
            const hasCurrentUOM = uomOptions.some(
                (uom) => normalizeLookupValue(uom.uom_name) === normalizeLookupValue(currentUOM)
            );

            if (!hasCurrentUOM) {
                const defaultUOM = master?.uomLookup?.[departmentHead]?.[productName] || uomOptions[0]?.uom_name || '';
                form.setValue(`products.${index}.uom` as any, defaultUOM);
            }
        });
    }, [products, master, uoms, inventorySheet, form]);

    const getLastPurchaseInfo = (itemName: string, departmentHead: string) => {
        if (!itemName || !receivedSheet) return null;
        const latest = [...receivedSheet]
            .filter(r => 
                (r.product || '').toLowerCase().trim() === itemName.toLowerCase().trim() &&
                ((r as any).indent?.departmentHead || '').toLowerCase().trim() === (departmentHead || '').toLowerCase().trim()
            )
            .sort((a, b) => {
                const dateA = new Date((a as any).createdAt || a.timestamp || 0).getTime();
                const dateB = new Date((b as any).createdAt || b.timestamp || 0).getTime();
                return dateB - dateA;
            })[0];

        if (!latest) return null;

        const po = poMasterSheet?.find(p => 
            (((p as any).poNumber === latest.poNumber) || ((p as any).po_number === latest.poNumber)) &&
            (p.product || '').toLowerCase().trim() === itemName.toLowerCase().trim()
        );
        
        const rate = (po as any)?.rate || 'N/A';
        const rawDate = (latest as any).createdAt || latest.timestamp;
        const date = rawDate ? new Date(rawDate).toLocaleDateString() : 'N/A';

        return {
            qty: latest.receivedQuantity,
            uom: (latest as any).uom || 'Qty',
            rate,
            date,
            vendor: latest.vendor || null
        };
    };

    // Automatic Indent Type switching removed per user request to allow manual control.
    // Stock validation is still performed in onSubmit and on the Backend.

    // Sync Department, Department Head, Area of Use from product[0] to all subsequent products
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (
                name === 'products.0.department' ||
                name === 'products.0.departmentHead' ||
                name === 'products.0.areaOfUse'
            ) {
                const first = value.products?.[0];
                if (!first) return;
                const total = value.products?.length || 0;
                for (let i = 1; i < total; i++) {
                    form.setValue(`products.${i}.department` as any, first.department || '');
                    form.setValue(`products.${i}.departmentHead` as any, first.departmentHead || '');
                    form.setValue(`products.${i}.areaOfUse` as any, first.areaOfUse || '');
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    // Auto-fill UOM when productName changes
    useEffect(() => {
        const subscription = form.watch(async (value, { name }) => {
            // Trigger check if productName, indentType, or cool-off period changes.
            const isLoanTypeChange = name === 'indentType' && value.indentType === 'Loan Out';
            const isCoolOffChange = name === 'coolOffPeriod' && value.indentType === 'Loan Out';
            const isProductChange = name?.endsWith('.productName');

            if (value.indentType === 'Loan Out' && (isProductChange || isLoanTypeChange || isCoolOffChange)) {
                const checkProduct = async (pn: string) => {
                    const targetUserId = isAdmin ? value.indenterUserId : (user as any)?.id;
                    if (!pn || !targetUserId) return;
                    try {
                        const url = `${import.meta.env.VITE_API_BASE_URL}/loans/check-eligibility?userId=${targetUserId}&productName=${encodeURIComponent(pn)}`;
                        const stored = localStorage.getItem('auth');
                        const token = stored ? JSON.parse(stored).token : '';
                        
                        const response = await fetch(url, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await response.json();
                        
                        if (data && data.eligible === false) {
                            toast.warning('Loan cool-off period active', {
                                description: data.message,
                                duration: 15000,
                            });
                        }
                    } catch (err) {
                        console.error('Error checking loan eligibility:', err);
                    }
                };

                if (isProductChange) {
                    const parts = name.split('.');
                    const index = parseInt(parts[1]);
                    const pn = value.products?.[index]?.productName;
                    if (pn) await checkProduct(pn);
                } else if (isLoanTypeChange) {
                    // Check all products
                    for (const p of (value.products || [])) {
                        if (p.productName) await checkProduct(p.productName);
                    }
                }
            }

            if (name?.endsWith('.productName')) {
                const parts = name.split('.');
                const index = parseInt(parts[1]);
                if (!isNaN(index)) {
                    const dh = products[index]?.departmentHead;
                    const pn = products[index]?.productName;
                    if (dh && pn && master?.uomLookup) {
                        const uom = master.uomLookup[dh]?.[pn];
                        if (uom) {
                            form.setValue(`products.${index}.uom` as any, uom);
                        }
                    }
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form, isAdmin, master, user]);

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
        const isStoreOutType = ['Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'].includes(data.indentType);
        if (isStoreOutType) {
            const shortProducts = data.products
                .filter(p => p.productName)
                .filter(p => {
                    const stock = getStock(p.productName, p.departmentHead);
                    return stock < Number(p.quantity || 0);
                });

            if (shortProducts.length > 0) {
                const messages = shortProducts.map(p => {
                    const stock = getStock(p.productName, p.departmentHead);
                    return `${p.productName} (Available: ${stock})`;
                });
                
                if (data.indentType === 'Loan Out' || data.indentType === 'Loan Out Return') {
                    toast.error(`You cannot create a Loan for items that are out of stock: ${messages.join(', ')}.`);
                } else {
                    toast.error(`Insufficient stock for ${data.indentType}: ${messages.join(', ')}. Please change Indent Type to "Purchase" instead of "${data.indentType}".`);
                }
                return;
            }
        }
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
            const plannedStr = formatDate(new Date()); 
            const rows: any[] = [];

            const currentIndentNumber = await getNextIndentNumber();

            for (let i = 0; i < data.products.length; i++) {
                const product = data.products[i];

                const row = {
                    createdAt: createdAt,
                    indentNumber: currentIndentNumber,
                    firm: data.firm,
                    indenterName: data.indenterName,
                    userId: isAdmin ? data.indenterUserId : (user as any)?.id,
                    department: product.department,
                    areaOfUse: product.areaOfUse,
                    departmentHead: product.departmentHead,
                    productName: product.productName,
                    productCategory: product.productCategory || null,
                    quantity: product.quantity,
                    uom: product.uom,
                    specifications: product.specifications || '',
                    indentType: data.indentType,
                    validityDate: (['Store Out', 'Store Out Return', 'Loan Out', 'Loan Out Return'].includes(data.indentType)) ? (data.validityDate ? new Date(data.validityDate).toISOString() : null) : null,
                    coolOffPeriod: data.indentType === 'Loan Out' && data.coolOffPeriod ? new Date(data.coolOffPeriod).toISOString() : null,
                    planned: plannedStr, 
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

            const result = await postToSheet(rows, 'insert', 'INDENT');

            if (!result.success) throw new Error('API insertion failed');

            toast.success('Indent created successfully');
            updateIndentSheet(); 

            setProductGroupFilters([null]);
            form.reset({
                firm: '',
                indenterName: isAdmin ? '' : ((user as any)?.name || ''),
                indenterUserId: isAdmin ? undefined : (user as any)?.id,
                indentType: '' as any,
                validityDate: '',
                coolOffPeriod: '',
                products: [
                    {
                        attachment: undefined,
                        uom: '',
                        productName: '',
                        productCategory: '',
                        specifications: '',
                        quantity: 1,
                        areaOfUse: '',
                        departmentHead: '',
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
                                            {(master?.firms || [])
                                                .map((firm: string, i: number) => (
                                                <SelectItem key={i} value={firm}>
                                                    {firm}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />

                        {isAdmin ? (
                            <FormField
                                control={form.control}
                                name="indenterUserId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Indenter Name
                                            <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <Select
                                            onValueChange={(value) => {
                                                const selectedUser = users.find((u) => String(u.id) === value);
                                                field.onChange(Number(value));
                                                form.setValue('indenterName', selectedUser?.name || '', { shouldValidate: true });
                                            }}
                                            value={field.value ? String(field.value) : ''}
                                        >
                                            <FormControl>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select indenter" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {users.map((u) => (
                                                    <SelectItem key={u.id} value={String(u.id)}>
                                                        {u.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                        ) : (
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
                                            <Input {...field} disabled />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        )}

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

                        <FormField
                            control={form.control}
                            name="coolOffPeriod"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Cool Off Period</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="date"
                                            min={today}
                                            {...field}
                                            disabled={indentType !== 'Loan Out'}
                                        />
                                    </FormControl>
                                    <FormMessage />
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
                                        departmentHead: lastProduct.departmentHead || '',
                                        productName: '',
                                        productCategory: lastProduct.productCategory || '',
                                        quantity: 1,
                                        uom: '',
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

                            const departmentHead = products[index]?.departmentHead;
                            const selectedProductName = products[index]?.productName || '';
                            const selectedGroupId = productGroupFilters[index] ?? null;

                            const allProductOptions: string[] = master?.groupHeadItems?.[departmentHead] || [];

                            // Filter products by selected group
                            const productOptions = selectedGroupId != null && master?.groupToItems?.[selectedGroupId]
                                ? allProductOptions.filter(p => (master.groupToItems[selectedGroupId] as string[]).includes(p))
                                : allProductOptions;

                            // All groups from the product_group table (authoritative list)
                            const allGroups: { id: number; name: string }[] = master?.allProductGroups || [];

                            // If a product is selected, restrict to groups that product belongs to
                            const groupOptions: { id: number; name: string }[] =
                                selectedProductName && master?.itemToGroups?.[selectedProductName]?.length
                                    ? master.itemToGroups[selectedProductName] as { id: number; name: string }[]
                                    : allGroups;

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
                                                                    const dh = master?.departmentToGroupHead?.[value];
                                                                    if (dh) {
                                                                        form.setValue(`products.0.departmentHead` as any, dh);
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
                                                name={`products.${index}.departmentHead`}
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
                                                                    const dep = master?.groupHeadToDepartment?.[value];
                                                                    if (dep) {
                                                                        form.setValue(`products.0.department` as any, dep);
                                                                    }
                                                                }}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select head" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <div className="flex items-center border-b px-3 pb-3">
                                                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                                        <input
                                                                            placeholder="Search categories..."
                                                                            value={searchTermDepartmentHead}
                                                                            onChange={(e) => setSearchTermDepartmentHead(e.target.value)}
                                                                            onKeyDown={(e) => e.stopPropagation()}
                                                                            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                        />
                                                                    </div>
                                                                    <div className="max-h-[300px] overflow-y-auto">
                                                                        {master?.createGroupHeads?.filter((dh: string) => dh.toLowerCase().includes(searchTermDepartmentHead.toLowerCase())).map((dh: string, i: number) => (
                                                                            <SelectItem key={i} value={dh}>{dh}</SelectItem>
                                                                        ))}
                                                                    </div>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed">
                                                                {products[0]?.departmentHead || '—'}
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
                                            <FormItem>
                                                <FormLabel>Product Group</FormLabel>
                                                <Select
                                                    value={selectedGroupId != null ? String(selectedGroupId) : ''}
                                                    onValueChange={(val) => {
                                                        const newId = Number(val);
                                                        setProductGroupFilters(prev => {
                                                            const next = [...prev];
                                                            next[index] = newId;
                                                            return next;
                                                        });
                                                        // If selected product is no longer in this group, clear it
                                                        if (newId != null && selectedProductName) {
                                                            const itemsInGroup = master?.groupToItems?.[newId] as string[] | undefined;
                                                            if (itemsInGroup && !itemsInGroup.includes(selectedProductName)) {
                                                                form.setValue(`products.${index}.productName` as any, '');
                                                                form.setValue(`products.${index}.uom` as any, '');
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Filter by group (optional)" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {groupOptions.map(g => (
                                                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>

                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.productCategory`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product Category <span className="text-red-500">*</span></FormLabel>
                                                        <Select
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                const currentProd = form.getValues(`products.${index}.productName` as any);
                                                                if (currentProd && master?.itemToCategory?.[currentProd] !== val) {
                                                                    form.setValue(`products.${index}.productName` as any, '');
                                                                    form.setValue(`products.${index}.uom` as any, '');
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
                                                    const stock = getStock(field.value, departmentHead);
                                                    return (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Product Name
                                                                <span className="text-destructive">
                                                                    *
                                                                </span>
                                                            </FormLabel>
                                                            <div className="relative">
                                                                <Select
                                                                    onValueChange={(value) => {
                                                                        field.onChange(value);
                                                                        form.setValue(`products.${index}.uom` as any, '');
                                                                        const uom = master?.uomLookup?.[departmentHead]?.[value];
                                                                        if (uom) {
                                                                            form.setValue(`products.${index}.uom` as any, uom);
                                                                        }
                                                                        // Auto-fill category if not set or different
                                                                        const cat = master?.itemToCategory?.[value];
                                                                        if (cat) {
                                                                            form.setValue(`products.${index}.productCategory` as any, cat);
                                                                        }
                                                                        // If current group filter doesn't contain the newly selected product, reset it
                                                                        const curGroup = productGroupFilters[index];
                                                                        if (curGroup != null) {
                                                                            const itemsInGroup = master?.groupToItems?.[curGroup] as string[] | undefined;
                                                                            if (itemsInGroup && !itemsInGroup.includes(value)) {
                                                                                setProductGroupFilters(prev => {
                                                                                    const next = [...prev];
                                                                                    next[index] = null;
                                                                                    return next;
                                                                                });
                                                                            }
                                                                        }
                                                                    }}
                                                                    value={field.value}
                                                                    disabled={!departmentHead}
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
                                                                                value={searchTermProductName}
                                                                                onChange={(e) => setSearchTermProductName(e.target.value)}
                                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                                className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                                            />
                                                                        </div>

                                                                        <div className="max-h-[300px] overflow-y-auto">
                                                                            {productOptions
                                                                                ?.filter((dep: string) => {
                                                                                    const searchMatch = dep.toLowerCase().includes(searchTermProductName.toLowerCase());
                                                                                    const currentCategory = form.getValues(`products.${index}.productCategory` as any);
                                                                                    const categoryMatch = !currentCategory || master?.itemToCategory?.[dep] === currentCategory;
                                                                                    return searchMatch && categoryMatch;
                                                                                })
                                                                                .map((dep: string, i: number) => {
                                                                                    const depStock = getStock(dep, departmentHead);
                                                                                    return (
                                                                                        <SelectItem
                                                                                            key={i}
                                                                                            value={dep}
                                                                                            indicator={
                                                                                                <span className={`text-xs font-semibold tabular-nums ${depStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                                                                    {depStock}
                                                                                                </span>
                                                                                            }
                                                                                        >
                                                                                            {dep}
                                                                                        </SelectItem>
                                                                                    );
                                                                                })}
                                                                        </div>
                                                                    </SelectContent>
                                                                </Select>
                                                                {field.value && (
                                                                    <div className="absolute top-full left-0 w-full z-10 pt-0.5 pointer-events-none">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <p className="text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm rounded-sm px-1">
                                                                                Stock: <span className={cn("font-bold", stock > 0 ? "text-green-600" : "text-red-500")}>
                                                                                    {stock}
                                                                                </span>
                                                                            </p>
                                                                            {(() => {
                                                                                const lp = getLastPurchaseInfo(field.value, departmentHead);
                                                                                return lp ? (
                                                                                    <p className="text-[10px] text-yellow-600 font-medium bg-background/80 backdrop-blur-sm rounded-sm px-1">
                                                                                        Last Purchased: {lp.qty} {lp.uom} @ ₹{lp.rate} on {lp.date}{lp.vendor ? ` from ${lp.vendor}` : ''}
                                                                                    </p>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    );
                                                }}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`products.${index}.uom`}
                                                render={({ field }) => {
                                                    const productName = products[index]?.productName || '';
                                                    const uomOptions = getUOMOptionsForProduct(productName, departmentHead);

                                                    return (
                                                        <FormItem>
                                                            <FormLabel>
                                                                UOM
                                                                <span className="text-destructive">
                                                                    *
                                                                </span>
                                                            </FormLabel>
                                                            <Select
                                                                key={`${departmentHead || 'no-head'}-${productName || 'no-product'}`}
                                                                onValueChange={field.onChange}
                                                                value={field.value}
                                                                disabled={!productName}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select UOM" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {uomOptions.map((u) => (
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
                                                    );
                                                }}
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
                                                                disabled={!departmentHead}
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

