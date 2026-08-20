"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Truck,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  TrendingUp,
  MapPin,
  ChevronRight,
  ShoppingCart,
  Boxes,
  Activity,
  CheckCircle2,
  BarChart3,
  ShoppingBag,
  ArrowRightLeft,
  Gauge,
  Zap,
} from "lucide-react";
import { PageLoader } from "@/components/ui/page-loader";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";

interface DashboardStats {
  totalInventoryValue: number;
  totalSkus: number;
  outOfStockCount: number;
  branchSummary: { branchId: string; name: string; value: number; items: number }[];
  categorySummary: { name: string; value: number; items: number }[];
  velocity: { name: string; quantity: number }[];
  recentPurchases: any[];
  pendingTransfers: any[];
  lowStockAlerts: {
    product: any;
    branch: any;
    currentQuantity: number;
    minThreshold: number;
  }[];
  procurementHealth: { count: number; totalValue: number };
  movementTrend: { movement_type: string; _count: number }[];
  warehouse: any;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];


export function InventoryDashboard({ onNavigate }: { onNavigate?: (tab: string) => void | any }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStats = async (isInternal = false) => {
    if (isInternal) setSwitchingBranch(true);
    else setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/inventory/dashboard`);
      setStats(res.data?.data || null);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load inventory data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSwitchingBranch(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    setUserRole(role);
    fetchStats();
  }, []);

  const formatCurrency = (n: number) =>
    `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const totalValue = stats?.totalInventoryValue ?? 0;
  const healthScore = useMemo(() => {
    if (!stats) return 0;
    const items = stats.totalSkus;
    const out = stats.outOfStockCount;
    if (items === 0) return 0;
    return Math.round(((items - out) / items) * 100);
  }, [stats]);

  if (loading && !stats) return <PageLoader />;

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-sm text-gray-500">Overview of stock, value and activity</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStats(true)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${switchingBranch ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-gray-500 mt-1">Total stock value</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.outOfStockCount ?? 0}</div>
            <p className="text-xs text-gray-500 mt-1">Items need restocking</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Health</CardTitle>
            <Gauge className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{healthScore}%</div>
            <p className="text-xs text-gray-500 mt-1">{stats?.lowStockAlerts?.length ?? 0} low stock alerts</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats?.totalSkus ?? 0}</div>
            <p className="text-xs text-gray-500 mt-1">Active products</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Charts */}
        <div className="lg:col-span-2 space-y-6">

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-gray-900">Sales Velocity</CardTitle>
              <CardDescription className="text-sm text-gray-500">Top selling products in last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats?.velocity || []}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                    <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                    <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <Bar dataKey="quantity" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-900">Value by Category</CardTitle>
              </CardHeader>
              <CardContent className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.categorySummary || []}
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {stats?.categorySummary?.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Procurement Summary */}
          <Card className="bg-blue-600 text-white border-blue-600">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-100">Total Purchases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-1">{formatCurrency(stats?.procurementHealth?.totalValue || 0)}</div>
              <p className="text-blue-200 text-xs mb-4">{stats?.procurementHealth?.count || 0} purchase records</p>
              <Button
                onClick={() => onNavigate?.("purchases")}
                className="w-full bg-white text-blue-600 hover:bg-blue-50 font-semibold text-sm"
              >
                Manage Stock
                <ArrowRightLeft className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Alerts Tabs */}
          <Card>
            <Tabs defaultValue="low" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="low" className="text-xs">Low Stock</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Transfers</TabsTrigger>
              </TabsList>

              <TabsContent value="low" className="p-0 m-0">
                <div className="divide-y max-h-[360px] overflow-y-auto">
                  {stats?.lowStockAlerts?.length ? stats.lowStockAlerts.map((a, i) => (
                    <div key={i} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate max-w-[150px]">{a.product?.name}</span>
                        <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">Qty: {a.currentQuantity}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="h-3 w-3" />
                        {a.branch?.name} · Min: {a.minThreshold}
                      </div>
                    </div>
                  )) : (
                    <div className="p-8 text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">All stock levels are fine</p>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t">
                  <Button onClick={() => onNavigate?.("stock-view")} variant="ghost" className="w-full text-sm text-gray-500">
                    View Full Inventory <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="pending" className="p-0 m-0">
                <div className="divide-y max-h-[360px] overflow-y-auto">
                  {stats?.pendingTransfers?.length ? stats.pendingTransfers.map((t) => (
                    <div key={t.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <RefreshCw className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.product?.name}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <span>{t.from_branch?.name}</span>
                            <ChevronRight className="h-3 w-3" />
                            <span className="text-blue-500">{t.to_branch?.name}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-blue-600">{t.quantity}</p>
                          <Badge variant="outline" className="text-xs text-gray-400">{t.status}</Badge>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="p-8 text-center">
                      <p className="text-sm text-gray-400">No active transfers</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Recent Purchases */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                Recent Purchases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats?.recentPurchases.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-4 w-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.product?.name}</p>
                      <p className="text-xs text-gray-400">{p.supplier?.name} · {new Date(p.purchase_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
                {!stats?.recentPurchases?.length && (
                  <p className="text-sm text-gray-400 text-center py-2">No recent purchases</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
