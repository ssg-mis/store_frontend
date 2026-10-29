import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { SearchableSelectContent } from '../element/SearchableSelectContent';
import { ClipLoader as Loader } from 'react-spinners';
import { Trash, UserCheck, Search } from 'lucide-react';
import {
    fetchHrEmployees,
    fetchIndentMasterData,
    fetchUOMs,
    fetchProductCategories,
    fetchProductSubCategories,
    uploadFile,
    createAccessoryIssue,
    type HrEmployeeRow,
} from '@/lib/fetchers';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';

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

// Same product fields/auto-fill behaviour as Create Indent's Products section, reused here
// for Accessory Issue — only the top-level identity fields differ (Customer + Remarks
// instead of Indenter Name / Indent Type / Cool Off Period).
const schema = z.object({
    employeeCode: z.string().nonempty('Select a customer'),
    remarks: z.string().optional(),
    items: z
        .array(
            z.object({
                department: z.string().nonempty(),
                departmentHead: z.string().nonempty(),
                productName: z.string().nonempty(),
                quantity: z.coerce.number().gt(0, 'Must be greater than 0'),
                uom: z.string().nonempty(),
                productCategory: z.string().nonempty('Product category is required'),
                productSubCategory: z.string().optional(),
                attachment: z.instanceof(File).optional(),
                specifications: z.string().optional(),
            })
        )
        .min(1, 'At least one product is required'),
});

