"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  RefreshCw,
  Package,
  Filter,
  ArrowUpDown, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingDown,
  LayoutGrid,
  ClipboardList,
  Database,
  ArrowRight,
  Clock,
  X,
  FileText
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import { cn } from "@/lib/utils";

export default function StockView() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  
  const { categories } = usePosData();

  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.append("categoryId", categoryFilter);
      if (search) params.append("search", search);

      const response = await apiClient.get(`/stock?${params.toString()}`);
      if (response.data.success) {
        setStocks(response.data.data);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const fetchMovements = async (stock: any) => {
    try {
      setLoadingMovements(true);
      setSelectedStock(stock);
      setTraceOpen(true);
      const response = await apiClient.get(`/stock/history?productId=${stock.product_id}&branchId=${stock.branch_id}`);
      if (response.data.success) {
        setMovements(response.data.data);
      }
    } catch (error) {
      toast.error("Failed to fetch movement history");
    } finally {
      setLoadingMovements(false);
    }
  };

  const getStatusDisplay = (qty: number) => {
    if (qty <= 0) return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-bold px-2 py-0.5 rounded text-[10px]">OUT OF STOCK</Badge>;
    if (qty <= 10) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold px-2 py-0.5 rounded text-[10px]">LOW STOCK</Badge>;
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold px-2 py-0.5 rounded text-[10px]">IN STOCK</Badge>;
  };

  if (loading && stocks.length === 0) return <PageLoader />;

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/50 min-h-screen font-sans text-slate-900">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <LayoutGrid className="h-6 w-6 text-slate-900" />
            INVENTORY BY LOCATION
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Real-time stock monitoring & audit trail</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchStocks} className="h-9 border-slate-200 font-bold text-xs uppercase tracking-tight">
            <RefreshCw className={cn("h-3.5 w-3.5 mr-2", loading && "animate-spin")} />
            Sync
          </Button>
          <Button size="sm" className="h-9 bg-slate-900 text-white font-bold text-xs uppercase tracking-tight px-4 ring-offset-2 hover:ring-2 hover:ring-slate-900 transition-all">
            <Download className="h-3.5 w-3.5 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardContent className="p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="SEARCH BY PRODUCT NAME…"
                className="pl-10 h-11 border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white transition-colors font-bold text-xs uppercase tracking-tight"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-11 border-slate-200 rounded-xl font-bold text-xs uppercase tracking-tight">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <SelectValue placeholder="All Categories" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL CATEGORIES</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest pl-6">Product Details</TableHead>
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-center">Item code</TableHead>
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest">Location</TableHead>
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-right">Available</TableHead>
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-center">Status</TableHead>
                  <TableHead className="font-black text-slate-900 text-[10px] uppercase tracking-widest text-right pr-6">Intel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-400 font-bold uppercase text-[10px]">No inventory records found</TableCell>
                  </TableRow>
                ) : (
                  stocks.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 group">
                      <TableCell className="py-4 pl-6">
                        <div className="font-black text-slate-900 text-xs uppercase mb-0.5">{item.product?.name}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{item.product?.category?.name || 'General Product'}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono font-bold text-slate-600">{item.product?.sku}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                          <span className="font-bold text-xs uppercase text-slate-700">{item.branch?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 tabular-nums">
                        {Number(item.current_quantity).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusDisplay(Number(item.current_quantity))}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                          onClick={() => fetchMovements(item)}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* INTEL PANEL - SIDEBAR OVERLAY */}
      {traceOpen && selectedStock && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity" onClick={() => setTraceOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-8 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
               <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tighter">STOCK TRACE</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Audit log for node {selectedStock.branch?.name}</p>
               </div>
               <Button variant="ghost" size="icon" onClick={() => setTraceOpen(false)} className="rounded-xl h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-slate-100">
                  <X className="h-5 w-5" />
               </Button>
            </div>

            <div className="bg-slate-900 rounded-2xl p-6 text-white mb-8">
               <div className="flex items-start justify-between mb-6">
                  <div className="bg-white/10 p-2.5 rounded-xl">
                     <Package className="h-5 w-5 text-white" />
                  </div>
                  <Badge className="bg-emerald-500 text-slate-900 font-black text-[9px] border-none px-2 rounded">LIVE DATA</Badge>
               </div>
               <h4 className="font-black text-lg uppercase leading-tight mb-1">{selectedStock.product?.name}</h4>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
                 Item code: {selectedStock.product?.sku || "—"}
               </p>
               <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Current Qty</p>
                     <p className="text-xl font-black tabular-nums">{Number(selectedStock.current_quantity).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Value Estimate</p>
                     <p className="text-xl font-black tabular-nums">---</p>
                  </div>
               </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
               <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <Clock className="h-3 w-3" /> MOVEMENT HISTORY
               </h4>
               
               <ScrollArea className="flex-1 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="p-4 space-y-4">
                    {loadingMovements ? (
                      <PageLoader message="Loading movements..." size="sm" />
                    ) : movements.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Database className="h-6 w-6 text-slate-300" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase">No movements recorded yet</p>
                      </div>
                    ) : (
                      movements.map((move: any) => (
                        <div key={move.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            move.movement_type === 'PURCHASE' ? "bg-emerald-100 text-emerald-700" :
                            move.movement_type === 'SALE' ? "bg-blue-100 text-blue-700" :
                            move.movement_type === 'ADJUSTMENT' ? "bg-amber-100 text-amber-700" :
                            "bg-rose-100 text-rose-700"
                          )}>
                            {move.movement_type === 'PURCHASE' ? <Package className="h-4 w-4" /> : 
                             move.movement_type === 'SALE' ? <FileText className="h-4 w-4" /> : 
                             <RefreshCw className="h-4 w-4" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-black uppercase text-slate-900">{move.movement_type.replace('_', ' ')}</span>
                              <span className={cn(
                                "text-[10px] font-black tabular-nums",
                                Number(move.quantity_change) > 0 ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {Number(move.quantity_change) > 0 ? '+' : ''}{move.quantity_change}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-0.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(move.created_at).toLocaleDateString()}</span>
                              <span className="text-[9px] font-bold text-slate-500 uppercase">{move.user?.email.split('@')[0]}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
               </ScrollArea>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
               <Button 
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-slate-200 hover:shadow-xl hover:-translate-y-0.5 transition-all" 
                onClick={() => setTraceOpen(false)}
               >
                  DISMISS TRACE
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
