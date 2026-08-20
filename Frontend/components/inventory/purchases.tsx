"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  Trash2, 
  Package, 
  Calculator, 
  Calendar as CalendarIcon, 
  FileText, 
  Truck, 
  ChevronRight, 
  Save, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  X,
  FileSpreadsheet,
  Info,
  RefreshCw
} from "lucide-react";
import apiClient, { BULK_UPLOAD_AXIOS_TIMEOUT_MS } from "@/lib/apiClient";
import { cachedGet, queueMutation } from "@/lib/offline-helpers";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/page-loader";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISO } from "date-fns";
import * as XLSX from "xlsx";
import { useStore } from "@/lib/store";
import { ExcelSheetUploadModal } from "@/components/inventory/excel-sheet-upload-modal";
import {
  CATALOG_IMPORT_SHEET_COLUMNS,
  CATALOG_IMPORT_OPTIONAL_COLUMNS_NOTE,
} from "@/components/inventory/catalog-import-sheet-spec";

interface Product {
  id: string;
  name: string;
  sku: string;
  purchase_rate: number;
  sales_rate_inc_dis_and_tax: number;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface Branch {
  id: string;
  name: string;
  branch_type: string;
}

interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  batchNo: string;
  expiryDate: string;
  total: number;
  ctns?: number;
  piecePerCtn?: number;
  cbmPerCtn?: number;
  tCbm?: number;
  gwPerCtn?: number;
  tGw?: number;
}

interface PurchaseResponse {
  id: string;
  purchase_date: string;
  invoice_ref: string;
  supplier: { name: string };
  warehouse_branch: { name: string };
  product?: { name: string };
  quantity?: number;
  cost_price?: number;
  delivery_status: string;
  items?: any[];
}

