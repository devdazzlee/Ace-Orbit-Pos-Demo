"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Trash2,
  Plus,
  Search,
  Calculator,
  Clock,
  CheckCircle2,
  Loader2,
  X,
  History,
  TrendingDown,
  Info,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { cachedGet, queueMutation } from "@/lib/offline-helpers";
import { usePosData } from "@/hooks/use-pos-data";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/page-loader";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISO } from "date-fns";
import * as XLSX from "xlsx";
import { ExcelSheetUploadModal, type SheetColumnSpec } from "@/components/inventory/excel-sheet-upload-modal";

const STOCK_OUT_EXCEL_COLUMNS: SheetColumnSpec[] = [
  { col: "Product Name", req: true, hint: "Must match the product name in your catalog exactly." },
  { col: "Quantity", req: true, hint: "Must be > 0 (Qty, T Pieces, etc. also work)." },
  { col: "Sell Price (Rs)", req: false, hint: "Optional — for line value in the draft; defaults from product." },
  { col: "Notes", req: false, hint: "Optional per line." },
];

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  sales_rate_inc_dis_and_tax: number;
  stock?: number;
  available_stock?: number;
}

interface StockItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  availableStock: number;
  salePrice: number;
  total: number;
  notes?: string;
  /** Set when the line came from Bulk Load (Excel) — not the live stock list screen */
  lineSource?: "sheet" | "manual";
}

interface Customer {
  id: string;
  name: string;
  mobile?: string;
}

interface HistoryItem {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  notes: string;
  product: { name: string; sku: string };
  branch?: { name: string };
  user?: { name?: string; email?: string };
}

