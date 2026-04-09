import { ChevronsRightLeft, FilePlus2, Pencil, Save, Trash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { z } from 'zod';
import { Button } from '../ui/button';
import { SidebarTrigger } from '../ui/sidebar';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import type { PoMasterSheet } from '@/types';
import { postToSheet, uploadFile, fetchSheet, fetchVendors, fetchFromSupabasePaginated } from '@/lib/fetchers';
import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
    calculateGrandTotal,
    calculateSubtotal,
    calculateTotal,
    calculateTotalGst,
    cn,
    formatDate,
} from '@/lib/utils';
import { toast } from 'sonner';
import { ClipLoader as Loader } from 'react-spinners';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '../ui/textarea';
import { pdf } from '@react-pdf/renderer';
import POPdf, { type POPdfProps } from '../element/POPdf';

function generatePoNumber(poNumbers: string[], today = new Date(), firmName?: string): string {
    // Step 1: Get financial year from today's date
    const fyStart = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const fy = `${(fyStart % 100).toString().padStart(2, '0')}-${((fyStart + 1) % 100).toString().padStart(2, '0')}`;

    // Add firm name if provided, else keep as is
    const firmPart = firmName && firmName !== 'N/A' && firmName !== '' ? `${firmName.toUpperCase().trim()}/` : '';
    const prefix = `SSPL/${firmPart}STORES/${fy}/`;

    // Step 2: Extract numbers for curre nt financial year
    const numbersInFY = poNumbers
        .filter((po) => po != null && typeof po === 'string' && po.includes(`/${fy}/`))
        .map((po) => {
            const parts = po.split('/');
            const lastPart = parts[parts.length - 1];
            const match = lastPart.match(/^(\d+)(?:-\d+)?$/);
            return match ? parseInt(match[1], 10) : null;
        })
        .filter((n): n is number => n !== null);

    // Step 3: Determine next number
    const next = numbersInFY.length > 0 ? Math.max(...numbersInFY) + 1 : 1;

    return `${prefix}${next}`;
}

function incrementPoRevision(poNumber: string, allPOs: PoMasterSheet[]): string {
    const parts = poNumber.split('/');
    const lastSegment = parts[parts.length - 1];

    const [mainSeq, _] = lastSegment.split('-');
    const baseKey = [...parts.slice(0, -1), mainSeq].join('/');

    let maxRevision = 0;

    for (const po of allPOs) {
        const currentPoNumber = po.po_number || '';
        const poParts = currentPoNumber.split('/');
        const poLastSegment = poParts[poParts.length - 1];
        const [poSeq, poRev] = poLastSegment.split('-');

        const poBaseKey = [...poParts.slice(0, -1), poSeq].join('/');
        if (poBaseKey === baseKey) {
            const revision = poRev ? parseInt(poRev, 10) : 0;
            if (revision > maxRevision) {
                maxRevision = revision;
            }
        }
    }

    return `${baseKey}-${maxRevision + 1}`;
}

function filterUniquePoNumbers(data: any[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];

    for (const po of data) {
        const poNumber = po.poNumber || po.po_number;
        if (!seen.has(poNumber)) {
            seen.add(poNumber);
            result.push(po);
        }
    }

    return result;
}

