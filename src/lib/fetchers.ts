import { type IndentSheet, type ReceivedSheet, type UserPermissions, type PoMasterSheet, type QuotationHistorySheet, type Sheet, type SheetData, type MasterConfigSheet } from '@/types/sheets';
import type {
    InventorySheet,
    Vendor,
} from '@/types/sheets';
import { dataStore, getNextId } from './dummyData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Helper to convert snake_case keys to camelCase
export function toCamelCase(obj: any): any {
    // Safety guard for null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((v) => toCamelCase(v));
    } else if (typeof obj === 'object' && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            // actual_7 -> actual7, indent_number -> indentNumber
            const camelKey = key.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            return {
                ...result,
                [camelKey]: toCamelCase(obj[key]),
            };
        }, {});
    }
    return obj;
}

function toSnakeCase(obj: any): any {
    // Safety guard for null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((v) => toSnakeCase(v));
    } else if (typeof obj === 'object' && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            // If the key is already snake_case, don't change it
            if (key.includes('_')) {
                return { ...result, [key]: toSnakeCase(obj[key]) };
            }
            // camelCase -> snake_case (handles actual7 -> actual_7)
            const snakeKey = key
                .replace(/([A-Z0-9])/g, '_$1')
                .toLowerCase()
                .replace(/^_/, ''); // Remove leading underscore if any
            return {
                ...result,
                [snakeKey]: toSnakeCase(obj[key]),
            };
        }, {});
    }
    return obj;
}

export async function uploadFile(
    file: File,
    folderId: string,
    uploadType: 'upload' | 'email' | 'supabase' = 'upload',
    email?: string
): Promise<string> {
    // Demo mode: return a fake URL
    await new Promise((r) => setTimeout(r, 300)); // Simulate upload delay
    return `https://demo.example.com/uploads/${Date.now()}_${file.name}`;
}

