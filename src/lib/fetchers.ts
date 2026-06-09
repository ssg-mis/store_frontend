import { type IndentSheet, type ReceivedSheet, type UserPermissions, type PoMasterSheet, type QuotationHistorySheet, type Sheet, type SheetData, type MasterConfigSheet } from '@/types/sheets';
import type {
    InventorySheet,
    Vendor,
} from '@/types/sheets';
import { dataStore, getNextId } from './dummyData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const stored = localStorage.getItem('auth');
    let token = '';
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed.token) token = parsed.token;
        } catch (e) {}
    }
    const headers = new Headers(init?.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(input, { ...init, headers, cache: 'no-store' });
    
    if (response.status === 401) {
        localStorage.removeItem('auth');
        window.location.href = '/login';
    }
    
    return response;
}

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
    const formData = new FormData();
    // Append text fields FIRST so multer can access them in req.body
    if (folderId) formData.append('folderId', folderId);
    if (email) formData.append('email', email);
    formData.append('file', file);

    try {
        const response = await apiFetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
}

export async function fetchIndentMasterData() {
    try {
        const [deptsRes, headsRes, firmsRes, inventoryRes, productGroupsRes] = await Promise.all([
            apiFetch(`${API_BASE_URL}/departments`),
            apiFetch(`${API_BASE_URL}/department-heads`),
            apiFetch(`${API_BASE_URL}/firms`),
            apiFetch(`${API_BASE_URL}/inventory`),
            apiFetch(`${API_BASE_URL}/product-groups`),
        ]);

        const deptsData = deptsRes.ok ? await deptsRes.json() : [];
        const headsData = headsRes.ok ? await headsRes.json() : [];
        const firmsData = firmsRes.ok ? await firmsRes.json() : [];
        const inventoryData: any[] = inventoryRes.ok ? await inventoryRes.json() : [];
        const productGroupsData: { product_group_id: number; product_group_name: string; isActive?: boolean }[] =
            productGroupsRes.ok ? await productGroupsRes.json() : [];

        // Only include active records in dropdowns
        const activeDepts = deptsData.filter((d: any) => d.isActive !== false);
        const activeHeads = headsData.filter((h: any) => h.isActive !== false);
        const activeFirms = firmsData.filter((f: any) => f.isActive !== false);

        const firms = activeFirms.map((f: any) => f.firm_name).filter(Boolean) as string[];
        const departments = activeDepts.map((d: any) => d.name) as string[];
        const allDepartmentHeads = activeHeads.map((h: any) => h.name) as string[];

        // Build bidirectional dept ↔ head lookup from Inventory records
        const departmentToHead: Record<string, string> = {};
        const headToDepartment: Record<string, string> = {};
        inventoryData.forEach((d: any) => {
            const dep = d.department;
            const dh = d.departmentHead;
            if (dep && dep !== 'N/A' && dh) {
                departmentToHead[dep] = dh;
                headToDepartment[dh] = dep;
            }
        });

        // Build product lists and UOM lookup per department head from Inventory
        const departmentHeadItems: Record<string, string[]> = {};
        const uomLookup: Record<string, Record<string, string>> = {};
        allDepartmentHeads.forEach((dh: string) => {
            const itemsInDh = inventoryData.filter((d: any) => d.departmentHead === dh);
            departmentHeadItems[dh] = [...new Set(itemsInDh.map((d: any) => d.itemName).filter(Boolean))] as string[];
            uomLookup[dh] = {};
            itemsInDh.forEach((d: any) => {
                if (d.itemName && d.uom && d.uom !== '-') uomLookup[dh][d.itemName] = d.uom;
            });
        });

        // Build item → category map from Inventory
        const itemToCategory: Record<string, string> = {};
        inventoryData.forEach((d: any) => {
            if (d.itemName && d.itemCategoryName) {
                itemToCategory[d.itemName] = d.itemCategoryName;
            }
        });

        // Build item ↔ group lookups from Inventory productGroups JSON
        const itemToGroups: Record<string, { id: number; name: string }[]> = {};
        const groupToItems: Record<number, string[]> = {};
        inventoryData.forEach((d: any) => {
            if (!d.itemName) return;
            const groups: { id: number; name: string }[] = Array.isArray(d.productGroups) ? d.productGroups : [];
            itemToGroups[d.itemName] = groups;
            groups.forEach((g) => {
                if (!groupToItems[g.id]) groupToItems[g.id] = [];
                if (!groupToItems[g.id].includes(d.itemName)) groupToItems[g.id].push(d.itemName);
            });
        });

        const allProductGroups = productGroupsData
            .filter(g => g.isActive !== false)
            .map(g => ({ id: g.product_group_id, name: g.product_group_name }));

        return {
            departments,
            createGroupHeads: allDepartmentHeads,
            groupHeadItems: departmentHeadItems,
            uomLookup,
            firms,
            departmentToGroupHead: departmentToHead,
            groupHeadToDepartment: headToDepartment,
            itemToCategory,
            itemToGroups,
            groupToItems,
            allProductGroups,
        };
    } catch (error) {
        console.error('Error fetching indent master data:', error);
        return {
            departments: [],
            createGroupHeads: [],
            groupHeadItems: {},
        };
    }
}

