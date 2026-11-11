import Heading from '../element/Heading';
import {
    ClipboardList,
    LayoutDashboard,
    PackageCheck,
    Truck,
    Warehouse,
    TrendingUp,
    HandCoins,
    RotateCcw,
    Repeat2,
    UserRoundCog,
    PackageOpen,
    ArrowUpRight,
    HardHat,
    PackageCheck as PackageCheckIcon,
    Star,
    type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheets } from '@/context/SheetsContext';
import { analyzeData } from '@/lib/filter';
import { fetchFirms } from '@/lib/fetchers';
import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import StoreOutApproval from './StoreOutApproval';
import AccessoryTracking from './AccessoryTracking';
import ContractorLoan from './ContractorLoan';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import IndentsDialog from '../element/IndentsDialog';
import ReceivedItemsDialog, { type ReceivedRecord } from '../element/ReceivedItemsDialog';

const ALL_FIRMS = '__all__';
const FIRM_STORAGE_KEY = 'dashboardFirm';

const THEMES = {
    blue: { grad: 'from-sky-500 to-blue-700', glow: 'bg-blue-400/20', chip: 'bg-blue-50 text-blue-700', ring: 'hover:ring-blue-200', shadow: 'shadow-blue-500/30' },
    green: { grad: 'from-green-500 to-emerald-700', glow: 'bg-green-400/20', chip: 'bg-green-50 text-green-700', ring: 'hover:ring-green-200', shadow: 'shadow-green-500/30' },
    orange: { grad: 'from-amber-500 to-orange-600', glow: 'bg-orange-400/20', chip: 'bg-orange-50 text-orange-700', ring: 'hover:ring-orange-200', shadow: 'shadow-orange-500/30' },
    red: { grad: 'from-red-500 to-rose-700', glow: 'bg-red-400/20', chip: 'bg-red-50 text-red-700', ring: 'hover:ring-red-200', shadow: 'shadow-red-500/30' },
    purple: { grad: 'from-violet-500 to-purple-700', glow: 'bg-purple-400/20', chip: 'bg-purple-50 text-purple-700', ring: 'hover:ring-purple-200', shadow: 'shadow-purple-500/30' },
    indigo: { grad: 'from-indigo-500 to-blue-700', glow: 'bg-indigo-400/20', chip: 'bg-indigo-50 text-indigo-700', ring: 'hover:ring-indigo-200', shadow: 'shadow-indigo-500/30' },
    cyan: { grad: 'from-cyan-500 to-sky-700', glow: 'bg-cyan-400/20', chip: 'bg-cyan-50 text-cyan-700', ring: 'hover:ring-cyan-200', shadow: 'shadow-cyan-500/30' },
    emerald: { grad: 'from-emerald-500 to-teal-700', glow: 'bg-emerald-400/20', chip: 'bg-emerald-50 text-emerald-700', ring: 'hover:ring-emerald-200', shadow: 'shadow-emerald-500/30' },
    rose: { grad: 'from-rose-500 to-pink-700', glow: 'bg-rose-400/20', chip: 'bg-rose-50 text-rose-700', ring: 'hover:ring-rose-200', shadow: 'shadow-rose-500/30' },
} as const;