export async function fetchIndentMasterData() {
    try {
        const response = await fetch(`${API_BASE_URL}/masters`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const camelData = toCamelCase(data);

        const departments = [...new Set(camelData.map((d: any) => d.department))].filter(Boolean) as string[];
        const groupHeads = [...new Set(camelData.map((d: any) => d.groupHead))].filter(Boolean) as string[];
        const firms = [...new Set(camelData.map((d: any) => d.firmName))].filter(Boolean) as string[];

        const groupHeadItems: Record<string, string[]> = {};
        groupHeads.forEach(gh => {
            groupHeadItems[gh] = [...new Set(camelData.filter((d: any) => d.groupHead === gh).map((d: any) => d.itemName))].filter(Boolean) as string[];
        });

        return {
            departments,
            createGroupHeads: groupHeads,
            groupHeadItems,
            firms
        };
    } catch (error) {
        console.error('Error fetching indent master data:', error);
        return {
            departments: [],
            createGroupHeads: [],
            groupHeadItems: {}
        };
    }
}

// Helper to fetch from in-memory dummy data (replaces fetchFromSupabasePaginated)
export async function fetchFromSupabasePaginated(
    tableName: string,
    select: string = '*',
    orderBy: { column: string; options?: { ascending?: boolean } } = {
        column: 'created_at',
        options: { ascending: false },
    },
    queryBuilder?: (query: any) => any,
    pagination?: { from: number; to: number }
) {
    // Map table names to API endpoints
    const endpointMap: Record<string, string> = {
        'indent': '/indents',
        'users': '/users',
        'approved_indent': '/approved-indents',
        'po_master': '/po-masters',
        'received': '/received',
        'inventory': '/inventory',
        'store_out_approval': '/store-out-approvals',
        'get_purchase': '/get-purchases',
        'master_data': '/masters',
        'vendor_rate_update': '/vendor-rate-updates',
        'three_party_approvals': '/three-party-approvals',
        'three_party_approval': '/three-party-approvals',
    };

    const endpoint = endpointMap[tableName] || `/${tableName.replace(/_/g, '-')}`;

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        let data = await response.json();

        // Filter using queryBuilder if provided
        if (queryBuilder) {
            data = queryBuilder(createFakeQuery(data))._data;
        }

        // Sorting
        if (orderBy.column) {
            const asc = orderBy.options?.ascending ?? false;
            const col = toCamelCase(orderBy.column);
            data.sort((a: any, b: any) => {
                const va = a[orderBy.column] ?? a[col] ?? '';
                const vb = b[orderBy.column] ?? b[col] ?? '';
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                return 0;
            });
        }

        // Pagination
        if (pagination) {
            data = data.slice(pagination.from, pagination.to + 1);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return [];
    }
}

// Simple fake query builder to support .not(), .eq(), .or() chains
function createFakeQuery(data: any[]) {
    const q: any = {
        _data: data,
        not(column: string, op: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            const getVal = (row: any) => row[column] ?? row[camelColumn];

            if (op === 'is') {
                if (value === null) {
                    q._data = q._data.filter(
                        (row: any) => {
                            const val = getVal(row);
                            return val !== null && val !== undefined && val !== '';
                        }
                    );
                } else {
                    q._data = q._data.filter((row: any) => getVal(row) !== value);
                }
            } else if (op === 'eq') {
                q._data = q._data.filter((row: any) => getVal(row) !== value);
            }
            return q;
        },
        is(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            const getVal = (row: any) => row[column] ?? row[camelColumn];

            if (value === null) {
                q._data = q._data.filter(
                    (row: any) => {
                        const val = getVal(row);
                        return val === null || val === undefined || val === '';
                    }
                );
            } else {
                q._data = q._data.filter((row: any) => getVal(row) === value);
            }
            return q;
        },
        in(column: string, values: any[]) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => values.includes(row[column] ?? row[camelColumn]));
            return q;
        },
        gt(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) > value);
            return q;
        },
        lt(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) < value);
            return q;
        },
        gte(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) >= value);
            return q;
        },
        lte(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) <= value);
            return q;
        },
        like(column: string, pattern: string) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i');
            q._data = q._data.filter((row: any) => regex.test(String(row[column] ?? row[camelColumn])));
            return q;
        },
        ilike(column: string, pattern: string) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i');
            q._data = q._data.filter((row: any) => regex.test(String(row[column] ?? row[camelColumn])));
            return q;
        },
        eq(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) === value);
            return q;
        },
        neq(column: string, value: any) {
            const camelColumn = column.replace(/([_][a-z0-9])/g, (m) => m[1].toUpperCase());
            q._data = q._data.filter((row: any) => (row[column] ?? row[camelColumn]) !== value);
            return q;
        },
        or(expr: string) {
            // Simple parser for "col.is.null,col.eq." type expressions
            // Just return data as-is for demo
            return q;
        },
        order(column: string, options?: { ascending?: boolean }) {
            const asc = options?.ascending ?? false;
            q._data.sort((a: any, b: any) => {
                if (a[column] < b[column]) return asc ? -1 : 1;
                if (a[column] > b[column]) return asc ? 1 : -1;
                return 0;
            });
            return q;
        },
        select(cols: string) {
            return q;
        },
        range(from: number, to: number) {
            q._data = q._data.slice(from, to + 1);
            return q;
        },
    };
    return q;
}

export async function fetchSheet(
    sheetName: Sheet
): Promise<
    | MasterConfigSheet
    | IndentSheet[]
    | ReceivedSheet[]
    | UserPermissions[]
    | PoMasterSheet[]
    | InventorySheet[]