/** Each GET /purchases row is one line: valuation = qty × cost (API may use camelCase or snake_case). */
function formatPurchaseLineValuation(p: PurchaseResponse): string | null {
  const raw = p as unknown as Record<string, unknown>;
  const q = Number(raw.quantity ?? p.quantity);
  const c = Number(raw.cost_price ?? p.cost_price);
  if (Number.isFinite(q) && Number.isFinite(c)) {
    const val = q * c;
    return `Rs ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  const items = Array.isArray(p.items) ? p.items : [];
  if (items.length > 0) {
    const sum = items.reduce((acc: number, it: Record<string, unknown>) => {
      const iq = Number(it.quantity ?? it.qty);
      const ic = Number(it.cost_price ?? it.costPrice);
      if (Number.isFinite(iq) && Number.isFinite(ic)) return acc + iq * ic;
      return acc;
    }, 0);
    if (Number.isFinite(sum)) {
      return `Rs ${sum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
  }
  return null;
}

export function Purchases() {
  const { toast } = useToast();
  const { fetchProducts: refreshGlobalProducts } = useStore();
  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE">("HISTORY");
  
  // Master Data
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // History State
  const [purchases, setPurchases] = useState<PurchaseResponse[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filters, setFilters] = useState({
    supplierId: "",
    startDate: "",
    endDate: "",
  });

  // Creation State
  const [header, setHeader] = useState({
        supplierId: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        invoiceRef: "",
        notes: "",
        deliveryStatus: "COMPLETE" as "PARTIAL" | "COMPLETE",
  });

  const [stagedItems, setStagedItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Bulk import progress
  const [importing, setImporting] = useState(false);
  const [serverUploading, setServerUploading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, label: "" });
  /** Excel path hits /products/bulk-upload — distinct from manual purchase lines below */
  const [sheetImportReport, setSheetImportReport] = useState<{
    at: number;
    totalRows: number;
    succeeded: number;
    failed: number;
    withStockCount: number;
    firstError?: string;
  } | null>(null);
  const [excelUploadModalOpen, setExcelUploadModalOpen] = useState(false);

  // Selector States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemForm, setItemForm] = useState({
    quantity: "",
    costPrice: "",
    salePrice: "",
    batchNo: "",
    expiryDate: "",
  });
  const [productSearch, setProductSearch] = useState("");
  const [openProductCombo, setOpenProductCombo] = useState(false);

  // Fetch Data
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [products, suppliers] = await Promise.all([
        cachedGet<any[]>('/products', { fetch_all: true, is_active: true }, 'products-purchases'),
        cachedGet<any[]>('/suppliers', { is_active: true }, 'suppliers'),
      ]);
      setProducts(products || []);
      setSuppliers(suppliers || []);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to load master data", variant: "destructive" });
    } finally {
      setLoadingMeta(false);
    }
  }, [toast]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params: any = { page: 1, limit: 50 };
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const data = await cachedGet<any[]>('/purchases', params, `purchases-${JSON.stringify(params)}`);
      setPurchases(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [filters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (activeView === "HISTORY") fetchHistory(); }, [activeView, fetchHistory]);

  // Derived Values
  const grandTotal = stagedItems.reduce((sum, item) => sum + item.total, 0);

  // Business Logic
  const handleAddStagedItem = () => {
    if (!selectedProduct || !itemForm.quantity || !itemForm.costPrice) {
      toast({ title: "Product & Quantity Required", variant: "destructive" });
      return;
    }

    const qty = parseFloat(itemForm.quantity);
    const cost = parseFloat(itemForm.costPrice);
    
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty,
      costPrice: cost,
      salePrice: parseFloat(itemForm.salePrice) || selectedProduct.sales_rate_inc_dis_and_tax,
      batchNo: itemForm.batchNo,
      expiryDate: itemForm.expiryDate,
      total: qty * cost,
    };

    setStagedItems([...stagedItems, newItem]);
    // Reset item form
    setSelectedProduct(null);
    setItemForm({
      quantity: "",
      costPrice: "",
      salePrice: "",
      batchNo: "",
      expiryDate: "",
    });
    setProductSearch("");
  };

  const handleRemoveStagedItem = (id: string) => {
    setStagedItems(stagedItems.filter(i => i.id !== id));
  };

  const handleSubmitPurchase = async () => {
    if (!header.supplierId || stagedItems.length === 0) {
      toast({ title: "Incomplete Stock In", description: "Supplier and items are mandatory.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const purchasePayload = {
        ...header,
        items: stagedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          salePrice: item.salePrice,
          batchNo: item.batchNo || undefined,
          expiryDate: item.expiryDate || undefined,
          ctns: item.ctns,
          piecePerCtn: item.piecePerCtn,
          cbmPerCtn: item.cbmPerCtn,
          tCbm: item.tCbm,
          gwPerCtn: item.gwPerCtn,
          tGw: item.tGw,
        })),
      };
      const { queued } = await queueMutation('POST', '/purchases', purchasePayload, 'purchase', 8);
      setStagedItems([]);
      setHeader({ ...header, invoiceRef: "", notes: "" });
      if (queued) {
        toast({ title: "Saved Offline", description: `${stagedItems.length} items queued — will sync when connected.` });
      } else {
        toast({ title: "Stock Updated", description: `Successfully logged ${stagedItems.length} items.` });
        refreshGlobalProducts({ force: true }).catch(() => {});
        setActiveView("HISTORY");
      }
    } catch (e: any) {
      toast({ title: "Submission Failed", description: e?.response?.data?.message || "Check your network connection", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setItemForm({
      ...itemForm,
      costPrice: p.purchase_rate.toString(),
      salePrice: p.sales_rate_inc_dis_and_tax.toString(),
    });
    setOpenProductCombo(false);
  };

  const downloadStockInTemplate = useCallback(() => {
    const sample = [
      {
        "Product Name": "Example product",
        "Buy Price (Rs)": 100,
        "Sell Price (Rs)": 150,
        "Initial Stock Qty": 50,
        Category: "General",
        Unit: "PCS",
        "Min Stock (Reorder)": 10,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "stock-in-catalog-import-template.xlsx");
  }, []);

  // Bulk Import — parses sheet, creates missing products, then directly submits stock-in
  const processStockInExcelFromFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet) as any[];

    if (json.length === 0) {
      toast({ title: "Empty File", description: "No data rows found in the sheet.", variant: "destructive" });
      return;
    }

    // Fuzzy column helpers — case/space/punctuation insensitive
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().\/]+/g, "");
    const col = (row: any, ...candidates: string[]): string => {
      const rowKeys = Object.keys(row);
      for (const candidate of candidates) {
        const nc = norm(candidate);
        const match = rowKeys.find((k) => norm(k) === nc);
        if (match !== undefined && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== "") {
          return String(row[match]).trim();
        }
      }
      return "";
    };
    const colNum = (row: any, ...candidates: string[]): number =>
      parseFloat(col(row, ...candidates)) || 0;

    // Filter blank / instruction rows
    const validRows = json.filter((row: any) => {
      const sku  = col(row, "Item No (SKU)", "Item no", "SKU", "sku", "Item No");
      const name = col(row, "Product Name", "Name", "name", "product_name");
      if (!sku && !name) return false;
      if (sku === "---" || name.startsWith("REQUIRED") || sku.startsWith("REQUIRED")) return false;
      return true;
    });

    if (validRows.length === 0) {
      toast({ title: "Empty File", description: "No valid data rows found.", variant: "destructive" });
      return;
    }

    console.log("📋 Sheet columns:", Object.keys(validRows[0]));
    console.log("📋 First row:", validRows[0]);

    setSheetImportReport(null);

    // Phase 1 — build payload in a for-loop so progress bar animates while parsing rows
    setImporting(true);
    setImportProgress({ current: 0, total: validRows.length, label: "Reading rows…" });

    const payload: any[] = [];
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i] as any;
      const name = col(row, "Product Name", "Name", "name", "product_name", "ProductName");
      const sku  = col(row, "Item No (SKU)", "Item no", "SKU", "sku", "Item No", "Sku");

      payload.push({
        sku,
        name,
        stock_qty:                  colNum(row, "Initial Stock Qty", "Initial Stock", "InitialStockQty",
                                      "Opening Stock", "Opening Qty", "Stock Qty", "T Pieces", "Quantity", "Qty", "Stock"),
        purchase_rate:              colNum(row, "Buy Price (Rs)", "Buy Price", "BuyPrice", "Purchase Rate", "purchase_rate"),
        sales_rate_inc_dis_and_tax: colNum(
          row,
          "Sales Rate",
          "SalesRate",
          "Sell Price (Rs)",
          "Sell Price",
          "SellPrice",
          "Selling Price",
          "sale_price",
          "sales_rate_inc_dis_and_tax"
        ),
        sales_rate_exc_dis_and_tax: colNum(
          row,
          "Sales Rate",
          "SalesRate",
          "Sell Price (Rs)",
          "Sell Price",
          "SellPrice",
          "Selling Price",
          "sale_price",
          "sales_rate_inc_dis_and_tax"
        ),
        min_qty:       colNum(row, "Min Stock (Reorder)", "Low Stock Alert", "Min Stock", "MinStock") || 10,
        category_name: col(row, "Category", "category_name", "category", "Cat") || undefined,
        unit_name:     col(row, "Unit", "unit_name", "unit", "UOM") || undefined,
        supplier_name: col(row, "Supplier", "supplier_name", "supplier") || undefined,
        brand_name:    col(row, "Brand", "brand_name", "brand") || undefined,
        description:   col(row, "Description", "description", "Notes", "notes") || undefined,
      });

      // Update progress and yield to React every row so the bar actually animates
      setImportProgress({ current: i + 1, total: validRows.length, label: name || sku });
      await new Promise(r => setTimeout(r, 40));
    }

    const validPayload = payload.filter(p => p.name || p.sku);
    if (validPayload.length === 0) {
      setImporting(false);
      setImportProgress({ current: 0, total: 0, label: "" });
      toast({ title: "Import Failed", description: "No valid rows found in sheet.", variant: "destructive" });
      return;
    }

    const badRates = validPayload.find(
      (p) =>
        !Number(p.purchase_rate) ||
        Number(p.purchase_rate) <= 0 ||
        !Number(p.sales_rate_inc_dis_and_tax) ||
        Number(p.sales_rate_inc_dis_and_tax) <= 0
    );
    if (badRates) {
      setImporting(false);
      setImportProgress({ current: 0, total: 0, label: "" });
      toast({
        title: "Missing rates",
        description: `Each row needs Purchase Rate and Sales Rate greater than 0 (same as Add Product). Check row: "${badRates.name || badRates.sku || "unknown"}".`,
        variant: "destructive",
      });
      return;
    }

    // Phase 2 — Sequential requests to server (creates product + sets stock per row on backend)
    setServerUploading(true);
    let allResults: any[] = [];
    
    try {
      for (let i = 0; i < validPayload.length; i++) {
        // Update progress for current item being sent
        setImportProgress({ 
          current: i + 1, 
          total: validPayload.length, 
          label: `Uploading: ${validPayload[i].name || validPayload[i].sku}...` 
        });

        const res = await apiClient.post(
          "/products/bulk-upload",
          { products: [validPayload[i]] },
          { timeout: BULK_UPLOAD_AXIOS_TIMEOUT_MS }
        );
        
        const rowResults: any[] = res.data?.data || [];
        allResults = [...allResults, ...rowResults];
      }

      const succeeded = allResults.filter(r => r.success);
      const failed    = allResults.filter(r => !r.success);
      const stocked   = succeeded.filter(r => (r.stock_set ?? 0) > 0).length;

      setImporting(false);
      setServerUploading(false);
      setImportProgress({ current: 0, total: 0, label: "" });

      if (failed.length > 0) console.warn("Import failures:", failed);

      if (succeeded.length === 0) {
        const firstError = failed[0]?.error || "Unknown error";
        setSheetImportReport({
          at: Date.now(),
          totalRows: validPayload.length,
          succeeded: 0,
          failed: failed.length,
          withStockCount: 0,
          firstError,
        });
        toast({
          title: "Import Failed",
          description: `All ${failed.length} rows failed. Reason: ${firstError}`,
          variant: "destructive",
        });
        return;
      }

      refreshGlobalProducts({ force: true }).catch(() => {});
      fetchHistory();

      setSheetImportReport({
        at: Date.now(),
        totalRows: validPayload.length,
        succeeded: succeeded.length,
        failed: failed.length,
        withStockCount: stocked,
        firstError: failed[0]?.error,
      });

      const partialWarn = failed.length > 0 ? ` (${failed.length} rows skipped: ${failed[0]?.error || "unknown error"})` : "";
      toast({
        title: succeeded.length === validPayload.length ? "Sheet import finished" : "Sheet import partially finished",
        description: `${succeeded.length} of ${validPayload.length} products saved in catalog, ${stocked} with opening stock. See Step 1 summary.${partialWarn}`,
      });
    } catch (err: any) {
      setImporting(false);
      setServerUploading(false);
      setImportProgress({ current: 0, total: 0, label: "" });
      const msg = err?.response?.data?.message || err?.message || "Server error during import.";
      setSheetImportReport({
        at: Date.now(),
        totalRows: 0,
        succeeded: 0,
        failed: 0,
        withStockCount: 0,
        firstError: msg,
      });
      toast({
        title: "Import Failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  if (loadingMeta) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Background Logo */}
      <img src="/logo.jpeg" alt="Logo" className="opacity-5 absolute pointer-events-none" style={{ top: '20px', left: '20px', width: '100px' }} />

      <div className="relative z-10 flex flex-col flex-1 p-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-2.5 rounded-2xl shadow-xl shadow-slate-200">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Stock in</h1>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">
                <strong>Excel</strong> adds many new products and opening stock. <strong>Supplier form</strong> records one
                delivery (invoice) and the lines you add below.
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
               New Entry
             </button>
          </div>
        </div>

        {activeView === "HISTORY" ? (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex gap-3">
              <Info className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 leading-relaxed">
                <p className="font-medium text-slate-900">What this list shows</p>
                <p className="mt-1">
                  Only <strong>supplier deliveries</strong> you save from <strong>New Entry → Save purchase</strong> (server{" "}
                  <code className="rounded bg-white px-1 text-xs">POST /purchases</code>). Each line becomes a purchase record
                  with supplier, invoice, and cost.
                </p>
                <p className="mt-2">
                  Stock added via <strong>Stock Management → New products (Excel)</strong> or <strong>Stock In → Step 1 Excel</strong>{" "}
                  updates inventory through <strong>bulk product import</strong> — it writes{" "}
                  <strong>stock movements</strong>, not purchase rows, so it will <strong>not</strong> appear here. To review that
                  activity use <strong>Inventory → Stock Management → Movement Log</strong> tab (or{" "}
                  <strong>Stock Operations → Movement Log</strong>).
                </p>
              </div>
            </div>

            {/* History Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Supplier Entity</Label>
                <Select value={filters.supplierId} onValueChange={(v) => setFilters({...filters, supplierId: v === "all" ? "" : v})}>
                  <SelectTrigger className="rounded-lg h-9 border-slate-200 font-bold bg-white text-xs">
                    <SelectValue placeholder="All Sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL SUPPLIERS</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Date Range Start</Label>
                <DatePicker 
                  date={filters.startDate ? parseISO(filters.startDate) : undefined}
                  onDateChange={(date) => setFilters({...filters, startDate: date ? format(date, "yyyy-MM-dd") : ""})}
                  placeholder="START DATE"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Date Range End</Label>
                <DatePicker 
                  date={filters.endDate ? parseISO(filters.endDate) : undefined}
                  onDateChange={(date) => setFilters({...filters, endDate: date ? format(date, "yyyy-MM-dd") : ""})}
                  placeholder="END DATE"
                />
              </div>
              <div className="flex items-end">
                  <Button className="w-full bg-slate-900 text-white h-9 rounded-lg font-black text-[10px] tracking-widest uppercase" onClick={fetchHistory} disabled={loadingHistory}>
                     {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                     SEARCH
                  </Button>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
               <ScrollArea className="flex-1">
                 <Table>
                   <TableHeader className="bg-slate-50 sticky top-0 z-10">
                     <TableRow className="border-slate-100">
                        <TableHead className="w-[120px] uppercase text-[9px] font-black text-slate-400 px-6 h-10">Timestamp</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Doc Ref</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Supplier</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Branch</TableHead>
                        <TableHead className="text-right uppercase text-[9px] font-black text-slate-400 h-10">Valuation</TableHead>
                        <TableHead className="text-right uppercase text-[9px] font-black text-slate-400 px-6 h-10">Status</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {loadingHistory ? (
                       <TableRow>
                         <TableCell colSpan={6} className="p-0">
                           <PageLoader message="Syncing Archive..." className="min-h-[300px]" />
                         </TableCell>
                       </TableRow>
                     ) : purchases.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={6} className="py-12 px-6">
                            <div className="max-w-lg mx-auto text-center space-y-3">
                               <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                               <p className="text-base font-semibold text-slate-800">No supplier purchases in this list</p>
                               <p className="text-sm text-slate-600 leading-relaxed text-left">
                                 That is expected if all your stock came from <strong>catalog / Excel bulk import</strong> (opening
                                 stock) rather than from <strong>Save purchase</strong> on this screen. Those imports still increased
                                 on-hand qty — they are stored as stock movements, not as rows in this purchase history.
                               </p>
                               <p className="text-sm text-slate-600 text-left">
                                 To see them: open <strong>Stock Management</strong> and check the <strong>Movement Log</strong> tab
                                 (movements tagged as bulk/catalog import).
                               </p>
                               <p className="text-xs text-slate-500 pt-2">
                                 Filters above only search saved purchase records. Clear dates/supplier and click Search if you
                                 expect rows but still see none — then no <code className="rounded bg-slate-100 px-1">POST /purchases</code>{" "}
                                 data exists yet.
                               </p>
                            </div>
                         </TableCell>
                       </TableRow>
                     ) : (
                       purchases.map((p) => (
                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-slate-50">
                          <TableCell className="px-6 py-4">
                             <p className="font-black text-slate-900 text-xs uppercase">{format(new Date(p.purchase_date), "dd MMM yy")}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase">{format(new Date(p.purchase_date), "hh:mm a")}</p>
                          </TableCell>
                          <TableCell className="font-black text-slate-900 text-[10px] uppercase">{p.invoice_ref || "SYSTEM_GEN"}</TableCell>
                          <TableCell className="font-black text-slate-900 text-xs uppercase">{p.supplier?.name}</TableCell>
                          <TableCell className="font-bold text-slate-500 text-[10px] uppercase">{p.warehouse_branch?.name}</TableCell>
                          <TableCell className="text-right font-black text-slate-900 text-xs tabular-nums">
                            {formatPurchaseLineValuation(p) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right px-6">
                             <Badge className={cn("px-2 py-0 h-5 rounded-md text-[8px] font-black uppercase border-none", p.delivery_status === "COMPLETE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                                {p.delivery_status}
                             </Badge>
                          </TableCell>
                        </TableRow>
                       ))
                     )}
                   </TableBody>
                 </Table>
               </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-y-auto pb-6">
            <div className="lg:col-span-8 space-y-6">
              {/* —— A: Excel = catalog only —— */}
              <Card className="rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm relative overflow-hidden">
                {importing && (
                  <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center rounded-xl gap-5">
                    <Loader2 className="h-10 w-10 text-white animate-spin" />
                    <div className="w-80 space-y-3 text-center px-4">
                      <p className="text-xs font-medium text-white/80">
                        {serverUploading ? "Saving each row to the product catalog…" : "Reading your Excel file…"}
                      </p>
                      <p className="text-sm font-semibold text-white truncate">{importProgress.label}</p>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 bg-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : "0%" }}
                        />
                      </div>
                      <p className="text-xs text-emerald-300/90 tabular-nums">
                        {importProgress.current} / {importProgress.total}{" "}
                        {serverUploading ? "rows sent to server" : "rows read"}
                      </p>
                    </div>
                  </div>
                )}
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-emerald-100/80 bg-white/60">
                  <div className="space-y-2 max-w-xl">
                    <CardTitle className="text-lg font-semibold text-slate-900">Step 1 — New products from Excel (optional)</CardTitle>
                    <CardDescription className="text-sm text-slate-600 leading-relaxed">
                      For a list of <strong>new products</strong> with prices and opening stock. When you pick a file, each row is
                      saved to the <strong>product catalog</strong> — it does <strong>not</strong> fill the supplier receipt in Step 2.
                    </CardDescription>
                  </div>
                  <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
                    <Button
                      type="button"
                      variant="default"
                      disabled={importing}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white h-10 px-4"
                      onClick={() => !importing && setExcelUploadModalOpen(true)}
                    >
                      {importing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-4 w-4 mr-2" /> Choose Excel file
                        </>
                      )}
                    </Button>
                    <span className="text-[11px] text-slate-500 text-right max-w-[200px]">.xlsx / .xls / .csv</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <p className="text-xs text-slate-600">
                    Click <strong>Choose Excel file</strong> for the same column layout as <strong>Add Product</strong> (name, unit,
                    category, purchase rate, sales rate, min stock, opening stock). Item codes are generated when omitted. Skip this
                    step if you only need a supplier bill — use Step 2.
                  </p>
                  {sheetImportReport && (
                    <div
                      className={`rounded-lg border p-4 space-y-2 ${
                        sheetImportReport.succeeded > 0
                          ? "border-emerald-200 bg-white"
                          : "border-amber-200 bg-amber-50/90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Last file result</p>
                          <p className="text-xs text-slate-600 mt-1">
                            Catalog rows saved: <strong>{sheetImportReport.succeeded}</strong> of{" "}
                            <strong>{sheetImportReport.totalRows}</strong> — failed:{" "}
                            <strong>{sheetImportReport.failed}</strong> — rows with stock set:{" "}
                            <strong>{sheetImportReport.withStockCount}</strong>
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setSheetImportReport(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {sheetImportReport.firstError && sheetImportReport.failed > 0 && (
                        <p className="text-xs text-rose-700">First error: {sheetImportReport.firstError}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* —— B: Supplier receipt —— */}
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-lg font-semibold text-slate-900">Step 2 — Supplier delivery (GRN)</CardTitle>
                  <CardDescription className="text-sm text-slate-600 leading-relaxed">
                    Use this for a real purchase: choose supplier and date, add each product and quantity, then{" "}
                    <strong>Save purchase</strong> on the right. Only lines you add here appear on the invoice.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 text-left">
                      <Label className="text-xs font-medium text-slate-700">Supplier</Label>
                      <Select value={header.supplierId} onValueChange={(v) => setHeader({ ...header, supplierId: v })}>
                        <SelectTrigger className="rounded-lg border-slate-200 h-10 bg-white text-sm">
                          <SelectValue placeholder="Choose supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-sm">
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-xs font-medium text-slate-700">Delivery date</Label>
                      <DatePicker
                        date={header.purchaseDate ? parseISO(header.purchaseDate) : undefined}
                        onDateChange={(date) => setHeader({ ...header, purchaseDate: date ? format(date, "yyyy-MM-dd") : "" })}
                        placeholder="Pick date"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-xs font-medium text-slate-700">Invoice / GRN reference</Label>
                      <Input
                        value={header.invoiceRef}
                        onChange={(e) => setHeader({ ...header, invoiceRef: e.target.value })}
                        placeholder="e.g. INV-1024"
                        className="rounded-lg h-10 border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:p-5 space-y-5">
                    <p className="text-xs font-medium text-slate-700">Add one line at a time</p>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-end">
                      <div className="md:col-span-5 space-y-2 text-left">
                        <Label className="text-xs font-medium text-slate-600">Product</Label>
                        <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between rounded-lg border-slate-200 h-10 text-sm font-normal bg-white">
                              <span className="truncate pr-2 text-left">{selectedProduct ? selectedProduct.name : "Search product…"}</span>
                              <Search className="h-4 w-4 shrink-0 opacity-40" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[min(100vw-2rem,480px)] p-0 rounded-lg shadow-lg border border-slate-200" align="start">
                            <Command>
                              <CommandInput placeholder="Search…" className="text-sm h-10" />
                              <CommandList className="max-h-[280px]">
                                <CommandEmpty className="text-sm py-6 text-center text-slate-500">No products found</CommandEmpty>
                                <CommandGroup>
                                  {products.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.sku} ${p.name}`}
                                      onSelect={() => selectProduct(p)}
                                      className="px-3 py-2.5 cursor-pointer text-sm"
                                    >
                                      <div className="flex flex-col gap-0.5">
                                        <span>{p.name}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs font-medium text-slate-600 block">Qty</Label>
                        <Input
                          type="number"
                          value={itemForm.quantity}
                          onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                          className="rounded-lg border-slate-200 bg-white h-10 text-sm text-center tabular-nums"
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs font-medium text-slate-600 block">Cost / unit (Rs)</Label>
                        <Input
                          type="number"
                          value={itemForm.costPrice}
                          onChange={(e) => setItemForm({ ...itemForm, costPrice: e.target.value })}
                          className="rounded-lg border-slate-200 bg-white h-10 text-sm text-center tabular-nums"
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg h-10 text-sm" onClick={handleAddStagedItem}>
                          Add to this bill
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80">
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-600">Batch / lot (optional)</Label>
                        <Input
                          value={itemForm.batchNo}
                          onChange={(e) => setItemForm({ ...itemForm, batchNo: e.target.value })}
                          className="rounded-lg h-9 text-sm bg-white"
                          placeholder="Lot number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-600">Expiry (optional)</Label>
                        <DatePicker
                          date={itemForm.expiryDate ? parseISO(itemForm.expiryDate) : undefined}
                          onDateChange={(date) => setItemForm({ ...itemForm, expiryDate: date ? format(date, "yyyy-MM-dd") : "" })}
                          placeholder="None"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Lines on this bill</h4>
                    <p className="text-xs text-slate-500">These lines are what will be saved with the supplier invoice — not the Excel import above.</p>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <ScrollArea className="max-h-[360px]">
                        <Table>
                          <TableHeader className="bg-slate-50 border-b border-slate-100">
                            <TableRow className="h-10">
                              <TableHead className="text-xs font-medium text-slate-600 px-4">Product</TableHead>
                              <TableHead className="text-xs font-medium text-slate-600 text-center w-20">Qty</TableHead>
                              <TableHead className="text-xs font-medium text-slate-600 text-right">Unit cost</TableHead>
                              <TableHead className="text-xs font-medium text-slate-600 text-right">Line total</TableHead>
                              <TableHead className="w-10 px-2" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stagedItems.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="py-14 text-center">
                                  <Package className="h-8 w-8 mx-auto text-slate-200 mb-2" />
                                  <p className="text-sm text-slate-600 font-medium">No lines yet</p>
                                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                                    Pick a product, enter quantity and cost, then click &quot;Add to this bill&quot;.
                                  </p>
                                </TableCell>
                              </TableRow>
                            ) : (
                              stagedItems.map((item) => (
                                <TableRow key={item.id} className="hover:bg-slate-50/80 border-b border-slate-50 last:border-0">
                                  <TableCell className="px-4 py-3">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-slate-900">{item.productName}</span>
                                      {item.batchNo ? (
                                        <span className="text-xs text-slate-500">Lot {item.batchNo}</span>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center text-sm tabular-nums">{item.quantity}</TableCell>
                                  <TableCell className="text-right text-sm text-slate-600 tabular-nums">Rs {item.costPrice.toLocaleString()}</TableCell>
                                  <TableCell className="text-right text-sm font-medium tabular-nums">Rs {item.total.toLocaleString()}</TableCell>
                                  <TableCell className="px-2">
                                    <button
                                      type="button"
                                      className="text-slate-300 hover:text-rose-600 p-2 rounded-md hover:bg-rose-50"
                                      onClick={() => handleRemoveStagedItem(item.id)}
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 space-y-5 sticky top-4">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-2 rounded-lg">
                    <Calculator className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Receipt summary</h3>
                    <p className="text-xs text-slate-500">Step 2 only — Excel lines are not counted here.</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Line count</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{stagedItems.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Total quantity</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{stagedItems.reduce((s, i) => s + i.quantity, 0)}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-slate-600 text-sm block mb-1">Bill total</span>
                    <span className="text-2xl font-semibold text-slate-900 tabular-nums">Rs {grandTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-700">Notes (optional)</Label>
                  <Textarea
                    value={header.notes}
                    onChange={(e) => setHeader({ ...header, notes: e.target.value })}
                    placeholder="Delivery notes, vehicle, etc."
                    className="rounded-lg border-slate-200 bg-slate-50 resize-none min-h-[88px] text-sm placeholder:text-slate-400"
                  />
                </div>

                <Button
                  className="w-full bg-slate-900 text-white h-11 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
                  disabled={submitting || stagedItems.length === 0}
                  onClick={handleSubmitPurchase}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Save purchase"
                  )}
                </Button>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 flex gap-2">
                  <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Saving records this supplier bill and updates stock for the lines above. Add all products before saving.
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
        title="Stock In — catalog & opening stock (Excel)"
        description="Each row creates or updates a product and can set opening stock. Same fields as Add Product in Stock Management → Inventory. This is not the supplier invoice in Step 2."
        columns={CATALOG_IMPORT_SHEET_COLUMNS}
        extraHelp={CATALOG_IMPORT_OPTIONAL_COLUMNS_NOTE}
        onDownloadTemplate={downloadStockInTemplate}
        onFileSelected={(file) => {
          void processStockInExcelFromFile(file);
        }}
      />
    </div>
  );
}
