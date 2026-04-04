

import { Package2, Trash2 } from 'lucide-react';
import Heading from '../element/Heading';
import { useSheets } from '@/context/SheetsContext';
import { useEffect, useState } from 'react';
import { fetchFromSupabasePaginated, postToSheet } from '@/lib/fetchers';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate } from '@/lib/utils';
import DataTable from '../element/DataTable';
import { Pill } from '../ui/pill';


interface HistoryData {
    poNumber: string;
    poCopy: string;
    vendorName: string;
    preparedBy: string;
    approvedBy: string;
    totalAmount: number;
    status: 'Revised' | 'Not Recieved' | 'Recieved';
    indentNumber: string;

    id: number;
}


export default () => {
    // Use context only for status calculation (indent vs received)
    const { indentSheet, receivedSheet } = useSheets();
    const [poMasterLoading, setPoMasterLoading] = useState(true);


    const [historyData, setHistoryData] = useState<HistoryData[]>([]);


    // Fetching table data directly from Supabase to ensure snake_case fields match
    useEffect(() => {
        const fetchPOMaster = async () => {
            setPoMasterLoading(true);
            try {
                const data = await fetchFromSupabasePaginated(
                    'po_master',
                    '*',
                    { column: 'timestamp', options: { ascending: false } }
                );

                if (data) {
                    setHistoryData(
                        data
                            // Filter out any invalid items, if necessary
                            .filter(sheet => sheet.po_number || sheet.party_name)
                            .map((sheet, index) => ({
                                approvedBy: sheet.approved_by || '',
                                poCopy: sheet.pdf_url || sheet.pdf_link || '', // Check both possible column names
                                poNumber: sheet.po_number || '',
                                preparedBy: sheet.prepared_by || '',
                                totalAmount: Number(sheet.total_po_amount) || 0,
                                vendorName: sheet.party_name || '',
                                indentNumber: sheet.internal_code || '',
                                id: sheet.id || 0,
                                status: (indentSheet.map((s) => s.poNumber).includes(sheet.po_number || '')
                                    ? receivedSheet.map((r) => r.poNumber).includes(sheet.po_number || '')
                                        ? 'Recieved'
                                        : 'Not Recieved'
                                    : 'Revised') as 'Revised' | 'Not Recieved' | 'Recieved',
                            }))
                    );
                }
            } catch (error) {
                console.error('Error fetching PO history:', error);
            } finally {
                setPoMasterLoading(false);
            }
        };

        fetchPOMaster();
    }, [indentSheet, receivedSheet]);


    // Delete handler function using Apps Script
    // Delete handler function using Supabase
    const handleDelete = async (indentNumber: string, id: number) => {
        if (!id) {
            alert('Row ID not found');
            return;
        }

        const confirmDelete = window.confirm(
            `Are you sure you want to delete the row with Indent Number: ${indentNumber}?`
        );

        if (!confirmDelete) return;

        try {
            console.log('Deleting row with ID:', id);

            const result = await postToSheet([{ id }], 'delete', 'PO_MASTER');
            if (!result.success) throw new Error('API delete failed');

            alert('Row deleted successfully');
            // Update local state to remove the deleted row
            setHistoryData((prev) =>
                prev.filter((item) => item.id !== id)
            );
        } catch (error) {
            console.error('Delete error:', error);
            alert('Error deleting row: ' + (error as any).message);
        }
    };


    // Creating table columns
    const historyColumns: ColumnDef<HistoryData>[] = [
        { accessorKey: 'poNumber', header: 'PO Number' },
        { accessorKey: 'indentNumber', header: 'Indent Number' },
        {
            accessorKey: 'poCopy',
            header: 'PO Copy',
            cell: ({ row }) => {
                const attachment = row.original.poCopy;
                return attachment ? (
                    <a href={attachment} target="_blank">
                        PDF
                    </a>
                ) : (
                    <></>
                );
            },
        },
        { accessorKey: 'vendorName', header: 'Vendor Name' },
        { accessorKey: 'preparedBy', header: 'Prepared By' },
        { accessorKey: 'approvedBy', header: 'Approved By' },
        {
            accessorKey: 'totalAmount',
            header: 'Amount',
            cell: ({ row }) => {
                return <>&#8377;{row.original.totalAmount}</>;
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const variant = row.original.status === "Not Recieved" ? "secondary" : row.original.status === "Recieved" ? "primary" : "default"
                return <Pill variant={variant}>{row.original.status}</Pill>
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                return (
                    <button
                        onClick={() => handleDelete(row.original.indentNumber, row.original.id)}
                        className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                        title="Delete row"
                    >
                        <Trash2 size={18} />
                    </button>
                );
            },
        },
    ];


    return (
        <div>
            <Heading heading="PO History" subtext="View purchase orders">
                <Package2 size={50} className="text-primary" />
            </Heading>


            <div className="w-full overflow-x-auto">
                <DataTable
                    data={historyData}
                    columns={historyColumns}
                    searchFields={['vendorName', 'poNumber', 'indentNumber']}
                    dataLoading={poMasterLoading}
                    className='h-[80dvh]'
                />
            </div>
        </div>
    );
};