export async function fetchDepartments() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/departments`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching departments:', error);
        return [];
    }
}

export async function postDepartment(name: string, isActive: boolean = true) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/departments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, isActive })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error posting department:', error);
        throw error;
    }
}

export async function updateDepartment(id: number, data: { name?: string; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/departments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update department');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating department:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchDepartmentHeads() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/department-heads`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching department heads:', error);
        return [];
    }
}

export async function postDepartmentHead(name: string, isActive: boolean = true) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/department-heads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, isActive })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error posting department head:', error);
        throw error;
    }
}

export async function updateDepartmentHead(id: number, data: { name?: string; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/department-heads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update department head');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating department head:', error);
        return { success: false, error: error.message };
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
    pagination?: { from: number; to: number },
    options: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        indentType?: string | string[];
        abortSignal?: AbortSignal;
    } = {}
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
        'master_data': '/masters',
        'vendor_rate_update': '/vendor-rate-updates',
        'three_party_approvals': '/three-party-approvals',
        'three_party_approval': '/three-party-approvals',
        'uom': '/uom',
        'loan': '/loans',
    };

    const endpoint = endpointMap[tableName] || `/${tableName.replace(/_/g, '-')}`;
    
    // Build query string from options
    const queryParams = new URLSearchParams();
    if (options.page) queryParams.append('page', options.page.toString());
    if (options.limit) queryParams.append('limit', options.limit.toString());
    if (options.search) queryParams.append('search', options.search);
    if (options.status) queryParams.append('status', options.status);
    if (options.indentType) {
        if (Array.isArray(options.indentType)) {
            options.indentType.forEach(type => queryParams.append('indentType', type));
        } else {
            queryParams.append('indentType', options.indentType);
        }
    }

    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

    try {
        const response = await apiFetch(url, { signal: options.abortSignal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        let data = await response.json();

        // Handle structural response from paginated backend
        if (data && typeof data === 'object' && !Array.isArray(data) && data.items) {
            // If it's the new format, return as is (but callers might expect array)
            // To ensure compatibility, we'll let the specific views handle the new format
            return data;
        }

        // --- LEGACY LOCAL PROCESSING ---

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
        if ((error as any).name === 'AbortError') return null;
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
        const data = await fetchFromSupabasePaginated('indent', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data) as IndentSheet[];
    }

    if (sheetName === 'PO MASTER') {
        const data = await fetchFromSupabasePaginated('po_master', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data) as PoMasterSheet[];
    }

    if (sheetName === 'RECEIVED') {
        const data = await fetchFromSupabasePaginated('received', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data) as ReceivedSheet[];
    }

    if (sheetName === 'INVENTORY') {
        const data = await fetchFromSupabasePaginated('inventory');
        return toCamelCase(data) as InventorySheet[];
    }

    if (sheetName === 'VENDOR_RATE_UPDATE') {
        const data = await fetchFromSupabasePaginated('vendor_rate_update', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data);
    }

    if (sheetName === 'THREE_PARTY_APPROVAL') {
        const data = await fetchFromSupabasePaginated('three_party_approval', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data);
    }

    if (sheetName === 'APPROVED_INDENT') {
        const data = await fetchFromSupabasePaginated('approved_indent', '*', undefined, undefined, undefined, { limit: 5000 });
        return toCamelCase(data);
    }

    if (sheetName === 'USER') {
        const data = await fetchFromSupabasePaginated('users');
        return toCamelCase(data) as UserPermissions[];
    }

    if (sheetName === 'MASTER') {
        try {
            const masterData = await fetchIndentMasterData();
            const vendors = await fetchVendors();

            return {
                vendors: vendors,
                departments: masterData.departments,
                groupHeads: masterData.groupHeadItems ?? {},   // Required field; mirrors groupHeadItems for legacy consumers
                createGroupHeads: masterData.createGroupHeads,
                groupHeadItems: masterData.groupHeadItems,
                uomLookup: masterData.uomLookup,
                firms: masterData.firms,
                departmentToGroupHead: masterData.departmentToGroupHead,
                groupHeadToDepartment: masterData.groupHeadToDepartment,
                itemToCategory: masterData.itemToCategory,
                paymentTerms: [],
                companyName: 'Shri Shyam Oil Extractions Pvt Ltd',
                companyAddress: 'Banari, Janjgir Champa-495668, Chhattisgarh',
                companyPhone: '+919993023243',
                companyGstin: 'GSTIN123',
                companyPan: 'PAN123',
                billingAddress: 'Billing Address',
                destinationAddress: 'Destination Address',
                defaultTerms: [],
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

export interface BadgeCounts {
    approveIndent: number;
    vendorRateUpdate: number;
    threePartyApproval: number;
    pendingPOs: number;
    receiveItems: number;
    storeOut: number;
    loanOut: number;
}

export async function fetchCounts(): Promise<BadgeCounts | null> {
    try {
        const res = await apiFetch(`${API_BASE_URL}/counts`);
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

export interface InventoryAuditLog {
    id: number;
    createdAt: string;
    action: string;
    quantity: number;
    itemName: string;
    firm?: string;
    department?: string | null;
    departmentHead?: string | null;
    uom?: string | null;
    userName: string;
    indentNumber?: string | null;
    metadata?: Record<string, any>;
}

export async function fetchInventoryAuditLogs(inventoryId: number): Promise<InventoryAuditLog[]> {
    try {
        const response = await apiFetch(`${API_BASE_URL}/inventory/${inventoryId}/audit-logs`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching inventory audit logs:', error);
        return [];
    }
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
        'LOAN': '/loans',
    };

    const endpoint = endpointMap[sheet] || `/${sheet.toLowerCase().replace(/ /g, '-')}`;

    for (const row of data) {
        const method = action === 'update' ? 'PUT' : action === 'delete' ? 'DELETE' : 'POST';
        const url = (action === 'update' || action === 'delete') && (row as any).id
            ? `${API_BASE_URL}${endpoint}/${(row as any).id}`
            : `${API_BASE_URL}${endpoint}`;

        console.log(`[postToSheet] Calling ${method} ${url} for ${sheet}`, row);

        try {
            const response = await apiFetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(row) // Send as-is (camelCase)
            });
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || errorText;
                } catch (e) {}
                throw new Error(errorMessage);
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
        const response = await apiFetch(`${API_BASE_URL}/indents/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error: any) {
        console.error(`Error approving indent ${id}:`, error);
        return { success: false, error: error.message };
    }
}

export async function fetchUOMs() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/uom`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching UOMs:', error);
        return [];
    }
}

export async function postToUOM(
    uomName: string,
    isActive: boolean = true,
    additionalUoms: { uom_name: string; conversionToBase: number }[] = []
) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/uom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uom_name: uomName, isActive, additionalUoms })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create UOM');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error creating UOM:', error);
        return { success: false, error: error.message };
    }
}

export async function postUOMConversion(id: number, data: { uom_name: string; conversionToBase: number; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/uom/${id}/conversions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create UOM conversion');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error creating UOM conversion:', error);
        return { success: false, error: error.message };
    }
}

