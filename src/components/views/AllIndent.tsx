import { type ColumnDef, type Row } from '@tanstack/react-table';
import DataTable from '../element/DataTable';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { PuffLoader as Loader } from 'react-spinners';
import { ClipboardList, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import Heading from '../element/Heading';
import { fetchIndentMasterData, fetchFromSupabasePaginated, postToSheet } from '@/lib/fetchers';
import { useSheets } from '@/context/SheetsContext';

interface AllIndentTableData {
    id: string;
    timestamp: string;
    indentNumber: string;
    firm: string;
    indenterName: string;
    indentApproveBy: string;
    indentType: 'Purchase' | 'Store Out' | 'Store Out Return';
    department: string;
    groupHead: string;
    productName: string;
    quantity: number;
    uom: string;
    areaOfUse: string;
    specifications: string;
    attachment: string;
    vendorType: string;
}

export default () => {
    const { user } = useAuth();
    const { updateIndentSheet } = useSheets();
    const [tableData, setTableData] = useState<AllIndentTableData[]>([]);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [bulkUpdates, setBulkUpdates] = useState<Map<string, Partial<AllIndentTableData>>>(new Map());
    const [submitting, setSubmitting] = useState(false);
    const [searchTermDepartment, setSearchTermDepartment] = useState('');
    const [searchTermGroupHead, setSearchTermGroupHead] = useState('');
    const [searchTermProduct, setSearchTermProduct] = useState('');
    const [master, setMaster] = useState<any>(null);

    const [loading, setLoading] = useState(false);
    const [indentLoading, setIndentLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 50;

    const fetchIndents = async (isLoadMore = false) => {
        if (isLoadMore && !hasMore) return;

        if (!isLoadMore) {
            setIndentLoading(true);
        } else {
            setLoading(true);
        }

        try {
            const currentPage = isLoadMore ? page + 1 : 0;
            const from = currentPage * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const data = await fetchFromSupabasePaginated(
                'indent',
                '*',
                { column: 'created_at', options: { ascending: false } },
                undefined,
                { from, to }
            );

            if (data) {
                const transformedData = data.map((record: any) => ({
                    id: record.id ? record.id.toString() : Math.random().toString(),
                    timestamp: formatDate(new Date(record.createdAt || record.created_at)),
                    indentNumber: record.indentNumber || record.indent_number || '',
                    firm: record.firm || 'N/A',
                    indenterName: record.indenterName || record.indenter_name || '',
                    indentApproveBy: record.indentApprovedBy || record.indent_approve_by || '',
                    indentType: (record.indentType || record.indent_type) as 'Purchase' | 'Store Out' | 'Store Out Return' || 'Purchase',
                    department: record.department || '',
                    groupHead: record.groupHead || record.group_head || '',
                    productName: record.productName || record.product_name || '',
                    quantity: record.quantity || 0,
                    uom: record.uom || '',
                    areaOfUse: record.areaOfUse || record.area_of_use || '',
                    specifications: record.specifications || '',
                    attachment: record.attachment || '',
                    vendorType: record.vendorType || record.vendor_type || '',
                }));

                if (isLoadMore) {
                    setTableData(prev => [...prev, ...transformedData]);
                } else {
                    setTableData(transformedData);
                }

                setPage(currentPage);
                setHasMore(data.length === PAGE_SIZE);
            }
        } catch (error: any) {
            console.error('Error fetching indents:', error);
            toast.error('Failed to fetch indents: ' + error.message);
        } finally {
            setIndentLoading(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIndents();
        fetchIndentMasterData().then(setMaster);
    }, []);
    const handleRowSelect = (id: string, checked: boolean) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(id);
                // Initialize with current values when selected
                const currentRow = tableData.find(row => row.id === id);
                if (currentRow) {
                    setBulkUpdates(prevUpdates => {
                        const newUpdates = new Map(prevUpdates);
                        newUpdates.set(id, { ...currentRow });
                        return newUpdates;
                    });
                }
            } else {
                newSet.delete(id);
                // Remove from bulk updates when unchecked
                setBulkUpdates(prevUpdates => {
                    const newUpdates = new Map(prevUpdates);
                    newUpdates.delete(id);
                    return newUpdates;
                });
            }
            return newSet;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(tableData.map(row => row.id)));
            // Initialize bulk updates for all rows
            const newUpdates = new Map();
            tableData.forEach(row => {
                newUpdates.set(row.id, { ...row });
            });
            setBulkUpdates(newUpdates);
        } else {
            setSelectedRows(new Set());
            setBulkUpdates(new Map());
        }
    };

    const handleBulkUpdate = (id: string, field: keyof AllIndentTableData, value: any) => {
        setBulkUpdates(prevUpdates => {
            const newUpdates = new Map(prevUpdates);
            const currentUpdate = newUpdates.get(id) || {};
            newUpdates.set(id, {
                ...currentUpdate,
                [field]: value
            });
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
            const updatesToProcess = Array.from(selectedRows).map(id => {
                const update = bulkUpdates.get(id);
                const originalRecord = tableData.find(s => s.id === id);

                if (!originalRecord || !update) return null;

                // Prepare update object with only changed fields
                const updatePayload: any = {};

                if (update.firm !== originalRecord.firm) {
                    updatePayload.firm = update.firm;
                }
                if (update.indenterName !== originalRecord.indenterName) {
                    updatePayload.indenterName = update.indenterName;
                }
                if (update.indentApproveBy !== originalRecord.indentApproveBy) {
                    updatePayload.indentApprovedBy = update.indentApproveBy;
                }
                if (update.indentType !== originalRecord.indentType) {
                    updatePayload.indentType = update.indentType;
                }
                if (update.department !== originalRecord.department) {
                    updatePayload.department = update.department;
                }
                if (update.groupHead !== originalRecord.groupHead) {
                    updatePayload.groupHead = update.groupHead;
                }
                if (update.productName !== originalRecord.productName) {
                    updatePayload.productName = update.productName;
                }
                if (update.quantity !== originalRecord.quantity) {
                    updatePayload.quantity = update.quantity;
                }
                if (update.uom !== originalRecord.uom) {
                    updatePayload.uom = update.uom;
                }
                if (update.areaOfUse !== originalRecord.areaOfUse) {
                    updatePayload.areaOfUse = update.areaOfUse;
                }
                if (update.specifications !== originalRecord.specifications) {
                    updatePayload.specifications = update.specifications;
                }

                return {
                    id: originalRecord.id,
                    updatePayload
                };
            }).filter((item): item is NonNullable<typeof item> => item !== null);

            // Prepare the bulk update data
            const bulkUpdateData = updatesToProcess.map(item => ({
                id: item.id,
                ...item.updatePayload
            }));

            // Process bulk updates via API
            const result = await postToSheet(bulkUpdateData, 'update', 'INDENT');

            if (!result.success) throw new Error('API update failed');

            toast.success(`Updated ${updatesToProcess.length} indents successfully`);

            // Refresh the data after updates with pagination (refresh only loaded pages or just reset)
            await fetchIndents(false);
            updateIndentSheet();

            setSelectedRows(new Set());
            setBulkUpdates(new Map());
        } catch (error: any) {
            console.error('Error updating indents:', error);
            toast.error('Failed to update indents: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };


    // Define table columns
    const columns: ColumnDef<AllIndentTableData>[] = [
        {
            id: 'select',
            header: ({ table }) => (
                <div className="flex justify-center">
                    <input
                        type="checkbox"
                        checked={table.getIsAllPageRowsSelected()}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4"
                    />
                </div>
            ),
            cell: ({ row }: { row: Row<AllIndentTableData> }) => {
                const indent = row.original;
                return (
                    <div className="flex justify-center">
                        <input
                            type="checkbox"
                            checked={selectedRows.has(indent.id)}
                            onChange={(e) => handleRowSelect(indent.id, e.target.checked)}
                            className="w-4 h-4"
                        />
                    </div>
                );
            },
            size: 50,
        },
        {
            accessorKey: 'timestamp',
            header: 'Date',
            cell: ({ getValue }) => (
                <div className="text-xs sm:text-sm whitespace-nowrap">
                    {getValue() as string}
                </div>
            ),
            size: 100,
        },
        {
            accessorKey: 'indentNumber',
            header: 'Indent No.',
            cell: ({ getValue }) => (
                <div className="font-medium text-xs sm:text-sm">
                    {getValue() as string}
                </div>
            ),
            size: 100,
        },
        {
            accessorKey: 'firm',
            header: 'Firm',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.firm || indent.firm;

                return (
                    <Select
                        value={currentValue}
                        onValueChange={(value) => handleBulkUpdate(indent.id, 'firm', value)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className={`w-32 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder="Select firm" />
                        </SelectTrigger>
                        <SelectContent>
                            {master?.firms?.map((firm: string, i: number) => (
                                <SelectItem key={i} value={firm}>{firm}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                );
            },
            size: 140,
        },
        {
            accessorKey: 'indenterName',
            header: 'Indenter Name',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.indenterName || indent.indenterName;

                return (
                    <Input
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.id, 'indenterName', e.target.value)}
                        disabled={!isSelected}
                        className={`w-32 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}
                        placeholder="Indenter name"
                    />
                );
            },
            size: 140,
        },

        {
            accessorKey: 'indentType',
            header: 'Indent Type',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.indentType || indent.indentType;

                return (
                    <Select
                        value={currentValue}
                        onValueChange={(value) => handleBulkUpdate(indent.id, 'indentType', value)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className={`w-32 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Purchase">Purchase</SelectItem>
                            <SelectItem value="Store Out">Store Out</SelectItem>
                            <SelectItem value="Store Out Return">Store Out Return</SelectItem>
                        </SelectContent>
                    </Select>
                );
            },
            size: 140,
        },
        {
            accessorKey: 'department',
            header: 'Department',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.department || indent.department;

                return (
                    <Select
                        value={currentValue}
                        onValueChange={(value) => handleBulkUpdate(indent.id, 'department', value)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className={`w-36 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder="Department" />
                        </SelectTrigger>
                        <SelectContent>
                            <div className="flex items-center border-b px-3 pb-3">
                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                <input
                                    placeholder="Search department..."
                                    value={searchTermDepartment}
                                    onChange={(e) => setSearchTermDepartment(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {master?.departments
                                    ?.filter((d: string) => d.toLowerCase().includes(searchTermDepartment.toLowerCase()))
                                    .map((d: string, i: number) => (
                                        <SelectItem key={i} value={d}>{d}</SelectItem>
                                    ))}
                            </div>
                        </SelectContent>
                    </Select>
                );
            },
            size: 160,
        },
        {
            accessorKey: 'groupHead',
            header: 'Group Head',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.groupHead || indent.groupHead;

                return (
                    <Select
                        value={currentValue}
                        onValueChange={(value) => handleBulkUpdate(indent.id, 'groupHead', value)}
                        disabled={!isSelected}
                    >
                        <SelectTrigger className={`w-36 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder="Group head" />
                        </SelectTrigger>
                        <SelectContent>
                            <div className="flex items-center border-b px-3 pb-3">
                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                <input
                                    placeholder="Search group head..."
                                    value={searchTermGroupHead}
                                    onChange={(e) => setSearchTermGroupHead(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {master?.createGroupHeads
                                    ?.filter((gh: string) => gh.toLowerCase().includes(searchTermGroupHead.toLowerCase()))
                                    .map((gh: string, i: number) => (
                                        <SelectItem key={i} value={gh}>{gh}</SelectItem>
                                    ))}
                            </div>
                        </SelectContent>
                    </Select>
                );
            },
            size: 160,
        },
        {
            accessorKey: 'productName',
            header: 'Product Name',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentGroupHead = bulkUpdates.get(indent.id)?.groupHead || indent.groupHead;
                const currentValue = bulkUpdates.get(indent.id)?.productName || indent.productName;

                const availableProducts = master?.groupHeadItems?.[currentGroupHead] || [];

                return (
                    <Select
                        value={currentValue}
                        onValueChange={(value) => handleBulkUpdate(indent.id, 'productName', value)}
                        disabled={!isSelected || !currentGroupHead}
                    >
                        <SelectTrigger className={`w-52 text-xs sm:text-sm ${(!isSelected || !currentGroupHead) ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder="Product name" />
                        </SelectTrigger>
                        <SelectContent>
                            <div className="flex items-center border-b px-3 pb-3">
                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                <input
                                    placeholder="Search product..."
                                    value={searchTermProduct}
                                    onChange={(e) => setSearchTermProduct(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {availableProducts
                                    ?.filter((p: string) => p.toLowerCase().includes(searchTermProduct.toLowerCase()))
                                    .map((p: string, i: number) => (
                                        <SelectItem key={i} value={p}>{p}</SelectItem>
                                    ))}
                            </div>
                        </SelectContent>
                    </Select>
                );
            },
            size: 220,
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.quantity || indent.quantity;

                return (
                    <Input
                        type="number"
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.id, 'quantity', Number(e.target.value) || 0)}
                        disabled={!isSelected}
                        className={`w-20 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}
                        min="0"
                        step="1"
                    />
                );
            },
            size: 80,
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.uom || indent.uom;

                return (
                    <Input
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.id, 'uom', e.target.value)}
                        disabled={!isSelected}
                        className={`w-20 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}
                        placeholder="UOM"
                    />
                );
            },
            size: 80,
        },
        {
            accessorKey: 'areaOfUse',
            header: 'Area of Use',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.areaOfUse || indent.areaOfUse;

                return (
                    <Input
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.id, 'areaOfUse', e.target.value)}
                        disabled={!isSelected}
                        className={`w-32 text-xs sm:text-sm ${!isSelected ? 'opacity-50' : ''}`}
                        placeholder="Area of use"
                    />
                );
            },
            size: 140,
        },
        {
            accessorKey: 'specifications',
            header: 'Specifications',
            cell: ({ row }) => {
                const indent = row.original;
                const isSelected = selectedRows.has(indent.id);
                const currentValue = bulkUpdates.get(indent.id)?.specifications || indent.specifications;

                return (
                    <Textarea
                        value={currentValue}
                        onChange={(e) => handleBulkUpdate(indent.id, 'specifications', e.target.value)}
                        disabled={!isSelected}
                        className={`w-40 min-h-[60px] text-xs sm:text-sm resize-y ${!isSelected ? 'opacity-50' : ''}`}
                        placeholder="Specifications"
                    />
                );
            },
            size: 180,
        },
        {
            accessorKey: 'attachment',
            header: 'Attachment',
            cell: ({ row }) => {
                const attachment = row.original.attachment;
                return attachment ? (
                    <a
                        href={attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm underline"
                    >
                        View
                    </a>
                ) : (
                    <span className="text-gray-400 text-xs sm:text-sm">-</span>
                );
            },
            size: 80,
        },
        {
            accessorKey: 'vendorType',
            header: 'Vendor Type',
            cell: ({ getValue }) => {
                const value = getValue() as string;
                const displayValue = (!value || value === 'Pending') ? '-' : value;
                return (
                    <div className={`text-xs sm:text-sm ${displayValue === '-' ? 'text-gray-400' : 'font-medium'}`}>
                        {displayValue}
                    </div>
                );
            },
            size: 120,
        },

    ];

    return (
        <div className="w-full">
            <div className="sticky top-0 z-20 bg-background -mx-5 -mt-5 p-5 pb-2 shadow-sm">
                <Heading
                    heading="All Indents"
                    subtext="View and manage all indent records"
                >
                    <ClipboardList size={50} className="text-primary" />
                </Heading>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-blue-50 rounded-lg gap-2 sm:gap-0 border border-blue-100">
                        <span className="text-sm font-medium">
                            {selectedRows.size} row(s) selected for update
                        </span>
                        <Button
                            onClick={handleSubmitBulkUpdates}
                            disabled={submitting}
                            className="flex items-center gap-2 w-full sm:w-auto"
                        >
                            {submitting && (
                                <Loader
                                    size={16}
                                    color="white"
                                    aria-label="Loading Spinner"
                                />
                            )}
                            Update Selected
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-4 p-5 pt-2">

                <div className="w-full overflow-x-auto">
                    <DataTable
                        data={tableData}
                        columns={columns}
                        searchFields={['indentNumber', 'indenterName', 'department', 'productName', 'groupHead']}
                        dataLoading={indentLoading}
                        footer={
                            <div className="flex flex-col items-center gap-2 p-4 pt-0">
                                {hasMore && (
                                    <Button
                                        variant="outline"
                                        onClick={() => fetchIndents(true)}
                                        disabled={loading}
                                        className="w-full sm:w-64"
                                    >
                                        {loading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader size={16} color="currentColor" />
                                                Loading...
                                            </div>
                                        ) : (
                                            'Load More Records'
                                        )}
                                    </Button>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Displaying {tableData.length} records
                                    {!hasMore && tableData.length > 0 && " (All records loaded)"}
                                </p>
                            </div>
                        }
                    />
                </div>
            </div>
        </div>
    );
};