> {
    if (sheetName === 'INDENT') {
        const data = await fetchFromSupabasePaginated('indent');
        return toCamelCase(data) as IndentSheet[];
    }

    if (sheetName === 'PO MASTER') {
        const data = await fetchFromSupabasePaginated('po_master');
        return toCamelCase(data) as PoMasterSheet[];
    }

    if (sheetName === 'RECEIVED') {
        const data = await fetchFromSupabasePaginated('received');
        return toCamelCase(data) as ReceivedSheet[];
    }

    if (sheetName === 'INVENTORY') {
        const data = await fetchFromSupabasePaginated('inventory');
        return toCamelCase(data) as InventorySheet[];
    }

    if (sheetName === 'GET_PURCHASE' || sheetName === 'GET PURCHASE') {
        const data = await fetchFromSupabasePaginated('get_purchase');
        return toCamelCase(data);
    }

    if (sheetName === 'VENDOR_RATE_UPDATE') {
        const data = await fetchFromSupabasePaginated('vendor_rate_update');
        return toCamelCase(data);
    }

    if (sheetName === 'THREE_PARTY_APPROVAL') {
        const data = await fetchFromSupabasePaginated('three_party_approval');
        return toCamelCase(data);
    }

    if (sheetName === 'APPROVED_INDENT') {
        const data = await fetchFromSupabasePaginated('approved_indent');
        return toCamelCase(data);
    }

    if (sheetName === 'USER') {
        const data = await fetchFromSupabasePaginated('users');
        return toCamelCase(data) as UserPermissions[];
    }

    if (sheetName === 'MASTER') {
        try {
            const data = await fetchFromSupabasePaginated('master_data');
            const camelData = toCamelCase(data);
            const vendors = await fetchVendors();

            // For now, return the first row as config or a default object
            // Ideally, we'd have a separate config table
            return {
                ...(camelData[0] || {}),
                vendors: vendors,
                departments: [...new Set(camelData.map((d: any) => d.department))].filter(Boolean),
                groupHeads: {},
                paymentTerms: [...new Set(camelData.map((d: any) => d.paymentTerm || d.payment_term))].filter(Boolean),
                companyName: 'Botivate Services LLP',
                companyAddress: 'Default Address',
                companyPhone: '1234567890',
                companyGstin: 'GSTIN123',
                companyPan: 'PAN123',
                billingAddress: 'Billing Address',
                destinationAddress: 'Destination Address',
                defaultTerms: []
            } as MasterConfigSheet;
        } catch (err) {
            console.error('Error fetching MASTER:', err);
            return {} as MasterConfigSheet;
        }
    }

    return [];
}

export async function postToQuotationHistory(rows: any[]) {
    await new Promise((r) => setTimeout(r, 200));
    rows.forEach((row) => {
        dataStore.quotation_history.push({ ...row, id: getNextId() });
    });
    return { success: true };
}

export async function fetchVendors() {
    try {
        const data = await fetchFromSupabasePaginated('master_data');
        if (!data) return [];

        const uniqueVendors = new Map<string, Vendor>();

        data.forEach((row: any) => {
            const name = row.vendor_name;
            if (!name) return;

            const trimmedName = name.trim();
            if (!uniqueVendors.has(trimmedName)) {
                uniqueVendors.set(trimmedName, {
                    vendorName: trimmedName,
                    gstin: row.vendor_gstin || '',
                    address: row.vendor_address || '',
                    email: row.vendor_email || '',
                });
            }
        });

        return Array.from(uniqueVendors.values()).sort((a, b) =>
            a.vendorName.localeCompare(b.vendorName)
        );
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return [];
    }
}

export async function postToSheet(
    data: Partial<SheetData>[],
    action: 'insert' | 'update' | 'delete' | 'insertQuotation' = 'insert',
    sheet: Sheet = 'INDENT'
) {
    const endpointMap: Record<string, string> = {
        'INDENT': '/indents',
        'PO MASTER': '/po-masters',
        'PO_MASTER': '/po-masters',
        'RECEIVED': '/received',
        'INVENTORY': '/inventory',
        'USER': '/users',
        'MASTER': '/masters',
        'GET PURCHASE': '/get-purchases',
        'GET_PURCHASE': '/get-purchases',
        'STORE OUT APPROVAL': '/store-out-approvals',
        'VENDOR_RATE_UPDATE': '/vendor-rate-updates',
        'THREE_PARTY_APPROVAL': '/three-party-approvals',
    };

    const endpoint = endpointMap[sheet] || `/${sheet.toLowerCase().replace(/ /g, '-')}`;

    for (const row of data) {
        const method = action === 'update' ? 'PUT' : action === 'delete' ? 'DELETE' : 'POST';
        const url = (action === 'update' || action === 'delete') && (row as any).id
            ? `${API_BASE_URL}${endpoint}/${(row as any).id}`
            : `${API_BASE_URL}${endpoint}`;

        console.log(`[postToSheet] Calling ${method} ${url} for ${sheet}`, row);

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(row) // Send as-is (camelCase)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
        } catch (error) {
            console.error(`Error ${action}ing ${sheet}:`, error);
            return { success: false, error };
        }
    }

    return { success: true };
}

// Add this new function in fetchers.ts
export async function postToMasterSheet(data: any[]) {
    await new Promise((r) => setTimeout(r, 200));
    data.forEach((row) => {
        dataStore.master.push({ ...row, id: getNextId() });
    });
    return { success: true };
}
export async function approveIndent(id: string | number, data: any) {
    try {
        const response = await fetch(`${API_BASE_URL}/indents/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error approving indent ${id}:`, error);
        return { success: false, error };
    }
}
