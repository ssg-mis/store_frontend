


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
import { postToSheet, uploadFile, fetchSheet } from '@/lib/fetchers';
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


// Updated schema - removed mandatory validations
const quotationSchema = z.object({
  quotationNumber: z.string().optional().default(''),
  quotationDate: z.coerce.date().optional().default(new Date()),
  suppliers: z.array(z.string()).optional().default([]),
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
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [supplierInfos, setSupplierInfos] = useState<SupplierInfo[]>([]);
  const [masterSuppliers, setMasterSuppliers] = useState<MasterSheetSupplier[]>([]);
  const [latestQuotationNumbers, setLatestQuotationNumbers] = useState<string[]>([]);
  const [allHistory, setAllHistory] = useState<QuotationHistorySheet[]>([]);
  const [selectedQuotationNo, setSelectedQuotationNo] = useState<string>('');
  const [fullMasterData, setFullMasterData] = useState<MasterDataRow[]>([]);





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
        console.log('Fetched QUOTATION HISTORY:', quotationHistory);

        if (Array.isArray(quotationHistory)) {
          setAllHistory(quotationHistory as unknown as QuotationHistorySheet[]);
          const quotationNos = quotationHistory
            .map((row: any) => row.quatationNo || '')
            .filter((no: string) => no && no.trim() !== '');

          setLatestQuotationNumbers(quotationNos);
          console.log('Latest quotation numbers:', quotationNos);
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
        console.log('Fetching MASTER sheet data...');

        const masterData = await fetchSheet('MASTER');
        const rawMasterForFilter = await fetchSheet('MASTER_DATA') as unknown as MasterDataRow[];

        console.log('MASTER sheet raw data:', masterData);
        console.log('Raw Master Data for filtering:', rawMasterForFilter);

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

        console.log('Processed suppliers:', suppliers);
        setMasterSuppliers(suppliers);

        if (suppliers.length === 0) {
          console.warn('No suppliers found in MASTER sheet');
          toast.warning('No suppliers found in MASTER sheet');
        } else {
          console.log(`Successfully loaded ${suppliers.length} suppliers from MASTER sheet`);
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
    console.log('Total indentSheet items:', indentSheet.length);

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
      const hasQuotationInHistory = allHistory.some(h => h.indentNo === item.indentNumber);

      // 3. Stage check: Identify if it already moved to Vendor Rate Update or Three Party Approval
      const isAlreadyInNextStage =
        (item.vendorRateUpdates && item.vendorRateUpdates.length > 0) ||
        (item.threePartyApproval && item.threePartyApproval.length > 0);

      // 4. If we are in revise mode, include items that were already in this quotation
      const isPartOfCurrentQuotation = mode === 'revise' && selectedQuotationNo &&
        allHistory.some(h => h.quatationNo === selectedQuotationNo && h.indentNo === item.indentNumber);

      // Eligible if Approved AND (Not yet in any quotation OR part of the current revision)
      // AND also NOT yet in Vendor Rate Update/Approval stages (unless revising)
      const isBasicEligible = isApproved &&
        (!hasQuotationInHistory || isPartOfCurrentQuotation) &&
        (!isAlreadyInNextStage || isPartOfCurrentQuotation);

      // 5. Supplier-based filtering (User request: "when i select any supplier name then show there data only")
      if (selectedSuppliers.length === 0) {
        return isBasicEligible; // Show all if no supplier selected
      }

      // If suppliers are selected, further filter to only show items they provide in master data
      const matchesSupplier = fullMasterData.some(m => {
        const isSelectedVendor = selectedSuppliers.some(s => s.trim().toLowerCase() === (m.vendorName || '').trim().toLowerCase());
        const isMatchingItem = (m.itemName || '').trim().toLowerCase() === (item.productName || '').trim().toLowerCase();
        return isSelectedVendor && isMatchingItem;
      });

      return isBasicEligible && matchesSupplier;
    }).reverse();

    console.log('Filtered eligible items:', filtered.length);
    return filtered;
  }, [indentSheet, mode, selectedQuotationNo, allHistory, selectedSuppliers, fullMasterData]);

  // Sync selection: remove items that are no longer in the eligible list (e.g., filtered out by supplier choice)
  useEffect(() => {
    if (eligibleItems.length === 0 && selectedItems.length === 0) return;

    setSelectedItems(prev => {
      const stillEligibleIds = new Set(eligibleItems.map(item => item.indentNumber));
      const filtered = prev.filter(id => stillEligibleIds.has(id));

      // If nothing changed, return original to avoid infinite loop
      if (filtered.length === prev.length) return prev;

      console.log('Auto-unselected items because they are no longer eligible for the selected supplier(s)');
      return filtered;
    });
  }, [eligibleItems, selectedItems.length]); // Track length instead of array to avoid re-triggering itself too easily if items change internally


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
      console.log('Generated next quotation number:', nextNumber);
    }
  }, [mode, poMasterSheet, latestQuotationNumbers, form]);


  // Handle multiple supplier selection from MASTER sheet - Robust lookup
  const handleSupplierSelect = (supplierName: string) => {
    if (!supplierName) return;

    setSelectedSuppliers(prev => {
      const isAlreadySelected = prev.some(s => s.trim().toLowerCase() === supplierName.trim().toLowerCase());
      const newSuppliers = isAlreadySelected
        ? prev.filter(s => s.trim().toLowerCase() !== supplierName.trim().toLowerCase())
        : [...prev, supplierName];

      form.setValue('suppliers', newSuppliers);

      // Fetch supplier info from MASTER sheet data
      const infos = newSuppliers.map(name => {
        const masterSupplier = masterSuppliers.find(s =>
          (s.supplierName || '').trim().toLowerCase() === name.trim().toLowerCase()
        );
        return {
          name,
          address: masterSupplier?.vendorAddress || '',
          gstin: masterSupplier?.vendorGstin || '',
          email: masterSupplier?.email || ''
        };
      });
      setSupplierInfos(infos);

      console.log('Selected suppliers info:', infos);

      return newSuppliers;
    });
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

        // Unique indents from these records
        const uniqueIndents = Array.from(new Set(historyRecords.map(h => h.indentNo)));

        // Update state
        setSelectedSuppliers(uniqueSuppliers);
        setSupplierInfos(infos as SupplierInfo[]);
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


  // Handle checkbox selection
  const handleItemSelection = (indentNumber: string, checked: boolean) => {
    setSelectedItems(prev => {
      if (checked) {
        return [...prev, indentNumber];
      } else {
        return prev.filter(item => item !== indentNumber);
      }
    });
  };


  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIndentNumbers = eligibleItems.map(item => item.indentNumber);
      setSelectedItems(allIndentNumbers);
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

      if (selectedSuppliers.length === 0) {
        toast.error('Please select at least one supplier');
        return;
      }

      const selectedItemsData = eligibleItems.filter(item =>
        selectedItems.includes(item.indentNumber)
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
          companyName: details?.companyName || '',
          companyPhone: details?.companyPhone || '',
          companyGstin: details?.companyGstin || '',
          companyPan: details?.companyPan || '',
          companyAddress: details?.companyAddress || '',
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
          indentNo: item.indentNumber,
          product: item.productName,
          description: item.specifications || '',
          qty: String(item.quantity || ''),
          unit: item.uom || '',
          pdfLink: pdfUrl,
        }));

        allQuotationRows.push(...quotationHistoryRows);
      }

      console.log('Submitting to QUOTATION HISTORY:', allQuotationRows);
      console.log('Total rows:', allQuotationRows.length);
      console.log('First row:', allQuotationRows[0]);

      await postToSheet(allQuotationRows, 'insert', 'QUOTATION HISTORY');

      toast.success(`Successfully created ${selectedSuppliers.length} unique quotation(s) for ${selectedSuppliers.length} supplier(s)`);
      form.reset();
      setSelectedItems([]);
      setSelectedSuppliers([]);
      setSupplierInfos([]);

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
    console.log('Form errors:', e);
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
                <div className="flex items-center justify-center gap-4 bg-blue-50 p-4 rounded">
                  <img src="/logo.png" alt="Company Logo" className="w-20 h-20 object-contain" />
                  <div className="text-center">
                    <h1 className="text-2xl font-bold">{details?.companyName}</h1>
                    <div>
                      <p className="text-sm">{details?.companyAddress}</p>
                      <p className="text-sm">Phone No: +{details?.companyPhone}</p>
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

                {/* Quotation meta */}
                <div className="grid gap-5 px-4 py-2 text-foreground/80">
                  {/* Multi-Supplier Selection from MASTER sheet */}
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="suppliers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Suppliers (From MASTER Sheet)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Select onValueChange={handleSupplierSelect}>
                                <SelectTrigger size="sm" className="w-full">
                                  <SelectValue placeholder="Select suppliers from MASTER sheet" />
                                </SelectTrigger>
                                <SelectContent className="z-[100] max-h-[300px]">
                                  {masterSuppliers.length === 0 ? (
                                    <SelectItem value="no-suppliers" disabled>
                                      No suppliers found in MASTER sheet
                                    </SelectItem>
                                  ) : (
                                    masterSuppliers.map((supplier, k) => (
                                      <SelectItem key={k} value={supplier.supplierName}>
                                        {supplier.supplierName}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>

                              {/* Selected suppliers badges */}
                              {selectedSuppliers.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {selectedSuppliers.map((supplier, index) => (
                                    <Badge key={index} variant="secondary" className="flex items-center gap-1 cursor-pointer hover:bg-gray-200">
                                      {supplier}
                                      <button
                                        type="button"
                                        onClick={() => handleSupplierSelect(supplier)}
                                        className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Display supplier details from MASTER sheet */}
                    {supplierInfos.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Selected Supplier Details (From MASTER Sheet):</h4>
                        {supplierInfos.map((supplier, index) => (
                          <div key={index} className="bg-gray-50 p-3 rounded border text-sm">
                            <div className="grid grid-cols-3 gap-x-4">
                              <div>
                                <span className="font-medium">Name:</span> {supplier.name}
                              </div>
                              <div>
                                <span className="font-medium">Address:</span> {supplier.address}
                              </div>
                              <div>
                                <span className="font-medium">GSTIN:</span> {supplier.gstin}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <div className="grid md:grid-cols-3 gap-3">
                  <Card className="p-0 gap-0 shadow-xs rounded-[3px]">
                    <CardHeader className="bg-muted px-5 py-2">
                      <CardTitle className="text-center">Our Commercial Details</CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 text-sm">
                      <p>
                        <span className="font-medium">GSTIN</span> {details?.companyGstin}
                      </p>
                      <p>
                        <span className="font-medium">Pan No.</span> {details?.companyPan}
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
                      <p>M/S {details?.companyName}</p>
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
                      <p>M/S {details?.companyName}</p>
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
                <div className="mx-4 grid">
                  <div className="grid overflow-hidden">
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
                            <TableRow key={item.indentNumber}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedItems.includes(item.indentNumber)}
                                  onCheckedChange={(checked) =>
                                    handleItemSelection(item.indentNumber, checked as boolean)
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
                  setSelectedSuppliers([]);
                  setSupplierInfos([]);
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

