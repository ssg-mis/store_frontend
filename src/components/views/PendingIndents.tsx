import { ListTodo } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate } from '@/lib/utils';
import DataTable from '../element/DataTable';
// supabase removed - using dummy data via fetchers

import { fetchFromSupabasePaginated } from '@/lib/fetchers';

interface PendingIndentsData {
    date: string;
    indentNo: string;
    product: string;
    quantity: number;
    rate: number;
    uom: string;
    vendorName: string;
    paymentTerm: string;
    specifications: string;
}

export default () => {
    const [tableData, setTableData] = useState<PendingIndentsData[]>([]);
    const [dataLoading, setDataLoading] = useState(true);

    // Fetching table data
    useEffect(() => {
        const fetchData = async () => {
            setDataLoading(true);
            try {
                // Fetch indents for Stage 4 (Pending POs)
                const data = await fetchFromSupabasePaginated(
                    'indent',
                    '*',
                    { column: 'planned_4', options: { ascending: false } },
                    (q) => q.not('planned_4', 'is', null).is('actual_4', null)
                );

                // Fetch approvals to get vendor names and rates
                const approvals = await fetchFromSupabasePaginated('three_party_approval', '*');
                const approvalMap: Record<string, any> = {};
                (approvals || []).forEach((a: any) => {
                    const key = a.indentNumber || a.indent_number;
                    if (key) approvalMap[key] = a;
                });

                if (data) {
                    const tableData = data.map((record: any) => {
                        const indentNo = record.indentNumber || record.indent_number || '';
                        const approval = approvalMap[indentNo];
                        
                        return {
                            date: formatDate(new Date(record.createdAt || record.created_at)),
                            indentNo: indentNo,
                            product: record.productName || record.product_name || '',
                            quantity: record.approvedQuantity || record.approved_quantity || record.quantity || 0,
                            rate: approval?.approvedRate || record.approvedRate || record.approved_rate || 0,
                            uom: record.uom || '',
                            vendorName: approval?.approvedVendorName || record.approvedVendorName || record.approved_vendor_name || '',
                            paymentTerm: approval?.approvedPaymentTerm || record.approvedPaymentTerm || record.approved_payment_term || '',
                            specifications: record.specifications || '',
                        };
                    });

                    setTableData(tableData);
                }
            } catch (error: any) {
                console.error('Error fetching data from Supabase:', error);
            } finally {
                setDataLoading(false);
            }
        };

        fetchData();
    }, []);

    // Creating table columns with compact Product column
    const columns: ColumnDef<PendingIndentsData>[] = [
        {
            accessorKey: 'date',
            header: 'Date',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'indentNo',
            header: 'Indent Number',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ getValue }) => (
                <div className="max-w-[120px] break-words whitespace-normal px-1 text-sm">
                    {getValue() as string}
                </div>
            ),
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity',
            cell: ({ getValue }) => <div className="px-2">{getValue() as number}</div>
        },
        {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => (
                <div className="px-2">
                    &#8377;{row.original.rate}
                </div>
            ),
        },
        {
            accessorKey: 'uom',
            header: 'UOM',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'vendorName',
            header: 'Vendor Name',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'paymentTerm',
            header: 'Payment Term',
            cell: ({ getValue }) => <div className="px-2">{getValue() as string}</div>
        },
        {
            accessorKey: 'specifications',
            header: 'Specifications',
            cell: ({ getValue }) => (
                <div className="max-w-[150px] break-words whitespace-normal px-2 text-sm">
                    {getValue() as string}
                </div>
            ),
        },
    ];

    return (
        <div>
            <Heading heading="Pending POs" subtext="View pending purchase orders">
                <ListTodo size={50} className="text-primary" />
            </Heading>
            <DataTable
                data={tableData}
                columns={columns}
                searchFields={['indentNo', 'date', 'product', 'vendorName', 'paymentTerm', 'specifications']}
                dataLoading={dataLoading}
                className="h-[80dvh]"
            />
        </div>
    );
};