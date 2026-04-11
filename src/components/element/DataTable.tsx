'use client';

import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';

import { Button } from '../ui/button';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Input } from '../ui/input';
import { Package } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import { PuffLoader as Loader } from 'react-spinners';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    searchFields?: string[];
    dataLoading?: boolean;
    /** True when a search/filter request is in-flight but we already have data to show */
    isSearching?: boolean;
    children?: ReactNode;
    className?: string;
    extraActions?: ReactNode;
    footer?: ReactNode;
    pagination?: boolean;
    pageSize?: number;
    scrollPagination?: boolean;
    // Server-side props
    onSearchChange?: (search: string) => void;
    onLoadMore?: () => void;
    totalCount?: number;
    isLoadingMore?: boolean;
    currentPage?: number;
    onPageChange?: (page: number) => void;
}

function globalFilterFn<TData>(row: TData, columnIds: string[], filterValue: string) {
    return columnIds.some((columnId) => {
        const value = (row as any)[columnId];
        return String(value ?? '')
            .toLowerCase()
            .includes(filterValue.toLowerCase());
    });
}

export default function DataTable<TData, TValue>({
    columns,
    data,
    searchFields = [],
    dataLoading,
    isSearching = false,
    children: _children,
    className,
    extraActions,
    footer,
    pagination = false,
    pageSize = 10,
    scrollPagination = false,
    onSearchChange,
    onLoadMore,
    totalCount,
    isLoadingMore = false,
    currentPage,
    onPageChange,
}: DataTableProps<TData, TValue>) {
    const [globalFilter, setGlobalFilter] = useState('');
    const sentinelRef = useRef<HTMLDivElement>(null);
    const isFirstRender = useRef(true);

    const isServerSide = !!onSearchChange || !!onLoadMore || !!onPageChange;
    const isStandardPagination = pagination && !scrollPagination;

    // Show full skeleton ONLY on the very first load when there is no data yet
    const showSkeleton = dataLoading && data.length === 0;

    const table = useReactTable({
        data,
        columns,
        initialState: {
            pagination: {
                pageSize: scrollPagination ? 99999 : pageSize,
            },
        },
        getCoreRowModel: getCoreRowModel(),
        // Only use local filtering if not server-side
        getFilteredRowModel: !isServerSide ? getFilteredRowModel() : undefined,
        // Only use local pagination if not server-side & using standard pagination
        getPaginationRowModel: isStandardPagination && !isServerSide ? getPaginationRowModel() : undefined,
        globalFilterFn: (row, _, filterValue) =>
            globalFilterFn(row.original, searchFields, filterValue),

        state: {
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
    });

    // Notify server of search changes — skip on first render to prevent double-fetch on mount
    useEffect(() => {
        if (!isServerSide || !onSearchChange) return;

        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        onSearchChange(globalFilter);
    }, [globalFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // Infinite Scroll via IntersectionObserver
    const handleLoadMore = useCallback(() => {
        if (isServerSide) {
            if (onLoadMore && !isLoadingMore) onLoadMore();
        } else {
            const currentPageSize = table.getState().pagination.pageSize;
            const totalFiltered = table.getFilteredRowModel().rows.length;
            if (currentPageSize < totalFiltered) {
                table.setPageSize(currentPageSize + pageSize);
            }
        }
    }, [isServerSide, onLoadMore, isLoadingMore, table, pageSize]);

    useEffect(() => {
        if (!scrollPagination) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    handleLoadMore();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (sentinelRef.current) {
            observer.observe(sentinelRef.current);
        }

        return () => observer.disconnect();
    }, [scrollPagination, handleLoadMore]);

    const displayedRows = table.getRowModel().rows;
    const totalRecordsCount = isServerSide
        ? (totalCount ?? data.length)
        : table.getFilteredRowModel
        ? table.getFilteredRowModel().rows.length
        : data.length;

    const hasMoreToLoad = isServerSide
        ? data.length < (totalCount ?? 0)
        : false;

    return (
        <div className="px-2 sm:px-5 py-5 grid gap-4 w-full overflow-hidden">
            {/* Top loading bar — shown during search/filter without hiding the table */}
            <div className={cn(
                'h-0.5 w-full rounded-full bg-primary/20 overflow-hidden transition-opacity duration-300',
                (isSearching || (dataLoading && data.length > 0)) ? 'opacity-100' : 'opacity-0'
            )}>
                <div className="h-full bg-primary animate-[progress_1.2s_ease-in-out_infinite] rounded-full" />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-3 mb-2">
                {searchFields.length !== 0 && (
                    <div className="flex items-center w-full sm:w-auto">
                        <Input
                            placeholder={`Search...`}
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="w-full sm:max-w-sm"
                        />
                    </div>
                )}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {extraActions && extraActions}
                </div>
            </div>

            <div className="relative max-w-full min-w-0">
                <ScrollArea
                    className={cn('rounded-sm border h-[74dvh] w-full', className)}
                >
                    <Table containerClassName="overflow-visible" className="min-w-max">
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {showSkeleton ? (
                                // Full skeleton only on the FIRST load when no data exists yet
                                Array.from({ length: 15 }).map((_, i) => (
                                    <TableRow
                                        key={`skeleton-${i}`}
                                        className="p-1 hover:bg-transparent"
                                    >
                                        {columns.map((_, j) => (
                                            <TableCell key={`skeleton-cell-${j}`}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : displayedRows?.length ? (
                                displayedRows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && 'selected'}
                                        className="p-1"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-50 text-center text-xl"
                                    >
                                        <div className="flex flex-col justify-center items-center w-full gap-1">
                                            <Package className="text-gray-400" size={50} />
                                            <p className="text-muted-foreground font-semibold">
                                                No Records Found.
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                            {/* Infinite scroll sentinel — always mounted so observer can watch it */}
                            {scrollPagination && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={columns.length} className="p-0 border-0 h-12">
                                        <div
                                            ref={sentinelRef}
                                            className="w-full h-12 flex justify-center items-center"
                                        >
                                            {isLoadingMore && (
                                                <Loader size={22} color="#F97316" />
                                            )}
                                            {!isLoadingMore && !hasMoreToLoad && data.length > 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    All {totalRecordsCount} records loaded
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </div>
            {(pagination || scrollPagination) && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 px-2">
                    <div className="text-sm text-muted-foreground order-2 sm:order-1">
                        {isSearching ? (
                            <span className="italic">Searching database…</span>
                        ) : (
                            <>
                                Showing <span className="font-semibold">{data.length}</span> of{' '}
                                <span className="font-semibold">{totalRecordsCount}</span> records
                                {isServerSide && globalFilter && ` (filtered)`}
                            </>
                        )}
                    </div>
                    {isStandardPagination && (() => {
                        const isServer = isServerSide && !!onPageChange;
                        const currentPageValue = isServer ? (currentPage ?? 1) : table.getState().pagination.pageIndex + 1;
                        const pageCountValue = isServer ? Math.ceil((totalCount ?? 0) / pageSize) : table.getPageCount();

                        const handlePrevPage = () => {
                            if (isServer && onPageChange) onPageChange(currentPageValue - 1);
                            else table.previousPage();
                        };
                        const handleNextPage = () => {
                            if (isServer && onPageChange) onPageChange(currentPageValue + 1);
                            else table.nextPage();
                        };
                        const handlePageClick = (page: number) => {
                            if (isServer && onPageChange) onPageChange(page);
                            else table.setPageIndex(page - 1);
                        };

                        const renderPageButtons = () => {
                            const pages = [];
                            const maxVisiblePages = 5;
                            let startPage = Math.max(1, currentPageValue - Math.floor(maxVisiblePages / 2));
                            let endPage = Math.min(pageCountValue, startPage + maxVisiblePages - 1);

                            if (endPage - startPage + 1 < maxVisiblePages) {
                                startPage = Math.max(1, endPage - maxVisiblePages + 1);
                            }

                            for (let i = startPage; i <= endPage; i++) {
                                pages.push(
                                    <Button
                                        key={i}
                                        variant={currentPageValue === i ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => handlePageClick(i)}
                                        className="w-8 h-8 p-0"
                                    >
                                        {i}
                                    </Button>
                                );
                            }

                            return (
                                <div className="flex items-center gap-1 mx-2">
                                    {startPage > 1 && <span className="text-muted-foreground mr-1">...</span>}
                                    {pages}
                                    {endPage < pageCountValue && <span className="text-muted-foreground ml-1">...</span>}
                                </div>
                            );
                        };

                        return (
                            <div className="flex items-center space-x-2 order-1 sm:order-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handlePrevPage}
                                    disabled={isServer ? (currentPageValue <= 1) : !table.getCanPreviousPage()}
                                >
                                    Previous
                                </Button>
                                
                                <div className="hidden sm:block">
                                    {renderPageButtons()}
                                </div>
                                <div className="sm:hidden text-sm font-medium min-w-[80px] text-center">
                                    Page {currentPageValue} of {pageCountValue}
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleNextPage}
                                    disabled={isServer ? (currentPageValue >= pageCountValue || pageCountValue === 0) : !table.getCanNextPage()}
                                >
                                    Next
                                </Button>
                            </div>
                        );
                    })()}
                </div>
            )}
            {footer && <div>{footer}</div>}
        </div>
    );
}