const formatCurrency = (n: number) =>
  `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function StockOut() {
  const { products: allProducts, fetchProducts } = usePosData();
  const { fetchProducts: refreshGlobalProducts } = useStore();

  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE">("HISTORY");

  // Master Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({ reason: "", startDate: "", endDate: "" });

  // Creation State
  const [header, setHeader] = useState({
    customerId: "none",
    reason: "SALE",
    notes: "",
    reference: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [stagedItems, setStagedItems] = useState<StockItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Item Form
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [availableStock, setAvailableStock] = useState<number>(0);
  const [itemForm, setItemForm] = useState({ quantity: "", price: "", notes: "" });
  const [openProductCombo, setOpenProductCombo] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Bulk Import State
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, label: "" });
  /** Explains last Excel load vs main "stock management" list — nothing is dispatched until you authorize */
  const [sheetLoadSummary, setSheetLoadSummary] = useState<{
    fileLabel: string;
    sheetRows: number;
    added: number;
    skipped: number;
  } | null>(null);
  const [excelUploadModalOpen, setExcelUploadModalOpen] = useState(false);

  // ── Fetch Metadata ────────────────────────────────────────────────────────
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const customers = await cachedGet<any[]>('/customer', undefined, 'customers-stock-out');
      setCustomers(customers || []);
      await fetchProducts();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMeta(false);
    }
  }, [fetchProducts]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params: Record<string, string> = {};
      if (historyFilters.reason) params.reason = historyFilters.reason;
      if (historyFilters.startDate) params.startDate = historyFilters.startDate;
      if (historyFilters.endDate) params.endDate = historyFilters.endDate;
      const data = await cachedGet<any[]>('/stock-out/history', params, `stock-out-history-${JSON.stringify(params)}`);
      setHistory(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (activeView === "HISTORY") fetchHistory(); }, [activeView, fetchHistory]);

  // ── Available stock lookup ────────────────────────────────────────────────
  const fetchAvailableStock = useCallback(async (productId: string) => {
    try {
      const stocks = await cachedGet<any[]>('/stock', { productId }, `stock-product-${productId}`);
      const qty = (stocks || []).reduce((sum: number, s: any) => sum + Number(s.current_quantity), 0);
      setAvailableStock(qty);
    } catch {
      setAvailableStock(0);
    }
  }, []);

  useEffect(() => {
    if (selectedProduct) fetchAvailableStock(selectedProduct.id);
    else setAvailableStock(0);
  }, [selectedProduct, fetchAvailableStock]);

  const grandTotal = stagedItems.reduce((sum, i) => sum + i.total, 0);

  const productQuery = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!productQuery) return allProducts;
    return allProducts.filter((p) => {
      const hay = `${p.name ?? ""} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase();
      return hay.includes(productQuery);
    });
  }, [allProducts, productQuery]);

  // ── Manual Add Item ───────────────────────────────────────────────────────
  const handleAddStagedItem = () => {
    if (!selectedProduct || !itemForm.quantity) {
      toast.error("Please select a product and enter quantity");
      return;
    }
    const qty = parseFloat(itemForm.quantity);
    if (qty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    if (qty > availableStock && header.reason === "SALE") {
      toast.error(`Low stock: Only ${Math.max(0, availableStock)} units available`);
      return;
    }
    const price = parseFloat(itemForm.price) || selectedProduct.sales_rate_inc_dis_and_tax;
    setStagedItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty,
      availableStock,
      salePrice: price,
      total: qty * price,
      notes: itemForm.notes,
      lineSource: "manual",
    }]);
    setSelectedProduct(null);
    setItemForm({ quantity: "", price: "", notes: "" });
    setProductSearch("");
  };

  const handleRemoveItem = (id: string) => setStagedItems(prev => prev.filter(i => i.id !== id));

  const downloadStockOutTemplate = useCallback(() => {
    const sample = [
      {
        "Product Name": "Example product (use exact catalog name)",
        Quantity: 6,
        "Sell Price (Rs)": 120,
        Notes: "Optional note",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch");
    XLSX.writeFile(wb, "stock-out-dispatch-template.xlsx");
  }, []);

  // ── Bulk Import from Sheet ────────────────────────────────────────────────
  const processStockOutExcelFromFile = async (file: File) => {
    const fileLabel = file.name;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet) as any[];

    if (json.length === 0) {
      toast.error("Empty file — no data rows found");
      return;
    }

    // Fuzzy column helpers — case/space/punctuation insensitive
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().\/]+/g, "");
    const col = (row: any, ...candidates: string[]): string => {
      const rowKeys = Object.keys(row);
      for (const candidate of candidates) {
        const nc = norm(candidate);
        const match = rowKeys.find(k => norm(k) === nc);
        if (match !== undefined && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== "") {
          return String(row[match]).trim();
        }
      }
      return "";
    };
    const colNum = (row: any, ...candidates: string[]): number => parseFloat(col(row, ...candidates)) || 0;

    // Filter blank/instruction rows
    const validRows = json.filter((row: any) => {
      const sku  = col(row, "Item No (SKU)", "SKU", "sku", "Item No");
      const name = col(row, "Product Name", "Name", "name");
      if (!sku && !name) return false;
      if (sku === "---" || name.startsWith("REQUIRED") || sku.startsWith("REQUIRED")) return false;
      return true;
    });

    if (validRows.length === 0) {
      toast.error("No valid rows found in the sheet");
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: validRows.length, label: "Reading file…" });

    const newItems: StockItem[] = [];
    let skipped = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const sku      = col(row, "Item No (SKU)", "SKU", "sku", "Item No", "Sku");
      const nameCol  = col(row, "Product Name", "Name", "name", "ProductName");
      const qty      = colNum(row, "Quantity", "Qty", "qty", "T Pieces", "TPieces", "quantity");
      const price    = colNum(row, "Sell Price (Rs)", "Sell Price", "Price", "Rate", "sales_rate_inc_dis_and_tax", "SellPrice");
      const notes    = col(row, "Notes", "Note", "Remarks", "notes");

      const displayName = nameCol || sku;
      setImportProgress({ current: i + 1, total: validRows.length, label: displayName });

      if (qty <= 0) { skipped++; continue; }

      // Find product in store (fuzzy match by SKU first, then name)
      const product = allProducts.find(
        p => (sku && (p.sku === sku || p.sku?.toLowerCase() === sku.toLowerCase())) ||
             (nameCol && p.name?.toLowerCase() === nameCol.toLowerCase())
      );

      if (!product) {
        console.warn(`Stock Out import: product not found — SKU: "${sku}", Name: "${nameCol}"`);
        skipped++;
        continue;
      }

      const finalPrice = price || product.sales_rate_inc_dis_and_tax || 0;
      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        availableStock: product.available_stock ?? product.stock ?? 0,
        salePrice: finalPrice,
        total: qty * finalPrice,
        notes: notes || undefined,
        lineSource: "sheet",
      });
    }

    setImporting(false);
    setImportProgress({ current: 0, total: 0, label: "" });

    if (newItems.length > 0) {
      setStagedItems(prev => [...prev, ...newItems]);
      setSheetLoadSummary({
        fileLabel,
        sheetRows: validRows.length,
        added: newItems.length,
        skipped,
      });
      toast.success(
        `Sheet loaded — ${newItems.length} line(s) added to this draft${skipped > 0 ? `, ${skipped} row(s) skipped` : ""}. Review step 2, then click Save dispatch.`
      );
    } else {
      setSheetLoadSummary({
        fileLabel,
        sheetRows: validRows.length,
        added: 0,
        skipped,
      });
      toast.error(`No lines added from "${fileLabel}". ${skipped} row(s) skipped — check product names match your catalog (exact name) and quantity > 0.`);
    }
  };

  // ── Submit Dispatch ───────────────────────────────────────────────────────
  const handleSubmitDispatch = async () => {
    if (stagedItems.length === 0) { toast.error("Please add at least one item"); return; }
    setSubmitting(true);
    try {
      const dispatchCount = stagedItems.length;
      const datePart = header.date?.trim() ? `Date: ${header.date.trim()}` : "";
      const refPart = header.reference?.trim() ? `Ref: ${header.reference.trim()}` : "";
      const notesPart = header.notes?.trim() ?? "";
      const mergedNotes = [datePart, refPart, notesPart].filter(Boolean).join(" · ") || undefined;
      const dispatchPayload = {
        reason: header.reason,
        notes: mergedNotes,
        customerId: header.customerId === "none" ? undefined : header.customerId,
        items: stagedItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes?.trim() || undefined,
        })),
      };
      const { queued } = await queueMutation('POST', '/stock-out/bulk', dispatchPayload, 'stock-out', 7);
      setStagedItems([]);
      setSheetLoadSummary(null);
      if (queued) {
        toast.success(`${dispatchCount} item(s) queued offline — will sync when connected`);
      } else {
        toast.success("Inventory dispatched successfully");
        refreshGlobalProducts({ force: true }).catch(() => {});
        setActiveView("HISTORY");
        fetchHistory();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setItemForm(prev => ({ ...prev, price: String(p.sales_rate_inc_dis_and_tax || "") }));
    setOpenProductCombo(false);
    setProductSearch("");
  };

  if (loadingMeta) return <PageLoader message="Loading inventory data..." />;

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="relative z-10 flex flex-col flex-1 p-6 animate-in fade-in duration-500">

        {/* ── PAGE HEADER ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-2.5 rounded-2xl shadow-xl shadow-slate-200">
              <TrendingDown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Stock out</h1>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">
                <strong>Excel</strong> can pre-fill a dispatch list. <strong>Save dispatch</strong> records the removal and
                updates on-hand stock (same idea as Stock in, but outbound).
              </p>
            </div>
          </div>
          <div className="flex p-1 bg-slate-50 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveView("HISTORY")}
              className={cn(
                "px-5 h-8 rounded-lg font-black text-[10px] tracking-widest transition-all uppercase",
                activeView === "HISTORY" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              History logs
            </button>
            <button
              onClick={() => setActiveView("CREATE")}
              className={cn(
                "px-5 h-8 rounded-lg font-black text-[10px] tracking-widest transition-all uppercase",
                activeView === "CREATE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              New dispatch
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeView === "HISTORY" ? (

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex gap-3">
              <Info className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 leading-relaxed">
                <p className="font-medium text-slate-900">What this list shows</p>
                <p className="mt-1">
                  Rows are <strong>stock movements</strong> with a negative quantity (stock removed). Saving a dispatch from{" "}
                  <strong>New dispatch</strong> creates one movement per line via{" "}
                  <code className="rounded bg-white px-1 text-xs">POST /stock-out/bulk</code>.
                </p>
                <p className="mt-2">
                  Sales rung through the main <strong>POS / New sale</strong> screen are logged separately. Anything you do in{" "}
                  <strong>Stock Management</strong> (adjustments, transfers) appears in{" "}
                  <strong>Movement Log</strong> there — use that tab if you need the full audit trail.
                </p>
              </div>
            </div>

            {/* FILTER BAR */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[160px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Reason</p>
                <Select value={historyFilters.reason || "all"} onValueChange={v => setHistoryFilters(f => ({ ...f, reason: v === "all" ? "" : v }))}>
                  <SelectTrigger className="rounded-lg h-10 border-slate-200 text-xs">
                    <SelectValue placeholder="All Reasons" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reasons</SelectItem>
                    <SelectItem value="SALE">Sale</SelectItem>
                    <SelectItem value="DAMAGE">Damage</SelectItem>
                    <SelectItem value="LOSS">Loss</SelectItem>
                    <SelectItem value="RETURN">Return</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">From Date</p>
                <DatePicker 
                  date={historyFilters.startDate ? parseISO(historyFilters.startDate) : undefined}
                  onDateChange={(date) => setHistoryFilters(f => ({ ...f, startDate: date ? format(date, "yyyy-MM-dd") : "" }))}
                  placeholder="START DATE"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">To Date</p>
                <DatePicker 
                  date={historyFilters.endDate ? parseISO(historyFilters.endDate) : undefined}
                  onDateChange={(date) => setHistoryFilters(f => ({ ...f, endDate: date ? format(date, "yyyy-MM-dd") : "" }))}
                  placeholder="END DATE"
                />
              </div>
              <Button disabled={loadingHistory} onClick={fetchHistory} className="h-10 px-6 font-bold bg-slate-900 text-white rounded-lg text-xs gap-2">
                {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                SEARCH
              </Button>
              {(historyFilters.reason || historyFilters.startDate || historyFilters.endDate) && (
                <Button variant="ghost" onClick={() => setHistoryFilters({ reason: "", startDate: "", endDate: "" })}
                  className="h-10 px-4 text-xs font-bold text-slate-400 hover:text-slate-700">
                  CLEAR
                </Button>
              )}
            </div>

            {/* LOG TABLE */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-100">
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Product</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Branch</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Qty</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Type</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Notes</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <PageLoader message="Syncing Logs..." className="min-h-[300px]" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!loadingHistory && history.map(h => (
                    <TableRow key={h.id} className="border-slate-100 hover:bg-slate-50 transition-colors">
                      <TableCell className="px-6 py-3">
                        <p className="text-xs font-semibold text-slate-700">{format(new Date(h.created_at), "dd MMM yy")}</p>
                        <p className="text-[10px] text-slate-400">{format(new Date(h.created_at), "HH:mm")}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="font-bold text-slate-800 text-xs">{h.product?.name}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-[10px] font-semibold text-slate-600">{h.branch?.name ?? "—"}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <span className="font-bold text-xs text-rose-600">-{Math.abs(h.quantity_change)}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className={cn("rounded-md text-[9px] font-bold uppercase px-2 py-0.5 border-slate-200",
                          h.movement_type === "SALE" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100")}>
                          {h.movement_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{h.notes || "—"}</p>
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">{h.user?.name || h.user?.email || "System"}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loadingHistory && history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 px-6">
                        <div className="max-w-lg mx-auto text-center space-y-3">
                          <History className="h-10 w-10 text-slate-300 mx-auto" />
                          <p className="text-base font-semibold text-slate-800">No outbound movements in this range</p>
                          <p className="text-sm text-slate-600 leading-relaxed text-left">
                            Either nothing was saved from <strong>New dispatch</strong> yet, or your filters exclude the rows.
                            Clear dates and reason, then click <strong>Search</strong> again.
                          </p>
                          <p className="text-sm text-slate-600 text-left">
                            For every stock change in the warehouse (including POS sales and adjustments), open{" "}
                            <strong>Stock Management → Movement Log</strong>.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-y-auto pb-6">
            <div className="lg:col-span-8 space-y-6">
              <Card className="rounded-xl border border-violet-200 bg-violet-50/20 shadow-sm relative overflow-hidden">
                {importing && (
                  <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center rounded-xl gap-5">
                    <Loader2 className="h-10 w-10 text-white animate-spin" />
                    <div className="w-80 space-y-3 text-center">
                      <p className="text-[11px] font-black text-white/70 tracking-widest uppercase">Reading Excel — building draft</p>
                      <p className="text-sm font-black text-white truncate px-4">{importProgress.label}</p>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 bg-violet-400 rounded-full transition-all duration-300"
                          style={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : "0%" }}
                        />
                      </div>
                      <p className="text-[10px] font-black text-white/60 tabular-nums">
                        {importProgress.current} / {importProgress.total} rows
                      </p>
                    </div>
                  </div>
                )}
                <CardHeader className="pb-2 border-b border-violet-100/80 bg-white/70">
                  <CardTitle className="text-base font-semibold text-slate-900">Step 1 — Load from Excel (optional)</CardTitle>
                  <CardDescription className="text-sm text-slate-600">
                    Adds lines to the draft below. Stock is <strong>not</strong> reduced until you save in step 2.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={importing}
                      className="bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-lg h-9 text-xs border border-slate-200 disabled:opacity-50"
                      onClick={() => !importing && setExcelUploadModalOpen(true)}
                    >
                      {importing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Importing…
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                          Choose Excel file
                        </>
                      )}
                    </Button>
                  </div>

                  {sheetLoadSummary && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/90 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-violet-950">Last sheet load (draft only)</p>
                          <p className="text-xs text-violet-900 mt-1 leading-snug">
                            Lines are staged until you click <strong>Save dispatch</strong> in the summary panel.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 text-xs text-violet-800"
                          onClick={() => setSheetLoadSummary(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                      <ul className="text-xs text-violet-900/90 space-y-0.5 list-disc pl-4">
                        <li>
                          File: <span className="font-semibold">{sheetLoadSummary.fileLabel}</span>
                        </li>
                        <li>
                          Sheet rows: <strong>{sheetLoadSummary.sheetRows}</strong> — added: <strong>{sheetLoadSummary.added}</strong>{" "}
                          — skipped: <strong>{sheetLoadSummary.skipped}</strong> (unknown product name or qty ≤ 0)
                        </li>
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-slate-600">
                    Use <strong>Choose Excel file</strong> to open the column guide and template (no item code column required —
                    match products by <strong>name</strong> only).
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white">
                <CardHeader className="pb-2 border-b border-slate-100">
                  <CardTitle className="text-base font-semibold text-slate-900">Step 2 — Record dispatch</CardTitle>
                  <CardDescription className="text-sm text-slate-600">
                    Set who/why, add lines, then save. For <strong>Sale</strong>, quantities cannot exceed available stock.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600">Reason</Label>
                      <Select value={header.reason} onValueChange={(v) => setHeader((h) => ({ ...h, reason: v }))}>
                        <SelectTrigger className="rounded-lg h-10 border-slate-200 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SALE">Sale</SelectItem>
                          <SelectItem value="DAMAGE">Damage / scrap</SelectItem>
                          <SelectItem value="LOSS">Loss</SelectItem>
                          <SelectItem value="EXPIRED">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600">Customer (optional)</Label>
                      <Select value={header.customerId} onValueChange={(v) => setHeader((h) => ({ ...h, customerId: v }))}>
                        <SelectTrigger className="rounded-lg h-10 border-slate-200 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Walk-in / not linked</SelectItem>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600">Document ref</Label>
                      <Input
                        value={header.reference}
                        onChange={(e) => setHeader((h) => ({ ...h, reference: e.target.value }))}
                        placeholder="Invoice or gate pass"
                        className="rounded-lg h-10 border-slate-200 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600">Dispatch date</Label>
                      <DatePicker
                        date={header.date ? parseISO(header.date) : undefined}
                        onDateChange={(date) => setHeader((h) => ({ ...h, date: date ? format(date, "yyyy-MM-dd") : "" }))}
                        placeholder="Pick date"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Label className="text-sm font-medium text-slate-800 mb-3 block">Add a line</Label>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="md:col-span-12 lg:col-span-5 space-y-1.5 relative">
                        <Label className="text-xs font-medium text-slate-600">Product</Label>
                        <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between rounded-lg h-10 text-sm border-slate-200 bg-white font-normal"
                            >
                              <span className="truncate text-left">
                                {selectedProduct ? selectedProduct.name : "Search product…"}
                              </span>
                              <Search className="h-3.5 w-3.5 opacity-40 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 rounded-lg shadow-xl border-slate-200 w-[min(100vw-2rem,400px)]" align="start">
                            <Command className="rounded-lg" shouldFilter={false}>
                              <CommandInput
                                placeholder="Type to filter…"
                                className="h-9 text-sm"
                                value={productSearch}
                                onValueChange={setProductSearch}
                              />
                              <CommandList className="max-h-[300px]">
                                <CommandEmpty className="text-sm py-4">No matching products.</CommandEmpty>
                                <CommandGroup>
                                  {filteredProducts.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.sku} ${p.name}`}
                                      onSelect={() => selectProduct(p as Product)}
                                      className="px-4 py-2 border-b border-slate-50 last:border-none cursor-pointer"
                                    >
                                      <div className="flex flex-col flex-1 min-w-0">
                                        <span className="font-medium text-sm truncate">{p.name}</span>
                                      </div>
                                      <span
                                        className={cn(
                                          "text-xs font-semibold ml-2 shrink-0",
                                          (p.available_stock ?? p.stock ?? 0) > 0 ? "text-emerald-600" : "text-rose-500"
                                        )}
                                      >
                                        {p.available_stock ?? p.stock ?? 0} in stock
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {selectedProduct && (
                          <p
                            className={cn(
                              "text-xs font-medium absolute -bottom-5 right-1",
                              availableStock > 0 ? "text-emerald-600" : "text-rose-500"
                            )}
                          >
                            Available: {Math.max(0, availableStock)}
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-6 lg:col-span-2 space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Quantity</Label>
                        <Input
                          type="number"
                          value={itemForm.quantity}
                          onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
                          className="rounded-lg h-10 border-slate-200 text-center font-semibold text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-6 lg:col-span-2 space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Rate (Rs)</Label>
                        <Input
                          type="number"
                          value={itemForm.price}
                          onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                          className="rounded-lg h-10 border-slate-200 text-center font-semibold text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-12 lg:col-span-3">
                        <Button className="w-full bg-slate-900 rounded-lg h-10 font-semibold text-sm gap-2" onClick={handleAddStagedItem}>
                          <Plus className="h-4 w-4" />
                          Add to draft
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">Draft lines ({stagedItems.length})</h3>
                      {stagedItems.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs font-medium text-rose-600 h-auto p-0"
                          onClick={() => {
                            setStagedItems([]);
                            setSheetLoadSummary(null);
                          }}
                        >
                          Clear all
                        </Button>
                      )}
                    </div>
                    <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50/30">
                      <ScrollArea className="h-[260px]">
                        <Table>
                          <TableHeader className="bg-slate-100/50">
                            <TableRow className="h-9">
                              <TableHead className="text-xs font-semibold h-9 px-4">Item</TableHead>
                              <TableHead className="text-xs font-semibold h-9 text-right px-4">Available</TableHead>
                              <TableHead className="text-xs font-semibold h-9 text-right px-4">Qty</TableHead>
                              <TableHead className="text-xs font-semibold h-9 text-right px-4">Value</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stagedItems.map((item) => (
                              <TableRow key={item.id} className="hover:bg-white h-10">
                                <TableCell className="px-4">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-slate-800 text-sm">{item.productName}</span>
                                      {item.lineSource === "sheet" && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] h-5 px-1.5 font-medium bg-violet-100 text-violet-800 border-0"
                                        >
                                          From Excel
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right px-4">
                                  <span
                                    className={cn(
                                      "text-xs font-semibold",
                                      item.availableStock > 0 ? "text-emerald-600" : "text-rose-500"
                                    )}
                                  >
                                    {item.availableStock}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-slate-900 text-sm px-4">{item.quantity}</TableCell>
                                <TableCell className="text-right font-semibold text-rose-600 text-sm px-4">
                                  {formatCurrency(item.total)}
                                </TableCell>
                                <TableCell className="pr-4">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-slate-300 hover:text-rose-500"
                                    onClick={() => handleRemoveItem(item.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {stagedItems.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="h-28 text-center">
                                  <p className="text-sm text-slate-500">Add lines manually or load an Excel file in step 1.</p>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white p-6 lg:sticky lg:top-4">
                <CardHeader className="p-0 pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg">
                      <Calculator className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">Summary</CardTitle>
                      <CardDescription className="text-sm">Review totals, then save.</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 border-dashed text-sm">
                    <span className="text-slate-600">Lines</span>
                    <span className="font-semibold text-slate-900">{stagedItems.length}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 border-dashed text-sm">
                    <span className="text-slate-600">Total units</span>
                    <span className="font-semibold text-slate-900">{stagedItems.reduce((s, i) => s + i.quantity, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 text-sm">
                    <span className="text-slate-600">Total value (at rates above)</span>
                    <span className="text-xl font-semibold text-rose-600">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <Label className="text-xs font-medium text-slate-600">Notes for this dispatch</Label>
                  <Textarea
                    value={header.notes}
                    onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                    placeholder="Driver, vehicle, approval, etc."
                    className="min-h-[96px] text-sm resize-none rounded-lg border-slate-200"
                  />
                </div>

                <Button
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11 rounded-xl font-semibold text-sm mt-6"
                  disabled={submitting || stagedItems.length === 0}
                  onClick={handleSubmitDispatch}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {submitting ? "Saving…" : "Save dispatch"}
                </Button>

                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 flex gap-2">
                  <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Saving deducts stock immediately (per line). Reference and dispatch date are copied into the movement notes for
                    auditing.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      <ExcelSheetUploadModal
        open={excelUploadModalOpen}
        onOpenChange={setExcelUploadModalOpen}
        title="Stock Out — dispatch draft (Excel)"
        description="Adds lines to your draft only. Stock is not reduced until you click Save dispatch. Products must already exist — match by exact product name."
        columns={STOCK_OUT_EXCEL_COLUMNS}
        onDownloadTemplate={downloadStockOutTemplate}
        onFileSelected={(file) => {
          void processStockOutExcelFromFile(file);
        }}
      />
    </div>
  );
}
