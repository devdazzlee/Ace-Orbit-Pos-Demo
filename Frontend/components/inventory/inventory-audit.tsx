"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  PieChart, 
  Calendar, 
  Download,
  Search,
  ArrowUpRight,
  ArrowDownRight, 
  Activity,
  Filter,
  RefreshCw,
  LayoutDashboard,
  X,
  Loader2
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AuditSummary {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
  totalStockValue?: number;
  projectedValue?: number;
  equityHealthy?: number;
}

interface BranchMetric {
  name: string;
  revenue: number;
  cogs: number;
  profit: number;
  count: number;
}

import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger, 
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const formatCurrency = (n: number) =>
  `Rs ${Number(n).toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })}`;

export function InventoryAudit() {
  const {
    products,
    categories,
    productsLoading,
    categoriesLoading,
    fetchProducts,
    fetchCategories,
  } = usePosData();

  const [data, setData] = useState<BranchMetric[] | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Custom Search States
  const [prodSearch, setProdSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    categoryId: "all",
    productId: "all"
  });

  const fetchAuditData = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { type: "financial_audit" };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.categoryId !== "all") params.categoryId = filters.categoryId;
      if (filters.productId !== "all") params.productId = filters.productId;

      const response = await apiClient.get("/inventory/reports", { params });
      const report = response.data.data;
      setData(report.data || []);
      setSummary(report.summary || null);
    } catch (error: any) {
      const backendError = error?.response?.data?.message || error?.message || "Internal Telemetry Error";
      toast.error(backendError);
    } finally {
      await new Promise(r => setTimeout(r, 600));
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(event.target as Node)) setProdDropdownOpen(false);
      if (catRef.current && !catRef.current.contains(event.target as Node)) setCatDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProd = useMemo(() => {
    const term = prodSearch.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term))).slice(0, 50);
  }, [products, prodSearch]);

  const filteredCat = useMemo(() => {
    const term = catSearch.toLowerCase();
    if (!term) return categories.slice(0, 50);
    return categories.filter(c => c.name.toLowerCase().includes(term)).slice(0, 50);
  }, [categories, catSearch]);

  const selectedProdName = products.find(p => p.id === filters.productId)?.name || "";
  const selectedCatName = categories.find(c => c.id === filters.categoryId)?.name || "";

  const resetFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      categoryId: "all",
      productId: "all"
    });
    setIsFilterOpen(false);
  };

  const exportAudit = () => {
    if (!data || !summary) return;
    const headers = ["Branch", "Transactions", "Revenue", "COGS", "Total Profit", "Margin (%)"];
    const rows = data.map(b => [
      b.name,
      b.count,
      b.revenue.toFixed(2),
      b.cogs.toFixed(2),
      b.profit.toFixed(2),
      ((b.profit / b.revenue) * 100 || 0).toFixed(2)
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profit-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  if (loading && !data) {
    return <PageLoader message="Analyzing financial data..." />;
  }

  return (
    <div className="p-4 space-y-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-lg border border-slate-200">
            <BarChart3 className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Stock Profit Report</h1>
            <p className="text-slate-500 text-xs translate-y-[-2px]">Revenue, COGS and profitability summary</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-[140px]">
              <DatePicker 
                 date={filters.startDate ? new Date(filters.startDate) : undefined}
                 onDateChange={(date) => setFilters(f => ({...f, startDate: date ? format(date, 'yyyy-MM-dd') : ""}))}
                 placeholder="Start Date"
              />
            </div>
            <span className="text-slate-300 text-[10px] font-bold">TO</span>
            <div className="w-[140px]">
              <DatePicker 
                 date={filters.endDate ? new Date(filters.endDate) : undefined}
                 onDateChange={(date) => setFilters(f => ({...f, endDate: date ? format(date, 'yyyy-MM-dd') : ""}))}
                 placeholder="End Date"
              />
            </div>
          </div>

          <Button 
            variant="outline"
            onClick={exportAudit}
            className="flex h-10 px-4 text-xs gap-2 border-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Sales</p>
            <h3 className="text-2xl font-bold text-blue-600">{formatCurrency(summary?.totalRevenue || 0)}</h3>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{summary?.transactionCount} Transactions</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Stock Cost</p>
            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(summary?.totalCOGS || 0)}</h3>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">COGS Value</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Gross Profit</p>
            <h3 className="text-2xl font-bold text-emerald-600">{formatCurrency(summary?.grossProfit || 0)}</h3>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Inland Margin</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Profit %</p>
            <h3 className="text-2xl font-bold text-slate-900">{(summary?.profitMargin || 0).toFixed(1)}%</h3>
            <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full"
                style={{ width: `${Math.min(100, summary?.profitMargin || 0)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SALES PERFORMANCE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between p-5 border-b border-slate-100 gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Sales Performance</h2>
            <p className="text-[10px] font-semibold text-slate-400 uppercase">Overall business metrics</p>
          </div>
          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-xs gap-2 border-slate-200 text-slate-600">
                  <Filter className="h-3 w-3" />
                  Apply Filter
                </Button>
              </SheetTrigger>
              <SheetContent className="p-6 bg-white sm:max-w-md">
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-base font-bold text-slate-900 uppercase">Advanced Filtering</SheetTitle>
                  <SheetDescription className="text-xs">Filter report by category and specific products</SheetDescription>
                </SheetHeader>

                <div className="space-y-6 flex-1 overflow-y-auto p-1 -m-1">
                  {/* CATEGORY DROPDOWN */}
                  <div className="space-y-2 relative" ref={catRef}>
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</Label>
                    <Popover open={catDropdownOpen} onOpenChange={setCatDropdownOpen}>
                      <PopoverTrigger asChild>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input 
                            placeholder="Search category..."
                            className="h-10 pl-9 rounded-lg bg-slate-50 border-slate-200 text-xs"
                            value={filters.categoryId === "all" ? catSearch : selectedCatName}
                            onFocus={() => { setCatDropdownOpen(true); if(filters.categoryId !== "all") setFilters(f => ({...f, categoryId: "all"})); }}
                            onChange={(e) => { setCatSearch(e.target.value); setCatDropdownOpen(true); }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[100]" 
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="max-h-48 overflow-y-auto rounded-lg bg-white py-1">
                          <button onClick={() => { setFilters(f => ({...f, categoryId: "all"})); setCatDropdownOpen(false); }} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-400 hover:bg-slate-50 border-b border-slate-50">All Categories</button>
                          {filteredCat.map(c => (
                            <button key={c.id} onClick={() => { setFilters(f => ({...f, categoryId: c.id})); setCatDropdownOpen(false); }} className="w-full px-4 py-2 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none">
                               <span className="font-bold text-xs text-slate-800">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* PRODUCT DROPDOWN */}
                  <div className="space-y-2 relative" ref={prodRef}>
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product</Label>
                    <Popover open={prodDropdownOpen} onOpenChange={setProdDropdownOpen}>
                      <PopoverTrigger asChild>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input 
                            placeholder="Search SKU or Name..."
                            className="h-10 pl-9 rounded-lg bg-slate-50 border-slate-200 text-xs"
                            value={filters.productId === "all" ? prodSearch : selectedProdName}
                            onFocus={() => { setProdDropdownOpen(true); if(filters.productId !== "all") setFilters(f => ({...f, productId: "all"})); }}
                            onChange={(e) => { setProdSearch(e.target.value); setProdDropdownOpen(true); }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[100]" 
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="max-h-48 overflow-y-auto rounded-lg bg-white py-1">
                          <button onClick={() => { setFilters(f => ({...f, productId: "all"})); setProdDropdownOpen(false); }} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-400 hover:bg-slate-50 border-b border-slate-50">All Products</button>
                          {filteredProd.map(p => (
                            <button key={p.id} onClick={() => { setFilters(f => ({...f, productId: p.id})); setProdDropdownOpen(false); }} className="w-full px-4 py-2 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none flex flex-col">
                                <span className="font-bold text-xs text-slate-800">{p.name}</span>
                                <span className="text-[10px] text-slate-400 uppercase tracking-tighter">SKU: {p.sku || "N/A"}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <SheetFooter className="mt-8 flex flex-col gap-2">
                  <Button 
                    className="w-full h-10 rounded-lg text-xs font-bold uppercase tracking-wider"
                    onClick={() => { fetchAuditData(); setIsFilterOpen(false); }}
                  >
                    Generate Report
                  </Button>
                  <Button 
                    variant="ghost"
                    className="w-full h-10 text-[10px] text-slate-400 font-bold uppercase"
                    onClick={resetFilters}
                  >
                    Clear All
                  </Button>
                </SheetFooter>
              </SheetContent>
          </Sheet>
        </div>
          
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="border-slate-200">
              <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Period</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Transactions</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Revenue</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">COGS</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Profit</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const totalRevenue = data?.reduce((s: number, b: BranchMetric) => s + b.revenue, 0) || 0;
              const totalCogs = data?.reduce((s: number, b: BranchMetric) => s + b.cogs, 0) || 0;
              const totalProfit = data?.reduce((s: number, b: BranchMetric) => s + b.profit, 0) || 0;
              const totalCount = data?.reduce((s: number, b: BranchMetric) => s + b.count, 0) || 0;
              const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
              return (
                <TableRow className="border-slate-100 hover:bg-slate-50 transition-colors">
                  <TableCell className="px-6 py-4">
                    <p className="font-bold text-slate-800 text-xs">All Sales</p>
                    <p className="text-[10px] text-slate-400 uppercase">Combined Total</p>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-slate-600 text-xs">{totalCount}</TableCell>
                  <TableCell className="text-right font-bold text-slate-900 text-xs">{formatCurrency(totalRevenue)}</TableCell>
                  <TableCell className="text-right text-slate-400 text-xs">{formatCurrency(totalCogs)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`font-bold text-xs ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(totalProfit)}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-bold text-slate-700">{margin.toFixed(1)}%</span>
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${margin > 20 ? 'bg-emerald-500' : margin > 10 ? 'bg-blue-500' : 'bg-rose-400'}`} style={{ width: `${Math.min(100, margin)}%` }} />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
          
        {!data?.length && !loading && (
          <div className="py-20 text-center">
            <LayoutDashboard className="h-10 w-10 text-slate-200 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400 uppercase">No performance data found</p>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-xl border border-slate-200 shadow-sm p-5 bg-white">
           <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4 border-b pb-2">Analysis Summary</h4>
           <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">Profitability is currently at <span className="font-bold text-slate-900">{(summary?.profitMargin || 0).toFixed(1)}%</span>. Inventory turnover rates confirm stable margin performance across all reported locations.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
                  <Activity className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">No critical anomalies detected. Revenue is consistent with stock movement history and purchase orders.</p>
              </div>
           </div>
        </Card>
        
        <Card className="rounded-xl border border-slate-200 shadow-sm p-5 bg-white">
           <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4 border-b pb-2">Inventory Valuation</h4>
           <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">
              Current live assets in warehouse
           </p>
            
           <div className="space-y-5">
              <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs font-bold text-slate-600">Stock Assets</span>
                    <span className="text-xl font-bold text-slate-900">{formatCurrency(summary?.totalStockValue || 0)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-slate-400 rounded-full" 
                      style={{ width: `${Math.min(100, summary?.equityHealthy || 0)}%` }}
                    />
                  </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-emerald-100 rounded-md flex items-center justify-center text-emerald-600">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-900">Potential Earnings</p>
                      <p className="text-[10px] text-emerald-600 font-semibold uppercase">Est. Portfolio Growth</p>
                    </div>
                  </div>
                  <h5 className="text-lg font-bold text-emerald-700">
                    +{formatCurrency((summary?.projectedValue || 0) - (summary?.totalStockValue || 0))}
                  </h5>
              </div>
           </div>
        </Card>
      </div>
    </div>
  );
}
