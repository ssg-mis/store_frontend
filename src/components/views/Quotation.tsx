


import { ChevronsRightLeft, FilePlus2, Pencil, Save, Trash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { z } from 'zod';
import { Button } from '../ui/button';
import { SidebarTrigger } from '../ui/sidebar';
import { useFieldArray, useForm, type Control, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import type { PoMasterSheet, QuotationHistorySheet, MasterDataRow } from '@/types';
import { postToSheet, uploadFile, fetchSheet, fetchFirms } from '@/lib/fetchers';
import { useEffect, useMemo, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { ClipLoader as Loader } from 'react-spinners';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '../ui/textarea';
import { pdf } from '@react-pdf/renderer';
import POPdf, { type POPdfProps } from '../element/QuotationPdf';
import { Checkbox } from '../ui/checkbox';
import { Search as SearchIcon } from 'lucide-react'; // Added icons





type Mode = 'create' | 'revise';


interface SupplierInfo {
  name: string;
  address: string;
  gstin: string;
  email?: string;
}


// MASTER Sheet interface for suppliers
interface MasterSheetSupplier {
  supplierName: string;      // Column A
  vendorGstin: string;       // Column B  
  vendorAddress: string;     // Column C
  email?: string;
}


function filterUniqueQuotationNumbers(data: PoMasterSheet[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data) {
    // Convert to string first, then trim
    const q = row.quotation_number ? String(row.quotation_number).trim() : ''; // Updated to quotation_number
    if (q && !seen.has(q)) {
      seen.add(q);
      result.push(q);
    }
  }
  return result;
}


// Generate next quotation number based on existing numbers
function generateNextQuotationNumber(existingNumbers: string[]): string {
  const numbers = existingNumbers
    .map(num => {
      const match = num.match(/QT-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `QT-${String(maxNumber + 1).padStart(3, '0')}`;
}


const quotationSchema = z.object({
  quotationNumber: z.string().optional().default(''),
  quotationDate: z.coerce.date().optional().default(new Date()),
  suppliers: z.array(z.string()).min(1, "At least one supplier is required"),
  description: z.string().optional().default(''),
  selectedIndents: z.array(z.string()).optional().default([]),
  terms: z.array(z.string()).optional().default([]),
});


type QuotationForm = z.infer<typeof quotationSchema>;


// Simple Badge component as replacement
const Badge = ({ children, variant, className, onClick }: {
  children: React.ReactNode;
  variant?: string;
  className?: string;
  onClick?: () => void;
}) => (
  <span
    className={cn(
      "inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border",
      className
    )}
    onClick={onClick}
  >
    {children}
  </span>
);


export default function QuotationPage() {
  const { indentSheet, poMasterSheet, updateIndentSheet, updatePoMasterSheet, updateMasterSheet, masterSheet: details } = useSheets();
  const [mode, setMode] = useState<Mode>('create');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [masterSuppliers, setMasterSuppliers] = useState<MasterSheetSupplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [latestQuotationNumbers, setLatestQuotationNumbers] = useState<string[]>([]);
  const [allHistory, setAllHistory] = useState<QuotationHistorySheet[]>([]);
  const [selectedQuotationNo, setSelectedQuotationNo] = useState<string>('');
  const [fullMasterData, setFullMasterData] = useState<MasterDataRow[]>([]);
  const [firms, setFirms] = useState<any[]>([]);
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');

  // Load firms (companies) so the user can switch which company the quotation is from
  useEffect(() => {
    fetchFirms().then((data: any[]) => setFirms(Array.isArray(data) ? data.filter(f => f.isActive !== false) : []));
  }, []);

  // The active company: a selected firm overrides the default masterSheet company details
  const company = useMemo(() => {
    const firm = firms.find(f => String(f.firm_id) === selectedFirmId);
    if (firm) {
      return {
        name: firm.firm_name || '',
        address: firm.firm_address || '',
        phone: firm.mobile || '',
        gstin: firm.firm_gstin || '',
        pan: firm.pan_number || '',
      };
    }
    return {
      name: details?.companyName || '',
      address: details?.companyAddress || '',
      phone: details?.companyPhone || '',
      gstin: details?.companyGstin || '',
      pan: details?.companyPan || '',
    };
  }, [firms, selectedFirmId, details]);





  // Editable cards: make Billing and Destination editable (last two cards)
  const [isEditingBilling, setIsEditingBilling] = useState(false);
  const [billingAddress, setBillingAddress] = useState('');
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');


  useEffect(() => {
    if (details) {
      setBillingAddress(details.billingAddress || '');
      setDestinationAddress(details.destinationAddress || '');
    }
  }, [details]);


  // Fetch latest quotation numbers from QUOTATION HISTORY sheet
  useEffect(() => {
    const fetchLatestQuotationNumbers = async () => {
      try {
        const quotationHistory = await fetchSheet('QUOTATION HISTORY');

        if (Array.isArray(quotationHistory)) {
          setAllHistory(quotationHistory as unknown as QuotationHistorySheet[]);
          const quotationNos = quotationHistory
            .map((row: any) => row.quatationNo || '')
            .filter((no: string) => no && no.trim() !== '');

          setLatestQuotationNumbers(quotationNos);
        }
      } catch (error) {
        console.error('Error fetching quotation numbers:', error);
      }
    };

    fetchLatestQuotationNumbers();
  }, []);


  // Fetch suppliers from MASTER sheet using existing fetchSheet function
  useEffect(() => {
    function hasVendors(data: any): data is { vendors: any[] } {
      return data && typeof data === 'object' && 'vendors' in data;
    }

    const fetchMasterSuppliers = async () => {
      try {
        const masterData = await fetchSheet('MASTER');
        const rawMasterForFilter = await fetchSheet('MASTER_DATA') as unknown as MasterDataRow[];


        if (Array.isArray(rawMasterForFilter)) {
          setFullMasterData(rawMasterForFilter);
        }

        // Use type guard to safely access vendors
        let vendorsArray: any[] = [];

        if (hasVendors(masterData)) {
          vendorsArray = masterData.vendors || [];
        } else if (Array.isArray(masterData)) {
          vendorsArray = masterData;
        }

        const suppliers: MasterSheetSupplier[] = vendorsArray
          .map((vendor: any) => ({
            supplierName: vendor.vendorName || vendor.supplierName || '',
            vendorGstin: vendor.gstin || vendor.vendorGstin || '',
            vendorAddress: vendor.address || vendor.vendorAddress || '',
            email: vendor.email || ''
          }))
          .filter(supplier => {
            const name = supplier.supplierName;
            return name && typeof name === 'string' && name.trim() !== '';
          });

        setMasterSuppliers(suppliers);

        if (suppliers.length === 0) {
          toast.warning('No suppliers found in MASTER sheet');
        } else {
          toast.success(`Loaded ${suppliers.length} suppliers`);
        }

      } catch (error) {
        console.error('Error fetching MASTER sheet suppliers:', error);
        toast.error('Failed to load suppliers from MASTER sheet');
      }
    };

    fetchMasterSuppliers();
  }, [details]);


  // Filter eligible items - planned2 NOT NULL and actual2 effectively empty
  const eligibleItems = useMemo(() => {

    const isEmpty = (value: any) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      const normalized = value.trim();
      // Treat common placeholder values as "empty"
      return (
        normalized === '' ||
        normalized.toLowerCase() === 'null' ||
        normalized === '0000-00-00' ||
        normalized === '0000-00-00 00:00:00' ||
        normalized === '0000-00-00T00:00:00'
      );
    };

    const filtered = indentSheet.filter(item => {
      // 1. Stage 1 must be done (Approved)
      // The backend IndentController adds a 'status' field: 'Approved' if approvedIndents.length > 0
      const isApproved = item.status === 'Approved' || (item.approvedIndents && item.approvedIndents.length > 0);

      // 2. Identify if it already has a quotation
      const hasQuotationInHistory = allHistory.some(h => ((h as any).indent?.indentNumber || h.indentNo) === item.indentNumber);

      // 3. Stage check: Identify if it already moved to Vendor Rate Update or Three Party Approval
      const isAlreadyInNextStage =
        (item.vendorRateUpdates && item.vendorRateUpdates.length > 0) ||
        (item.threePartyApproval && item.threePartyApproval.length > 0);

      // 4. If we are in revise mode, include items that were already in this quotation
      const isPartOfCurrentQuotation = mode === 'revise' && selectedQuotationNo &&
        allHistory.some(h => h.quatationNo === selectedQuotationNo && ((h as any).indent?.indentNumber || h.indentNo) === item.indentNumber);

      // Eligible if Approved AND (Not yet in any quotation OR part of the current revision)
      // AND also NOT yet in Vendor Rate Update/Approval stages (unless revising)
      return isApproved &&
        (!hasQuotationInHistory || isPartOfCurrentQuotation) &&
        (!isAlreadyInNextStage || isPartOfCurrentQuotation);
    }).reverse();

    return filtered;
  }, [indentSheet, mode, selectedQuotationNo, allHistory]);



  const form = useForm<QuotationForm>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      quotationNumber: '',
      quotationDate: new Date(),
      suppliers: [],
      description: '',
      selectedIndents: [],
      terms: details?.defaultTerms || [],
    },
  });


  useEffect(() => {
    if (details?.defaultTerms) {
      form.setValue('terms', details.defaultTerms);
    }
  }, [details]);


  // Auto-generate quotation number in create mode - FIXED
  useEffect(() => {
    if (mode === 'create') {
      // Combine both sources of quotation numbers
      const allNumbers = [...filterUniqueQuotationNumbers(poMasterSheet), ...latestQuotationNumbers];
      const nextNumber = generateNextQuotationNumber(allNumbers);
      form.setValue('quotationNumber', nextNumber);
    }
  }, [mode, poMasterSheet, latestQuotationNumbers, form]);


  const getSupplierInfo = (name: string): SupplierInfo | null => {
    if (!name) return null;
    const masterSupplier = masterSuppliers.find(s => (s.supplierName || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (!masterSupplier) return null;
    return {
      name,
      address: masterSupplier.vendorAddress || '',
      gstin: masterSupplier.vendorGstin || '',
      email: masterSupplier.email || ''
    };
  };


  // Logic for Revise mode: Populate form when selectedQuotationNo changes
  useEffect(() => {
    if (mode === 'revise' && selectedQuotationNo) {
      const historyRecords = allHistory.filter(h =>
        (h.quatationNo) === selectedQuotationNo
      );

      if (historyRecords.length > 0) {
        // Unique suppliers from these records
        const uniqueSuppliers = Array.from(new Set(historyRecords.map(h => h.supplierName)));

        // Find them in masterData to get full info
        const infos = uniqueSuppliers.map(name => {
          const master = masterSuppliers.find(s => (s.supplierName || '').trim().toLowerCase() === name.trim().toLowerCase());
          return {
            name,
            address: master?.vendorAddress || historyRecords.find(h => h.supplierName === name)?.adreess || '',
            gstin: master?.vendorGstin || historyRecords.find(h => h.supplierName === name)?.gst || '',
            email: master?.email || ''
          };
        });

        // Unique indents from these records — keyed by unique indent id, not the
        // (possibly duplicated) internal code, so revise restores the exact rows.
        const uniqueIndents = Array.from(new Set(historyRecords.map(h => String(h.indent_id))));

        setSelectedItems(uniqueIndents);

        // Update form
        form.setValue('quotationNumber', selectedQuotationNo);
        form.setValue('suppliers', uniqueSuppliers);
        form.setValue('selectedIndents', uniqueIndents);

        // Optionally set date if we have it
        const firstRecord = historyRecords[0];
        if (firstRecord.timestamp) {
          form.setValue('quotationDate', new Date(firstRecord.timestamp));
        }
        if (firstRecord.description) {
          form.setValue('description', firstRecord.description);
        }

        toast.success(`Loaded quotation ${selectedQuotationNo}`);
      }
    }
  }, [selectedQuotationNo, mode, allHistory, masterSuppliers]);


  // Handle checkbox selection — selection is keyed by the unique indent id so two
  // indents that share the same internal code are never selected together.
  const handleItemSelection = (id: string, checked: boolean) => {
    setSelectedItems(prev => {
      if (checked) {
        return [...prev, id];
      } else {
        return prev.filter(item => item !== id);
      }
    });
  };


  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = eligibleItems.map(item => String(item.id));
      setSelectedItems(allIds);
    } else {
      setSelectedItems([]);
    }
  };


  // Update form when selectedItems changes
  useEffect(() => {
    form.setValue('selectedIndents', selectedItems);
  }, [selectedItems, form]);


  // Fixed TypeScript error for useFieldArray
  const termsArray = useFieldArray({
    control: form.control as Control<FieldValues>,
    name: 'terms',
  });


  async function onSubmit(values: QuotationForm) {
    try {
      if (selectedItems.length === 0) {
        toast.error('Please select at least one item');
        return;
      }

      const suppliersToProcess = values.suppliers;
      
      const supplierInfos = suppliersToProcess.map(getSupplierInfo).filter((s): s is SupplierInfo => s !== null);

      if (supplierInfos.length === 0) {
        toast.error('Please select at least one valid supplier');
        return;
      }

      const selectedItemsData = eligibleItems.filter(item =>
        selectedItems.includes(String(item.id))
      );

      const logoResponse = await fetch('/logo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });

      const allQuotationRows: QuotationHistorySheet[] = [];

      // Get all existing quotation numbers to generate unique ones - FIXED
      const allNumbers = [...filterUniqueQuotationNumbers(poMasterSheet), ...latestQuotationNumbers];
      let currentMaxNumber = allNumbers
        .map(num => {
          const match = num.match(/QT-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0)
        .reduce((max, num) => Math.max(max, num), 0);

      for (let i = 0; i < supplierInfos.length; i++) {
        const supplierInfo = supplierInfos[i];

        // Generate unique quotation number for each supplier
        currentMaxNumber += 1;
        const uniqueQuotationNumber = `QT-${String(currentMaxNumber).padStart(3, '0')}`;

        const pdfProps: POPdfProps = {
          companyName: company.name,
          companyPhone: company.phone,
          companyGstin: company.gstin,
          companyPan: company.pan,
          companyAddress: company.address,
          billingAddress: billingAddress,
          destinationAddress: destinationAddress,
          supplierName: supplierInfo.name,
          supplierAddress: supplierInfo.address,
          supplierGstin: supplierInfo.gstin,
          orderNumber: uniqueQuotationNumber,
          orderDate: formatDate(values.quotationDate || new Date()),
          quotationNumber: uniqueQuotationNumber,
          quotationDate: formatDate(values.quotationDate || new Date()),
          enqNo: '',
          enqDate: '',
          description: values.description || '',
          items: selectedItemsData.map(item => ({
            internalCode: item.indentNumber,
            product: item.productName,
            description: item.specifications,
            quantity: item.quantity,
            unit: item.uom,
            rate: 0,
            gst: 0,
            discount: 0,
            amount: 0,
          })),
          total: 0,
          gstAmount: 0,
          grandTotal: 0,
          terms: values.terms || [],
          preparedBy: '',
          approvedBy: '',
        };

        const blob = await pdf(<POPdf {...pdfProps} />).toBlob();
        const file = new File([blob], `QUOTATION-${uniqueQuotationNumber}-${supplierInfo.name}.pdf`, { type: 'application/pdf' });

        if (!supplierInfo.email) {
          toast.error(`Email not found for ${supplierInfo.name}!`);
          continue;
        }

        const pdfUrl = await uploadFile(
          file,
          import.meta.env.VITE_PURCHASE_ORDERS_FOLDER,
          'email',
          supplierInfo.email
        );

        // Type-safe mapping to QuotationHistorySheet
        const quotationHistoryRows: QuotationHistorySheet[] = selectedItemsData.map(item => ({
          timestamp: (values.quotationDate || new Date()).toISOString(),
          quatationNo: uniqueQuotationNumber,
          supplierName: supplierInfo.name,
          adreess: supplierInfo.address,
          gst: supplierInfo.gstin,
          indent_id: item.id,
          indentNo: item.indentNumber,
          product: item.productName,
          description: item.specifications || '',
          qty: String(item.quantity || ''),
          unit: item.uom || '',
          pdfLink: pdfUrl,
          firm: item.firm || 'N/A',
        }));

        allQuotationRows.push(...quotationHistoryRows);
      }

      await postToSheet(allQuotationRows, 'insert', 'QUOTATION HISTORY');

      toast.success(`Successfully created ${supplierInfos.length} unique quotation(s) for ${supplierInfos.length} supplier(s)`);
      form.reset();
      setSelectedItems([]);
      setSupplierSearch('');

      setTimeout(() => {
        updatePoMasterSheet();
        updateIndentSheet();
      }, 1000);
    } catch (e) {
      console.error('Submit error:', e);
      toast.error('Failed to create quotation: ' + (e as Error).message);
    }
  }

  function onError(e: any) {
    console.error('Form validation errors:', e);
    toast.error('Please check the form');
  }

  // Simple inline edit controls
  const EditIconButton = ({ editing, onClick }: { editing: boolean; onClick: () => void }) => (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="h-6 w-6 p-0 hover:bg-gray-200">
      {editing ? <Save size={14} className="text-green-600" /> : <Pencil size={14} className="text-gray-600" />}
    </Button>
  );

  const quotationNumbers = useMemo(() => filterUniqueQuotationNumbers(poMasterSheet), [poMasterSheet]);

  return (
    <div className="w-full h-screen overflow-hidden bg-gradient-to-br from-blue-100 via-purple-50 to-blue-50 rounded-md flex flex-col">
      <div className="flex justify-between items-center p-5 w-full flex-shrink-0">
        <div className="flex gap-2 items-center">
          <FilePlus2 size={50} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-primary">Create or Revise Quotation</h1>
            <p className="text-muted-foreground text-sm">Create a quotation from eligible indents or revise an existing one</p>
          </div>
        </div>
        <SidebarTrigger />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="w-full mx-auto">
          <div className="w-full">
            <Tabs defaultValue="create" onValueChange={(v) => setMode(v === 'create' ? 'create' as Mode : 'revise' as Mode)}>
              <TabsList className="h-10 w-full rounded-none">
                <TabsTrigger value="create">Create</TabsTrigger>
                <TabsTrigger value="revise">Revise</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onError)} className="flex flex-col items-center">
              <div className="space-y-4 p-4 w-full bg-white shadow-md rounded-sm mt-4">
                <div className="flex flex-col gap-3 bg-blue-50 p-4 rounded">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Company</span>
                    <Select value={selectedFirmId} onValueChange={setSelectedFirmId}>
                      <SelectTrigger size="sm" className="w-[240px] bg-white">
                        <SelectValue placeholder="Default company" />
                      </SelectTrigger>
                      <SelectContent className="z-[150] max-h-[300px]">
                        {details?.companyName && (
                          <SelectItem value="default">{details.companyName} (Default)</SelectItem>
                        )}
                        {firms.length === 0 ? (
                          <SelectItem value="no-firms" disabled>No companies found</SelectItem>
                        ) : (
                          firms.map((f) => (
                            <SelectItem key={f.firm_id} value={String(f.firm_id)}>{f.firm_name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <img src="/logo.png" alt="Company Logo" className="w-20 h-20 object-contain" />
                    <div className="text-center">
                      <h1 className="text-2xl font-bold">{company.name}</h1>
                      <div>
                        <p className="text-sm">{company.address}</p>
                        <p className="text-sm">Phone No: +{company.phone}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <hr />
                {mode === 'revise' && (
                  <div className="px-4 py-2 space-y-2 bg-yellow-50 rounded border border-yellow-100">
                    <FormLabel className="text-yellow-800">Select Quotation to Revise</FormLabel>
                    <Select onValueChange={setSelectedQuotationNo} value={selectedQuotationNo}>
                      <SelectTrigger size="sm" className="w-full bg-white border-yellow-200">
                        <SelectValue placeholder="Select a quotation to revise..." />
                      </SelectTrigger>
                      <SelectContent className="z-[100] max-h-[300px]">
                        {latestQuotationNumbers.length === 0 ? (
                          <SelectItem value="no-quotations" disabled>No quotations found</SelectItem>
                        ) : (
                          latestQuotationNumbers.map((no, k) => (
                            <SelectItem key={k} value={no}>{no}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <h2 className="text-center font-bold text-lg">{mode === 'create' ? 'Create New' : 'Revise Existing'} Quotation</h2>
                <hr />

                {/* Supplier Selection */}
                <div className="px-4 py-2 space-y-4">
                  <FormField
                    control={form.control}
                    name="suppliers"
                    render={({ field }) => (
                      <FormItem className="space-y-4">
                        <FormLabel className="text-lg font-semibold text-primary">Select Suppliers (Vendors)</FormLabel>
                        <div className="flex gap-4 items-end">
                          <div className="flex-1">
                            <Select
                              onValueChange={(val) => {
                                if (val && !field.value.includes(val)) {
                                  field.onChange([...field.value, val]);
                                }
                                setSupplierSearch('');
                              }}
                              onOpenChange={(open) => { if (!open) setSupplierSearch(""); }}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full bg-white">
                                  <SelectValue placeholder="Search and select a supplier..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="z-[150]">
                                <div className="p-2 border-b space-y-2 sticky top-0 bg-white">
                                  <div className="flex items-center border-b px-2 pb-1">
                                    <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                    <Input
                                      placeholder="Search suppliers..."
                                      className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                      value={supplierSearch}
                                      onChange={(e) => setSupplierSearch(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                  {masterSuppliers
                                    .filter(v => (v.supplierName || '').toLowerCase().includes(supplierSearch.toLowerCase()))
                                    .length > 0 ? (
                                      masterSuppliers
                                        .filter(v => (v.supplierName || '').toLowerCase().includes(supplierSearch.toLowerCase()))
                                        .map((supplier, i) => (
                                          <SelectItem 
                                            key={i} 
                                            value={supplier.supplierName}
                                            disabled={field.value.includes(supplier.supplierName)}
                                          >
                                            {supplier.supplierName}
                                          </SelectItem>
                                        ))
                                    ) : (
                                      <div className="py-6 text-center text-sm text-muted-foreground">No suppliers found</div>
                                    )}
                                </div>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Selected Suppliers List */}
                        {field.value.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                            {field.value.map((supplierName, idx) => {
                              const info = getSupplierInfo(supplierName);
                              return (
                                <Card key={idx} className="relative border-primary/20 bg-primary/5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 rounded-full"
                                    onClick={() => {
                                      field.onChange(field.value.filter(s => s !== supplierName));
                                    }}
                                  >
                                    <Trash size={14} />
                                  </Button>
                                  <CardContent className="p-4 pt-4">
                                    <div className="flex items-start gap-3">
                                      <div className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                                        {idx + 1}
                                      </div>
                                      <div className="space-y-1 overflow-hidden">
                                        <p className="font-bold text-sm truncate" title={supplierName}>
                                          {supplierName}
                                        </p>
                                        {info && (
                                          <>
                                            <p className="text-[10px] text-muted-foreground line-clamp-2" title={info.address}>
                                              {info.address}
                                            </p>
                                            <p className="text-[10px] font-medium text-primary/80">
                                              GSTIN: {info.gstin || 'N/A'}
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                </div>

                {/* Cards */}
                <div className="grid md:grid-cols-3 gap-3">
                  <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                    <CardHeader className="bg-muted px-5 py-2">
                      <CardTitle className="text-center">Our Commercial Details</CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 text-sm">
                      <p>
                        <span className="font-medium">GSTIN</span> {company.gstin}
                      </p>
                      <p>
                        <span className="font-medium">Pan No.</span> {company.pan}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                    <CardHeader className="bg-muted px-5 py-2">
                      <CardTitle className="text-center flex items-center justify-between">
                        Billing Address
                        <EditIconButton
                          editing={isEditingBilling}
                          onClick={() => {
                            if (isEditingBilling) toast.success('Billing address updated');
                            setIsEditingBilling(!isEditingBilling);
                          }}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 text-sm">
                      <p>M/S {company.name}</p>
                      {isEditingBilling ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            value={billingAddress}
                            onChange={(e) => setBillingAddress(e.target.value)}
                            className="h-7 text-sm"
                            placeholder="Enter billing address"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setIsEditingBilling(false);
                                toast.success('Billing address updated');
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingBilling(false)}
                            className="h-6 w-6 p-0 hover:bg-red-100"
                          >
                            <Trash size={12} className="text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <p>{billingAddress}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                    <CardHeader className="bg-muted px-5 py-2">
                      <CardTitle className="text-center flex items-center justify-between">
                        Destination Address
                        <EditIconButton
                          editing={isEditingDestination}
                          onClick={() => {
                            if (isEditingDestination) toast.success('Destination address updated');
                            setIsEditingDestination(!isEditingDestination);
                          }}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 text-sm">
                      <p>M/S {company.name}</p>
                      {isEditingDestination ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            value={destinationAddress}
                            onChange={(e) => setDestinationAddress(e.target.value)}
                            className="h-7 text-sm"
                            placeholder="Enter destination address"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setIsEditingDestination(false);
                                toast.success('Destination address updated');
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingDestination(false)}
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

                {/* Description */}
                <div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Enter message" className="resize-y" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <hr />

                {/* Table with checkboxes and Unit column */}
                <div className="mx-4">
                  <div className="border rounded-md max-h-[420px] overflow-auto">
                    <Table containerClassName="overflow-visible">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedItems.length === eligibleItems.length && eligibleItems.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                          <TableHead>S/N</TableHead>
                          <TableHead>Internal Code</TableHead>
                          <TableHead>Firm</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eligibleItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                              {mode === 'create'
                                ? "No eligible items found (Only APPROVED indents without quotations are shown)"
                                : "No items found for this quotation"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          eligibleItems.map((item, index) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedItems.includes(String(item.id))}
                                  onCheckedChange={(checked) =>
                                    handleItemSelection(String(item.id), checked as boolean)
                                  }
                                />
                              </TableCell>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{item.indentNumber}</TableCell>
                              <TableCell>{item.firm || 'N/A'}</TableCell>
                              <TableCell>{item.productName}</TableCell>
                              <TableCell>{item.specifications || <span className="text-muted-foreground">No Description</span>}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.uom}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 w-full max-w-6xl bg-background my-5 shadow-md rounded-md">
                <Button type="reset" variant="outline" onClick={() => {
                  form.reset();
                  setSelectedItems([]);
                  setSupplierSearch('');
                }}>
                  Reset
                </Button>

                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader size={20} color="white" aria-label="Loading Spinner" />}
                  Save And Send Quotation
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
