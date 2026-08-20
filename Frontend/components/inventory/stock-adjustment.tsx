"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Edit, 
  Loader2, 
  Plus, 
  Search, 
  MapPin, 
  Package, 
  ClipboardCheck, 
  History, 
  ArrowRightLeft, 
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Download,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info,
  X,
  LayoutGrid,
  RefreshCw,
  Clock
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { cachedGet, queueMutation } from "@/lib/offline-helpers";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { cn } from "@/lib/utils";

export function StockAdjustment() {
  const { products, fetchProducts } = usePosData();

  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    productId: "",
    adjustmentType: "RECONCILIATION" as any,
    adjustmentCategory: "CORRECTION" as any,
    physicalCount: "",
    changeQuantity: "",
    referenceNo: "",
    reason: "",
  });

  const fetchAdjustments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await cachedGet<any[]>('/stock-adjustments', { page: 1, limit: 100 }, 'stock-adjustments');
      setAdjustments(data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load adjustment history");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStockLevels = useCallback(async () => {
    try {
      const stockList = await cachedGet<any[]>('/stock', { limit: 1000 }, 'stock-levels');
      const map: Record<string, number> = {};
      (stockList || []).forEach((s: any) => {
        map[`${s.product_id}-${s.branch_id}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch (e) {
      console.error("Failed to fetch stock levels", e);
    }
  }, []);

  useEffect(() => {
    fetchAdjustments();
    fetchStockLevels();
    fetchProducts();
  }, [fetchAdjustments, fetchStockLevels, fetchProducts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [products, searchTerm]);

  const selectedProduct = useMemo(() => 
    products.find(p => p.id === form.productId),
    [products, form.productId]
  );

  const currentSystemQty = useMemo(() => {
    if (!form.productId) return 0;
    // Sum across all branches for this product
    return Object.entries(stocks)
      .filter(([key]) => key.startsWith(`${form.productId}-`))
      .reduce((sum, [, qty]) => sum + qty, 0);
  }, [form.productId, stocks]);

  const handleSubmit = async () => {
    if (!form.productId) {
      toast.error("Product is required");
      return;
    }

    const payload: any = {
      productId: form.productId,
      systemQuantity: currentSystemQty,
      adjustmentType: form.adjustmentType,
      adjustmentCategory: form.adjustmentCategory,
      reason: form.reason || `${form.adjustmentType} via POS Portal`,
      referenceNo: form.referenceNo,
    };

    if (form.adjustmentType === 'RECONCILIATION') {
       if (form.physicalCount === "") {
          toast.error("Physical count is required for reconciliation");
          return;
       }
       payload.physicalCount = Number(form.physicalCount);
    } else {
       if (form.changeQuantity === "") {
          toast.error("Change quantity is required");
          return;
       }
       payload.changeQuantity = Number(form.changeQuantity);
    }

    try {
      setSubmitting(true);
      const { queued } = await queueMutation('POST', '/stock-adjustments', payload, 'stock-adjustment', 6);
      setDialogOpen(false);
      setForm({ ...form, productId: "", physicalCount: "", changeQuantity: "", referenceNo: "", reason: "" });
      setSearchTerm("");
      if (queued) {
        toast.success("Saved offline — adjustment will sync when connected");
      } else {
        toast.success("Inventory synchronized successfully");
        fetchAdjustments();
        fetchStockLevels();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to execute stock adjustment");
    } finally {
      setSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (adjustments.length === 0) return;
    const headers = ["Date", "Product", "Branch", "Type", "Category", "System Qty", "Change/Phys", "Difference", "Staff", "Reason"];
    const rows = adjustments.map(a => [
      new Date(a.adjustment_date).toLocaleString(),
      a.product?.name || "",
      a.branch?.name || "",
      a.adjustment_type,
      a.adjustment_category,
      a.system_quantity,
      a.adjustment_type === 'RECONCILIATION' ? a.physical_count : a.change_quantity,
      a.difference,
      a.user?.email || "N/A",
      a.reason || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-adjustments-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const stats = useMemo(() => {
    const totalCount = adjustments.length;
    let shrink = 0;
    let gain = 0;
    adjustments.forEach(a => {
       const diff = Number(a.difference);
       if (diff < 0) shrink += Math.abs(diff);
       else gain += diff;
    });
    return { totalCount, shrink: shrink.toFixed(0), gain: gain.toFixed(0) };
  }, [adjustments]);

  if (loading && adjustments.length === 0) return <PageLoader />;

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/50 min-h-screen font-sans text-slate-900">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3 text-slate-900">
            <ClipboardCheck className="h-6 w-6" />
            STOCK ADJUSTMENTS
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Physical reconciliation & discrepancy logs</p>
        </div>

        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 border-slate-200 font-bold text-xs uppercase tracking-tight">
             <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
           </Button>
           <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-9 px-4 bg-slate-900 text-white font-medium text-xs uppercase tracking-tight shadow-sm hover:ring-2 hover:ring-slate-900 transition-all">
                  <Plus className="h-4 w-4 mr-2" /> New Adjustment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Stock Adjustment</DialogTitle>
                  <DialogDescription>
                    Adjust stock levels for physical reconciliation.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* PRODUCT SEARCH */}
                  <div className="space-y-2 relative" ref={dropdownRef}>
                    <Label>Search Product</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="Search product…"
                        className="pl-10"
                        value={form.productId ? selectedProduct?.name : searchTerm}
                        onFocus={() => {
                          setProductDropdownOpen(true);
                          if (form.productId) {
                            setSearchTerm("");
                            setForm(f => ({ ...f, productId: "" }));
                          }
                        }}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setProductDropdownOpen(true);
                        }}
                      />
                      {form.productId && (
                        <button onClick={() => { setForm(f => ({ ...f, productId: "" })); setSearchTerm(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {productDropdownOpen && (
                      <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg py-1">
                        {filteredProducts.map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setForm(f => ({ ...f, productId: p.id }));
                              setProductDropdownOpen(false);
                              setSearchTerm(p.name);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none flex flex-col"
                          >
                            <span className="font-medium text-slate-900 text-sm">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select value={form.adjustmentType} onValueChange={(v) => setForm(f => ({...f, adjustmentType: v}))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RECONCILIATION">Set Fixed Qty</SelectItem>
                          <SelectItem value="ADDITION">Add (+)</SelectItem>
                          <SelectItem value="SUBTRACTION">Subtract (-)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Select value={form.adjustmentCategory} onValueChange={(v) => setForm(f => ({...f, adjustmentCategory: v}))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CORRECTION">Correction</SelectItem>
                          <SelectItem value="DAMAGE">Damage</SelectItem>
                          <SelectItem value="EXPIRED">Expired</SelectItem>
                          <SelectItem value="THEFT">TheFT</SelectItem>
                          <SelectItem value="RETURN_TO_SUPPLIER">Return</SelectItem>
                          <SelectItem value="ADMINISTRATIVE">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Current Qty</p>
                      <h4 className="text-2xl font-semibold text-slate-900">{form.productId ? currentSystemQty : "—"}</h4>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs">
                        {form.adjustmentType === 'RECONCILIATION' ? 'New Total Qty' : 'Change Amount'}
                      </Label>
                      <Input 
                        type="number"
                        className="text-lg font-semibold"
                        placeholder="0"
                        value={form.adjustmentType === 'RECONCILIATION' ? form.physicalCount : form.changeQuantity}
                        onChange={(e) => {
                          if (form.adjustmentType === 'RECONCILIATION') setForm(f => ({...f, physicalCount: e.target.value}));
                          else setForm(f => ({...f, changeQuantity: e.target.value}));
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Remarks (Optional)</Label>
                    <Textarea 
                      className="min-h-[60px]"
                      placeholder="Add any additional details..."
                      value={form.reason}
                      onChange={(e) => setForm(f => ({...f, reason: e.target.value}))}
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto bg-slate-900">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Adjustment"}
                  </Button>
                </DialogFooter>
              </DialogContent>
           </Dialog>
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 flex items-center justify-between group hover:border-slate-400 transition-colors">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Cycles</p>
                <h3 className="text-2xl font-black text-slate-900 tabular-nums">{stats.totalCount}</h3>
              </div>
              <div className="bg-slate-100 p-2.5 rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-colors text-slate-400">
                <History className="h-5 w-5" />
              </div>
          </Card>
          <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 flex items-center justify-between group hover:border-rose-400 transition-colors">
              <div>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Shrinkage</p>
                <h3 className="text-2xl font-black text-rose-600 tabular-nums">-{stats.shrink}</h3>
              </div>
              <div className="bg-rose-50 p-2.5 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-colors text-rose-400">
                <TrendingDown className="h-5 w-5" />
              </div>
          </Card>
          <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 flex items-center justify-between group hover:border-emerald-400 transition-colors">
              <div>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Gains</p>
                <h3 className="text-2xl font-black text-emerald-700 tabular-nums">+{stats.gain}</h3>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
          </Card>
          <Card className="rounded-2xl border border-slate-200 shadow-sm bg-slate-900 p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">System Status</p>
                <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Synced
                </h3>
              </div>
              <Zap className="h-5 w-5 text-emerald-400 opacity-50" />
          </Card>
      </div>

      {/* TABLE SECTION */}
      <Card className="border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest pl-8 h-12">Date / Time</TableHead>
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest h-12">Asset Details</TableHead>
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest h-12">Location</TableHead>
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest h-12">Method / Reason</TableHead>
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-right h-12">Variance</TableHead>
              <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-right pr-8 h-12">Operator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((a) => {
              const isLoss = Number(a.difference) < 0;
              return (
                <TableRow key={a.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 italic-none">
                  <TableCell className="py-5 pl-8">
                     <p className="font-black text-slate-900 text-xs tabular-nums uppercase">{new Date(a.adjustment_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                     <p className="text-[10px] font-bold text-slate-400 tabular-nums uppercase">{new Date(a.adjustment_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
                  </TableCell>
                  <TableCell>
                     <p className="font-black text-slate-900 text-xs uppercase mb-0.5">{a.product?.name}</p>
                     <code className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-mono font-medium text-slate-600">Code: {a.product?.sku || "—"}</code>
                  </TableCell>
                  <TableCell>
                     <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        <span className="font-bold text-xs uppercase text-slate-700">{a.branch?.name || "Main Warehouse"}</span>
                     </div>
                  </TableCell>
                  <TableCell>
                     <p className="text-[10px] font-black text-slate-900 uppercase mb-0.5">{a.adjustment_type}</p>
                     <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-2 py-0 border-none h-4", 
                        isLoss ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                     )}>
                        {a.adjustment_category}
                     </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                     <p className={cn("font-black text-sm tabular-nums", isLoss ? "text-rose-600" : "text-emerald-700")}>
                        {Number(a.difference) > 0 ? "+" : ""}{Number(a.difference).toFixed(0)}
                     </p>
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Final: {a.physical_count ?? a.change_quantity}</p>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                     <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase">{a.user?.email?.split('@')[0] || "SYSTEM"}</span>
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
                           <Clock className="h-3 w-3 text-slate-300" />
                        </div>
                     </div>
                  </TableCell>
                </TableRow>
              );
            })}
            
            {adjustments.length === 0 && !loading && (
               <TableRow>
                  <TableCell colSpan={6} className="py-24 text-center">
                     <div className="flex flex-col items-center gap-2 opacity-20">
                        <ClipboardCheck className="h-12 w-12 text-slate-900" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Zero Discrepancies Recorded</p>
                     </div>
                  </TableCell>
               </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
