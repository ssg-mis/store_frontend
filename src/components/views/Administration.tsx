import { Eye, EyeClosed, MoreHorizontal, Pencil, ShieldUser, Trash, UserPlus } from 'lucide-react';
import Heading from '../element/Heading';
import { useEffect, useState } from 'react';
import { fetchSheet, postToSheet } from '@/lib/fetchers';
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

interface UsersTableData {
    username: string;
    name: string;
    password: string;
    permissions: string[];
    rowIndex: number;
}

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

    useEffect(() => {
        if (!openDialog) {
            setSelectedUser(null);
        }
    }, [openDialog]);

    function fetchUser() {
        setDataLoading(true);
        fetchSheet('USER').then((res) => {
            setTableData(
                (res as UserPermissions[]).map((user) => {
                    const permissionKeys = Object.keys(user).filter(
                        (key): key is keyof UserPermissions =>
                            !['username', 'password', 'name', 'rowIndex'].includes(key) &&
                            user[key as keyof UserPermissions] === true
                    );

                    return {
                        username: user.username,
                        name: user.name,
                        password: user.password,
                        permissions: permissionKeys,
                        rowIndex: user.rowIndex,
                    };
                })
            );
            setDataLoading(false);
        });
    }

    useEffect(() => {
        fetchUser();
    }, []);

    const columns: ColumnDef<UsersTableData>[] = [
        { accessorKey: 'username', header: 'Username' },
        { accessorKey: 'name', header: 'Name' },
        {
            accessorKey: 'permissions',
            header: 'Permissions',
            cell: ({ row }) => {
                const permissions = row.original.permissions;
                return (
                    <div className="grid place-items-center">
                        <div className="flex flex-wrap gap-1">
                            {permissions.slice(0, 2).map((perm, i) => (
                                <Pill key={i}>{permissionLabels[perm as (typeof allPermissionKeys)[number]] || perm}</Pill>
                            ))}
                            {permissions.length > 2 && (
                                <HoverCard>
                                    <HoverCardTrigger>
                                        <Pill>...</Pill>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="min-w-4 max-w-100 flex flex-wrap gap-1 bg-background">
                                        {permissions.map((perm, i) => (
                                            <Pill key={i}>{permissionLabels[perm as (typeof allPermissionKeys)[number]] || perm}</Pill>
                                        ))}
                                    </HoverCardContent>
                                </HoverCard>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const user = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            asChild
                            disabled={
                                user.username === 'admin' || user.username === currentUser.username
                            }
                        >
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-6 w-6" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => {
                                    setSelectedUser(user);
                                    setOpenDialog(true);
                                }}
                            >
                                <Pencil /> Edit Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={async () => {
                                    try {
                                        if (user.username === 'admin') {
                                            throw new Error();
                                        }
                                        await postToSheet(
                                            [{ rowIndex: user.rowIndex }],
                                            'delete',
                                            'USER'
                                        );
                                        toast.success(`Deleted ${user.name} successfully`);
                                        setTimeout(fetchUser, 1000);
                                    } catch {
                                        toast.error('Failed to delete user');
                                    }
                                }}
                            >
                                <Trash className="text-destructive" /> Delete User
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    const schema = z.object({
        name: z.string().nonempty(),
        username: z.string().nonempty(),
        password: z.string().nonempty(),
        permissions: z.array(z.string()),
    });

    const form = useForm({ resolver: zodResolver(schema) });

    useEffect(() => {
        if (selectedUser) {
            form.reset({
                username: selectedUser.username,
                name: selectedUser.name,
                password: selectedUser.password,
                permissions: selectedUser.permissions,
            });
            return;
        }
        form.reset();
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
                const row: Partial<UserPermissions> = {
                    rowIndex: selectedUser.rowIndex,
                    username: value.username,
                    name: value.name,
                    password: value.password,
                };

                allPermissionKeys.forEach((perm) => {
                    row[perm] = value.permissions.includes(perm);
                });

                await postToSheet([row], 'update', 'USER');
                setOpenDialog(false);
                setTimeout(fetchUser, 1000);
                toast.success('Updated user settings');
            } catch {
                toast.error('Failed to update user settings');
            }
            return;
        }
        try {
            const row: Partial<UserPermissions> = {
                username: value.username,
                name: value.name,
                password: value.password,
            };

            allPermissionKeys.forEach((perm) => {
                row[perm] = value.permissions.includes(perm);
            });

            await postToSheet([row], 'insert', 'USER');
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
        <div>
            <Dialog open={openDialog} onOpenChange={(open) => setOpenDialog(open)}>
                <div>
                    <Heading
                        heading="Administration"
                        subtext="Manage permissions and user for the app"
                    >
                        <ShieldUser size={50} className="text-primary" />
                    </Heading>

                    <DataTable
                        data={tableData}
                        columns={columns}
                        searchFields={['name', 'username', 'permissions']}
                        dataLoading={dataLoading}
                        className="h-[80dvh]"
                    >
                        <Button
                            className="h-full w-40"
                            onClick={() => {
                                setOpenDialog(true);
                                setSelectedUser(null);
                            }}
                        >
                            <UserPlus />
                            Create User
                        </Button>
                    </DataTable>
                </div>

                <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-7">
                            <DialogHeader className="space-y-1">
                                <DialogTitle className="text-lg">
                                    {selectedUser ? 'Edit' : 'Create'} User
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
                            </div>
                            <FormField
                                control={form.control}
                                name="permissions"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-md">Permissions</FormLabel>
                                        <div className="grid md:grid-cols-3 gap-4 p-4 border rounded-sm">
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
                                                                className="font-light"
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
                            <DialogFooter>
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
