"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Plus, 
  Loader2, 
  Truck, 
  Printer, 
  Check, 
  ArrowRightLeft, 
  ArrowRight, 
  Package, 
  MapPin, 
  Calendar, 
  FileText, 
  AlertCircle,
  TrendingUp,
  History,
  CheckCircle2,
  Clock,
  X,
  Database,
  User,
  ExternalLink,
  ShieldCheck,
  Ship,
  Scale
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/page-loader";

// --- KPI CARD COMPONENT ---
function KpiCard({ title, value, icon: Icon, color, description }: any) {
  const colorMap: any = {
    blue: "from-blue-500 to-indigo-600 shadow-blue-100",
    amber: "from-amber-400 to-orange-500 shadow-amber-100",
    green: "from-emerald-500 to-green-600 shadow-emerald-100",
    purple: "from-purple-500 to-violet-600 shadow-purple-100",
    teal: "from-teal-500 to-cyan-600 shadow-teal-100"
  };

  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 group">
      <CardContent className="p-0">
        <div className="p-6 flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold text-slate-800 tracking-tight">{value}</h3>
              <p className="text-xs font-medium text-slate-400">{description}</p>
            </div>
          </div>
          <div className={cn("p-3 rounded-2xl bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-500", colorMap[color])}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className="h-1.5 w-full bg-slate-50 border-t border-slate-100">
          <div className={cn("h-full bg-gradient-to-r transition-all duration-1000", colorMap[color])} style={{ width: '80%' }} />
        </div>
      </CardContent>
    </Card>
  );
}