export async function updateUOM(id: number, data: { uom_name?: string; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/uom/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update UOM');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating UOM:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteUOM(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/uom/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete UOM');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting UOM:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchFirms() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/firms`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching firms:', error);
        return [];
    }
}

export async function postToFirm(data: any) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/firms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create firm');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error creating firm:', error);
        return { success: false, error: error.message };
    }
}

export async function updateFirm(id: number, data: any) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/firms/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update firm');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating firm:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchAreaOfUse() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/area-of-use`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as { area_of_use_id: number; area_of_use_name: string }[];
    } catch (error) {
        console.error('Error fetching area of use:', error);
        return [];
    }
}

export async function postAreaOfUse(name: string) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/area-of-use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ area_of_use_name: name })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create area of use');
        }
        return { success: true, data: await response.json() as { area_of_use_id: number; area_of_use_name: string } };
    } catch (error: any) {
        console.error('Error creating area of use:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchProductCategories() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-categories`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as { product_category_id: number; product_category_name: string; isActive?: boolean; specifications?: { id: number; name: string }[]; productSubCategories?: { product_sub_category_id: number; product_sub_category_name: string; isActive: boolean }[] }[];
    } catch (error) {
        console.error('Error fetching product categories:', error);
        return [];
    }
}

export async function postProductCategory(name: string, isActive: boolean = true, specificationIds?: number[]) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_category_name: name, isActive, specificationIds: specificationIds ?? [] })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create product category');
        }
        return { success: true, data: await response.json() as { product_category_id: number; product_category_name: string; isActive?: boolean; specifications?: { id: number; name: string }[] } };
    } catch (error: any) {
        console.error('Error creating product category:', error);
        return { success: false, error: error.message };
    }
}