export default () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { inventorySheet, updateInventorySheet, receivedSheet, poMasterSheet } = useSheets();

    const [employees, setEmployees] = useState<HrEmployeeRow[]>([]);
    const [master, setMaster] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [searchTermDepartmentHead, setSearchTermDepartmentHead] = useState('');
    const [searchTermProductName, setSearchTermProductName] = useState('');
    const [productGroupFilters, setProductGroupFilters] = useState<(number | null)[]>([null]);
    const [uoms, setUoms] = useState<UOMRow[]>([]);
    const [productCategories, setProductCategories] = useState<{ product_category_id: number; product_category_name: string; isActive?: boolean; productSubCategories?: { product_sub_category_id: number; product_sub_category_name: string; isActive: boolean }[] }[]>([]);
    const [productSubCategoriesData, setProductSubCategoriesData] = useState<{ product_sub_category_id: number; product_sub_category_name: string; isActive?: boolean }[]>([]);

    useEffect(() => {
        fetchHrEmployees().then(setEmployees);
        fetchIndentMasterData().then(setMaster);
        fetchUOMs().then((data) => setUoms(data.filter((u: UOMRow) => u.isActive !== false)));
        fetchProductCategories().then((data) => setProductCategories(data.filter((c: any) => c.isActive !== false)));
        fetchProductSubCategories().then((data) => setProductSubCategoriesData(data.filter((s: any) => s.isActive !== false)));
        updateInventorySheet(true); // silent refresh so stock check uses latest data
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            employeeCode: '',
            remarks: '',
            items: [
                {
                    attachment: undefined,
                    uom: '',
                    productName: '',
                    productCategory: '',
                    productSubCategory: '',
                    specifications: '',
                    quantity: 1,
                    departmentHead: '',
                    department: '',
                },
            ],
        },
    });

    const items = form.watch('items');
    const { fields, append: _append, remove: _remove } = useFieldArray({ control: form.control, name: 'items' });

    const append = (data: any) => {
        _append(data);
        setProductGroupFilters((prev) => [...prev, null]);
    };
    const remove = (index: number) => {
        _remove(index);
        setProductGroupFilters((prev) => prev.filter((_, i) => i !== index));
    };

    const getStock = (itemName: string, departmentHead: string) => {
        const rows = inventorySheet?.filter(
            (i) =>
                i.itemName?.toLowerCase().trim() === itemName?.toLowerCase().trim() &&
                (!departmentHead || i.departmentHead?.toLowerCase().trim() === departmentHead?.toLowerCase().trim())
        ) ?? [];
        return rows.reduce((sum, i) => sum + Number(i.current || 0), 0);
    };

    const normalizeLookupValue = (value?: string | null) => value?.toLowerCase().trim() || '';

    const getUOMOptionsForProduct = (
        itemName: string,
        departmentHead: string,
        facets?: { category?: string; subCategory?: string }
    ) => {
        const hasSubCategoryFacet = facets?.subCategory && facets.subCategory !== '__none__';
        if (!itemName && !facets?.category && !hasSubCategoryFacet) return uoms;

        const allowedUOMNames = [
            ...new Set(
                (inventorySheet || [])
                    .filter((item: any) =>
                        (!itemName || normalizeLookupValue(item.itemName) === normalizeLookupValue(itemName)) &&
                        (!departmentHead || normalizeLookupValue(item.departmentHead) === normalizeLookupValue(departmentHead)) &&
                        (!facets?.category || normalizeLookupValue(item.itemCategoryName) === normalizeLookupValue(facets.category)) &&
                        (!hasSubCategoryFacet || normalizeLookupValue(item.productSubCategoryName) === normalizeLookupValue(facets!.subCategory!)) &&
                        item.uom &&
                        item.uom !== '-'
                    )
                    .map((item: any) => item.uom.trim())
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

    const filterProductCombos = (facets: {
        itemName?: string;
        itemCategoryName?: string;
        productSubCategoryName?: string;
        uom?: string;
        departmentHead?: string;
    }) => {
        const hasSubCategoryFacet = facets.productSubCategoryName && facets.productSubCategoryName !== '__none__';
        return ((inventorySheet || []) as any[]).filter((c) =>
            (!facets.itemName || normalizeLookupValue(c.itemName) === normalizeLookupValue(facets.itemName)) &&
            (!facets.itemCategoryName || normalizeLookupValue(c.itemCategoryName) === normalizeLookupValue(facets.itemCategoryName)) &&
            (!hasSubCategoryFacet || normalizeLookupValue(c.productSubCategoryName) === normalizeLookupValue(facets.productSubCategoryName!)) &&
            (!facets.uom || normalizeLookupValue(c.uom) === normalizeLookupValue(facets.uom)) &&
            (!facets.departmentHead || !c.departmentHead || normalizeLookupValue(c.departmentHead) === normalizeLookupValue(facets.departmentHead))
        );
    };

    const uniqueComboValues = (rows: any[], key: 'itemName' | 'itemCategoryName' | 'productSubCategoryName' | 'uom') =>
        Array.from(new Set(rows.map((r) => r[key]).filter((v) => v && v !== '-'))) as string[];

    type ProductFacetField = 'productName' | 'productCategory' | 'productSubCategory' | 'uom';
    const FACET_FIELDS: { formField: ProductFacetField; comboKey: 'itemName' | 'itemCategoryName' | 'productSubCategoryName' | 'uom' }[] = [
        { formField: 'productName', comboKey: 'itemName' },
        { formField: 'productCategory', comboKey: 'itemCategoryName' },
        { formField: 'productSubCategory', comboKey: 'productSubCategoryName' },
        { formField: 'uom', comboKey: 'uom' },
    ];

    const reconcileProductFacets = (index: number, changedFormField: ProductFacetField, newValue: string) => {
        const current: Record<ProductFacetField, string> = {
            productName: form.getValues(`items.${index}.productName` as any) || '',
            productCategory: form.getValues(`items.${index}.productCategory` as any) || '',
            productSubCategory: form.getValues(`items.${index}.productSubCategory` as any) || '',
            uom: form.getValues(`items.${index}.uom` as any) || '',
        };
        current[changedFormField] = newValue;

        if (current.productName && !((inventorySheet || []) as any[]).some((c) => normalizeLookupValue(c.itemName) === normalizeLookupValue(current.productName))) {
            return;
        }

        FACET_FIELDS.forEach(({ formField, comboKey }) => {
            if (formField === changedFormField) return;

            const facets: Record<string, string> = {};
            FACET_FIELDS.forEach((f) => {
                if (f.formField === formField) return;
                const val = current[f.formField];
                if (val) facets[f.comboKey] = val;
            });

            const candidates = uniqueComboValues(filterProductCombos(facets), comboKey);
            const curVal = current[formField];

            if (curVal && curVal !== '__none__') {
                const stillValid = candidates.length === 0 || candidates.some((v) => normalizeLookupValue(v) === normalizeLookupValue(curVal));
                if (!stillValid) {
                    form.setValue(`items.${index}.${formField}` as any, '');
                    current[formField] = '';
                    if (formField === 'productCategory') {
                        form.setValue(`items.${index}.productSubCategory` as any, '');
                        current.productSubCategory = '';
                    }
                }
            } else if (!curVal && candidates.length === 1) {
                form.setValue(`items.${index}.${formField}` as any, candidates[0]);
                current[formField] = candidates[0];
            }
        });
    };

    useEffect(() => {
        items.forEach((item, index) => {
            const productName = item?.productName || '';
            const currentUOM = item?.uom || '';

            if (!productName) {
                if (currentUOM) form.setValue(`items.${index}.uom` as any, '');
                return;
            }

            const departmentHead = item?.departmentHead || '';
            const uomOptions = getUOMOptionsForProduct(productName, departmentHead);
            const hasCurrentUOM = uomOptions.some(
                (uom) => normalizeLookupValue(uom.uom_name) === normalizeLookupValue(currentUOM)
            );

            if (!hasCurrentUOM) {
                const defaultUOM = master?.uomLookup?.[departmentHead]?.[productName] || uomOptions[0]?.uom_name || '';
                form.setValue(`items.${index}.uom` as any, defaultUOM);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, master, uoms, inventorySheet, form]);

    const getLastPurchaseInfo = (itemName: string, departmentHead: string) => {
        if (!itemName || !receivedSheet) return null;
        const latest = [...receivedSheet]
            .filter((r) =>
                (r.product || '').toLowerCase().trim() === itemName.toLowerCase().trim() &&
                ((r as any).indent?.departmentHead || '').toLowerCase().trim() === (departmentHead || '').toLowerCase().trim()
            )
            .sort((a, b) => {
                const dateA = new Date((a as any).createdAt || a.timestamp || 0).getTime();
                const dateB = new Date((b as any).createdAt || b.timestamp || 0).getTime();
                return dateB - dateA;
            })[0];

        if (!latest) return null;

        const po = poMasterSheet?.find(
            (p) =>
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
            vendor: latest.vendor || null,
        };
    };

    // Sync Department, Department Head from item[0] to all subsequent items
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (
                name === 'items.0.department' ||
                name === 'items.0.departmentHead'
            ) {
                const first = value.items?.[0];
                if (!first) return;
                const total = value.items?.length || 0;
                for (let i = 1; i < total; i++) {
                    form.setValue(`items.${i}.department` as any, first.department || '');
                    form.setValue(`items.${i}.departmentHead` as any, first.departmentHead || '');
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
                    const dh = items[index]?.departmentHead;
                    const pn = items[index]?.productName;
                    if (dh && pn && master?.uomLookup) {
                        const uom = master.uomLookup[dh]?.[pn];
                        if (uom) {
                            form.setValue(`items.${index}.uom` as any, uom);
                        }
                    }
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form, master]);

    // Every product name across every department head, so Product Name is never
    // limited by the selected department — same as Firm isn't limited by anything.
    const allProductNames: string[] = Array.from(
        new Set(Object.values(master?.groupHeadItems || {}).flat() as string[])
    );

    const findParentCategoryOfSubCategory = (subCategoryName: string) =>
        productCategories.find((c) => (c.productSubCategories || []).some((s) => s.product_sub_category_name === subCategoryName));

    const onSubmit = async (data: z.infer<typeof schema>) => {
        const employee = employees.find((e) => e.code === data.employeeCode);
        if (!employee) {
            toast.error('Select a valid customer');
            return;
        }

        const shortItems = data.items.filter((i) => getStock(i.productName, i.departmentHead) < Number(i.quantity || 0));
        if (shortItems.length > 0) {
            const messages = shortItems.map((i) => `${i.productName} (Available: ${getStock(i.productName, i.departmentHead)})`);
            toast.info('Item Not in Stock', {
                description: `Items out of stock cannot be issued: ${messages.join(', ')}.`,
            });
            return;
        }

        setSubmitting(true);
        try {
            const itemsPayload = await Promise.all(
                data.items.map(async (i) => ({
                    productName: i.productName,
                    department: i.department,
                    departmentHead: i.departmentHead,
                    uom: i.uom,
                    quantity: i.quantity,
                    productCategory: i.productCategory || null,
                    productSubCategory: (i.productSubCategory && i.productSubCategory !== '__none__') ? i.productSubCategory : null,
                    specifications: i.specifications || '',
                    attachment: i.attachment !== undefined ? await uploadFile(i.attachment, 'indent_file', 'upload') : undefined,
                }))
            );

            await createAccessoryIssue({
                employeeCode: employee.code,
                employeeName: employee.name,
                issuedBy: (user as any)?.name,
                remarks: data.remarks,
                items: itemsPayload,
            });
            toast.success('Accessory issued successfully');
            navigate('/accessory-tracking');
        } catch (error: any) {
            toast.error(error.message || 'Failed to issue accessory');
        } finally {
            setSubmitting(false);
        }
    };

    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div>
            <Heading heading="Issue Accessory" subtext="Hand out an item to an employee — tracked separately from Indent/PO">
                <UserCheck size={50} className="text-primary" />
            </Heading>

            <Form {...form}>
                <form noValidate onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6 p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <FormField
                            control={form.control}
                            name="employeeCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Customer
                                        <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select employee" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SearchableSelectContent searchPlaceholder="Search employees...">
                                            {employees.map((e) => (
                                                <SelectItem key={e.id} value={e.code}>
                                                    {e.code} — {e.name}{e.department ? ` (${e.department})` : ''}
                                                </SelectItem>
                                            ))}
                                        </SearchableSelectContent>
                                    </Select>
                                    {employees.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            No employees synced from HR yet — use "Sync Now" on the Employee Loan Tracker page.
                                        </p>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="remarks"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Remarks</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder="Optional note" className="h-10 min-h-10 resize-none" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Products</h2>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setProductGroupFilters(items.map(() => null));
                                        form.setValue(`items.0.department` as any, '');
                                        form.setValue(`items.0.departmentHead` as any, '');
                                        items.forEach((_, i) => {
                                            form.setValue(`items.${i}.productName` as any, '');
                                            form.setValue(`items.${i}.productCategory` as any, '');
                                            form.setValue(`items.${i}.productSubCategory` as any, '');
                                            form.setValue(`items.${i}.uom` as any, '');
                                            form.setValue(`items.${i}.specifications` as any, '');
                                        });
                                    }}
                                >
                                    Clear Filter
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        const lastItem = items[items.length - 1] || {};
                                        append({
                                            department: lastItem.department || '',
                                            departmentHead: lastItem.departmentHead || '',
                                            productName: '',
                                            productCategory: lastItem.productCategory || '',
                                            productSubCategory: '',
                                            quantity: 1,
                                            uom: '',
                                            attachment: undefined,
                                            specifications: '',
                                        });
                                    }}
                                >
                                    Add Product
                                </Button>
                            </div>
                        </div>

                        {fields.map((field, index) => {
                            const departmentHead = items[index]?.departmentHead;
                            const selectedProductName = items[index]?.productName || '';
                            const selectedGroupId = productGroupFilters[index] ?? null;
                            const selectedCategoryName = items[index]?.productCategory || '';
                            const selectedCategory = productCategories.find((c) => c.product_category_name === selectedCategoryName);
                            const selectedSubCategoryName = items[index]?.productSubCategory || '';

                            const subCategoryOptions = (
                                selectedCategory ? (selectedCategory.productSubCategories || []) : productSubCategoriesData
                            ).filter((s) => s.isActive !== false);

                            const allProductOptions: string[] = allProductNames;

                            const productOptions = selectedGroupId != null && master?.groupToItems?.[selectedGroupId]
                                ? allProductOptions.filter((p) => (master.groupToItems[selectedGroupId] as string[]).includes(p))
                                : allProductOptions;

                            const allGroups: { id: number; name: string }[] = master?.allProductGroups || [];

                            const groupOptions: { id: number; name: string }[] =
                                selectedProductName && master?.itemToGroups?.[selectedProductName]?.length
                                    ? master.itemToGroups[selectedProductName] as { id: number; name: string }[]
                                    : allGroups;

                            const comboProductNameCandidates = (selectedCategoryName || (selectedSubCategoryName && selectedSubCategoryName !== '__none__'))
                                ? new Set(uniqueComboValues(filterProductCombos({
                                    itemCategoryName: selectedCategoryName || undefined,
                                    productSubCategoryName: selectedSubCategoryName || undefined,
                                }), 'itemName').map(normalizeLookupValue))
                                : null;

                            const categoryOptionsFinal = productCategories;
                            const subCategoryOptionsFinal = subCategoryOptions;

                            return (
                                <div key={field.id} className="flex flex-col gap-4 border p-4 rounded-lg">
                                    <div className="flex justify-between">
                                        <h3 className="text-md font-semibold">Product {index + 1}</h3>
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
                                                name={`items.${index}.department`}
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
                                                                        form.setValue(`items.0.departmentHead` as any, dh);
                                                                    }
                                                                }}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select department" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SearchableSelectContent searchPlaceholder="Search departments...">
                                                                    {master?.departments?.map((dep: string, i: number) => (
                                                                        <SelectItem key={i} value={dep}>{dep}</SelectItem>
                                                                    ))}
                                                                </SearchableSelectContent>
                                                            </Select>
                                                        ) : (
                                                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed">
                                                                {items[0]?.department || '—'}
                                                            </div>
                                                        )}
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.departmentHead`}
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
                                                                        form.setValue(`items.0.department` as any, dep);
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
                                                                {items[0]?.departmentHead || '—'}
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
                                                        setProductGroupFilters((prev) => {
                                                            const next = [...prev];
                                                            next[index] = newId;
                                                            return next;
                                                        });
                                                        if (newId != null && selectedProductName) {
                                                            const itemsInGroup = master?.groupToItems?.[newId] as string[] | undefined;
                                                            if (itemsInGroup && !itemsInGroup.includes(selectedProductName)) {
                                                                form.setValue(`items.${index}.productName` as any, '');
                                                                form.setValue(`items.${index}.uom` as any, '');
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Filter by group (optional)" />
                                                    </SelectTrigger>
                                                    <SearchableSelectContent searchPlaceholder="Search groups...">
                                                        {groupOptions.map((g) => (
                                                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                                        ))}
                                                    </SearchableSelectContent>
                                                </Select>
                                            </FormItem>

                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.productCategory`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product Category <span className="text-red-500">*</span></FormLabel>
                                                        <Select
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                const currentSub = form.getValues(`items.${index}.productSubCategory` as any);
                                                                if (currentSub && currentSub !== '__none__') {
                                                                    const parent = findParentCategoryOfSubCategory(currentSub);
                                                                    if (parent && parent.product_category_name !== val) {
                                                                        form.setValue(`items.${index}.productSubCategory` as any, '');
                                                                    }
                                                                }
                                                                const currentProduct = form.getValues(`items.${index}.productName` as any);
                                                                if (currentProduct) {
                                                                    const productCategoryNames = uniqueComboValues(filterProductCombos({ itemName: currentProduct }), 'itemCategoryName').map(normalizeLookupValue);
                                                                    if (productCategoryNames.length > 0 && !productCategoryNames.includes(normalizeLookupValue(val))) {
                                                                        form.setValue(`items.${index}.productName` as any, '');
                                                                        form.setValue(`items.${index}.uom` as any, '');
                                                                        form.setValue(`items.${index}.specifications` as any, '');
                                                                    }
                                                                }
                                                                reconcileProductFacets(index, 'productCategory', val);
                                                            }}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select category" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SearchableSelectContent searchPlaceholder="Search categories...">
                                                                {categoryOptionsFinal.map((c) => (
                                                                    <SelectItem key={c.product_category_id} value={c.product_category_name}>
                                                                        {c.product_category_name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SearchableSelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.productSubCategory`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product Sub Category</FormLabel>
                                                        <Select
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                if (val && val !== '__none__') {
                                                                    const parent = findParentCategoryOfSubCategory(val);
                                                                    if (parent && parent.product_category_name !== form.getValues(`items.${index}.productCategory` as any)) {
                                                                        form.setValue(`items.${index}.productCategory` as any, parent.product_category_name);
                                                                    }
                                                                    const currentProduct = form.getValues(`items.${index}.productName` as any);
                                                                    if (currentProduct) {
                                                                        const productSubCategoryNames = uniqueComboValues(filterProductCombos({ itemName: currentProduct }), 'productSubCategoryName').map(normalizeLookupValue);
                                                                        if (productSubCategoryNames.length > 0 && !productSubCategoryNames.includes(normalizeLookupValue(val))) {
                                                                            form.setValue(`items.${index}.productName` as any, '');
                                                                            form.setValue(`items.${index}.uom` as any, '');
                                                                            form.setValue(`items.${index}.specifications` as any, '');
                                                                        }
                                                                    }
                                                                }
                                                                reconcileProductFacets(index, 'productSubCategory', val);
                                                            }}
                                                            value={field.value || ''}
                                                            disabled={subCategoryOptionsFinal.length === 0}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder={subCategoryOptionsFinal.length === 0 ? 'No sub categories' : 'Select sub category'} />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SearchableSelectContent searchPlaceholder="Search sub categories...">
                                                                <SelectItem value="__none__">— None —</SelectItem>
                                                                {subCategoryOptionsFinal.map((s) => (
                                                                    <SelectItem key={s.product_sub_category_id} value={s.product_sub_category_name}>
                                                                        {s.product_sub_category_name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SearchableSelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.specifications`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Specifications</FormLabel>
                                                        <FormControl>
                                                            <Textarea placeholder="Specification (auto-filled from product, editable)" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.productName`}
                                                render={({ field }) => {
                                                    const stock = getStock(field.value, departmentHead);
                                                    return (
                                                        <FormItem className="min-w-0">
                                                            <FormLabel>
                                                                Product Name
                                                                <span className="text-destructive">*</span>
                                                            </FormLabel>
                                                            <div className="relative min-w-0">
                                                                <Select
                                                                    onValueChange={(value) => {
                                                                        field.onChange(value);
                                                                        reconcileProductFacets(index, 'productName', value);
                                                                        const linkedSpec = master?.itemToSpecifications?.[value] as string | undefined;
                                                                        form.setValue(`items.${index}.specifications` as any, linkedSpec || '');

                                                                        if (index === 0) {
                                                                            const headsForItem = Object.entries(master?.groupHeadItems || {})
                                                                                .filter(([, itms]) => (itms as string[]).includes(value))
                                                                                .map(([dh]) => dh);
                                                                            if (headsForItem.length === 1) {
                                                                                const dh = headsForItem[0];
                                                                                form.setValue(`items.0.departmentHead` as any, dh);
                                                                                const dep = master?.groupHeadToDepartment?.[dh];
                                                                                if (dep) form.setValue(`items.0.department` as any, dep);
                                                                            }
                                                                        }

                                                                        const linkedGroups = master?.itemToGroups?.[value] as { id: number; name: string }[] | undefined;
                                                                        if (linkedGroups && linkedGroups.length === 1) {
                                                                            setProductGroupFilters((prev) => {
                                                                                const next = [...prev];
                                                                                next[index] = linkedGroups[0].id;
                                                                                return next;
                                                                            });
                                                                        } else {
                                                                            const curGroup = productGroupFilters[index];
                                                                            if (curGroup != null) {
                                                                                const itemsInGroup = master?.groupToItems?.[curGroup] as string[] | undefined;
                                                                                if (itemsInGroup && !itemsInGroup.includes(value)) {
                                                                                    setProductGroupFilters((prev) => {
                                                                                        const next = [...prev];
                                                                                        next[index] = null;
                                                                                        return next;
                                                                                    });
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full min-w-0" title={field.value || ''}>
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
                                                                                    const facetMatch = !comboProductNameCandidates || comboProductNameCandidates.has(normalizeLookupValue(dep));
                                                                                    return searchMatch && facetMatch;
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
                                                                                Stock: <span className={cn('font-bold', stock > 0 ? 'text-green-600' : 'text-red-500')}>
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
                                                name={`items.${index}.uom`}
                                                render={({ field }) => {
                                                    const productName = items[index]?.productName || '';
                                                    const uomOptions = getUOMOptionsForProduct(productName, departmentHead, {
                                                        category: selectedCategoryName || undefined,
                                                        subCategory: selectedSubCategoryName || undefined,
                                                    });

                                                    return (
                                                        <FormItem className="min-w-0">
                                                            <FormLabel>
                                                                UOM
                                                                <span className="text-destructive">*</span>
                                                            </FormLabel>
                                                            <Select
                                                                key={`${departmentHead || 'no-head'}-${productName || 'no-product'}-${selectedCategoryName || 'no-cat'}-${selectedSubCategoryName || 'no-subcat'}`}
                                                                onValueChange={(val) => {
                                                                    field.onChange(val);
                                                                    reconcileProductFacets(index, 'uom', val);
                                                                }}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full min-w-0">
                                                                        <SelectValue placeholder="Select UOM" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SearchableSelectContent searchPlaceholder="Search UOM...">
                                                                    {uomOptions.map((u) => (
                                                                        <SelectItem key={u.uom_id} value={u.uom_name}>
                                                                            {u.uom_name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SearchableSelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    );
                                                }}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Quantity
                                                            <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input type="number" step="any" min="0.001" {...field} disabled={!departmentHead} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.attachment`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Attachment</FormLabel>
                                                    <FormControl>
                                                        <Input type="file" onChange={(e) => field.onChange(e.target.files?.[0])} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => navigate('/accessory-tracking')}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader size={16} color="#fff" /> : 'Issue Accessory'}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
};