export default () => {
    const { updateIndentSheet, updatePoMasterSheet, updateRelatedSheets } = useSheets();
    const [indentSheetData, setIndentSheetData] = useState<any[]>([]);
    const [approvalsData, setApprovalsData] = useState<any[]>([]);
    const [poMasterSheetData, setPoMasterSheetData] = useState<any[]>([]);
    const [detailsData, setDetailsData] = useState<any>(null);
    const [vendorsData, setVendorsData] = useState<any[]>([]);
    const [readOnly, setReadOnly] = useState(-1);
    const [mode, setMode] = useState<'create' | 'revise'>('create');
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [loading, setLoading] = useState(true);

    // Initialize destination address from details
    useEffect(() => {
        if (detailsData?.destinationAddress) {
            setDestinationAddress(detailsData.destinationAddress);
        }
    }, [detailsData]);

    const enrichAndSetData = (allIndents: any[], approvals: any[], poData: any[], masterData: any, vendors: any[]) => {
        const enrichedIndents = (allIndents || []).map((indent: any) => {
            const approval = (approvals || []).find((a: any) =>
                (a.indentNumber || a.indent_number) === (indent.indentNumber || indent.indent_number)
            );

            return {
                ...indent,
                indent_number: indent.indentNumber || indent.indent_number,
                indentNumber: indent.indentNumber || indent.indent_number,
                product_name: indent.productName || indent.product_name,
                productName: indent.productName || indent.product_name,
                uom: indent.uom,
                specifications: indent.specifications,
                approvedVendorName: approval?.approvedVendorName || indent.approvedVendorName || '',
                approved_vendor_name: approval?.approvedVendorName || indent.approvedVendorName || '',
                approvedRate: approval?.approvedRate ?? indent.approvedRate ?? 0,
                approved_rate: approval?.approvedRate ?? indent.approved_rate ?? 0,
                approvedQuantity: indent.approvedQuantity || indent.approved_quantity || indent.quantity || 0,
                approved_quantity: indent.approvedQuantity || indent.approved_quantity || indent.quantity || 0,
            };
        });

        setIndentSheetData(enrichedIndents);
        if (approvals) setApprovalsData(approvals);
        if (poData) setPoMasterSheetData(poData);
        if (masterData) setDetailsData(masterData);
        if (vendors) setVendorsData(vendors);
    };

    // Fetch data from Supabase
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch pending indents (Stage 4: Pending POs)
                const allIndents = await fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'planned_4', options: { ascending: false } },
                    (q) => q.not('planned_4', 'is', null).is('actual_4', null)
                );

                const poData = await fetchFromSupabasePaginated(
                    'po_master',
                    '*',
                    { column: 'timestamp', options: { ascending: false } }
                );

                const masterData = await fetchSheet('MASTER') as any;

                const vendorsRaw = await fetchVendors();
                const vendorsMapped = vendorsRaw.map(v => ({
                    vendor_name: v.vendorName,
                    vendor_address: v.address,
                    vendor_gstin: v.gstin,
                    vendor_email: v.email
                }));

                const approvals = await fetchFromSupabasePaginated('three_party_approval', '*');

                enrichAndSetData(allIndents || [], approvals || [], poData || [], masterData, vendorsMapped);
            } catch (error: any) {
                console.error('Error fetching data from Supabase:', error);
                toast.error('Failed to fetch data: ' + error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const schema = z.object({
        poNumber: z.string().nonempty(),
        poDate: z.coerce.date(),
        supplierName: z.string().nonempty(),
        supplierAddress: z.string().nonempty(),
        gstin: z.string().nonempty(),
        quotationNumber: z.string().optional().default(''),
        quotationDate: z.coerce.date().optional(),
        ourEnqNo: z.string().optional(),
        enquiryDate: z.coerce.date().optional(),
        description: z.string().optional().default(''), // Made optional
        indents: z
            .array(
                z.object({
                    indentNumber: z.string().nonempty(),
                    gst: z.coerce.number(),
                    discount: z.coerce.number().default(0).optional(),
                })
            ),
        terms: z.array(z.string().nonempty()).max(10),
        preparedBy: z.string().nonempty(),
        approvedBy: z.string().nonempty(),
        transportationType: z.string().nonempty('Select transportation type'),
    });


    type FormData = z.infer<typeof schema>;
    const form = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            poNumber: generatePoNumber(poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null)),
            poDate: new Date(),
            supplierName: '',
            supplierAddress: '',
            preparedBy: '',
            approvedBy: '',
            gstin: '',
            quotationNumber: '',
            quotationDate: new Date(),
            ourEnqNo: '',
            enquiryDate: undefined,
            indents: [],
            terms: detailsData?.defaultTerms || [], // Updated to camelCase
            transportationType: 'F-FOR',
        },
    });

    useEffect(() => {
        if (detailsData) {
            form.setValue('terms', detailsData.defaultTerms); // Updated to camelCase
        }
    }, [detailsData]);

    const indents = form.watch('indents');
    const vendor = form.watch('supplierName');
    const poDate = form.watch('poDate');
    const poNumber = form.watch('poNumber');

    const termsArray = useFieldArray({
        control: form.control,
        // @ts-ignore
        name: 'terms',
    });

    const itemsArray = useFieldArray({
        control: form.control,
        // @ts-ignore
        name: 'indents',
    });

    useEffect(() => {
        if (mode === 'create') {
            // Get firm from selected indents
            const selectedFirm = indents.length > 0 
                ? indentSheetData.find(i => i.indentNumber === indents[0].indentNumber)?.firm 
                : undefined;

            form.setValue(
                'poNumber',
                generatePoNumber(
                    poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null),
                    poDate || new Date(),
                    selectedFirm
                )
            );
        }
    }, [poDate, poMasterSheetData, mode, indents, indentSheetData, form]);

    useEffect(() => {
        if (mode === 'revise') {
            form.reset({
                poNumber: '',
                poDate: undefined,
                supplierName: '',
                supplierAddress: '',
                preparedBy: '',
                approvedBy: '',
                gstin: '',
                quotationNumber: '',
                quotationDate: undefined,
                ourEnqNo: '',
                enquiryDate: undefined,
                indents: [],
                terms: [],
                transportationType: 'F-FOR',
            });
        } else {
            form.reset({
                poNumber: generatePoNumber(poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null)),
                poDate: new Date(),
                supplierName: '',
                supplierAddress: '',
                preparedBy: '',
                approvedBy: '',
                gstin: '',
                quotationNumber: '',
                quotationDate: new Date(),
                ourEnqNo: '',
                enquiryDate: undefined,
                indents: [],
                terms: detailsData?.defaultTerms || [], // Updated to camelCase
                transportationType: 'F-FOR',
            });
        }
    }, [mode, poMasterSheetData, detailsData]);

    useEffect(() => {
        if (vendor && mode === 'create') {
            const items = indentSheetData.filter(
                (i: any) => (i.approvedVendorName || i.approved_vendor_name) === vendor
            );

            // Find vendor from master_data table
            const selectedVendor = vendorsData.find((v: any) => (v.vendorName || v.vendor_name)?.trim().toLowerCase() === vendor?.trim().toLowerCase());

            form.setValue(
                'supplierAddress',
                selectedVendor?.vendor_address || selectedVendor?.address || ''
            );
            form.setValue(
                'gstin',
                selectedVendor?.vendor_gstin || selectedVendor?.gstin || ''
            );

            // Auto-fill indents for this supplier
            form.setValue(
                'indents',
                items.map((i: any) => ({
                    indentNumber: i.indentNumber || i.indent_number,
                    gst: 18,
                    discount: 0,
                }))
            );
        }
    }, [vendor, indentSheetData, vendorsData]);

    useEffect(() => {
        const po = poMasterSheetData.find((p: any) => (p.poNumber || p.po_number) === poNumber)!;
        if (mode === 'revise' && po) {
            const partyName = po.partyName || po.party_name || '';
            const vendor = vendorsData.find((v: any) =>
                (v.vendor_name || v.vendorName)?.trim().toLowerCase() === partyName.trim().toLowerCase()
            );

            form.setValue('poDate', po.timestamp ? new Date(po.timestamp) : new Date());
            form.setValue('supplierName', partyName);
            form.setValue('supplierAddress', vendor?.vendor_address || vendor?.address || '');
            form.setValue('preparedBy', po.preparedBy || po.prepared_by || '');
            form.setValue('approvedBy', po.approvedBy || po.approved_by || '');
            form.setValue('gstin', vendor?.vendor_gstin || vendor?.gstin || '');
            form.setValue('quotationNumber', po.quotationNumber || po.quotation_number || '');
            form.setValue('quotationDate', (po.quotationDate || po.quotation_date) ? new Date(po.quotationDate || po.quotation_date) : new Date());
            form.setValue('description', po.description || '');
            form.setValue('ourEnqNo', po.enquiryNumber || po.enquiry_number || '');
            form.setValue('enquiryDate', (po.enquiryDate || po.enquiry_date) ? new Date(po.enquiryDate || po.enquiry_date) : new Date());

            form.setValue(
                'indents',
                poMasterSheetData
                    .filter((p: any) => (p.poNumber || p.po_number) === (po.poNumber || po.po_number))
                    .map((poItem: any) => ({
                        indentNumber: poItem.internalCode || poItem.internal_code || poItem.indent_number || '',
                        gst: poItem.gstPercent || poItem.gst_percent || 0,
                        discount: poItem.discountPercent || poItem.discount_percent || 0,
                    }))
            );

            const terms = [];
            for (let i = 1; i <= 10; i++) {
                const term = (po as any)[`term${i}`] || (po as any)[`term_${i}`];
                if (term && term !== '') {
                    terms.push(term);
                }
            }
            form.setValue('terms', terms);
        }
    }, [poNumber, poMasterSheetData, vendorsData, mode]);

    const handleDestinationEdit = () => {
        setIsEditingDestination(true);
    };

    const handleDestinationSave = () => {
        setIsEditingDestination(false);
        toast.success('Destination address updated');
    };

    const handleDestinationCancel = () => {
        setDestinationAddress(detailsData?.destinationAddress || ''); // Updated to camelCase
        setIsEditingDestination(false);
    };

    const getCurrentFormattedDateTime = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    async function onSubmit(values: FormData) {
        try {
            const poNumber =
                mode === 'create'
                    ? values.poNumber
                    : incrementPoRevision(values.poNumber, poMasterSheetData as PoMasterSheet[]);

            // Fetch all indents and approvals associated with this PO to ensure we have correct data and IDs
            const indentNumbers = values.indents.map(i => i.indentNumber);
            const [allIndentsForPO, approvals] = await Promise.all([
                fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'id', options: { ascending: true } },
                    (q) => q.in('indentNumber', indentNumbers)
                ),
                fetchFromSupabasePaginated(
                    'three_party_approval',
                    '*',
                    { column: 'id', options: { ascending: true } },
                    (q) => q.in('indentNumber', indentNumbers)
                )
            ]);

            // Enrich the fetched indents with approval data (same logic as enrichAndSetData)
            const enrichedFetchedIndents = allIndentsForPO.map((indent: any) => {
                const approval = (approvals || []).find((a: any) =>
                    (a.indentNumber || a.indent_number) === (indent.indentNumber || indent.indent_number)
                );
                return {
                    ...indent,
                    approvedQuantity: indent.approvedQuantity || indent.approved_quantity || indent.quantity || 0,
                    approvedRate: approval?.approvedRate ?? indent.approvedRate ?? 0,
                };
            });

            const grandTotal = calculateGrandTotal(
                values.indents.map((indent) => {
                    const value = enrichedFetchedIndents.find((i: any) => i.indentNumber === indent.indentNumber) ||
                        poMasterSheetData.find((p: any) => (p.internalCode || p.poNumber) === indent.indentNumber && (p.poNumber || p.po_number) === values.poNumber);
                    return {
                        quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                        rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                        discountPercent: indent?.discount || 0,
                        gstPercent: indent.gst,
                    };
                })
            );

            // Convert logo image to base64 for PDF
            const logoResponse = await fetch('/logo.png');
            const logoBlob = await logoResponse.blob();
            const logoBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(logoBlob);
            });

            const pdfProps: POPdfProps = {
                companyLogo: logoBase64,
                companyName: detailsData?.companyName || '', // Updated to camelCase
                companyPhone: detailsData?.companyPhone || '', // Updated to camelCase
                companyGstin: detailsData?.companyGstin || '', // Updated to camelCase
                companyPan: detailsData?.companyPan || '', // Updated to camelCase
                companyAddress: detailsData?.companyAddress || '', // Updated to camelCase
                billingAddress: detailsData?.billingAddress || '', // Updated to camelCase
                destinationAddress: destinationAddress, // Use the editable destination address
                supplierName: values.supplierName,
                supplierAddress: values.supplierAddress,
                supplierGstin: values.gstin,
                orderNumber: poNumber,
                orderDate: formatDate(values.poDate),
                quotationNumber: values.quotationNumber,
                quotationDate: values.quotationDate ? formatDate(values.quotationDate) : '',
                enqNo: values.ourEnqNo || '',
                enqDate: values.enquiryDate ? formatDate(values.enquiryDate) : '',
                description: values.description,
                items: values.indents.map((item) => {
                    const indent = enrichedFetchedIndents.find((i: any) => i.indentNumber === item.indentNumber) ||
                        poMasterSheetData.find((p: any) => (p.internalCode || p.po_number || '') === (item.indentNumber || '') && (p.poNumber || p.po_number || '') === (values.poNumber || ''));
                    return {
                        internalCode: indent?.indentNumber || indent?.indent_number || indent?.internalCode || indent?.internal_code || '',
                        firm: indent?.firm || 'N/A',
                        product: indent?.productName || indent?.product_name || indent?.product || '',
                        description: indent?.specifications || indent?.description || '',
                        quantity: indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity || 0,
                        unit: indent?.uom || indent?.unit || '',
                        rate: indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                        gst: item.gst || 0,
                        discount: item.discount || 0,
                        amount: calculateTotal(
                            indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                            item.gst || 0,
                            item.discount || 0,
                            indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity || 0
                        ),
                    };
                }),
                total: calculateSubtotal(
                    values.indents.map((indent) => {
                        const value = enrichedFetchedIndents.find((i: any) => i.indentNumber === indent.indentNumber) ||
                            poMasterSheetData.find((p: any) => (p.internalCode || p.poNumber) === indent.indentNumber && (p.poNumber || p.po_number) === values.poNumber);
                        return {
                            quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                            rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                            discountPercent: indent?.discount || 0,
                        };
                    })
                ),
                gstAmount: calculateTotalGst(
                    values.indents.map((indent) => {
                        const value = enrichedFetchedIndents.find((i: any) => i.indentNumber === indent.indentNumber) ||
                            poMasterSheetData.find((p: any) => (p.internalCode || p.po_number) === indent.indentNumber && (p.poNumber || p.po_number) === poNumber);
                        return {
                            quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                            rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                            discountPercent: indent?.discount || 0,
                            gstPercent: indent.gst,
                        };
                    })
                ),
                grandTotal: grandTotal,
                terms: values.terms,
                preparedBy: values.preparedBy,
                approvedBy: values.approvedBy,
                transportationType: values.transportationType,
                firm: values.indents.length > 0 
                    ? indentSheetData.find(i => i.indentNumber === values.indents[0].indentNumber)?.firm || 'N/A'
                    : 'N/A',
            };

            const blob = await pdf(<POPdf {...pdfProps} />).toBlob();
            const file = new File([blob], `PO-${poNumber}.pdf`, {
                type: 'application/pdf',
            });

            // Auto-download the PDF
            const blobUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = `PO-${poNumber.replace(/\//g, '-')}.pdf`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

            const email = vendorsData.find((v: any) => v.vendor_name?.trim().toLowerCase() === values.supplierName?.trim().toLowerCase())?.vendor_email; // Fixed logic to use correct column names and robust matching

            let url = '';

            if (email) {
                // Email hai to PDF upload + email send
                url = await uploadFile(
                    file,
                    import.meta.env.VITE_PURCHASE_ORDERS_FOLDER,
                    'email',
                    email
                );
                toast.success('PO created and email sent successfully');
            } else {
                // Email nahi hai to sirf PDF upload (without email)
                url = await uploadFile(
                    file,
                    import.meta.env.VITE_PURCHASE_ORDERS_FOLDER,
                    'upload', // ← Use 'upload' instead of 'email'
                    '' // Empty email parameter
                );
                toast.warning("PO created but email not sent (vendor email not found)");
            }

            // Insert PO data into Supabase
            const poData: Partial<PoMasterSheet>[] = values.indents.map((v) => {
                const indent = enrichedFetchedIndents.find((i: any) => i.indentNumber === v.indentNumber) ||
                    poMasterSheetData.find((p: any) => (p.internalCode || p.indent_number) === v.indentNumber && (p.poNumber || p.po_number) === values.poNumber);

                // Validate and process dates
                const validateDate = (date: Date | null | undefined) => {
                    if (!date) return null;
                    const dateObj = new Date(date);
                    if (isNaN(dateObj.getTime())) {
                        console.error('Invalid date detected:', date);
                        return null;
                    }
                    return dateObj.toISOString();
                };

                return {
                    createdAt: new Date(),
                    partyName: values.supplierName,
                    poNumber: poNumber,
                    internalCode: v.indentNumber,
                    product: indent?.productName || indent?.product_name || indent?.product || '',
                    description: values.description,
                    quantity: indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity || 0,
                    unit: indent?.uom || indent?.unit || '',
                    rate: indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                    amount: calculateTotal(
                        indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                        v.gst,
                        v.discount || 0,
                        indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity || 0
                    ),
                    totalPOAmount: grandTotal,
                    pdf: url,
                    preparedBy: values.preparedBy,
                    approvedBy: values.approvedBy,
                    transportationType: values.transportationType,
                    quotationNumber: values.quotationNumber,
                    quotationDate: values.quotationDate ? new Date(values.quotationDate) : null,
                    enquiryNumber: values.ourEnqNo,
                    enquiryDate: values.enquiryDate ? new Date(values.enquiryDate) : null,
                    term1: values.terms[0] || null,
                    term2: values.terms[1] || null,
                    term3: values.terms[2] || null,
                    term4: values.terms[3] || null,
                    term5: values.terms[4] || null,
                    term6: values.terms[5] || null,
                    term7: values.terms[6] || null,
                    term8: values.terms[7] || null,
                    term9: values.terms[8] || null,
                    term10: values.terms[9] || null,
                    discountPercent: v.discount || 0,
                    gstPercent: v.gst,
                    indent_number: v.indentNumber
                };
            });

            console.log('PO Data to be inserted:', poData); // Debug log

            // Insert each PO record into the database using API
            const poResult = await postToSheet(poData, 'insert', 'PO_MASTER');
            if (!poResult.success) throw new Error('Failed to save PO records');

            // Update corresponding indent records to sync with Receive Items and Get Purchase stages
            const indentUpdates: any[] = values.indents.map((v) => {
                const indent = enrichedFetchedIndents.find((i: any) => i.indentNumber === v.indentNumber);
                return {
                    id: indent.id,
                    indentNumber: v.indentNumber,
                    actual_4: getCurrentFormattedDateTime(), // PO Completion Date
                    planned_5: getCurrentFormattedDateTime(), // Enable Receive Items stage
                    po_number: poNumber,
                    po_copy: url,
                    planned_7: getCurrentFormattedDateTime(), // Enable Billing (Get Purchase) stage
                };
            });

            const indentResult = await postToSheet(indentUpdates, 'update', 'INDENT');
            if (!indentResult.success) throw new Error('Failed to update indents');

            toast.success(`Successfully ${mode}d purchase order`);
            updateIndentSheet();
            updatePoMasterSheet();
            updateRelatedSheets();
            form.reset();

            // Refresh data after submission
            const [updatedIndents, updatedApprovals] = await Promise.all([
                fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'planned_4', options: { ascending: false } },
                    (q) => q.not('planned_4', 'is', null).is('actual_4', null)
                ),
                fetchFromSupabasePaginated('three_party_approval', '*')
            ]);

            enrichAndSetData(updatedIndents || [], updatedApprovals || [], null as any, null, null as any);
        } catch (e: any) {
            console.log(e);
            toast.error(`Failed to ${mode} purchase order: ${e.message}`);
        }
    }

    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div className="grid place-items-center w-full bg-gradient-to-br from-blue-100 via-purple-50 to-blue-50 rounder-md">
            <div className="flex justify-between items-center w-full p-5">
                <div className="flex gap-2 items-center">
                    <FilePlus2 size={50} className="text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold text-primary">Create or Revise PO</h1>
                        <p className="text-muted-foreground text-sm">
                            Create purchase order for indends or revise previous orders
                        </p>
                    </div>
                </div>
                <SidebarTrigger />
            </div>
            <div className="sm:p-4 w-full">
                <div className="w-full">
                    <Tabs
                        defaultValue="create"
                        onValueChange={(v) => setMode(v === 'create' ? v : 'revise')}
                    >
                        <TabsList className="h-10 w-full rounded-none">
                            <TabsTrigger value="create">Create</TabsTrigger>
                            <TabsTrigger value="revise">Revise</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit, onError)}
                        className="flex flex-col items-center"
                    >
                        <div className="space-y-4 p-4 w-full bg-white shadow-md rounded-sm">
                            <div className="flex items-center justify-center gap-4 bg-blue-50 p-4 rounded">
                                <img
                                    src="/logo.png"
                                    alt="Company Logo"
                                    className="w-20 h-20 object-contain"
                                />
                                <div className="text-center">
                                    <h1 className="text-2xl font-bold">Shri Shyam Oil Extractions Pvt Ltd</h1>
                                    <div>
                                        <p className="text-sm">Banari, Janjgir Champa-495668, Chhattisgarh</p>
                                        <p className="text-sm">Phone No: +919993023243</p>
                                    </div>
                                </div>
                            </div>
                            <hr />
                            <h2 className="text-center font-bold text-lg">Purchase Order</h2>
                            <hr />

                            <div className="grid gap-5 px-4 py-2 text-foreground/80">
                                <div className="grid grid-cols-2 gap-x-5">
                                    <FormField
                                        control={form.control}
                                        name="poNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                {mode === 'create' ? (
                                                    <>
                                                        <FormLabel>PO Number</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                className="h-9"
                                                                readOnly
                                                                placeholder="Enter PO number"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </>
                                                ) : (
                                                    <FormControl>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormLabel>PO Number <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <SelectTrigger
                                                                    size="sm"
                                                                    className="w-full"
                                                                >
                                                                    <SelectValue placeholder="Select PO" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {filterUniquePoNumbers(
                                                                    poMasterSheetData
                                                                ).map((i: any, k) => {
                                                                    const poNumDisplay = i.poNumber || i.po_number;
                                                                    return (
                                                                        <SelectItem
                                                                            key={k}
                                                                            value={poNumDisplay}
                                                                        >
                                                                            {poNumDisplay}
                                                                        </SelectItem>
                                                                    )
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                )}
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="poDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>PO Date</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        className="h-9"
                                                        type="date"
                                                        value={
                                                            field.value
                                                                ? field.value
                                                                    .toISOString()
                                                                    .split('T')[0]
                                                                : ''
                                                        }
                                                        onChange={(e) =>
                                                            field.onChange(
                                                                e.target.value
                                                                    ? new Date(e.target.value)
                                                                    : undefined
                                                            )
                                                        }
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-x-5">
                                    <FormField
                                        control={form.control}
                                        name="supplierName"
                                        render={({ field }) => (
                                            <FormItem>
                                                {mode === 'create' ? (
                                                    <FormControl>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <FormLabel>Supplier Name <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <SelectTrigger
                                                                    size="sm"
                                                                    className="w-full"
                                                                >
                                                                    <SelectValue placeholder="Select supplier" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {[
                                                                    ...new Map(
                                                                        indentSheetData
                                                                            .filter(
                                                                                (i: any) =>
                                                                                    (i.approvedVendorName || i.approved_vendor_name) &&
                                                                                    (i.approvedVendorName || i.approved_vendor_name) !== ''
                                                                            )
                                                                            .map((i: any) => [i.approvedVendorName || i.approved_vendor_name, i])
                                                                    ).values()
                                                                ].map((i: any, k) => (
                                                                    <SelectItem key={k} value={i.approvedVendorName || i.approved_vendor_name}>
                                                                        {i.approvedVendorName || i.approved_vendor_name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                ) : (
                                                    <>
                                                        <FormLabel>Supplier Name<span className="text-red-500">*</span></FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                className="h-9"
                                                                readOnly
                                                                placeholder="Enter supplier name"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </>
                                                )}
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="supplierAddress"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Supplier Address<span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        className="h-9"
                                                        readOnly={mode === 'revise'}
                                                        placeholder="Enter supplier address"
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="gstin"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>GSTIN<span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        className="h-9"
                                                        readOnly={mode === 'revise'}
                                                        placeholder="Enter GSTIN"
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <hr />

                            <div className="grid md:grid-cols-3 gap-3">
                                <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                                    <CardHeader className="bg-muted px-5 py-2">
                                        <CardTitle className="text-center">
                                            Our Commercial Details
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 text-sm">
                                        <p>
                                            <span className="font-medium">GSTIN</span>{'21AACCJ1154B1ZG '}
                                            {detailsData?.company_gstin}
                                        </p>
                                        <p>
                                            <span className="font-medium">Pan No.</span>{'AACCJ1154B'}
                                            {detailsData?.company_pan}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                                    <CardHeader className="bg-muted px-5 py-2">
                                        <CardTitle className="text-center">
                                            Billing Address
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 text-sm">
                                        <p>M/S  shri shyam oil extractions pvt.ltd

                                            Banari, Janjgir Champa-495668, Chhattisgarh{detailsData?.company_name}</p>
                                        <p>{detailsData?.billing_address}</p>
                                    </CardContent>
                                </Card>
                                <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                                    <CardHeader className="bg-muted px-5 py-2">
                                        <CardTitle className="text-center flex items-center justify-between">
                                            Destination Address
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={isEditingDestination ? handleDestinationSave : handleDestinationEdit}
                                                className="h-6 w-6 p-0 hover:bg-gray-200"
                                            >
                                                {isEditingDestination ? (
                                                    <Save size={14} className="text-green-600" />
                                                ) : (
                                                    <Pencil size={14} className="text-gray-600" />
                                                )}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 text-sm">
                                        <p>Shri Shyam Oil Extractions Pvt. Ltd.</p>
                                        {isEditingDestination ? (
                                            <div className="flex items-center gap-2 mt-1">
                                                <Input
                                                    value={destinationAddress}
                                                    onChange={(e) => setDestinationAddress(e.target.value)}
                                                    className="h-7 text-sm"
                                                    placeholder="Enter destination address"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleDestinationSave();
                                                        } else if (e.key === 'Escape') {
                                                            handleDestinationCancel();
                                                        }
                                                    }}
                                                    autoFocus
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleDestinationCancel}
                                                    className="h-6 w-6 p-0 hover:bg-red-100"
                                                >
                                                    <Trash size={12} className="text-red-500" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <p>{destinationAddress}</p>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <hr />

                            <div>
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Enter message"
                                                    className="resize-y" // or "resize-y" to allow vertical resizing
                                                    {...field}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <hr />

                            <div className="mx-4 grid overflow-hidden">
                                <Table containerClassName="overflow-visible">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>S/N</TableHead>
                                            <TableHead>Internal Code</TableHead>
                                            <TableHead>Firm</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit</TableHead>
                                            <TableHead>Rate</TableHead>
                                            <TableHead>GST (%)</TableHead>
                                            <TableHead>Discount (%)</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {itemsArray.fields.map((field, index) => {
                                            const value = indents[index];
                                            const indent = indentSheetData.find(
                                                (i: any) => (i.indentNumber || i.indent_number) === value.indentNumber
                                            ) || poMasterSheetData.find(
                                                (p: any) => (p.internalCode || p.internal_code || p.indent_number) === value.indentNumber && (p.poNumber || p.po_number) === poNumber
                                            );
                                            return (
                                                <TableRow key={field.id}>
                                                    <TableCell>{index + 1}</TableCell>
                                                    <TableCell>{indent?.indentNumber || indent?.indent_number || indent?.internalCode || indent?.internal_code}</TableCell>
                                                    <TableCell>{indent?.firm || 'N/A'}</TableCell>
                                                    <TableCell>{indent?.productName || indent?.product_name || indent?.product}</TableCell>
                                                    <TableCell>
                                                        {indent?.specifications || indent?.description || (
                                                            <span className="text-muted-foreground">
                                                                No Description
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity}
                                                    </TableCell>
                                                    <TableCell>{indent?.uom || indent?.unit}</TableCell>
                                                    <TableCell>
                                                        {indent?.approvedRate || indent?.approved_rate || indent?.rate}
                                                    </TableCell>
                                                    <TableCell>
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.gst`}
                                                            render={({ field: indentField }) => (
                                                                <FormItem className="flex justify-center items-center gap-1">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            className="rounded-sm h-9 w-20 p-0 text-center"
                                                                            {...indentField}
                                                                        />
                                                                    </FormControl>
                                                                    %
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.discount`} // Assuming productName is in your schema
                                                            render={({
                                                                field: indentField,
                                                            }) => (
                                                                <FormItem className="flex justify-center items-center">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            className="rounded-sm h-9 max-w-15 p-0 text-center"
                                                                            max="100"
                                                                            {...indentField}
                                                                        />
                                                                    </FormControl>{' '}
                                                                    %
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {calculateTotal(
                                                            indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                                                            value.gst,
                                                            value.discount || 0,
                                                            indent?.approvedQuantity || indent?.approved_quantity || indent?.quantity || 0
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                itemsArray.remove(index);
                                                            }}
                                                        >
                                                            <Trash
                                                                size={20}
                                                                className="text-red-300"
                                                            />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                                <div className="flex justify-end p-4">
                                    <div className="w-80 rounded-[3px] bg-muted">
                                        <p className="flex px-7 py-2 justify-between">
                                            <span>Total:</span>
                                            <span className="text-end">
                                                {calculateSubtotal(
                                                    indents.map((indentRow) => {
                                                        const value = indentSheetData.find(
                                                            (i: any) => (i.indentNumber || i.indent_number) === indentRow.indentNumber
                                                        ) || poMasterSheetData.find(
                                                            (p: any) => (p.internalCode || p.internal_code || p.indent_number) === indentRow.indentNumber && (p.poNumber || p.po_number) === poNumber
                                                        );
                                                        return {
                                                            quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                                                            rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                                                            discountPercent: indentRow?.discount || 0,
                                                        };
                                                    })
                                                )}
                                            </span>
                                        </p>
                                        <hr />
                                        <p className="flex px-7 py-2 justify-between">
                                            <span>GST Amount:</span>
                                            <span className="text-end">
                                                {calculateTotalGst(
                                                    indents.map((indentRow) => {
                                                        const value = indentSheetData.find(
                                                            (i: any) => (i.indentNumber || i.indent_number) === indentRow.indentNumber
                                                        ) || poMasterSheetData.find(
                                                            (p: any) => (p.internalCode || p.internal_code || p.indent_number) === indentRow.indentNumber && (p.poNumber || p.po_number) === poNumber
                                                        );
                                                        return {
                                                            quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                                                            rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                                                            discountPercent: indentRow?.discount || 0,
                                                            gstPercent: indentRow.gst,
                                                        };
                                                    })
                                                )}
                                            </span>
                                        </p>
                                        <hr />
                                        <p className="flex px-7 py-2 justify-between font-bold">
                                            <span>Grand Total:</span>
                                            <span className="text-end">
                                                {calculateGrandTotal(
                                                    indents.map((indentRow) => {
                                                        const value = indentSheetData.find(
                                                            (i: any) => (i.indentNumber || i.indent_number) === indentRow.indentNumber
                                                        ) || poMasterSheetData.find(
                                                            (p: any) => (p.internalCode || p.internal_code || p.indent_number) === indentRow.indentNumber && (p.poNumber || p.po_number) === poNumber
                                                        );
                                                        return {
                                                            quantity: value?.approvedQuantity || value?.approved_quantity || value?.quantity || 0,
                                                            rate: value?.approvedRate || value?.approved_rate || value?.rate || 0,
                                                            discountPercent: indentRow?.discount || 0,
                                                            gstPercent: indentRow.gst,
                                                        };
                                                    })
                                                )}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <hr />

                            <div>
                                <p className="text-sm px-3 font-semibold">Terms & Conditions</p>
                                <div>
                                    {termsArray.fields.map((field, index) => {
                                        const write = readOnly === index;
                                        return (
                                            <div className="flex items-center" key={field.id}>
                                                <span className="px-3">{index + 1}.</span>
                                                <FormField
                                                    control={form.control}
                                                    name={`terms.${index}`}
                                                    render={({ field: termField }) => (
                                                        <FormItem className="w-full">
                                                            <FormControl>
                                                                <Input
                                                                    className={cn(
                                                                        'border-transparent rounded-xs h-6 shadow-none',
                                                                        !write
                                                                            ? ''
                                                                            : 'border-b border-b-foreground'
                                                                    )}
                                                                    readOnly={!write}
                                                                    {...termField}
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        if (write) {
                                                            setReadOnly(-1);
                                                        } else if (readOnly === -1) {
                                                            setReadOnly(index);
                                                        } else {
                                                            toast.error(
                                                                `Please save term ${readOnly + 1} before editing`
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {!write ? (
                                                        <Pencil size={20} />
                                                    ) : (
                                                        <Save size={20} />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        if (readOnly === index) setReadOnly(-1);
                                                        termsArray.remove(index);
                                                    }}
                                                >
                                                    <Trash className="text-red-300" size={20} />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="w-full flex justify-end p-3">
                                    <Button
                                        className="w-50"
                                        variant="outline"
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (termsArray.fields.length < 11) {
                                                if (readOnly === -1) {
                                                    // @ts-ignore
                                                    termsArray.append('');
                                                    setReadOnly(termsArray.fields.length);
                                                } else {
                                                    toast.error(
                                                        `Please save term ${readOnly + 1} before creating`
                                                    );
                                                }
                                            } else {
                                                toast.error('Only 10 terms are allowed');
                                            }
                                        }}
                                    >
                                        Add Term
                                    </Button>
                                </div>
                            </div>

                            <hr />

                            <div className="text-center flex justify-between gap-5 px-7 items-center">
                                <FormField
                                    control={form.control}
                                    name="transportationType"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col justify-center items-center w-full">
                                            <FormLabel>Transportation Type<span className="text-red-500">*</span></FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-9 w-full text-center">
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="F-FOR">F-FOR</SelectItem>
                                                    <SelectItem value="Ex-factory">Ex-factory</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="preparedBy"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col justify-center items-center w-full">
                                            <FormLabel>Prepared By<span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Input
                                                    className="h-9 w-full text-center"
                                                    placeholder="Purchase Order Prepared By"
                                                    {...field}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="approvedBy"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col justify-center items-center w-full">
                                            <FormLabel>Approved By<span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Input
                                                    className="h-9 w-full text-center"
                                                    placeholder="Purchase Order Approved By"
                                                    {...field}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <div className="text-center w-full">
                                    <p className="font-semibold text-[11px] leading-tight">For Shri Shyam Oil Extractions Pvt. Ltd.</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 w-full max-w-6xl bg-background m-5 shadow-md rounded-md">
                            <Button type="reset" variant="outline" onClick={() => form.reset()}>
                                Reset
                            </Button>

                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && (
                                    <Loader size={20} color="white" aria-label="Loading Spinner" />
                                )}
                                Save And Send PO
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
};