export async function updateProductCategory(id: number, data: { product_category_name?: string; isActive?: boolean; specificationIds?: number[] }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update product category');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating product category:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteProductCategory(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-categories/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete product category');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting product category:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchProductGroups() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-groups`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as { product_group_id: number; product_group_name: string; isActive?: boolean }[];
    } catch (error) {
        console.error('Error fetching product groups:', error);
        return [];
    }
}

export async function postProductGroup(name: string, isActive: boolean = true) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_group_name: name, isActive })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create product group');
        }
        return { success: true, data: await response.json() as { product_group_id: number; product_group_name: string; isActive?: boolean } };
    } catch (error: any) {
        console.error('Error creating product group:', error);
        return { success: false, error: error.message };
    }
}

export async function updateProductGroup(id: number, data: { product_group_name?: string; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update product group');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating product group:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteProductGroup(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-groups/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete product group');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting product group:', error);
        return { success: false, error: error.message };
    }
}

export type ProductSubCategoryRow = {
    product_sub_category_id: number;
    product_sub_category_name: string;
    isActive?: boolean;
    productCategoryId?: number | null;
    productCategory?: { product_category_id: number; product_category_name: string } | null;
    specifications?: { id: number; name: string }[];
};

export async function fetchProductSubCategories() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-sub-categories`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as ProductSubCategoryRow[];
    } catch (error) {
        console.error('Error fetching product sub categories:', error);
        return [];
    }
}

export async function postProductSubCategory(name: string, isActive: boolean = true, productCategoryId?: number | null, specificationIds?: number[]) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-sub-categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_sub_category_name: name, isActive, productCategoryId: productCategoryId ?? null, specificationIds: specificationIds ?? [] })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create product sub category');
        }
        return { success: true, data: await response.json() as ProductSubCategoryRow };
    } catch (error: any) {
        console.error('Error creating product sub category:', error);
        return { success: false, error: error.message };
    }
}

export async function updateProductSubCategory(id: number, data: { product_sub_category_name?: string; isActive?: boolean; productCategoryId?: number | null; specificationIds?: number[] }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-sub-categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update product sub category');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating product sub category:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteProductSubCategory(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/product-sub-categories/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete product sub category');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting product sub category:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteDepartment(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/departments/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete department');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting department:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteDepartmentHead(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/department-heads/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete department head');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting department head:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchSpecifications() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/specifications`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching specifications:', error);
        return [];
    }
}

export async function postSpecification(name: string, isActive: boolean = true) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/specifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, isActive })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error posting specification:', error);
        throw error;
    }
}

export async function updateSpecification(id: number, data: { name?: string; isActive?: boolean }) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/specifications/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update specification');
        }
        return { success: true, data: await response.json() };
    } catch (error: any) {
        console.error('Error updating specification:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteSpecification(id: number) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/specifications/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete specification');
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting specification:', error);
        return { success: false, error: error.message };
    }
}

export async function fetchUsers() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/users`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as { id: number; name: string; username: string }[];
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}
