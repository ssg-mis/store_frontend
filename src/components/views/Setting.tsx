import { Eye, EyeClosed, MoreHorizontal, Pencil, Settings, Trash, UserPlus } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState } from 'react';
import { fetchFirms, fetchSheet, postToSheet } from '@/lib/fetchers';
import { allPermissionKeys, type UserPermissions } from '@/types/sheets';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../element/DataTable';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/context/AuthContext';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../ui/form';
import { PuffLoader as Loader } from 'react-spinners';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { Pill } from '../ui/pill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface UsersTableData {
    id?: number;
    username: string;
    name: string;
    password: string;
    contactNumber?: string;
    role: string;
    modifyAccess: 'EDIT' | 'VIEW';
    permissions: string[];
    firmAccess: string[];
    pageModifyAccess: Record<string, 'EDIT' | 'VIEW'>;
}

// Pages that support per-page modify access override
const PAGE_MODIFY_ITEMS = [
    { key: 'inventory',          label: 'Inventory' },
    { key: 'createIndent',       label: 'Create Indent' },
    { key: 'approveIndent',      label: 'Approve Indent' },
    { key: 'vendorRateUpdate',   label: 'Vendor Rate Update' },
    { key: 'threePartyApproval', label: 'Multi-Party Approval' },
    { key: 'pendingPos',         label: 'Pending for PO' },
    { key: 'createPo',           label: 'Create PO' },
    { key: 'poMaster',           label: 'PO Master' },
    { key: 'receiveItems',       label: 'Receive Items' },
    { key: 'storeOutApproval',   label: 'Store Out / Approval' },
    { key: 'quotation',          label: 'Quotation' },
    { key: 'masterData',         label: 'Master Data' },
    { key: 'statusOfPo',         label: 'Status of PO' },
];

const permissionLabels: Record<(typeof allPermissionKeys)[number], string> = {
    administrate: 'Administration',
    createIndent: 'Create Indent',
    allIndent: 'All Indent',
    createPo: 'Create PO',
    indentApprovalView: 'Approve Indent',
    indentApprovalAction: 'Approve Indent - Action',
    updateVendorView: 'Vendor Rate Update',
    updateVendorAction: 'Vendor Rate Update - Action',
    threePartyApprovalView: 'Multi-Party Approval',
    threePartyApprovalAction: 'Multi-Party Approval - Action',
    receiveItemView: 'Receive Items',
    receiveItemAction: 'Receive Items - Action',
    storeOutApprovalView: 'Store Out / Approval',
    storeOutApprovalAction: 'Store Out / Approval - Action',
    quotation: 'Quotation',
    pendingIndentsView: 'Pending for PO',
    poApprovalView: 'Approval of PO',
    ordersView: 'PO History',
    poMaster: 'PO Master',
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    masterData: 'Master Data',
    setting: 'Setting',
    statusOfPo: 'Status of PO',
};

