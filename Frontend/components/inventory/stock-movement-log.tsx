"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Search,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Calendar,
  Filter,
  RefreshCw,
  Archive,
  History,
  TrendingUp,
  FileText,
  AlertTriangle,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/page-loader";
import { DatePicker } from "@/components/ui/date-picker";
import { format, parseISO } from "date-fns";


const MOVEMENT_TYPES = [
  { value: "PURCHASE", label: "Inventory Purchase", icon: Archive },
  { value: "SALE", label: "Point of Sale", icon: TrendingUp },
  { value: "ADJUSTMENT", label: "Stock Adjustment", icon: Filter },
  { value: "TRANSFER_IN", label: "Inbound Transfer", icon: ArrowUpRight },
  { value: "TRANSFER_OUT", label: "Outbound Transfer", icon: ArrowDownRight },
  { value: "RETURN", label: "Customer Return", icon: History },
  { value: "DAMAGE", label: "Damage / Loss", icon: AlertTriangle },
];

export function StockMovementLog() {
  const { products, productsLoading, fetchProducts } = usePosData();

  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Custom Search States
  const [prodSearch, setProdSearch] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    productId: "all",
    movementType: "all",
    startDate: "",
    endDate: "",
  });

  const fetchMovements = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { page, limit: pageSize };
      if (filters.productId !== "all") params.productId = filters.productId;
      if (filters.movementType !== "all") params.movementType = filters.movementType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const res = await apiClient.get(`${API_BASE}/inventory/movements`, { params });
      setMovements(res.data?.data || []);
      const meta = res.data?.meta || {};
      setSummary(meta.summary || null);
      setTotalPages(meta.totalPages || 1);
      setTotalRecords(meta.total || 0);
    } catch (e: any) {
      const backendMessage = e?.response?.data?.message || e?.message || "Failed to load stock audit trail";
      toast.error(backendMessage);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, [filters, page, pageSize]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [filters.productId, filters.movementType, filters.startDate, filters.endDate, pageSize]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProdDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProd = useMemo(() => {
    const term = prodSearch.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [products, prodSearch]);

  const selectedProdName = products.find(p => p.id === filters.productId)?.name || "";

  const exportCSV = () => {
    if (movements.length === 0) return;
    const headers = ["Timestamp", "Activity", "Product", "Identifier", "Delta", "Prev", "Final", "Location", "Ref", "Operator"];
    const rows = movements.map((m) => [
      new Date(m.created_at).toLocaleString(),
      m.movement_type,
      m.product?.name || "",
      m.product?.sku || "",
      m.quantity_change,
      m.previous_qty,
      m.new_qty,
      m.branch?.name || "",
      m.reference_id || "",
      m.user?.email || "System",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-log-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Log Exported");
  };

  const getMovementStyle = (type: string, qty: number) => {
    if (qty > 0) return { color: "text-emerald-700", bg: "bg-emerald-50", icon: <ArrowUpRight className="h-3 w-3" /> };
    if (qty < 0) return { color: "text-rose-700", bg: "bg-rose-50", icon: <ArrowDownRight className="h-3 w-3" /> };
    return { color: "text-slate-600", bg: "bg-slate-50", icon: <Activity className="h-3 w-3" /> };
  };

  if (loading && movements.length === 0) return <PageLoader message="Loading history..." />;

  return (
    <div className="p-4 space-y-4">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-lg border border-slate-200">
            <History className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Stock Movement Log</h1>
            <p className="text-slate-500 text-xs translate-y-[-2px]">Historical record of inventory changes</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
           <DatePicker 
             date={filters.startDate ? parseISO(filters.startDate) : undefined}
             onDateChange={(date) => setFilters(f => ({...f, startDate: date ? format(date, "yyyy-MM-dd") : ""}))}
             placeholder="Start Date"
           />
           <span className="text-slate-400 text-xs font-medium">TO</span>
           <DatePicker 
             date={filters.endDate ? parseISO(filters.endDate) : undefined}
             onDateChange={(date) => setFilters(f => ({...f, endDate: date ? format(date, "yyyy-MM-dd") : ""}))}
             placeholder="End Date"
           />
        </div>

           <Button 
            variant="outline"
            onClick={exportCSV}
            className="flex h-10 px-4 text-xs gap-2 border-slate-200"
           >
             <Download className="h-3.5 w-3.5" /> Export CSV
           </Button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
           <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Stock In</p>
              <h3 className="text-2xl font-bold text-emerald-600">+{summary?.totalIncrease || 0}</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Total Received</p>
           </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
           <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Stock Out</p>
              <h3 className="text-2xl font-bold text-rose-600">-{summary?.totalDecrease || 0}</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Total Removed</p>
           </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
           <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Net Change</p>
              <h3 className="text-2xl font-bold text-slate-900">{(summary?.totalIncrease || 0) - (summary?.totalDecrease || 0)}</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Current Volume Balance</p>
           </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
           <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Records Found</p>
              <h3 className="text-2xl font-bold text-slate-900">{summary?.count || movements.length}</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Selected period</p>
           </CardContent>
        </Card>
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
         <div className="flex-1 space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Type</Label>
            <Select value={filters.movementType} onValueChange={(v) => setFilters(f => ({...f, movementType: v}))}>
              <SelectTrigger className="h-10 rounded-lg bg-slate-50 border-slate-200 text-xs">
                <SelectValue placeholder="All Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Activity Types</SelectItem>
                {MOVEMENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    <div className="flex items-center gap-2">
                      <t.icon className="h-3.5 w-3.5 text-slate-400" />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
         </div>

         <div className="flex-[2] space-y-1.5 relative" ref={dropdownRef}>
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input 
                placeholder="Find by product name…"
                className="h-10 pl-9 rounded-lg bg-slate-50 border-slate-200 text-xs"
                value={filters.productId === "all" ? prodSearch : selectedProdName}
                onFocus={() => {
                  setProdDropdownOpen(true);
                  if (filters.productId !== "all") {
                    setFilters(f => ({ ...f, productId: "all" }));
                    setProdSearch("");
                  }
                }}
                onChange={(e) => {
                  setProdSearch(e.target.value);
                  setProdDropdownOpen(true);
                }}
              />
              {filters.productId !== "all" && (
                <button 
                  onClick={() => {
                    setFilters(f => ({ ...f, productId: "all" }));
                    setProdSearch("");
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>

            {prodDropdownOpen && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {productsLoading ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                       <Loader2 className="h-3 w-3 animate-spin" /> Fetching...
                    </div>
                  ) : filteredProd.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No matches found</div>
                  ) : (
                    filteredProd.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFilters(f => ({ ...f, productId: p.id }));
                          setProdDropdownOpen(false);
                          setProdSearch(p.name);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none flex flex-col"
                      >
                         <span className="font-bold text-slate-800 text-xs">{p.name}</span>
                      </button>
                    ))
                  )}
              </div>
            )}
         </div>

         <div className="flex space-y-1.5 items-end">
            <Button 
              variant="secondary" 
              onClick={fetchMovements}
              className="h-10 rounded-lg px-6 text-xs gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
         </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-slate-200">
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Timestamp</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Activity</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Product</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4 text-right">Item code</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4 text-right">Delta</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4 text-right">Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const style = getMovementStyle(m.movement_type, Number(m.quantity_change));
                return (
                  <TableRow key={m.id} className="border-slate-100 hover:bg-slate-50 transition-colors">
                    <TableCell className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700">{new Date(m.created_at).toLocaleDateString()}</p>
                      <p className="text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString()}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="outline" className={`${style.bg} ${style.color} border-current/20 text-[9px] uppercase px-2 py-0.5`}>
                        {m.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                        <p className="font-bold text-slate-800 text-xs">{m.product?.name}</p>
                        <p className="text-[10px] text-slate-400">Ref: {m.reference_id?.slice(0, 8) || "—"}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-[11px] text-slate-500">
                      {m.product?.sku || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                       <span className={`px-2 py-1 rounded-md bg-slate-50 text-[11px] font-bold ${style.color}`}>
                          {Number(m.quantity_change) > 0 ? "+" : ""}{m.quantity_change}
                       </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                       <p className="text-xs font-bold text-slate-700">{m.new_qty}</p>
                       <p className="text-[10px] text-slate-400">Prev: {m.previous_qty}</p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {movements.length === 0 && !loading && (
             <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Archive className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-xs font-semibold">No stock movements found</p>
                <p className="text-[10px] uppercase tracking-wider">Try adjusting your filters</p>
             </div>
          )}

          {/* PAGINATION FOOTER */}
          {totalRecords > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span className="font-medium">
                  Showing{" "}
                  <span className="font-bold text-slate-900">
                    {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRecords)}
                  </span>{" "}
                  of <span className="font-bold text-slate-900">{totalRecords}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[70px] text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 border-slate-200"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-3 text-xs font-semibold text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 border-slate-200"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
