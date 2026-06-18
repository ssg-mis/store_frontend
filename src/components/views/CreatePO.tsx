import { ChevronsRightLeft, FilePlus2, Pencil, Save, Send, Trash, X } from 'lucide-react';
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
import { postToSheet, uploadFile, fetchSheet, fetchVendors, fetchFromSupabasePaginated, fetchUsers, fetchFirms } from '@/lib/fetchers';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSheets } from '@/context/SheetsContext';
import { useAuth } from '@/context/AuthContext';
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

function generatePoNumber(poNumbers: string[], today = new Date(), firmAlias?: string): string {
    // Step 1: Get financial year from today's date
    const fyStart = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const fy = `${(fyStart % 100).toString().padStart(2, '0')}-${((fyStart + 1) % 100).toString().padStart(2, '0')}`;

    const firmPart = firmAlias && firmAlias !== '' ? `${firmAlias.toUpperCase().trim()}/` : '';
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
        const currentPoNumber = (po as any).poNumber || po.po_number || '';
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

const formatFirmAddress = (firm: any, fallback = '') => {
    if (!firm) return fallback;

    const lines = [
        firm.firm_address || '',
        [firm.state, firm.pin_code].filter(Boolean).join(' '),
    ].filter(Boolean);

    return lines.join('\n') || fallback;
};

export default () => {
    const { updateIndentSheet, updatePoMasterSheet, updateRelatedSheets } = useSheets();
    const { user } = useAuth();
    const isAdmin = (user as any)?.role === 'ADMIN';

    const [indentSheetData, setIndentSheetData] = useState<any[]>([]);
    const [approvalsData, setApprovalsData] = useState<any[]>([]);
    const [poMasterSheetData, setPoMasterSheetData] = useState<any[]>([]);
    const [detailsData, setDetailsData] = useState<any>(null);
    const [vendorsData, setVendorsData] = useState<any[]>([]);
    const [inventoryData, setInventoryData] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [firms, setFirms] = useState<any[]>([]);
    const [readOnly, setReadOnly] = useState(-1);
    const [mode, setMode] = useState<'create' | 'revise'>('create');
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [loading, setLoading] = useState(true);
    // PO numbers whose items have been fully received — cannot be revised
    const [receivedPoNumbers, setReceivedPoNumbers] = useState<Set<string>>(new Set());
    // All indents (including those with POs) for type-based filtering in Revise tab
    const [allIndentsData, setAllIndentsData] = useState<any[]>([]);
 


    const enrichAndSetData = (allIndents: any[], approvals: any[], poData: any[], masterData: any, vendors: any[]) => {
        const enrichedIndents = (allIndents || []).map((indent: any) => {
            // Match by indent_id (FK) first — unique per product row.
            // Fall back to indentNumber only if indent_id is missing.
            const approval = (approvals || []).find((a: any) =>
                (a.indent_id || a.indentId) === indent.id
            ) || (approvals || []).find((a: any) =>
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

                const inventory = await fetchSheet('INVENTORY') as any[];
                setInventoryData(inventory || []);

                const firmsData = await fetchFirms();
                setFirms(firmsData || []);

                const approvals = await fetchFromSupabasePaginated('three_party_approval', '*');

                // Fetch received records to find POs that have been partially or fully received
                const receivedRecords = await fetchFromSupabasePaginated(
                    'received',
                    '*',
                    { column: 'createdAt', options: { ascending: false } }
                );
                const receivedPoSet = new Set<string>(
                    (receivedRecords || []).map((r: any) => r.poNumber || r.po_number).filter(Boolean)
                );
                setReceivedPoNumbers(receivedPoSet);

                // Fetch all indents (including those with POs) for indent type filtering in Revise tab
                const allIndentsRaw = await fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'id', options: { ascending: true } }
                );
                setAllIndentsData(allIndentsRaw || []);

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

    useEffect(() => {
        if (isAdmin) {
            fetchUsers().then(setUsers);
        }
    }, [isAdmin]);

    const schema = z.object({
        poNumber: z.string().nonempty(),
        poDate: z.coerce.date(),
        indentName: z.string().optional().default(''),
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
                    id: z.number().optional(),
                    quantity: z.coerce.number().min(0.001, 'Quantity must be greater than 0'),
                    gst: z.coerce.number(),
                    discount: z.coerce.number().default(0).optional(),
                    discountAmount: z.coerce.number().default(0).optional(),
                })
            ),
        terms: z.array(z.string().nonempty()).max(10),
        preparedBy: z.string().nonempty(),
        approvedBy: z.string().nonempty(),
        transportationType: z.string().nonempty('Select transportation type'),
        leadTime: z.string().optional().default(''),
    });


    type FormData = z.infer<typeof schema>;
    const form = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            poNumber: generatePoNumber(poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null)),
            poDate: new Date(),
            indentName: '',
            supplierName: '',
            supplierAddress: '',
            preparedBy: (user as any)?.name || '',
            approvedBy: '',
            gstin: '',
            quotationNumber: '',
            quotationDate: new Date(),
            ourEnqNo: '',
            enquiryDate: undefined,
            indents: [],
            terms: detailsData?.defaultTerms || [], // Updated to camelCase
            transportationType: 'F-FOR',
            leadTime: '',
        },
    });

    useEffect(() => {
        if (detailsData) {
            form.setValue('terms', detailsData.defaultTerms); // Updated to camelCase
        }
    }, [detailsData]);

    const indents = form.watch('indents');
    const vendor = form.watch('supplierName');
    const indentName = form.watch('indentName');
    const poDate = form.watch('poDate');
    const poNumber = form.watch('poNumber');

    // When navigated here from the Approval of PO page's "Revise" action,
    // switch to Revise mode and preselect the rejected PO once data is loaded.
    const location = useLocation();
    const revisePoFromNav = (location.state as any)?.revisePoNumber as string | undefined;
    const [reviseNavApplied, setReviseNavApplied] = useState(false);
    useEffect(() => {
        if (reviseNavApplied || !revisePoFromNav) return;
        const exists = poMasterSheetData.some((p: any) => (p.poNumber || p.po_number) === revisePoFromNav);
        if (!exists) return;
        setMode('revise');
        form.setValue('poNumber', revisePoFromNav);
        setReviseNavApplied(true);
    }, [revisePoFromNav, poMasterSheetData, reviseNavApplied]);

    const findIndentById = (id?: number) => indentSheetData.find((indent: any) => indent.id === id);

    const selectedIndentRows = useMemo(() => {
        if (mode !== 'create' || !indentName) return [];

        return indentSheetData.filter((indent: any) => indent.indentNumber === indentName);
    }, [mode, indentName, indentSheetData]);

    const selectedPrimaryIndent = useMemo(() => {
        if (indents[0]?.id) return findIndentById(indents[0].id);
        return selectedIndentRows[0];
    }, [indents, selectedIndentRows, indentSheetData]);

    const selectedPoRejectionReason = useMemo(() => {
        if (mode !== 'revise' || !poNumber) return null;
        const po = poMasterSheetData.find((p: any) => (p.poNumber || p.po_number) === poNumber);
        return po?.rejectionReason || po?.rejection_reason || null;
    }, [mode, poNumber, poMasterSheetData]);

    const displayFirm = useMemo(() => {
        let firmName = "Shri Shyam Oil Extractions Pvt Ltd"; // Default

        if (mode === 'create') {
            if (selectedPrimaryIndent?.firm) {
                firmName = selectedPrimaryIndent.firm;
            }
        } else if (mode === 'revise') {
            const po = poMasterSheetData.find((p: any) => (p.poNumber || p.po_number) === poNumber);
            if (po) {
                if (po.firm) {
                    firmName = po.firm;
                } else if (po.indent?.firm) {
                    firmName = po.indent.firm;
                }
            }
        }
        return firmName;
    }, [mode, selectedPrimaryIndent, poNumber, poMasterSheetData]);

    const selectedFirmData = useMemo(() => {
        return firms.find(f => f.firm_name === displayFirm);
    }, [firms, displayFirm]);

    const selectedFirmAddress = useMemo(
        () => formatFirmAddress(selectedFirmData, detailsData?.companyAddress || detailsData?.company_address || ''),
        [selectedFirmData, detailsData]
    );


    // Initialize destination address from details
    useEffect(() => {
        const baseAddr = [displayFirm, selectedFirmAddress].filter(Boolean).join('\n');
        
        if (detailsData?.destinationAddress) {
            setDestinationAddress(`${baseAddr}\n${detailsData.destinationAddress}`);
        } else if (detailsData?.destination_address) {
            setDestinationAddress(`${baseAddr}\n${detailsData.destination_address}`);
        } else {
            setDestinationAddress(baseAddr);
        }
    }, [detailsData, displayFirm, selectedFirmAddress]);

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
            const selectedFirmName = indents.length > 0
                ? findIndentById(indents[0].id)?.firm
                : undefined;
            const selectedFirmAlias = firms.find(f => f.firm_name === selectedFirmName)?.alias ?? selectedFirmName;

            form.setValue(
                'poNumber',
                generatePoNumber(
                    poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null),
                    poDate || new Date(),
                    selectedFirmAlias
                )
            );
        }
    }, [poDate, poMasterSheetData, mode, indents, indentSheetData, form, firms]);

    useEffect(() => {
        if (mode === 'revise') {
            form.reset({
                poNumber: '',
                poDate: undefined,
                indentName: '',
                supplierName: '',
                supplierAddress: '',
                preparedBy: (user as any)?.name || '',
                approvedBy: '',
                gstin: '',
                quotationNumber: '',
                quotationDate: undefined,
                ourEnqNo: '',
                enquiryDate: undefined,
                indents: [],
                terms: [],
                transportationType: 'F-FOR',
                leadTime: '',
            });
        } else {
            form.reset({
                poNumber: generatePoNumber(poMasterSheetData.map((p: any) => p.poNumber || p.po_number).filter(po => po != null)),
                poDate: new Date(),
                indentName: '',
                supplierName: '',
                supplierAddress: '',
                preparedBy: (user as any)?.name || '',
                approvedBy: '',
                gstin: '',
                quotationNumber: '',
                quotationDate: new Date(),
                ourEnqNo: '',
                enquiryDate: undefined,
                indents: [],
                terms: detailsData?.defaultTerms || [],
                transportationType: 'F-FOR',
                leadTime: '',
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

            // If a specific indent is selected, only show that one; otherwise show all for this vendor
            const currentIndentName = form.getValues('indentName');
            if (currentIndentName) {
                form.setValue('indents', selectedIndentRows.map((i: any) => ({
                    indentNumber: i.indentNumber,
                    id: i.id,
                    quantity: i.approvedQuantity || i.approved_quantity || i.quantity || 0,
                    gst: 18,
                    discount: 0,
                    discountAmount: 0,
                })));
            } else {
                form.setValue(
                    'indents',
                    items.map((i: any) => ({
                        indentNumber: i.indentNumber || i.indent_number,
                        id: i.id,
                        quantity: i.approvedQuantity || i.approved_quantity || i.quantity || 0,
                        gst: 18,
                        discount: 0,
                    }))
                );
            }
        }
    }, [vendor, indentName, indentSheetData, vendorsData, selectedIndentRows]);

    useEffect(() => {
        if (indentName && mode === 'create') {
            const selectedIndent = selectedIndentRows[0];
            if (selectedIndent) {
                form.setValue('supplierName', selectedIndent.approvedVendorName || selectedIndent.approved_vendor_name || '');
                form.setValue('indents', selectedIndentRows.map((i: any) => ({
                    indentNumber: i.indentNumber,
                    id: i.id,
                    quantity: i.approvedQuantity || i.approved_quantity || i.quantity || 0,
                    gst: 18,
                    discount: 0,
                    discountAmount: 0,
                })));
            }
        }
    }, [indentName, mode, selectedIndentRows]);

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
                        quantity: poItem.quantity || 0,
                        gst: poItem.gstPercent || poItem.gst_percent || 0,
                        discount: poItem.discountPercent || poItem.discount_percent || 0,
                        discountAmount: 0,
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

            // Auto-fill Lead Time: prefer saved value on the PO, fall back to three-party approval
            const savedLeadTime = po.leadTime || po.lead_time;
            if (savedLeadTime) {
                form.setValue('leadTime', savedLeadTime);
            } else {
                const firstPoItem = poMasterSheetData.find(
                    (p: any) => (p.poNumber || p.po_number) === (po.poNumber || po.po_number)
                );
                if (firstPoItem) {
                    const indentNum = firstPoItem.internalCode || firstPoItem.internal_code || firstPoItem.indent_number || '';
                    const approval = approvalsData.find(
                        (a: any) => (a.indentNumber || a.indent_number) === indentNum
                    );
                    if (approval?.approvedActualTime != null) {
                        form.setValue('leadTime', `${approval.approvedActualTime} days`);
                    }
                }
            }
        }
    }, [poNumber, poMasterSheetData, vendorsData, approvalsData, mode]);

    const handleDestinationEdit = () => {
        setIsEditingDestination(true);
    };

    const handleDestinationSave = () => {
        setIsEditingDestination(false);
        toast.success('Destination address updated');
    };

    const handleDestinationCancel = () => {
        const baseAddr = [displayFirm, selectedFirmAddress].filter(Boolean).join('\n');
        const destination = detailsData?.destinationAddress || detailsData?.destination_address || '';
        setDestinationAddress(destination ? `${baseAddr}\n${destination}` : baseAddr);
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
        // Approved Quantity Validation
        if (mode !== 'revise') {
            const qtyErrors: string[] = [];
            values.indents.forEach((itemRow) => {
                const indent = indentSheetData.find((i: any) =>
                    itemRow.id ? i.id === itemRow.id : (i.indentNumber || i.indent_number) === itemRow.indentNumber
                );
                const approvedQty = Number(indent?.approvedQuantity || indent?.approved_quantity || 0);
                if (approvedQty > 0 && itemRow.quantity > approvedQty) {
                    const name = indent?.productName || indent?.product_name || itemRow.indentNumber;
                    qtyErrors.push(`Qty (${itemRow.quantity}) exceeds approved qty (${approvedQty}) for ${name}.`);
                }
            });
            if (qtyErrors.length > 0) {
                qtyErrors.forEach(err => toast.error(err));
                return;
            }
        }

        // Stock Validation (skipped in revise mode — already checked at PO creation)
        const stockErrors: string[] = [];
        if (mode !== 'revise') values.indents.forEach((itemRow) => {
            const indent = indentSheetData.find((i: any) =>
                itemRow.id ? i.id === itemRow.id : (i.indentNumber || i.indent_number) === itemRow.indentNumber
            );
            const itemName = indent?.productName || indent?.product_name || '';
            const departmentHead = indent?.departmentHead || '';

            const inventoryItem = inventoryData.find(
                i => i.itemName?.toLowerCase().trim() === itemName.toLowerCase().trim() &&
                    (!departmentHead || i.departmentHead?.toLowerCase().trim() === departmentHead.toLowerCase().trim())
            );
            const stock = Number(inventoryItem?.current || 0);
            const indentType = indent?.indentType || '';
            const isPurchase = indentType.toLowerCase().includes('purchase');

            if (!isPurchase && itemRow.quantity > stock) {
                let errorMsg = `Insufficient stocks for ${itemName} (Available: ${stock})`;
                if (indentType.toLowerCase().includes('store out')) {
                    errorMsg += `. Please change Indent Type to "Purchase" instead of "${indentType}".`;
                }
                stockErrors.push(errorMsg);
            }
        });

        if (stockErrors.length > 0) {
            stockErrors.forEach(err => toast.error(err));
            return;
        }

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
                    (a.indent_id || a.indentId) === indent.id
                ) || (approvals || []).find((a: any) =>
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
                    const value = enrichedFetchedIndents.find((i: any) => indent.id ? i.id === indent.id : i.indentNumber === indent.indentNumber) ||
                        poMasterSheetData.find((p: any) => (p.internalCode || p.poNumber) === indent.indentNumber && (p.poNumber || p.po_number) === values.poNumber);
                    return {
                        quantity: indent.quantity,
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
                companyName: displayFirm,
                companyPhone: selectedFirmData?.mobile || detailsData?.companyPhone || detailsData?.company_phone || '',
                companyGstin: selectedFirmData?.firm_gstin || detailsData?.companyGstin || detailsData?.company_gstin || '',
                companyPan: selectedFirmData?.pan_number || detailsData?.companyPan || detailsData?.company_pan || '',
                companyAddress: selectedFirmAddress,
                billingAddress: selectedFirmAddress || detailsData?.billingAddress || detailsData?.billing_address || '',
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
                    const indent = enrichedFetchedIndents.find((i: any) => item.id ? i.id === item.id : i.indentNumber === item.indentNumber) ||
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
                        const value = enrichedFetchedIndents.find((i: any) => indent.id ? i.id === indent.id : i.indentNumber === indent.indentNumber) ||
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
                        const value = enrichedFetchedIndents.find((i: any) => indent.id ? i.id === indent.id : i.indentNumber === indent.indentNumber) ||
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
                firm: displayFirm,
            };

            const blob = await pdf(<POPdf {...pdfProps} />).toBlob();
            const file = new File([blob], `PO-${poNumber}.pdf`, {
                type: 'application/pdf',
            });

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
                const indent = enrichedFetchedIndents.find((i: any) => v.id ? i.id === v.id : i.indentNumber === v.indentNumber) ||
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
                    quantity: v.quantity,
                    unit: indent?.uom || indent?.unit || '',
                    rate: indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                    amount: calculateTotal(
                        indent?.approvedRate || indent?.approved_rate || indent?.rate || 0,
                        v.gst,
                        v.discount || 0,
                        v.quantity
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
                    leadTime: values.leadTime || null,
                    indent_number: v.indentNumber,
                    indent_id: v.id || indent?.id || null,
                };
            });


            // Insert each PO record into the database using API
            const poResult = await postToSheet(poData, 'insert', 'PO_MASTER');
            if (!poResult.success) throw new Error((poResult.error as any)?.message || 'Failed to save PO records');

            // Update corresponding indent records to sync with Receive Items and Get Purchase stages
            const indentUpdates: any[] = values.indents.map((v) => {
                const indent = enrichedFetchedIndents.find((i: any) => v.id ? i.id === v.id : i.indentNumber === v.indentNumber);
                return {
                    id: indent.id,
                    indentNumber: v.indentNumber,
                    actual_4: getCurrentFormattedDateTime(), // PO Completion Date (removes from "Pending for PO")
                    // planned_5 (Receive Items) is enabled only after the PO is approved
                    // on the Approval of PO page — not at creation time.
                    po_number: poNumber,
                    po_copy: url,
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
        <div className="grid place-items-center w-full min-w-0 bg-gradient-to-br from-blue-100 via-purple-50 to-blue-50 rounder-md">
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
                                    <h1 className="text-2xl font-bold">{displayFirm}</h1>
                                    <div>
                                        <p className="text-sm">
                                            {selectedFirmAddress || 'Banari, Janjgir Champa-495668, Chhattisgarh'}
                                        </p>
                                        <p className="text-sm">Phone No: {selectedFirmData?.mobile || '+919993023243'}</p>
                                    </div>
                                </div>
                            </div>
                            <hr />
                            <h2 className="text-center font-bold text-lg">Purchase Order</h2>
                            <hr />

                            <div className="grid gap-4 px-4 py-2 text-foreground/80">
                                <div className="grid grid-cols-2 gap-4">
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
                                                                    poMasterSheetData.filter((i: any) => {
                                                                        const poNum = i.poNumber || i.po_number;
                                                                        if (receivedPoNumbers.has(poNum)) return false;
                                                                        // Only rejected POs can be revised
                                                                        if ((i.approvalStatus || i.approval_status) !== 'Rejected') return false;
                                                                        const indentNum = i.internalCode || i.internal_code || i.indent_number;
                                                                        const matchedIndent = allIndentsData.find((ind: any) =>
                                                                            (ind.indentNumber || ind.indent_number) === indentNum
                                                                        );
                                                                        if (!matchedIndent) return false;
                                                                        return (matchedIndent.indentType || matchedIndent.indent_type || '')
                                                                            .toLowerCase()
                                                                            .includes('purchase');
                                                                    })
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

                                {/* Rejection Reason Alert Box */}
                                {selectedPoRejectionReason && (
                                    <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-4 py-3 text-xs flex flex-col gap-1.5 animate-in fade-in duration-200">
                                        <div className="font-semibold uppercase tracking-wider text-[10px] text-red-500">Rejection Reason</div>
                                        <div className="font-medium">{selectedPoRejectionReason}</div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {mode === 'create' && (
                                        <FormField
                                            control={form.control}
                                            name="indentName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Indent Name</FormLabel>
                                                    <FormControl>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger size="sm" className="w-full">
                                                                    <SelectValue placeholder="Select indent" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {[...new Map(
                                                                    indentSheetData
                                                                        .filter((i: any) => i.indentNumber || i.indent_number)
                                                                        .map((i: any) => [i.indentNumber || i.indent_number, i])
                                                                ).values()].map((i: any, k: number) => (
                                                                    <SelectItem key={k} value={i.indentNumber || i.indent_number}>
                                                                        {i.indentNumber || i.indent_number}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}
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
                                                            disabled={!!indentName}
                                                        >
                                                            <FormLabel>Vendor Name <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <SelectTrigger
                                                                    size="sm"
                                                                    className="w-full"
                                                                >
                                                                    <SelectValue placeholder="Select vendor" />
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
                                                        <FormLabel>Vendor Name<span className="text-red-500">*</span></FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                className="h-9"
                                                                readOnly
                                                                placeholder="Enter vendor name"
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
                                                <FormLabel>Vendor Address<span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        className={cn("h-9", (mode === 'revise' || !!vendor) && "bg-muted cursor-not-allowed")}
                                                        readOnly={mode === 'revise' || !!vendor}
                                                        placeholder="Enter vendor address"
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
                                                        className={cn("h-9", (mode === 'revise' || !!vendor) && "bg-muted cursor-not-allowed")}
                                                        readOnly={mode === 'revise' || !!vendor}
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
                                            <span className="font-medium">GSTIN: </span>
                                            {selectedFirmData?.firm_gstin || detailsData?.companyGstin || detailsData?.company_gstin || '21AACCJ1154B1ZG'}
                                        </p>
                                        <p>
                                            <span className="font-medium">Pan No: </span>
                                            {selectedFirmData?.pan_number || detailsData?.companyPan || detailsData?.company_pan || 'AACCJ1154B'}
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
                                        <p className="font-medium">M/S {displayFirm}</p>
                                        <p className="whitespace-pre-wrap">
                                            {selectedFirmAddress || 'Banari, Janjgir Champa-495668, Chhattisgarh'}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                                    <CardHeader className="bg-muted px-5 py-2">
                                        <CardTitle className="text-center flex items-center justify-between">
                                            Destination Address
                                            {!isEditingDestination && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleDestinationEdit}
                                                    className="h-6 w-6 p-0 hover:bg-gray-200"
                                                >
                                                    <Pencil size={14} className="text-gray-600" />
                                                </Button>
                                            )}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 text-sm">
                                        {isEditingDestination ? (
                                            <div className="flex flex-col gap-2">
                                                <Textarea
                                                    value={destinationAddress}
                                                    onChange={(e) => setDestinationAddress(e.target.value)}
                                                    className="min-h-[80px] text-sm"
                                                    placeholder="Enter destination address"
                                                    autoFocus
                                                />
                                                <div className="flex justify-end gap-2 mt-1">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleDestinationCancel}
                                                        className="h-7 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 border-red-200"
                                                    >
                                                        <X size={14} className="mr-1" /> Cancel
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="default"
                                                        size="sm"
                                                        onClick={handleDestinationSave}
                                                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                                                    >
                                                        <Save size={14} className="mr-1" /> Save
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="whitespace-pre-wrap">{destinationAddress}</p>
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

                            <div className="mx-4 overflow-x-auto">
                                <Table containerClassName="min-w-max">
                                    <TableHeader>
                                        <TableRow className="text-xs">
                                            <TableHead className="px-2 py-1 whitespace-nowrap">S/N</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Internal Code</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Firm</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Product</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Description</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Qty</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Unit</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Rate</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">GST (%)</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Disc (%)</TableHead>
                                            <TableHead className="px-2 py-1 whitespace-nowrap">Disc Amt</TableHead>
                                            <TableHead className="px-2 py-1"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {itemsArray.fields.map((field, index) => {
                                            const value = indents[index];
                                            const indent = indentSheetData.find(
                                                (i: any) => value.id ? i.id === value.id : (i.indentNumber || i.indent_number) === value.indentNumber
                                            ) || poMasterSheetData.find(
                                                (p: any) => (p.internalCode || p.internal_code || p.indent_number) === value.indentNumber && (p.poNumber || p.po_number) === poNumber
                                            );
                                            return (
                                                <TableRow key={field.id} className="text-xs">
                                                    <TableCell className="px-2 py-1">{index + 1}</TableCell>
                                                    <TableCell className="px-2 py-1 whitespace-nowrap">{indent?.indentNumber || indent?.indent_number || indent?.internalCode || indent?.internal_code}</TableCell>
                                                    <TableCell className="px-2 py-1 whitespace-nowrap">{indent?.firm || 'N/A'}</TableCell>
                                                    <TableCell className="px-2 py-1 whitespace-nowrap">{indent?.productName || indent?.product_name || indent?.product}</TableCell>
                                                    <TableCell className="px-2 py-1 max-w-[160px] truncate">
                                                        {indent?.specifications || indent?.description || (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.quantity`}
                                                            render={({ field: indentField }) => {
                                                                const inventoryItem = inventoryData.find(
                                                                    i => i.itemName?.toLowerCase().trim() === (indent?.productName || indent?.product_name || '').toLowerCase().trim() &&
                                                                         (!indent?.departmentHead || i.departmentHead?.toLowerCase().trim() === (indent?.departmentHead || '').toLowerCase().trim())
                                                                );
                                                                const stock = Number(inventoryItem?.current || 0);
                                                                const indentType = indent?.indentType || '';
                                                                const isPurchase = indentType.toLowerCase().includes('purchase');
                                                                const isInsufficient = mode !== 'revise' && !isPurchase && Number(indentField.value) > stock;

                                                                return (
                                                                    <FormItem className="space-y-0">
                                                                        <FormControl>
                                                                            <Input
                                                                                type="number"
                                                                                className={cn(
                                                                                    "rounded-sm h-7 w-20 p-0 text-center text-xs",
                                                                                    isInsufficient && "border-red-500 focus-visible:ring-red-500"
                                                                                )}
                                                                                onFocus={(e) => e.target.select()}
                                                                                {...indentField}
                                                                            />
                                                                        </FormControl>
                                                                        {isInsufficient && (
                                                                            <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                                                                                Insufficient stocks for "{indent?.productName || indent?.product_name}".
                                                                                {indentType.toLowerCase().includes('store out') && (
                                                                                    <span> Please change Indent Type to "Purchase".</span>
                                                                                )}
                                                                            </p>
                                                                        )}
                                                                    </FormItem>
                                                                );
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">{indent?.uom || indent?.unit}</TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        {indent?.approvedRate || indent?.approved_rate || indent?.rate}
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.gst`}
                                                            render={({ field: indentField }) => (
                                                                <FormItem className="flex justify-center items-center gap-1">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            className="rounded-sm h-7 w-14 p-0 text-center text-xs"
                                                                            onFocus={(e) => e.target.select()}
                                                                            {...indentField}
                                                                        />
                                                                    </FormControl>
                                                                    %
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.discount`}
                                                            render={({ field: indentField }) => {
                                                                const baseAmt = (indent?.approvedRate || indent?.approved_rate || indent?.rate || 0) * (Number(form.getValues(`indents.${index}.quantity`)) || 0);
                                                                return (
                                                                    <FormItem className="flex justify-center items-center">
                                                                        <FormControl>
                                                                            <Input
                                                                                type="number"
                                                                                className="rounded-sm h-7 w-14 p-0 text-center text-xs"
                                                                                max="100"
                                                                                value={indentField.value}
                                                                                onFocus={(e) => e.target.select()}
                                                                                onChange={(e) => {
                                                                                    const pct = Number(e.target.value) || 0;
                                                                                    indentField.onChange(pct);
                                                                                    form.setValue(`indents.${index}.discountAmount` as any, parseFloat(((baseAmt * pct) / 100).toFixed(2)));
                                                                                }}
                                                                            />
                                                                        </FormControl>{' '}%
                                                                    </FormItem>
                                                                );
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        <FormField
                                                            control={form.control}
                                                            name={`indents.${index}.discountAmount`}
                                                            render={({ field: indentField }) => {
                                                                const baseAmt = (indent?.approvedRate || indent?.approved_rate || indent?.rate || 0) * (Number(form.getValues(`indents.${index}.quantity`)) || 0);
                                                                return (
                                                                    <FormItem className="flex justify-center items-center">
                                                                        <FormControl>
                                                                            <Input
                                                                                type="number"
                                                                                className="rounded-sm h-7 w-20 p-0 text-center text-xs"
                                                                                value={indentField.value}
                                                                                onFocus={(e) => e.target.select()}
                                                                                onChange={(e) => {
                                                                                    const amt = Number(e.target.value) || 0;
                                                                                    indentField.onChange(amt);
                                                                                    const pct = baseAmt > 0 ? parseFloat(((amt / baseAmt) * 100).toFixed(4)) : 0;
                                                                                    form.setValue(`indents.${index}.discount` as any, pct);
                                                                                }}
                                                                            />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                );
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-2 py-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                itemsArray.remove(index);
                                                            }}
                                                        >
                                                            <Trash
                                                                size={16}
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
                                                            quantity: indentRow.quantity,
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
                                                            quantity: indentRow.quantity,
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
                                                            quantity: indentRow.quantity,
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

                            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 px-4">
                                <FormField
                                    control={form.control}
                                    name="transportationType"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs">Transportation Type<span className="text-red-500">*</span></FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-8 text-xs">
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
                                    name="leadTime"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs">Lead Time to Receive</FormLabel>
                                            <FormControl>
                                                <Input className="h-8 text-xs" placeholder="e.g. 7 days" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="preparedBy"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs">Prepared By<span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                {isAdmin ? (
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="Select user" />
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
                                                    <Input className="h-8 text-xs text-center" placeholder="Prepared by" {...field} disabled />
                                                )}
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="approvedBy"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs">Approved By<span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Input className="h-8 text-xs text-center" placeholder="Approved by" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <div className="flex flex-col justify-end items-center pb-1">
                                    <p className="text-[11px] font-semibold text-center leading-tight">For {displayFirm}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 w-full max-w-6xl bg-background m-5 shadow-md rounded-md">
                            <Button type="reset" variant="outline" className="h-10 gap-2" onClick={() => form.reset()}>
                                <X size={16} />
                                Reset
                            </Button>

                            <Button type="submit" disabled={form.formState.isSubmitting} className="h-10 gap-2 bg-primary hover:bg-primary/90">
                                {form.formState.isSubmitting
                                    ? <Loader size={16} color="white" aria-label="Loading Spinner" />
                                    : <Send size={16} />
                                }
                                {form.formState.isSubmitting ? 'Saving...' : 'Save & Send PO'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
};