export function Transfers() {
  const { 
    products, 
    branches, 
    productsLoading, 
    branchesLoading,
    fetchProducts,
    fetchBranches
  } = usePosData();

  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: "",
    notes: "",
    // Advanced fields
    reason: "Stock Replenishment",
    carrierName: "",
    vehicleNo: "",
    estimatedArrival: "",
  });

  const [sourceStock, setSourceStock] = useState<number | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Fetch Transfers
  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`${API_BASE}/transfers`, {
        params: { page: 1, limit: 100 },
      });
      setTransfers(res.data?.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to synchronize transfer records");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial Sync
  useEffect(() => {
    fetchTransfers();
    fetchProducts();
    fetchBranches();
  }, [fetchTransfers, fetchProducts, fetchBranches]);

  // Fetch Stock in Source Branch
  useEffect(() => {
    if (form.productId && form.fromBranchId) {
      const fetchCurrentStock = async () => {
        setStockLoading(true);
        try {
          const res = await apiClient.get(`${API_BASE}/stock/product/${form.productId}/branch/${form.fromBranchId}`);
          setSourceStock(res.data?.data?.current_quantity || 0);
        } catch (e) {
          setSourceStock(0);
        } finally {
          setStockLoading(false);
        }
      };
      fetchCurrentStock();
    } else {
      setSourceStock(null);
    }
  }, [form.productId, form.fromBranchId]);

  // Handle Outside Click for Product Selector
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(event.target as Node)) {
        setProdDropdownOpen(false);
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

  const handleSubmit = async () => {
    const qty = Number(form.quantity);
    if (!form.productId || !form.fromBranchId || !form.toBranchId || !qty || qty <= 0) {
      toast.warning("Incomplete Data Transmission", {
        description: "Please verify all required ledger fields are populated."
      });
      return;
    }

    if (form.fromBranchId === form.toBranchId) {
      toast.error("Invalid Destination", {
        description: "Source and destination nodes cannot be identical."
      });
      return;
    }

    if (sourceStock !== null && qty > sourceStock) {
      toast.error("Insufficient Telemetry", {
        description: `Cannot transfer ${qty} units. Only ${sourceStock} available at source.`
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/transfers`, {
        productId: form.productId,
        fromBranchId: form.fromBranchId,
        toBranchId: form.toBranchId,
        quantity: qty,
        notes: form.notes || undefined,
        reason: form.reason || undefined,
        carrierName: form.carrierName || undefined,
        vehicleNo: form.vehicleNo || undefined,
        estimatedArrival: form.estimatedArrival || undefined,
      });
      
      toast.success("Transfer Chain Initialized", {
        description: "Inventory movement has been successfully recorded."
      });
      
      setDialogOpen(false);
      setForm({ 
        productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "", 
        reason: "Stock Replenishment", carrierName: "", vehicleNo: "", estimatedArrival: "" 
      });
      setSearchTerm("");
      fetchTransfers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Execution Error: Synchronizer Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiClient.patch(`${API_BASE}/transfers/${id}/status`, { status });
      toast.success(`Transfer status updated to ${status}`);
      fetchTransfers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update status");
    }
  };

  const printSlip = (t: any) => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`
        <html><head><title>Transfer Slip - ${t.reference_no || t.id}</title></head>
        <body style="font-family: sans-serif; padding: 40px; color: #334155;">
          <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #4f46e5;">ACE ORBITS POS</h1>
            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #64748b;">STOCK TRANSFER CHALLAN</h2>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 14px;">
            <div>
              <p style="margin: 5px 0;"><strong>REFERENCE:</strong> ${t.reference_no || t.id}</p>
              <p style="margin: 5px 0;"><strong>REASON:</strong> ${t.reason || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>TIMESTAMP:</strong> ${new Date(t.transfer_date).toLocaleString()}</p>
              <p style="margin: 5px 0;"><strong>LOGISTICS NODE:</strong> ${t.from_branch?.name}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 5px 0;"><strong>TARGET NODE:</strong> ${t.to_branch?.name}</p>
              <p style="margin: 5px 0;"><strong>CARRIER:</strong> ${t.carrier_name || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>VEHICLE:</strong> ${t.vehicle_no || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>CURRENT STATUS:</strong> ${t.status}</p>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 800;">MANAGED ASSET</th>
                <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 800;">SKU/ID</th>
                <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 800;">TRANSFER VOLUME</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${t.product?.name}</td>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; font-family: monospace;">${t.product?.sku}</td>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #4f46e5;">${t.quantity} UNITS</td>
              </tr>
            </tbody>
          </table>
          ${t.notes ? `
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; font-weight: 800; color: #64748b; margin-bottom: 8px;">LOGISTICS REMARKS</p>
              <p style="margin: 0; font-size: 14px;">${t.notes}</p>
            </div>
          ` : ""}
          <div style="margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
            <div>
              <div style="border-top: 1px solid #cbd5e1; margin-top: 30px; padding-top: 10px; font-size: 12px; font-weight: bold; color: #64748b;">DISPATCH AUTHORIZATION</div>
            </div>
            <div>
              <div style="border-top: 1px solid #cbd5e1; margin-top: 30px; padding-top: 10px; font-size: 12px; font-weight: bold; color: #64748b;">RECIPIENT ACKNOWLEDGMENT</div>
            </div>
          </div>
          <p style="margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center;">This is a system-generated document. Dynamic ID: ${t.id}</p>
        </body></html>
      `);
      w.document.close();
      w.print();
    }
  };

  const getStatusStyle = (s: string) => {
    switch(s) {
      case 'PENDING': return "bg-slate-100 text-slate-800 border-slate-200 shadow-sm";
      case 'DISPATCHED': return "bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm animate-pulse";
      case 'RECEIVED': return "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm font-bold";
      case 'CANCELLED': return "bg-rose-50 text-rose-700 border-rose-100 shadow-sm";
      default: return "bg-gray-100 text-gray-800 shadow-sm";
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = transfers.length;
    const pending = transfers.filter(t => t.status === 'PENDING').length;
    const dispatched = transfers.filter(t => t.status === 'DISPATCHED').length;
    const received = transfers.filter(t => t.status === 'RECEIVED').length;
    return { total, pending, dispatched, received };
  }, [transfers]);

  if (loading && transfers.length === 0) return <PageLoader message="Loading transfers..." />;

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100">
                <Truck className="h-6 w-6 text-white" />
             </div>
             <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stock Logistics</h1>
          </div>
          <p className="text-slate-500 font-medium flex items-center gap-2 pl-1">
            <Database className="h-4 w-4 text-slate-400" />
            Enterprise Inventory Transfer Management System
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 rounded-lg px-6">
              <Plus className="h-4 w-4 mr-2" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl bg-white border-none shadow-2xl p-0 overflow-hidden rounded-2xl">
            <DialogHeader className="p-6 pb-2 bg-slate-50/80">
              <DialogTitle className="text-lg font-bold">New Inventory Transfer</DialogTitle>
              <DialogDescription className="text-xs">Move stock between locations.</DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Main Entry */}
                <div className="space-y-4">
                  <div className="space-y-1.5 relative" ref={productRef}>
                    <Label className="text-xs font-bold text-slate-500">Product</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search product..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          if (!prodDropdownOpen) setProdDropdownOpen(true);
                        }}
                        onFocus={() => setProdDropdownOpen(true)}
                        className="h-10 bg-white border-slate-200 rounded-md"
                      />
                      <Search className="absolute right-3 top-3 h-4 w-4 text-slate-300" />
                    </div>

                    {prodDropdownOpen && (
                      <Card className="absolute z-50 w-full mt-1 shadow-lg border-slate-100 overflow-hidden">
                        <ScrollArea className="h-[200px]">
                          {filteredProducts.length > 0 ? (
                            <div>
                              {filteredProducts.map((p) => (
                                <div
                                  key={p.id}
                                  className="p-3 cursor-pointer hover:bg-slate-50 border-b last:border-0 border-slate-50 flex justify-between items-center"
                                  onClick={() => {
                                    setForm({ ...form, productId: p.id });
                                    setSearchTerm(p.name);
                                    setProdDropdownOpen(false);
                                  }}
                                >
                                  <span className="font-medium text-slate-700 text-sm">{p.name}</span>
                                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">Qty: {p.stock}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-slate-400 text-xs">No results</div>
                          )}
                        </ScrollArea>
                      </Card>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500">From</Label>
                      <Select value={form.fromBranchId} onValueChange={(v) => setForm({ ...form, fromBranchId: v })}>
                        <SelectTrigger className="h-10 rounded-md">
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500">To</Label>
                      <Select value={form.toBranchId} onValueChange={(v) => setForm({ ...form, toBranchId: v })}>
                        <SelectTrigger className="h-10 rounded-md">
                          <SelectValue placeholder="Target" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map(b => (
                            <SelectItem key={b.id} value={b.id} disabled={b.id === form.fromBranchId}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500">Transfer Quantity</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0"
                        value={form.quantity}
                        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        className="h-10 rounded-md font-bold text-indigo-600"
                      />
                      {sourceStock !== null && (
                         <div className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">
                           Available: {sourceStock}
                         </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Logistics Info */}
                <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                   <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Reason</Label>
                      <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                        <SelectTrigger className="h-9 bg-white rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Stock Replenishment">Stock Replenishment</SelectItem>
                          <SelectItem value="Branch Support">Branch Support</SelectItem>
                          <SelectItem value="Damage Return">Damage Return</SelectItem>
                        </SelectContent>
                      </Select>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Carrier</Label>
                        <Input
                          placeholder="Courier"
                          value={form.carrierName}
                          onChange={(e) => setForm({ ...form, carrierName: e.target.value })}
                          className="h-8 bg-white border-slate-200 rounded px-2 text-[11px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Vehicle</Label>
                        <Input
                          placeholder="Plate #"
                          value={form.vehicleNo}
                          onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })}
                          className="h-8 bg-white border-slate-200 rounded px-2 text-[11px]"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Est. Arrival</Label>
                      <Input
                        type="datetime-local"
                        value={form.estimatedArrival}
                        onChange={(e) => setForm({ ...form, estimatedArrival: e.target.value })}
                        className="h-9 bg-white border-slate-200 rounded text-xs"
                      />
                   </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">Extra Notes</Label>
                <Textarea
                  placeholder="Optional remarks..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[60px] bg-slate-50/30 border-slate-200 rounded-md text-sm"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50/80 border-t border-slate-100 flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="px-6 h-10 font-bold border-slate-200">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-10 font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                Confirm & Create Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Logistic Cycles" value={stats.total} icon={History} color="blue" description="cumulative" />
        <KpiCard title="Awaiting Dispatch" value={stats.pending} icon={Clock} color="amber" description="in queue" />
        <KpiCard title="In-Transit Cargo" value={stats.dispatched} icon={Truck} color="teal" description="freight active" />
        <KpiCard title="Success Rate" value={stats.received} icon={CheckCircle2} color="green" description="handovers" />
      </div>

      {/* TRANSFERS TABLE */}
      <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-500" />
                Regional Logistic Explorer
              </CardTitle>
              <CardDescription className="font-medium text-slate-500">Real-time tracking of inter-branch inventory handovers.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm shadow-slate-100">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="w-[120px] font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 pl-8">Timeline</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 text-center">Reference</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6">Managed Asset</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6">Logistics Lane</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6">Consignment Intel</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 text-center w-[150px]">Status</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 text-right pr-8">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                   <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                       <div className="space-y-3">
                          <History className="h-10 w-10 text-slate-100 mx-auto" />
                          <p className="text-slate-400 font-bold tracking-tight italic">Registry stream empty.</p>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((t) => (
                    <TableRow key={t.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="pl-8 py-6">
                        <div className="flex flex-col">
                           <span className="font-bold text-slate-700 text-xs">{new Date(t.transfer_date).toLocaleDateString()}</span>
                           <span className="text-[9px] font-black text-slate-400 uppercase">{new Date(t.transfer_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono text-[9px] border-indigo-100 bg-indigo-50/30 text-indigo-600 px-2 py-0.5 rounded">
                          {t.reference_no || t.id.slice(0, 8)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                           <div className="flex flex-col">
                              <span className="font-black text-slate-800 text-xs">{t.product?.name}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty: {t.quantity}</span>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-600">{t.from_branch?.name?.slice(0,10)}</span>
                            <ArrowRight className="h-3 w-3 text-indigo-300" />
                            <span className="text-[10px] font-black text-slate-600">{t.to_branch?.name?.slice(0,10)}</span>
                         </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col gap-0.5">
                            {t.carrier_name && <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1"><Ship className="h-2 w-2" /> {t.carrier_name}</span>}
                            {t.vehicle_no && <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1"><Truck className="h-2 w-2" /> {t.vehicle_no}</span>}
                            <span className="text-[9px] font-black text-indigo-500 uppercase italic">{t.reason || 'General Replenishment'}</span>
                         </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("px-3 py-1 rounded-full border font-black uppercase text-[9px] tracking-widest", getStatusStyle(t.status))}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 w-8 p-0 border-slate-200 text-slate-600 rounded-lg"
                            onClick={() => printSlip(t)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {t.status === 'PENDING' && (
                            <Button 
                              size="sm" 
                              className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 font-bold text-[10px]"
                              onClick={() => updateStatus(t.id, 'DISPATCHED')}
                            >
                              Dispatch
                            </Button>
                          )}
                          {(t.status === 'DISPATCHED') && (
                            <Button 
                              size="sm" 
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 font-bold text-[10px]"
                              onClick={() => updateStatus(t.id, 'RECEIVED')}
                            >
                              Receive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