function MetricCard({
    label,
    value,
    footerLabel,
    footerValue,
    icon: Icon,
    color,
    onClick,
}: {
    label: string;
    value: React.ReactNode;
    footerLabel: string;
    footerValue: React.ReactNode;
    icon: LucideIcon;
    color: keyof typeof THEMES;
    onClick?: () => void;
}) {
    const t = THEMES[color];
    const clickable = !!onClick;
    return (
        <Card
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? `View ${label}` : undefined}
            onClick={onClick}
            onKeyDown={
                clickable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick?.();
                          }
                      }
                    : undefined
            }
            className={`group relative h-full min-h-[140px] overflow-hidden bg-white border-slate-200/70 shadow-sm ring-1 ring-transparent transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                clickable ? `${t.ring} cursor-pointer focus-visible:outline-none focus-visible:ring-2` : ''
            }`}
        >
            <div className={`absolute -right-10 -top-10 size-32 rounded-full blur-2xl ${t.glow} transition-transform duration-500 group-hover:scale-125`} />
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.grad}`} />
            <CardContent className="relative p-4 h-full flex flex-col">
                <div className={`flex items-start justify-between mb-3`}>
                    <div className={`size-10 rounded-xl bg-gradient-to-br ${t.grad} text-white flex items-center justify-center shadow-lg ${t.shadow} transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3`}>
                        <Icon size={20} strokeWidth={2} />
                    </div>
                    {clickable && (
                        <div className="size-7 rounded-full border border-slate-200 text-slate-400 flex items-center justify-center transition-all group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900">
                            <ArrowUpRight size={14} />
                        </div>
                    )}
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 truncate">
                    {label}
                </p>
                <p className="text-3xl font-black text-slate-900 tabular-nums leading-none tracking-tight">
                    {value}
                </p>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 font-medium">{footerLabel}</span>
                    <span className={`${t.chip} rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums`}>
                        {footerValue}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

export default function Dashboard() {
    const { receivedSheet: allReceived, indentSheet: allIndent, poMasterSheet: allPoMaster, inventorySheet: allInventory } = useSheets();

    // Firm selection: asked once, then remembered. Everything below is scoped to it.
    const [firmRows, setFirmRows] = useState<any[]>([]);
    const firms = useMemo(() => firmRows.map((f) => f.firm_name as string).filter(Boolean), [firmRows]);
    const [firmsLoaded, setFirmsLoaded] = useState(false);
    const [selectedFirm, setSelectedFirm] = useState<string | null>(() => {
        try { return localStorage.getItem(FIRM_STORAGE_KEY); } catch { return null; }
    });

    useEffect(() => {
        fetchFirms()
            .then((rows: any[]) => setFirmRows(Array.isArray(rows) ? rows : []))
            .catch(() => setFirmRows([]))
            .finally(() => setFirmsLoaded(true));
    }, []);

    const chooseFirm = (value: string) => {
        setSelectedFirm(value);
        try { localStorage.setItem(FIRM_STORAGE_KEY, value); } catch { /* storage optional */ }
    };

    // Forget a saved firm that this user can no longer see.
    useEffect(() => {
        if (firmsLoaded && selectedFirm && selectedFirm !== ALL_FIRMS && !firms.includes(selectedFirm)) {
            setSelectedFirm(null);
            try { localStorage.removeItem(FIRM_STORAGE_KEY); } catch { /* ignore */ }
        }
    }, [firmsLoaded, firms, selectedFirm]);

    const byFirm = <T,>(rows: T[], getFirm: (r: T) => string | null | undefined) =>
        !selectedFirm || selectedFirm === ALL_FIRMS ? rows : rows.filter((r) => getFirm(r) === selectedFirm);

    const indentSheet = useMemo(() => byFirm(allIndent, (r) => r.firm), [allIndent, selectedFirm]); // eslint-disable-line react-hooks/exhaustive-deps
    const receivedSheet = useMemo(() => byFirm(allReceived, (r: any) => r.firm), [allReceived, selectedFirm]); // eslint-disable-line react-hooks/exhaustive-deps
    const poMasterSheet = useMemo(() => byFirm(allPoMaster, (r: any) => r.firm), [allPoMaster, selectedFirm]); // eslint-disable-line react-hooks/exhaustive-deps
    const inventorySheet = useMemo(() => byFirm(allInventory, (r: any) => r.firmName), [allInventory, selectedFirm]); // eslint-disable-line react-hooks/exhaustive-deps
    const [chartData, setChartData] = useState<
        {
            name: string;
            quantity: number;
            frequency: number;
        }[]
    >([]);
    const [topVendorsData, setTopVendors] = useState<
        {
            name: string;
            orders: number;
            quantity: number;
            value: number;
        }[]
    >([]);

    // Metrics State
    const [indent, setIndent] = useState({ count: 0, quantity: 0 });
    const [purchase, setPurchase] = useState({ count: 0, quantity: 0 });
    const [out, setOut] = useState({ count: 0, quantity: 0 });
    const [finance, setFinance] = useState({ poCount: 0, totalValue: 0 });
    const [alerts, setAlerts] = useState({ lowStock: 0, outOfStock: 0 });
    const navigate = useNavigate();
    const [receivedOpen, setReceivedOpen] = useState(false);
    const [indentsOpen, setIndentsOpen] = useState(false);
    const [typeDialog, setTypeDialog] = useState<string | null>(null);

    const typeCards = [
        { key: 'storeOut', label: 'Store Out', types: ['Store Out'], page: 'store' as const, mode: 'store-out' as const, tab: 'store-out', icon: PackageOpen, color: 'purple' as const },
        { key: 'storeOutReturn', label: 'Store Out Return', types: ['Store Out Return'], page: 'store' as const, mode: 'store-out' as const, tab: 'store-out-return', icon: RotateCcw, color: 'indigo' as const },
        { key: 'loanOut', label: 'Loan Out', types: ['Loan Out'], page: 'store' as const, mode: 'loan' as const, tab: 'loan-out', icon: HandCoins, color: 'cyan' as const },
        { key: 'loanOutReturn', label: 'Loan Out Return', types: ['Loan Out Return'], page: 'store' as const, mode: 'loan' as const, tab: 'loan-out-return', icon: Repeat2, color: 'emerald' as const },
        { key: 'contractorOut', label: 'Contractor Loan Out', types: ['Contractor Loan Out'], page: 'contractor' as const, mode: 'loan' as const, tab: 'contractor-loan-out', icon: HardHat, color: 'orange' as const },
        { key: 'contractorIn', label: 'Contractor Loan In', types: ['Contractor Loan In'], page: 'contractor' as const, mode: 'loan' as const, tab: 'contractor-loan-in', icon: PackageCheckIcon, color: 'blue' as const },
        { key: 'empLoan', label: 'Employee Loan Tracker', types: ['Employee Loan Tracker'], page: 'employee' as const, mode: 'loan' as const, tab: 'loan-out', icon: UserRoundCog, color: 'rose' as const },
    ].map((c) => {
        const records = indentSheet.filter((i) => c.types.includes(i.indentType));
        return { ...c, records, qty: records.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0) };
    });
    const activeType = typeCards.find((c) => c.key === typeDialog);

    useEffect(() => {
        const stats = analyzeData({
            receivedSheet,
            indentSheet,
            poMasterSheet,
            inventorySheet,
        });

        setChartData(stats.topProducts);
        setTopVendors(stats.topVendors);

        setIndent({ quantity: stats.totalIndentedQuantity, count: stats.totalIndentCount });
        setPurchase({ quantity: stats.totalPurchasedQuantity, count: stats.receivedPurchaseCount });
        setOut({ quantity: stats.totalIssuedQuantity, count: stats.issuedIndentCount });
        setFinance({ poCount: stats.totalPOCount, totalValue: stats.totalPOAmount });
        setAlerts({ lowStock: stats.lowStock, outOfStock: stats.outOfStock });
    }, [indentSheet, receivedSheet, poMasterSheet, inventorySheet]);

    // First visit: pick a firm before any card is shown.
    if (!selectedFirm) {
        return (
            <div className="p-4 space-y-6">
                <Heading heading="Insights & Analytics" subtext="Select a firm to view its dashboard.">
                    <LayoutDashboard size={48} className="text-primary opacity-80" />
                </Heading>
                <div className="max-w-3xl mx-auto pt-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Select Firm</p>
                    {!firmsLoaded ? (
                        <p className="text-sm text-muted-foreground">Loading firms...</p>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {firms.map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => chooseFirm(f)}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary"
                                >
                                    <span className="size-10 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center">
                                        <Building2 size={20} />
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900">{f}</span>
                                </button>
                            ))}
                            {firms.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => chooseFirm(ALL_FIRMS)}
                                    className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left transition-all hover:border-primary hover:shadow-lg"
                                >
                                    <span className="size-10 shrink-0 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                                        <Building2 size={20} />
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900">All Firms</span>
                                </button>
                            )}
                            {firms.length === 0 && (
                                <p className="text-sm text-muted-foreground">No firms available for your account.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            <IndentsDialog open={indentsOpen} onOpenChange={setIndentsOpen} records={indentSheet} />
            <ReceivedItemsDialog
                open={receivedOpen}
                onOpenChange={setReceivedOpen}
                records={receivedSheet as unknown as ReceivedRecord[]}
            />
            <Dialog open={!!activeType} onOpenChange={(o) => !o && setTypeDialog(null)}>
                <DialogContent className="sm:max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] overflow-y-auto p-0 gap-0">
                    <DialogTitle className="sr-only">{activeType?.label}</DialogTitle>
                    {activeType?.page === 'store' && (
                        <StoreOutApproval mode={activeType.mode} initialTab={activeType.tab} />
                    )}
                    {activeType?.page === 'contractor' && <ContractorLoan initialTab={activeType.tab} />}
                    {activeType?.page === 'employee' && <AccessoryTracking />}
                </DialogContent>
            </Dialog>
            <Heading
                heading="Insights & Analytics"
                subtext="Live overview of procurement, store, and inventory status."
            >
                <LayoutDashboard size={48} className="text-primary opacity-80" />
            </Heading>

            {/* Company banner for the selected firm (details come from Firm Master) */}
            {(() => {
                const firm = selectedFirm === ALL_FIRMS ? null : firmRows.find((f) => f.firm_name === selectedFirm);
                const address = firm
                    ? [firm.firm_address, [firm.state, firm.pin_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                    : '';
                const chips = firm
                    ? ([['GSTIN', firm.firm_gstin], ['PAN', firm.pan_number], ['Email', firm.firm_email], ['Contact', firm.contact_person]] as const).filter(([, v]) => v)
                    : [];
                return (
                    <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-blue-50 p-4 sm:p-5 shadow-sm">
                        <div className="flex flex-wrap items-center gap-4">
                            <img src="/logo.png" alt="Company Logo" className="size-16 sm:size-20 shrink-0 object-contain" />
                            <div className="min-w-0 flex-1 text-center sm:text-left">
                                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                                    {firm ? firm.firm_name : `All Firms${firms.length ? ` (${firms.length})` : ''}`}
                                </h2>
                                {firm ? (
                                    <>
                                        {address && <p className="text-sm text-slate-600">{address}</p>}
                                        {firm.mobile && <p className="text-sm text-slate-600">Phone No: {firm.mobile}</p>}
                                    </>
                                ) : (
                                    <p className="text-sm text-slate-600">Combined view of every firm you have access to.</p>
                                )}
                                {chips.length > 0 && (
                                    <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                                        {chips.map(([label, value]) => (
                                            <span key={label} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                                <span className="font-semibold text-slate-400">{label}:</span> {value}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="w-full sm:w-72 space-y-1">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <Building2 size={12} /> Change Firm
                                </p>
                                <Select value={selectedFirm} onValueChange={chooseFirm}>
                                    <SelectTrigger className="w-full bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {firms.length > 1 && <SelectItem value={ALL_FIRMS}>All Firms</SelectItem>}
                                        {firms.map((f) => (
                                            <SelectItem key={f} value={f}>{f}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Primary Metrics Layer */}
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <MetricCard label="Total Indents" value={indent.count} icon={ClipboardList} color="blue" footerLabel="Indented Vol." footerValue={Math.floor(indent.quantity).toLocaleString()} onClick={() => setIndentsOpen(true)} />
                <MetricCard label="PO Summary" value={finance.poCount} icon={TrendingUp} color="green" footerLabel="Total Value" footerValue={`₹${Math.floor(finance.totalValue).toLocaleString()}`} onClick={() => navigate('/po-master')} />
                <MetricCard label="Received Items" value={purchase.count} icon={Truck} color="orange" footerLabel="Received Qty" footerValue={Math.floor(purchase.quantity).toLocaleString()} onClick={() => setReceivedOpen(true)} />
                <MetricCard label="Inventory Alerts" value={alerts.outOfStock} icon={Warehouse} color="red" footerLabel="Low in Stock" footerValue={alerts.lowStock} onClick={() => navigate('/inventory')} />
            </div>

            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Indent Types
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {typeCards.map((c) => (
                        <MetricCard
                            key={c.key}
                            label={c.label}
                            value={c.records.length}
                            icon={c.icon}
                            color={c.color}
                            footerLabel="Total Qty"
                            footerValue={Math.floor(c.qty).toLocaleString()}
                            onClick={() => setTypeDialog(c.key)}
                        />
                    ))}
                </div>
            </div>

            {/* Visual Analytics Layer */}
            <div className="grid lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3 relative overflow-hidden rounded-2xl border-slate-200/70 shadow-sm">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />
                    <CardHeader className="flex flex-row items-center gap-4 border-b border-slate-100 pb-4">
                        <div className="size-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-extrabold text-slate-900">
                                High Frequency Products
                            </CardTitle>
                            <p className="text-sm text-slate-400 mt-0.5">
                                Products prioritized by order frequency
                            </p>
                        </div>
                        <span className="ml-auto rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1.5">
                            Top {chartData.length}
                        </span>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {chartData.length > 0 ? (
                            <div className="space-y-1">
                                {chartData.map((p, i) => {
                                    const max = Math.max(...chartData.map((d) => d.frequency), 1);
                                    return (
                                        <div
                                            key={p.name}
                                            title={`${p.name} · Qty ${Math.floor(p.quantity)}`}
                                            className="flex items-center gap-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                                        >
                                            <div
                                                className={`size-6 shrink-0 rounded-lg text-xs font-bold flex items-center justify-center ${
                                                    i < 3
                                                        ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white'
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {i + 1}
                                            </div>
                                            <p className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-600 leading-tight line-clamp-2">
                                                {p.name}
                                            </p>
                                            <div className="flex-1 h-3.5 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ${
                                                        p.frequency === max
                                                            ? 'bg-gradient-to-r from-violet-300 via-violet-600 to-violet-800'
                                                            : 'bg-gradient-to-r from-indigo-300 via-indigo-500 to-violet-600'
                                                    }`}
                                                    style={{ width: `${(p.frequency / max) * 100}%` }}
                                                />
                                            </div>
                                            <span className="w-9 shrink-0 text-center text-xs font-extrabold text-indigo-900 bg-indigo-50 rounded-lg py-1 tabular-nums">
                                                {p.frequency}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-slate-400 italic">
                                No product data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 relative overflow-hidden rounded-2xl border-slate-200/70 shadow-sm">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />
                    <CardHeader className="flex flex-row items-center gap-4 border-b border-slate-100 pb-4">
                        <div className="size-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40">
                            <Star size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-extrabold text-slate-900">
                                Strategic Vendors
                            </CardTitle>
                            <p className="text-sm text-slate-400 mt-0.5">
                                Partners with highest business volume
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        {topVendorsData.length > 0 ? (
                            topVendorsData.map((vendor, i) => {
                                const maxValue = Math.max(...topVendorsData.map((v) => v.value), 1);
                                const avatar = [
                                    'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md shadow-amber-500/40',
                                    'bg-gradient-to-br from-slate-300 to-slate-400 text-white',
                                    'bg-gradient-to-br from-orange-300 to-orange-600 text-white',
                                ][i] ?? 'bg-slate-100 text-slate-500';
                                return (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all hover:shadow-md ${
                                            i === 0
                                                ? 'bg-gradient-to-br from-amber-50 to-white border-amber-200'
                                                : 'border-slate-100 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div
                                            className={`size-11 shrink-0 rounded-xl flex items-center justify-center font-extrabold text-xs uppercase ${avatar}`}
                                        >
                                            {vendor.name.slice(0, 2)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-extrabold text-sm text-slate-900 truncate" title={vendor.name}>
                                                {vendor.name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                                                    {vendor.orders} {vendor.orders === 1 ? 'Order' : 'Orders'}
                                                </span>
                                                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                                                        style={{ width: `${(vendor.value / maxValue) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-extrabold text-sm text-slate-900 tabular-nums">
                                                ₹{Math.floor(vendor.value).toLocaleString('en-IN')}
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                Value
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-10 text-slate-400 italic">
                                No vendor data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
