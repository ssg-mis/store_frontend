
import { type ColumnDef, type Row } from '@tanstack/react-table';
import DataTable from '../element/DataTable';
import { useEffect, useState } from 'react';
import { DownloadOutlined } from "@ant-design/icons";
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { fetchIndentMasterData, fetchFromSupabasePaginated, postToSheet, approveIndent } from '@/lib/fetchers';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { Tabs, TabsContent } from '../ui/tabs';
import { ClipboardCheck, PenSquare, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useSheets } from '@/context/SheetsContext';
import Heading from '../element/Heading';
import { Pill } from '../ui/pill';
import { Input } from '../ui/input';

const statuses = ['Reject', 'Three Party', 'Regular'];

interface ApproveTableData {
    id: number;
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    quantity: number;
    uom: string;
    vendorType: 'Reject' | 'Three Party' | 'Regular';
    date: string;
    attachment: string;
    specifications: string;
    status: 'Pending' | 'Approved';
    plannedDate: string | null;
}

interface HistoryData {
    indentNo: string;
    indenter: string;
    department: string;
    product: string;
    uom: string;
    approvedQuantity: number;
    vendorType: 'Reject' | 'Three Party' | 'Regular';
    date: string;
    approvedDate: string;
    delay?: string;
    specifications: string;
    lastUpdated?: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet } = useSheets();

    const [tableData, setTableData] = useState<ApproveTableData[]>([]);
    const [historyData, setHistoryData] = useState<HistoryData[]>([]);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<HistoryData>>({});
    const [loading, setLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [bulkUpdates, setBulkUpdates] = useState<Map<string, { vendorType?: string; quantity?: number; product?: string; plannedDate?: string }>>(new Map());
    const [searchTermProduct, setSearchTermProduct] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const [master, setMaster] = useState<any>(null);

    const fetchData = async () => {
        setDataLoading(true);
        try {
            // Backend now handles mapping and status tracking via relations
            const data = await fetchFromSupabasePaginated('indent');

            if (data) {
                // All Indents (filtered for Purchase for this view)
                const purchaseIndents = data.filter((r: any) => r.indentType === 'Purchase');

                // Mapping is now much simpler as the backend provides the correct fields
                const mappedData = purchaseIndents.map((record: any) => ({
                    id: record.id,
                    indentNo: record.indentNumber,
                    indenter: record.indenterName,
                    department: record.department || '',
                    product: record.productName,
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    specifications: record.specifications || '',
                    vendorType: record.vendorType || record.vendor_type || 'Regular',
                    date: record.createdAt ? formatDate(new Date(record.createdAt)) : '',
                    status: record.status, // 'Pending' or 'Approved' from backend
                    plannedDate: record.plannedDate,
                    approvedQuantity: record.approvedQuantity,
                    delay: record.delay
                }));

                // Set table data for pending and history
                setTableData(mappedData.filter(d => d.status === 'Pending'));
                setHistoryData(mappedData.filter(d => d.status === 'Approved').map(d => ({
                    ...d,
                    approvedQuantity: d.approvedQuantity || d.quantity,
                    approvedDate: d.plannedDate ? formatDate(new Date(d.plannedDate)) : d.date,
                    delay: d.delay || 'No delay'
                })));
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch data');
        } finally {
            setDataLoading(false);
        }
    };

    // Fetching table data on mount
    useEffect(() => {
        fetchData();
        fetchIndentMasterData().then(setMaster);
    }, []);

    const handleRowSelect = (indentNo: string, checked: boolean) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(indentNo);
                const currentRow = tableData.find(row => row.indentNo === indentNo);
                if (currentRow) {
                    setBulkUpdates(prevUpdates => {
                        const newUpdates = new Map(prevUpdates);
                        newUpdates.set(indentNo, {
                            vendorType: currentRow.vendorType,
                            quantity: currentRow.quantity,
                            product: currentRow.product,
                            plannedDate: new Date().toISOString().split('T')[0] // Default to today
                        });
                        return newUpdates;
                    });
                }
            } else {
                newSet.delete(indentNo);
                setBulkUpdates(prevUpdates => {
                    const newUpdates = new Map(prevUpdates);
                    newUpdates.delete(indentNo);
                    return newUpdates;
                });
            }
            return newSet;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(tableData.map(row => row.indentNo)));
            const newUpdates = new Map();
            tableData.forEach(row => {
                newUpdates.set(row.indentNo, {
                    vendorType: row.vendorType,
                    quantity: row.quantity,
                    product: row.product,
                    plannedDate: new Date().toISOString().split('T')[0]
                });
            });
            setBulkUpdates(newUpdates);
        } else {
            setSelectedRows(new Set());
            setBulkUpdates(new Map());
        }
    };

    const handleBulkUpdate = (
        indentNo: string,
        field: 'vendorType' | 'quantity' | 'product' | 'plannedDate',
        value: string | number
    ) => {
        setBulkUpdates((prevUpdates) => {
            const newUpdates = new Map(prevUpdates);
            if (field === 'vendorType') {
                const vendorValue = value as string;
                selectedRows.forEach((selectedIndentNo) => {
                    const currentUpdate = newUpdates.get(selectedIndentNo) || {};
                    newUpdates.set(selectedIndentNo, {
                        ...currentUpdate,
                        vendorType: vendorValue,
                    });
                });
            } else {
                const qtyValue = value as number;
                const currentUpdate = newUpdates.get(indentNo) || {};
                newUpdates.set(indentNo, {
                    ...currentUpdate,
                    quantity: qtyValue,
                });
            }
            return newUpdates;
        });
    };

    const handleSubmitBulkUpdates = async () => {
        if (selectedRows.size === 0) {
            toast.error('Please select at least one row to update');
            return;
        }

        setSubmitting(true);
        try {
            const updatesToProcess = Array.from(selectedRows).map(indentNo => {
                const update = bulkUpdates.get(indentNo);
                const originalRecord = tableData.find(s => s.indentNo === indentNo);

                if (!originalRecord || !update) return null;

                const updatePayload: any = {
                    quantity: update.quantity !== undefined ? update.quantity : originalRecord.quantity,
                    productName: update.product || originalRecord.product,
                    vendorType: update.vendorType || originalRecord.vendorType,
                    planned: update.plannedDate || new Date().toISOString().split('T')[0]
                };

                return {
                    id: originalRecord.id,
                    updatePayload: {
                        indentNumber: originalRecord.indentNo,
                        ...updatePayload
                    }
                };
            }).filter((item): item is NonNullable<typeof item> => item !== null);

            const approvalResults = await Promise.all(
                updatesToProcess.map(async (item) => {
                    return approveIndent(item.id, item.updatePayload);
                })
            );

            const errors = approvalResults.filter(r => !r.success);
            if (errors.length > 0) {
                console.error('Some updates failed:', errors);
                toast.warning(`Updated ${approvalResults.length - errors.length} indents, but ${errors.length} failed.`);
            } else {
                toast.success(`Updated ${updatesToProcess.length} indents successfully`);
            }

            updateIndentSheet();
            await fetchData();

            setSelectedRows(new Set());
            setBulkUpdates(new Map());
        } catch (error) {
            console.error('Error in bulk updates:', error);
            toast.error('Failed to submit bulk updates');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditClick = (record: HistoryData) => {
        setEditingRow(record.indentNo);
        setEditValues(record);
    };

    const handleCancelEdit = () => {
        setEditingRow(null);
        setEditValues({});
    };

    const handleSaveEdit = async (indentNo: string) => {
        setLoading(true);
        try {
            const result = await postToSheet([editValues], 'update', 'INDENT');
            if (result.success) {
                toast.success('Record updated successfully');
                await fetchData();
                setEditingRow(null);
            } else {
                toast.error('Failed to update record');
            }
        } catch (err) {
            console.error('Error saving edit:', err);
            toast.error('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const onDownloadClick = () => {
        // Simple CSV download placeholder
        const headers = ["Indent No", "Indenter", "Department", "Product", "Quantity", "UOM", "Vendor Type", "Date", "Status"];
        const rows = tableData.map(d => [d.indentNo, d.indenter, d.department, d.product, d.quantity, d.uom, d.vendorType, d.date, d.status]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "indents.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const columns: ColumnDef<ApproveTableData>[] = [
        {
            id: 'select',
            header: ({ table }) => (
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={tableData.length > 0 && selectedRows.size === tableData.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={selectedRows.has(row.original.indentNo)}
                    onChange={(e) => handleRowSelect(row.original.indentNo, e.target.checked)}
                />
            ),
            size: 40,
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent No',
            cell: ({ getValue }) => <div className="font-medium text-xs sm:text-sm">{getValue() as string}</div>,
            size: 100,
        },
        {
            accessorKey: 'indenter',
            header: 'Indenter',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 120,
        },
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 120,
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 150,
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                const currentValue = bulkUpdates.get(indent.indentNo)?.quantity || indent.quantity;
                return (
                    <Input
                        type="number"
                        defaultValue={currentValue}
                        onBlur={(e) => handleBulkUpdate(indent.indentNo, 'quantity', Number(e.target.value) || 0)}
                        className="w-16 sm:w-20 text-xs sm:text-sm h-8"
                        disabled={!isSelected}
                    />
                );
            },
            size: 80,
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm">{getValue() as string}</div>,
            size: 60,
        },
        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                const currentValue = bulkUpdates.get(indent.indentNo)?.vendorType || indent.vendorType;
                return (
                    <Select
                        value={currentValue}
                        onValueChange={(val) => handleBulkUpdate(indent.indentNo, 'vendorType', val)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className="w-24 sm:w-32 h-8 text-xs sm:text-sm">
                            <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Regular">Regular</SelectItem>
                            <SelectItem value="Three Party">Three Party</SelectItem>
                            <SelectItem value="Reject">Reject</SelectItem>
                        </SelectContent>
                    </Select>
                );
            },
            size: 110,
        },
        {
            accessorKey: 'plannedDate',
            header: 'Planned Date',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.indentNo);
                const currentValue = bulkUpdates.get(indent.indentNo)?.plannedDate || new Date().toISOString().split('T')[0];
                return (
                    <Input
                        type="date"
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.indentNo, 'plannedDate', e.target.value)}
                        className="w-32 h-8 text-xs sm:text-sm"
                        disabled={!isSelected}
                    />
                );
            },
            size: 130,
        },
        {
            accessorKey: 'date',
            header: 'Date',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm whitespace-nowrap">{getValue() as string}</div>,
            size: 100,
        },
        {
            accessorKey: 'specifications',
            header: 'Specifications',
            cell: ({ getValue }) => <div className="text-xs sm:text-sm max-w-xs truncate">{getValue() as string}</div>,
            size: 150,
        }
    ];

    const historyColumns: ColumnDef<HistoryData>[] = [
        { accessorKey: 'indentNo', header: 'Indent No', size: 100 },
        { accessorKey: 'indenter', header: 'Indenter', size: 120 },
        { accessorKey: 'product', header: 'Product', size: 150 },
        { accessorKey: 'approvedQuantity', header: 'Appr. Qty', size: 80 },
        {
            accessorKey: 'vendorType', header: 'Status', size: 110, cell: ({ row }) => (
                <Pill variant={row.original.vendorType === 'Reject' ? 'reject' : row.original.vendorType === 'Regular' ? 'primary' : 'secondary'}>
                    {row.original.vendorType}
                </Pill>
            )
        },
        { accessorKey: 'date', header: 'Request Date', size: 100 },
        { accessorKey: 'approvedDate', header: 'Approval Date', size: 100 },
        { accessorKey: 'delay', header: 'Delay', size: 80 }
    ];

    return (
        <div className="w-full max-w-full pb-10 overflow-x-hidden">
            <Tabs defaultValue="pending" className="w-full">
                <Heading heading="Approve Indent" subtext="Update Indent status to Approve or Reject them" tabs>
                    <ClipboardCheck size={50} className="text-primary" />
                </Heading>
                <TabsContent value="pending" className="w-full max-w-full">
                    <div className="space-y-4">
                        {selectedRows.size > 0 && (
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-blue-50 rounded-lg gap-2">
                                <span className="text-sm font-medium">{selectedRows.size} row(s) selected</span>
                                <Button onClick={handleSubmitBulkUpdates} disabled={submitting}>Submit Updates</Button>
                            </div>
                        )}
                        <DataTable
                            data={tableData}
                            columns={columns}
                            searchFields={['indentNo', 'product', 'department', 'indenter']}
                            dataLoading={dataLoading}
                            extraActions={<Button onClick={onDownloadClick}><DownloadOutlined /> Download</Button>}
                        />
                    </div>
                </TabsContent>
                <TabsContent value="history" className="w-full max-w-full">
                    <DataTable data={historyData} columns={historyColumns} />
                </TabsContent>
            </Tabs>
        </div>
    );
};
