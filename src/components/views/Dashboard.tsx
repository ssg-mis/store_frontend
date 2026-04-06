import Heading from '../element/Heading';
import {
    ClipboardList,
    LayoutDashboard,
    PackageCheck,
    Truck,
    Warehouse,
    TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '../ui/chart';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { useEffect, useState } from 'react';
import { useSheets } from '@/context/SheetsContext';
import { analyzeData } from '@/lib/filter';

function CustomChartTooltipContent({
    payload,
    label,
}: {
    payload?: { payload: { quantity: number; frequency: number } }[];
    label?: string;
}) {
    if (!payload?.length) return null;

    const data = payload[0].payload;

    return (
        <div className="rounded-md border bg-white px-3 py-2 shadow-sm text-sm">
            <p className="font-medium text-slate-900 border-b pb-1 mb-1">{label}</p>
            <div className="flex flex-col gap-0.5 text-slate-600">
                <p>Quantity: <span className="font-semibold text-slate-900">{Math.floor(data.quantity)}</span></p>
                <p>Order Frequency: <span className="font-semibold text-slate-900">{data.frequency}</span></p>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { receivedSheet, indentSheet, poMasterSheet, inventorySheet } = useSheets();
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
        }[]
    >([]);

    // Metrics State
    const [indent, setIndent] = useState({ count: 0, quantity: 0 });
    const [purchase, setPurchase] = useState({ count: 0, quantity: 0 });
    const [out, setOut] = useState({ count: 0, quantity: 0 });
    const [finance, setFinance] = useState({ poCount: 0, totalValue: 0 });
    const [alerts, setAlerts] = useState({ lowStock: 0, outOfStock: 0 });

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

    const chartConfig = {
        quantity: {
            label: 'Quantity',
            color: 'hsl(var(--primary))',
        },
    } satisfies ChartConfig;

    return (
        <div className="p-4 space-y-6">
            <Heading heading="Insights & Analytics" subtext="Live overview of procurement, store, and inventory status.">
                <LayoutDashboard size={48} className="text-primary opacity-80" />
            </Heading>

            {/* Primary Metrics Layer */}
            <div className="grid md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-white to-blue-50/50 border-blue-100 shadow-sm transition-all hover:shadow-md">
                    <CardContent className="pt-6">
                        <div className="text-blue-600 flex justify-between items-center mb-4">
                            <p className="font-bold uppercase text-xs tracking-wider">Total Indents</p>
                            <div className="bg-blue-100 p-2 rounded-lg"><ClipboardList size={20} /></div>
                        </div>
                        <p className="text-4xl font-extrabold text-blue-900 mb-2 tabular-nums">{indent.count}</p>
                        <div className="flex justify-between items-end">
                            <p className="text-sm text-blue-600/80 font-medium tracking-tight">Indented Vol.</p>
                            <p className="font-semibold text-blue-950 text-lg tabular-nums">{Math.floor(indent.quantity)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-green-50/50 border-green-100 shadow-sm transition-all hover:shadow-md">
                    <CardContent className="pt-6">
                        <div className="text-green-600 flex justify-between items-center mb-4">
                            <p className="font-bold uppercase text-xs tracking-wider">PO Summary</p>
                            <div className="bg-green-100 p-2 rounded-lg"><TrendingUp size={20} /></div>
                        </div>
                        <p className="text-4xl font-extrabold text-green-900 mb-2 tabular-nums">{finance.poCount}</p>
                        <div className="flex justify-between items-end">
                            <p className="text-sm text-green-600/80 font-medium tracking-tight">Total Value</p>
                            <p className="font-semibold text-green-950 text-lg tabular-nums">₹{Math.floor(finance.totalValue).toLocaleString()}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-orange-50/50 border-orange-100 shadow-sm transition-all hover:shadow-md">
                    <CardContent className="pt-6">
                        <div className="text-orange-600 flex justify-between items-center mb-4">
                            <p className="font-bold uppercase text-xs tracking-wider">Received Items</p>
                            <div className="bg-orange-100 p-2 rounded-lg"><Truck size={20} /></div>
                        </div>
                        <p className="text-4xl font-extrabold text-orange-900 mb-2 tabular-nums">{purchase.count}</p>
                        <div className="flex justify-between items-end">
                            <p className="text-sm text-orange-600/80 font-medium tracking-tight">Received Qty</p>
                            <p className="font-semibold text-orange-950 text-lg tabular-nums">{Math.floor(purchase.quantity)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-red-50/50 border-red-100 shadow-sm transition-all hover:shadow-md">
                    <CardContent className="pt-6">
                        <div className="text-red-600 flex justify-between items-center mb-4">
                            <p className="font-bold uppercase text-xs tracking-wider">Inventory Alerts</p>
                            <div className="bg-red-100 p-2 rounded-lg"><Warehouse size={20} /></div>
                        </div>
                        <p className="text-4xl font-extrabold text-red-900 mb-2 tabular-nums">{alerts.outOfStock}</p>
                        <div className="flex justify-between items-end">
                            <p className="text-sm text-red-600/80 font-medium tracking-tight">Low in Stock</p>
                            <p className="font-semibold text-red-950 text-lg tabular-nums">{alerts.lowStock}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Visual Analytics Layer */}
            <div className="grid lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3 shadow-sm border-slate-100">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 mb-4 pb-4">
                        <div>
                            <CardTitle className="text-xl font-bold text-slate-800">High Frequency Products</CardTitle>
                            <p className="text-sm text-slate-400 mt-1">Products prioritized by order frequency</p>
                        </div>
                        <div className="p-2 border rounded-full text-slate-400"><TrendingUp size={16}/></div>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer className="h-[350px] w-full" config={chartConfig}>
                            <BarChart
                                accessibilityLayer
                                data={chartData}
                                layout="vertical"
                                margin={{ right: 30, left: 10 }}
                            >
                                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    tickLine={false}
                                    tickMargin={10}
                                    axisLine={false}
                                    hide
                                />
                                <XAxis dataKey="frequency" type="number" hide />
                                <ChartTooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    content={<CustomChartTooltipContent />}
                                />
                                <Bar
                                    dataKey="frequency"
                                    layout="vertical"
                                    fill="hsl(var(--primary))"
                                    radius={[0, 4, 4, 0]}
                                    barSize={32}
                                >
                                    <LabelList
                                        dataKey="name"
                                        position="insideLeft"
                                        offset={12}
                                        className="fill-white font-bold"
                                        fontSize={12}
                                    />
                                    <LabelList
                                        dataKey="frequency"
                                        position="right"
                                        offset={10}
                                        className="fill-slate-500 font-semibold"
                                        fontSize={12}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-slate-100">
                    <CardHeader className="border-b border-slate-50 mb-4 pb-4">
                        <CardTitle className="text-xl font-bold text-slate-800">Strategic Vendors</CardTitle>
                        <p className="text-sm text-slate-400 mt-1">Partners with highest business volume</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {topVendorsData.length > 0 ? (
                            topVendorsData.map((vendor, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-50 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs uppercase tracking-tighter">
                                            {vendor.name.slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 truncate max-w-[150px] leading-tight">{vendor.name}</p>
                                            <p className="text-xs text-slate-500 font-medium">{vendor.orders} Orders processed</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-slate-900 tracking-tight">{Math.floor(vendor.quantity).toLocaleString()}</p>
                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Units Sold</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-slate-400 italic">No vendor data available</div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