export default () => {
    const { user: currentUser } = useAuth();

    const [tableData, setTableData] = useState<UsersTableData[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UsersTableData | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [firmsList, setFirmsList] = useState<string[]>([]);

    useEffect(() => {
        if (!openDialog) {
            setSelectedUser(null);
        }
    }, [openDialog]);

    function fetchUser() {
        setDataLoading(true);
        fetchSheet('USER').then((res) => {
            setTableData(
                (res as any[]).map((user) => {
                    const permissionKeys = Object.keys(user).filter(
                        (key) => allPermissionKeys.includes(key as any) && (user[key] === true || user[key] === 'TRUE')
                    );

                    let extractedFirmAccess = [];
                    if (Array.isArray(user.firmAccess)) extractedFirmAccess = user.firmAccess;
                    else if (typeof user.firmAccess === 'string') {
                        try { extractedFirmAccess = JSON.parse(user.firmAccess); } catch (e) {}
                    } else if (Array.isArray(user.firms)) extractedFirmAccess = user.firms;
                    else if (typeof user.firms === 'string') {
                        try { extractedFirmAccess = JSON.parse(user.firms); } catch (e) {}
                    }

                    const extractedPageModifyAccess: Record<string, 'EDIT' | 'VIEW'> =
                        user.pageModifyAccess && typeof user.pageModifyAccess === 'object'
                            ? (user.pageModifyAccess as Record<string, 'EDIT' | 'VIEW'>)
                            : {};

                    return {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        password: user.password,
                        contactNumber: user.contactNumber || user.contact_number || '',
                        role: user.role || 'USER',
                        modifyAccess: (String(user.modifyAccess || user.modify_access || 'EDIT').toUpperCase() === 'VIEW' ? 'VIEW' : 'EDIT'),
                        permissions: permissionKeys,
                        firmAccess: extractedFirmAccess,
                        pageModifyAccess: extractedPageModifyAccess,
                    };
                })
            );
            setDataLoading(false);
        });
    }

    useEffect(() => {
        fetchUser();
        fetchFirms().then(res => setFirmsList(res.map(f => f.firm_name)));
    }, []);

    const columns: ColumnDef<UsersTableData>[] = [
        { accessorKey: 'username', header: 'Username' },
        { accessorKey: 'name', header: 'Name' },
        {
            accessorKey: 'contactNumber',
            header: 'Contact No.',
            cell: ({ row }) => (
                <span className="font-mono text-sm text-foreground/90">
                    {row.original.contactNumber || '-'}
                </span>
            ),
        },
        {
            accessorKey: 'role',
            header: 'Role',
            cell: ({ row }) => (
                <Pill className={row.original.role === 'ADMIN' ? 'bg-primary/10 text-primary' : ''}>
                    {row.original.role}
                </Pill>
            ),
        },
        {
            accessorKey: 'permissions',
            header: 'Permissions',
            cell: ({ row }) => {
                const user = row.original;
                return (
                    <div className="grid place-items-center">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => {
                                setSelectedUser(user);
                                setOpenDialog(true);
                            }}
                        >
                            <Eye className="w-3 h-3 mr-1.5" />
                            View Permissions
                        </Button>
                    </div>
                );
            },
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                const user = row.original;

                return (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                                setSelectedUser(user);
                                setOpenDialog(true);
                            }}
                        >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={async () => {
                                if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
                                    try {
                                        await postToSheet(
                                            [{ id: user.id }],
                                            'delete',
                                            'USER'
                                        );
                                        toast.success(`Deleted ${user.name} successfully`);
                                        setTimeout(fetchUser, 1000);
                                    } catch {
                                        toast.error('Failed to delete user');
                                    }
                                }
                            }}
                        >
                            <Trash className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];

    const schema = z.object({
        name: z.string().nonempty(),
        username: z.string().nonempty(),
        password: z.string().nonempty(),
        contactNumber: z
            .string()
            .regex(/^\d*$/, 'Contact number must contain only numbers')
            .max(12, 'Contact number cannot exceed 12 digits')
            .optional(),
        role: z.string().default('USER'),
        modifyAccess: z.enum(['EDIT', 'VIEW']).default('EDIT'),
        permissions: z.array(z.string()),
        firmAccess: z.array(z.string()).default([]),
        pageModifyAccess: z.record(z.enum(['EDIT', 'VIEW'])).default({}),
    });

    const form = useForm({ resolver: zodResolver(schema) });

    useEffect(() => {
        if (selectedUser) {
            form.reset({
                username: selectedUser.username,
                name: selectedUser.name,
                password: selectedUser.password,
                contactNumber: selectedUser.contactNumber || '',
                role: selectedUser.role || 'USER',
                modifyAccess: selectedUser.modifyAccess || 'EDIT',
                permissions: selectedUser.permissions,
                firmAccess: selectedUser.firmAccess || [],
                pageModifyAccess: selectedUser.pageModifyAccess || {},
            });
            return;
        }
        form.reset({
            username: '',
            name: '',
            password: '',
            contactNumber: '',
            role: 'USER',
            modifyAccess: 'EDIT',
            permissions: [],
            firmAccess: [],
            pageModifyAccess: {},
        });
    }, [selectedUser]);

    async function onSubmit(value: z.infer<typeof schema>) {
        if (
            tableData.map((d) => d.username).includes(value.username) &&
            value.username !== selectedUser?.username
        ) {
            toast.error('Username already exists');
            return;
        }
        if (selectedUser) {
            try {
                const pageAccess: any = {};
                allPermissionKeys.forEach((perm) => {
                    pageAccess[perm] = value.permissions.includes(perm);
                });
                pageAccess.pageModifyAccess = value.pageModifyAccess || {};

                const payload = {
                    id: selectedUser.id,
                    username: value.username,
                    name: value.name,
                    password: value.password,
                    contactNumber: value.contactNumber || '',
                    role: value.role,
                    modifyAccess: 'EDIT',
                    pageAccess,
                    firmAccess: value.firmAccess,
                };

                await postToSheet([payload as any], 'update', 'USER');
                setOpenDialog(false);
                setTimeout(fetchUser, 1000);
                toast.success('Updated user settings');
            } catch {
                toast.error('Failed to update user settings');
            }
            return;
        }
        try {
            const pageAccess: any = {};
            allPermissionKeys.forEach((perm) => {
                pageAccess[perm] = value.permissions.includes(perm);
            });
            pageAccess.pageModifyAccess = value.pageModifyAccess || {};

            const payload = {
                username: value.username,
                name: value.name,
                password: value.password,
                contactNumber: value.contactNumber || '',
                role: value.role,
                modifyAccess: value.modifyAccess,
                pageAccess,
                firmAccess: value.firmAccess,
            };

            await postToSheet([payload as any], 'insert', 'USER');
            setOpenDialog(false);
            setTimeout(fetchUser, 1000);
            toast.success('Created user successfully');
        } catch {
            toast.error('Failed to update user settings');
        }
    }

    function onError(e: any) {
        console.log(e);
        toast.error('Please fill all required fields');
    }

    return (
        <div className="space-y-6">
            <Heading
                heading="Settings"
                subtext="Manage system configuration and user access"
            >
                <Settings size={50} className="text-primary" />
            </Heading>

            <Dialog open={openDialog} onOpenChange={(open) => setOpenDialog(open)}>
                <DataTable
                    data={tableData}
                    columns={columns}
                    searchFields={['name', 'username', 'contactNumber', 'permissions']}
                    dataLoading={dataLoading}
                    className="h-[60dvh]"
                    extraActions={
                        <Button
                            className="h-9"
                            onClick={() => {
                                setOpenDialog(true);
                                setSelectedUser(null);
                            }}
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Create User
                        </Button>
                    }
                />

                <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-7">
                            <DialogHeader className="space-y-1">
                                <DialogTitle className="text-lg">
                                    {selectedUser ? 'Edit' : 'Create'} User Access
                                </DialogTitle>
                            </DialogHeader>
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="username"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Username</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter username" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Enter name of user"
                                                    {...field}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Enter password"
                                                        {...field}
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        type="button"
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent active:bg-transparent"
                                                        tabIndex={-1}
                                                        onMouseDown={(e) => {
                                                             e.preventDefault();
                                                             setShowPassword(!showPassword);
                                                        }}
                                                    >
                                                        {showPassword ? <EyeClosed /> : <Eye />}
                                                        <span className="sr-only">
                                                            Toggle password visibility
                                                        </span>
                                                    </Button>
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="contactNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Contact Number</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="tel"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={12}
                                                    placeholder="Enter contact number (max 12 digits)"
                                                    value={field.value || ''}
                                                    onChange={(e) => {
                                                        const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 12);
                                                        field.onChange(onlyDigits);
                                                    }}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="role"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select role" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="USER">USER</SelectItem>
                                                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="permissions"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-end">
                                            <FormLabel className="text-md">Permissions</FormLabel>
                                            <div className="flex items-center gap-2 pb-1">
                                                <Checkbox
                                                    id="select-all"
                                                    checked={field.value?.length === allPermissionKeys.length}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            field.onChange([...allPermissionKeys]);
                                                        } else {
                                                            field.onChange([]);
                                                        }
                                                    }}
                                                />
                                                <label htmlFor="select-all" className="text-sm font-bold cursor-pointer">
                                                    Select All
                                                </label>
                                            </div>
                                        </div>
                                        <div className="grid md:grid-cols-3 gap-4 p-4 border rounded-sm max-h-[300px] overflow-y-auto">
                                            {allPermissionKeys.map((perm) => (
                                                <FormField
                                                    key={perm}
                                                    control={form.control}
                                                    name="permissions"
                                                    render={() => (
                                                        <FormItem className="flex gap-2">
                                                            <FormControl>
                                                                <Checkbox
                                                                    id={perm}
                                                                    checked={field.value?.includes(
                                                                        perm
                                                                    )}
                                                                    onCheckedChange={(checked) => {
                                                                        const values =
                                                                            field.value || [];
                                                                        checked
                                                                            ? field.onChange([
                                                                                ...values,
                                                                                perm,
                                                                            ])
                                                                            : field.onChange(
                                                                                values.filter(
                                                                                    (p) =>
                                                                                        p !== perm
                                                                                )
                                                                            );
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel
                                                                className="font-light cursor-pointer"
                                                                htmlFor={perm}
                                                            >
                                                                {permissionLabels[perm]}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="pageModifyAccess"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-end">
                                            <FormLabel className="text-md">Page-wise Modify Access</FormLabel>
                                            <button
                                                type="button"
                                                className="text-xs text-muted-foreground underline pb-1"
                                                onClick={() => {
                                                    const reset: Record<string, 'EDIT' | 'VIEW'> = {};
                                                    PAGE_MODIFY_ITEMS.forEach(p => { reset[p.key] = 'VIEW'; });
                                                    field.onChange(reset);
                                                }}
                                            >
                                                Reset all to VIEW
                                            </button>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-3 p-4 border rounded-sm max-h-[240px] overflow-y-auto">
                                            {PAGE_MODIFY_ITEMS.map(page => (
                                                <div key={page.key} className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-light">{page.label}</span>
                                                    <Select
                                                        value={field.value?.[page.key] || 'EDIT'}
                                                        onValueChange={(val) => {
                                                            field.onChange({
                                                                ...field.value,
                                                                [page.key]: val as 'EDIT' | 'VIEW',
                                                            });
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-24 h-7 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="EDIT">EDIT</SelectItem>
                                                            <SelectItem value="VIEW">VIEW</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ))}
                                        </div>
                                    </FormItem>
                                )}
                            />

                        <FormField
                            control={form.control}
                            name="firmAccess"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex justify-between items-end">
                                        <FormLabel className="text-md">Firms Access</FormLabel>
                                        <div className="flex items-center gap-2 pb-1">
                                            <Checkbox
                                                id="select-all-firms"
                                                checked={field.value?.length === firmsList.length && firmsList.length > 0}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        field.onChange([...firmsList]);
                                                    } else {
                                                        field.onChange([]);
                                                    }
                                                }}
                                            />
                                            <label htmlFor="select-all-firms" className="text-sm font-bold cursor-pointer">
                                                Select All
                                            </label>
                                        </div>
                                    </div>
                                    <div className="grid md:grid-cols-3 gap-4 p-4 border rounded-sm max-h-[200px] overflow-y-auto">
                                        {firmsList.map((firm) => (
                                            <FormItem key={firm} className="flex gap-2">
                                                <FormControl>
                                                    <Checkbox
                                                        id={`firm-${firm}`}
                                                        checked={field.value?.includes(firm)}
                                                        onCheckedChange={(checked) => {
                                                            const values = field.value || [];
                                                            checked
                                                                ? field.onChange([...values, firm])
                                                                : field.onChange(values.filter((f: string) => f !== firm));
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormLabel
                                                    className="font-light cursor-pointer"
                                                    htmlFor={`firm-${firm}`}
                                                >
                                                    {firm}
                                                </FormLabel>
                                            </FormItem>
                                        ))}
                                    </div>
                                </FormItem>
                            )}
                        />    <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Close</Button>
                                </DialogClose>

                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting && (
                                        <Loader
                                            size={20}
                                            color="white"
                                            aria-label="Loading Spinner"
                                        />
                                    )}
                                    {selectedUser ? 'Save' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
};
