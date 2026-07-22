
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
    SelectGroup,
    SelectLabel,
} from '@/components/ui/select';
import { SearchableSelectContent } from '../element/SearchableSelectContent';
import { ClipLoader as Loader } from 'react-spinners';
import { ClipboardList, Trash, Search, FileDown } from 'lucide-react';
import { uploadFile } from '@/lib/fetchers';
import type { IndentSheet } from '@/types';
import { useSheets } from '@/context/SheetsContext';
import { fetchIndentMasterData, postToSheet, fetchFromSupabasePaginated, fetchUOMs, fetchProductCategories, fetchProductSubCategories, fetchUsers, fetchSpecifications } from '@/lib/fetchers';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import IndentPdf from '../element/IndentPdf';
import { pdf } from '@react-pdf/renderer';
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
    const [productCategories, setProductCategories] = useState<{ product_category_id: number; product_category_name: string; isActive?: boolean; specifications?: { id: number; name: string }[]; productSubCategories?: { product_sub_category_id: number; product_sub_category_name: string; isActive: boolean }[] }[]>([]);
    const [productSubCategoriesData, setProductSubCategoriesData] = useState<{ product_sub_category_id: number; product_sub_category_name: string; isActive?: boolean; specifications?: { id: number; name: string }[] }[]>([]);
    const [allSpecifications, setAllSpecifications] = useState<{ id: number; name: string }[]>([]);
    const [exportingPdf, setExportingPdf] = useState(false);

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
        fetchProductSubCategories().then((data) => setProductSubCategoriesData(data.filter((s) => s.isActive !== false)));
        fetchSpecifications().then((data: { id: number; name: string; isActive?: boolean }[]) => setAllSpecifications(data.filter((s) => s.isActive !== false)));
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
                    productSubCategory: z.string().optional(),
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
                    productSubCategory: '',
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
        const items = inventorySheet?.filter(
            (i) =>
                i.itemName?.toLowerCase().trim() === itemName?.toLowerCase().trim() &&
                (!departmentHead || i.departmentHead?.toLowerCase().trim() === departmentHead?.toLowerCase().trim())
        ) ?? [];
        // Sum across all matching rows so duplicate inventory records don't cause false zero-stock
        return items.reduce((sum, i) => sum + Number(i.current || 0), 0);
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

    // Inventory rows double as the source of truth for which category / sub category /
    // uom combinations actually belong together for a given product — used to cross-filter
    // and autofill Product Name, Product Category, Product Sub Category and UOM against each other.
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

    // Reconciles Product Name / Product Category / Product Sub Category / UOM against each
    // other whenever any one of them changes: fields with exactly one remaining valid value
    // get auto-filled, fields whose current value is no longer valid get cleared, and fields
    // with multiple remaining valid values are left for the dropdown to narrow (see render).
    const reconcileProductFacets = (index: number, changedFormField: ProductFacetField, newValue: string) => {
        const departmentHead = form.getValues(`products.${index}.departmentHead` as any) || '';

        const current: Record<ProductFacetField, string> = {
            productName: form.getValues(`products.${index}.productName` as any) || '',
            productCategory: form.getValues(`products.${index}.productCategory` as any) || '',
            productSubCategory: form.getValues(`products.${index}.productSubCategory` as any) || '',
            uom: form.getValues(`products.${index}.uom` as any) || '',
        };
        current[changedFormField] = newValue;

        // Products with no Inventory record at all can't be cross-referenced — leave the rest alone.
        if (current.productName && !((inventorySheet || []) as any[]).some((c) => normalizeLookupValue(c.itemName) === normalizeLookupValue(current.productName))) {
            return;
        }

        FACET_FIELDS.forEach(({ formField, comboKey }) => {
            if (formField === changedFormField) return;

            const facets: Record<string, string> = { departmentHead };
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
                    form.setValue(`products.${index}.${formField}` as any, '');
                    current[formField] = '';
                    if (formField === 'productCategory') {
                        form.setValue(`products.${index}.productSubCategory` as any, '');
                        current.productSubCategory = '';
                    }
                }
            } else if (!curVal && candidates.length === 1) {
                form.setValue(`products.${index}.${formField}` as any, candidates[0]);
                current[formField] = candidates[0];
            }
        });
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

    async function handleExportPdf() {
        setExportingPdf(true);
        try {
            const values = form.getValues();
            const first = values.products?.[0];
            const indentNo = await getNextIndentNumber();
            const now = new Date();
            const indentDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

            const blob = await pdf(
                <IndentPdf
                    division={master?.firmAliases?.[values.firm] || values.firm || ''}
                    departmentName={first?.department || ''}
                    indentNo={indentNo}
                    indentDate={indentDate}
                    indentType={values.indentType || ''}
                    siteToBeUsed={first?.areaOfUse || ''}
                    indenterName={values.indenterName || ''}
                    items={(values.products || []).map((p) => ({
                        particulars: p.productName || '',
                        quantity: p.quantity,
                        uom: p.uom || '',
                    }))}
                />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            console.error('Error generating indent PDF:', err);
            toast.error('Failed to generate PDF');
        } finally {
            setExportingPdf(false);
        }
    }

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
                    productSubCategory: (product.productSubCategory && product.productSubCategory !== '__none__') ? product.productSubCategory : null,
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
                        productSubCategory: '',
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

    // Every product name across every department head, so Product Name is never
    // limited by the selected department — same as Firm isn't limited by anything.
    const allProductNames: string[] = Array.from(
        new Set(Object.values(master?.groupHeadItems || {}).flat() as string[])
    );

    // Category ↔ Sub Category ↔ Specification are mutually linked: whichever of the
    // three is picked first narrows the other two. Before anything is picked, every
    // dropdown shows its full list.
    const findParentCategoryOfSubCategory = (subCategoryName: string) =>
        productCategories.find(c => (c.productSubCategories || []).some(s => s.product_sub_category_name === subCategoryName));

    const categoryContainsSpec = (category: typeof productCategories[number], specName: string) =>
        (category.specifications || []).some(s => s.name === specName);

    const subCategoryContainsSpec = (subCategory: typeof productSubCategoriesData[number], specName: string) => {
        if ((subCategory.specifications || []).some(s => s.name === specName)) return true;
        const parent = findParentCategoryOfSubCategory(subCategory.product_sub_category_name);
        return (parent?.specifications || []).some(s => s.name === specName);
    };

    return (
        <div>
            <Heading heading="Indent Form" subtext="Create new Indent">
                <ClipboardList size={50} className="text-primary" />
            </Heading>
            <div className="flex justify-end px-5 pt-4">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                >
                    {exportingPdf ? (
                        <Loader size={16} color="currentColor" aria-label="Loading Spinner" />
                    ) : (
                        <FileDown className="size-4" />
                    )}
                    Export PDF
                </Button>
            </div>
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
                                        <SearchableSelectContent searchPlaceholder="Search firms...">
                                            {(master?.firms || [])
                                                .map((firm: string, i: number) => (
                                                <SelectItem key={i} value={firm}>
                                                    {master?.firmAliases?.[firm] || firm}
                                                </SelectItem>
                                            ))}
                                        </SearchableSelectContent>
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
                                            <SearchableSelectContent searchPlaceholder="Search indenters...">
                                                {users.map((u) => (
                                                    <SelectItem key={u.id} value={String(u.id)}>
                                                        {u.name}
                                                    </SelectItem>
                                                ))}
                                            </SearchableSelectContent>
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
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setProductGroupFilters(products.map(() => null));
                                        products.forEach((_, i) => {
                                            form.setValue(`products.${i}.productCategory` as any, '');
                                            form.setValue(`products.${i}.productSubCategory` as any, '');
                                            form.setValue(`products.${i}.specifications` as any, '');
                                        });
                                    }}
                                >
                                    Clear Filter
                                </Button>
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
                                            productSubCategory: '',
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
                        </div>

                        {fields.map((field, index) => {

                            const departmentHead = products[index]?.departmentHead;
                            const selectedProductName = products[index]?.productName || '';
                            const selectedGroupId = productGroupFilters[index] ?? null;
                            const selectedCategoryName = products[index]?.productCategory || '';
                            const selectedCategory = productCategories.find(c => c.product_category_name === selectedCategoryName);
                            const selectedSubCategoryName = products[index]?.productSubCategory || '';
                            const selectedSubCategory = productSubCategoriesData.find(s => s.product_sub_category_name === selectedSubCategoryName);
                            const selectedSpecNames = (products[index]?.specifications || '')
                                .split(',')
                                .map((s: string) => s.trim())
                                .filter(Boolean);

                            // Category options: narrowed to the sub category's parent if one is picked;
                            // else narrowed to categories matching picked specifications; else every category.
                            const categoryOptions = selectedSubCategoryName && selectedSubCategoryName !== '__none__'
                                ? (() => {
                                    const parent = findParentCategoryOfSubCategory(selectedSubCategoryName);
                                    return parent ? [parent] : productCategories;
                                })()
                                : selectedSpecNames.length
                                    ? productCategories.filter(c => selectedSpecNames.some((name: string) => categoryContainsSpec(c, name)))
                                    : productCategories;

                            // Sub category options: the selected category's own list if one is picked;
                            // else narrowed to sub categories matching picked specifications; else every sub category.
                            const subCategoryOptions = (
                                selectedCategory
                                    ? (selectedCategory.productSubCategories || [])
                                    : selectedSpecNames.length
                                        ? productSubCategoriesData.filter(sc => selectedSpecNames.some((name: string) => subCategoryContainsSpec(sc, name)))
                                        : productSubCategoriesData
                            ).filter(s => s.isActive !== false);

                            // Specification options: linked to sub category first, else category, else everything.
                            const specificationOptions = (
                                selectedSubCategory?.specifications?.length
                                    ? selectedSubCategory.specifications
                                    : selectedCategory?.specifications?.length
                                        ? selectedCategory.specifications
                                        : allSpecifications
                            );

                            // Product Name is never limited by department — same as Firm isn't limited by anything.
                            const allProductOptions: string[] = allProductNames;

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

                            // Cross-filter candidates derived from real Inventory item↔category↔subCategory↔uom
                            // combinations — narrows each of these four fields by whichever of the other three
                            // are already picked, so choosing any one of them updates what's valid in the rest.
                            const comboCategoryCandidates = (selectedProductName || products[index]?.uom || (selectedSubCategoryName && selectedSubCategoryName !== '__none__'))
                                ? new Set(uniqueComboValues(filterProductCombos({
                                    itemName: selectedProductName || undefined,
                                    uom: products[index]?.uom || undefined,
                                    productSubCategoryName: selectedSubCategoryName || undefined,
                                    departmentHead,
                                }), 'itemCategoryName').map(normalizeLookupValue))
                                : null;

                            const comboSubCategoryCandidates = (selectedProductName || products[index]?.uom)
                                ? new Set(uniqueComboValues(filterProductCombos({
                                    itemName: selectedProductName || undefined,
                                    uom: products[index]?.uom || undefined,
                                    itemCategoryName: selectedCategoryName || undefined,
                                    departmentHead,
                                }), 'productSubCategoryName').map(normalizeLookupValue))
                                : null;

                            const comboProductNameCandidates = (selectedCategoryName || (selectedSubCategoryName && selectedSubCategoryName !== '__none__') || products[index]?.uom)
                                ? new Set(uniqueComboValues(filterProductCombos({
                                    itemCategoryName: selectedCategoryName || undefined,
                                    productSubCategoryName: selectedSubCategoryName || undefined,
                                    uom: products[index]?.uom || undefined,
                                    departmentHead,
                                }), 'itemName').map(normalizeLookupValue))
                                : null;

                            const categoryOptionsFinal = (comboCategoryCandidates && comboCategoryCandidates.size > 0)
                                ? categoryOptions.filter(c => comboCategoryCandidates.has(normalizeLookupValue(c.product_category_name)))
                                : categoryOptions;

                            const subCategoryOptionsFinal = (comboSubCategoryCandidates && comboSubCategoryCandidates.size > 0)
                                ? subCategoryOptions.filter(s => comboSubCategoryCandidates.has(normalizeLookupValue(s.product_sub_category_name)))
                                : subCategoryOptions;

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
                                                    <SearchableSelectContent searchPlaceholder="Search groups...">
                                                        {groupOptions.map(g => (
                                                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                                        ))}
                                                    </SearchableSelectContent>
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
                                                                form.setValue(`products.${index}.specifications` as any, '');
                                                                // Structural check: sub category must belong to this category's own hierarchy.
                                                                const currentSub = form.getValues(`products.${index}.productSubCategory` as any);
                                                                if (currentSub && currentSub !== '__none__') {
                                                                    const parent = findParentCategoryOfSubCategory(currentSub);
                                                                    if (parent && parent.product_category_name !== val) {
                                                                        form.setValue(`products.${index}.productSubCategory` as any, '');
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
                                                                    <SelectItem
                                                                        key={c.product_category_id}
                                                                        value={c.product_category_name}
                                                                    >
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
                                                name={`products.${index}.productSubCategory`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product Sub Category</FormLabel>
                                                        <Select
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                form.setValue(`products.${index}.specifications` as any, '');
                                                                if (val && val !== '__none__') {
                                                                    const parent = findParentCategoryOfSubCategory(val);
                                                                    if (parent && parent.product_category_name !== form.getValues(`products.${index}.productCategory` as any)) {
                                                                        form.setValue(`products.${index}.productCategory` as any, parent.product_category_name);
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
                                                                {subCategoryOptionsFinal.map(s => (
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
                                                name={`products.${index}.specifications`}
                                                render={({ field }) => {
                                                    const selected = (field.value || '')
                                                        .split(',')
                                                        .map((s: string) => s.trim())
                                                        .filter(Boolean);
                                                    // All specifications available to add (linked-to-category first,
                                                    // then any other master spec) — deduped by name, minus already-selected.
                                                    const optionMap = new Map<string, { id: number; name: string }>();
                                                    [...specificationOptions, ...allSpecifications].forEach(s => {
                                                        if (s?.name && !optionMap.has(s.name)) optionMap.set(s.name, s);
                                                    });
                                                    const available = Array.from(optionMap.values())
                                                        .filter(s => !selected.includes(s.name));
                                                    const addSpec = (name: string) => {
                                                        if (name && !selected.includes(name)) {
                                                            field.onChange([...selected, name].join(', '));
                                                        }
                                                    };
                                                    const removeSpec = (name: string) => {
                                                        field.onChange(selected.filter((s: string) => s !== name).join(', '));
                                                    };
                                                    return (
                                                        <FormItem>
                                                            <FormLabel>Specifications</FormLabel>
                                                            <Select value="" onValueChange={addSpec}>
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Add specification" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SearchableSelectContent searchPlaceholder="Search specifications..." className="max-h-72">
                                                                    {available.length > 0 ? (
                                                                        available.map(s => (
                                                                            <SelectItem key={s.id} value={s.name}>
                                                                                {s.name}
                                                                            </SelectItem>
                                                                        ))
                                                                    ) : (
                                                                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                                                            {selected.length > 0 ? 'No more specifications' : 'No specifications available'}
                                                                        </p>
                                                                    )}
                                                                </SearchableSelectContent>
                                                            </Select>
                                                            {selected.length > 0 && (
                                                                <div className="flex flex-wrap gap-2 pt-2">
                                                                    {selected.map((name: string) => (
                                                                        <span
                                                                            key={name}
                                                                            className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-3 py-1 text-xs font-medium"
                                                                        >
                                                                            {name}
                                                                            <button
                                                                                type="button"
                                                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                                                                onClick={() => removeSpec(name)}
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </FormItem>
                                                    );
                                                }}
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
                                                                        reconcileProductFacets(index, 'productName', value);
                                                                        // Auto-fill specifications linked to this product (inventory item)
                                                                        const linkedSpecs = master?.itemToSpecifications?.[value] as { id: number; name: string }[] | undefined;
                                                                        if (linkedSpecs && linkedSpecs.length) {
                                                                            form.setValue(
                                                                                `products.${index}.specifications` as any,
                                                                                linkedSpecs.map(s => s.name).join(', ')
                                                                            );
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
                                                    const uomOptions = getUOMOptionsForProduct(productName, departmentHead, {
                                                        category: selectedCategoryName || undefined,
                                                        subCategory: selectedSubCategoryName || undefined,
                                                    });

                                                    return (
                                                        <FormItem>
                                                            <FormLabel>
                                                                UOM
                                                                <span className="text-destructive">
                                                                    *
                                                                </span>
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
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select UOM" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SearchableSelectContent searchPlaceholder="Search UOM...">
                                                                    {uomOptions.map((u) => (
                                                                        <SelectItem
                                                                            key={u.uom_id}
                                                                            value={u.uom_name}
                                                                        >
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

