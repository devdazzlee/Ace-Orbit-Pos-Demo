"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, ArrowRightLeft, RefreshCw, TrendingUp, TrendingDown, Package, Loader2, Calendar, Edit, MapPin, Filter, Trash2, X, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { Textarea } from "@/components/ui/textarea";
import { BulkImporter } from "./inventory/bulk-importer";

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stock {
  id: string;
  product: Product;
  branch: Branch;
  current_quantity: number;
  last_updated: string;
}

interface Movement {
  id: string;
  product: Product;
  branch: Branch;
  movement_type: string;
  quantity_change: number;
  previous_qty: number;
  new_qty: number;
  created_at: string;
  notes?: string;
  user?: { email: string };
}

type TabPaginationMeta = {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
};

function TabLoadingOverlay({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function TabPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = "items",
  loading = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  loading?: boolean;
}) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pageOptions = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-5 bg-slate-50/30 border-t border-slate-100 gap-4">
      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
        Showing {start}–{end} of {total} {itemLabel}
        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1 || loading}
            className="rounded-xl font-black text-[10px] border-slate-200 h-9 px-4 hover:bg-white"
          >
            Previous
          </Button>
          <Select
            value={String(page)}
            onValueChange={(value) => onPageChange(Number(value))}
            disabled={loading}
          >
            <SelectTrigger className="w-[88px] h-9 rounded-xl border-slate-200 bg-white text-xs font-black text-indigo-600">
              <SelectValue placeholder={`Page ${page}`} />
            </SelectTrigger>
            <SelectContent className="max-h-60 rounded-md border-slate-300">
              {pageOptions.map((pageNum) => (
                <SelectItem key={pageNum} value={String(pageNum)} className="text-xs font-bold">
                  {pageNum}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages || loading}
            className="rounded-xl font-black text-[10px] border-slate-200 h-9 px-4 hover:bg-white"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function StockManagement() {
  // Global store data
  const {
    products: globalProducts,
    categories,
    isAnyLoading: globalLoading,
    refreshAllData: triggerGlobalRefresh
  } = usePosData();

  // Data lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [todayMovements, setTodayMovements] = useState<Movement[]>([]);

  // Pagination and meta
  const [totalStocks, setTotalStocks] = useState(0);
  const [stockMeta, setStockMeta] = useState({ page: 1, limit: 20, totalPages: 1, totalQuantity: 0, lowStockCount: 0 });
  const [historyMeta, setHistoryMeta] = useState<TabPaginationMeta>({ page: 1, limit: 20, totalPages: 1, total: 0 });
  const [todayMeta, setTodayMeta] = useState<TabPaginationMeta>({ page: 1, limit: 20, totalPages: 1, total: 0 });
  const [todayTotal, setTodayTotal] = useState(0);

  // UI state
  const [activeTab, setActiveTab] = useState<"stock" | "history" | "today">("stock");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Product search state
  const [productSearch, setProductSearch] = useState("");

  // Pagination for each tab
  const [stockPage, setStockPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [todayPage, setTodayPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // Dropdown state for product selection
  const [addProductDropdownOpen, setAddProductDropdownOpen] = useState(false);
  const [adjustProductDropdownOpen, setAdjustProductDropdownOpen] = useState(false);
  const [removeProductDropdownOpen, setRemoveProductDropdownOpen] = useState(false);

  // Refs for dropdown containers
  const addProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const adjustProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const removeProductDropdownRef = React.useRef<HTMLDivElement>(null);

  const stockTabRef = useRef<HTMLDivElement>(null);
  const historyTabRef = useRef<HTMLDivElement>(null);
  const todayTabRef = useRef<HTMLDivElement>(null);
  const scrollAfterLoadTab = useRef<"stock" | "history" | "today" | null>(null);

  const scrollTabPanelToTop = useCallback((tab: "stock" | "history" | "today") => {
    const target =
      tab === "stock" ? stockTabRef.current :
      tab === "history" ? historyTabRef.current :
      todayTabRef.current;

    if (!target) return;

    const scrollParent = target.closest("main");
    if (scrollParent) {
      const top =
        target.getBoundingClientRect().top -
        scrollParent.getBoundingClientRect().top +
        scrollParent.scrollTop -
        16;
      scrollParent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const queueScrollAfterLoad = useCallback((tab: "stock" | "history" | "today") => {
    scrollAfterLoadTab.current = tab;
    requestAnimationFrame(() => scrollTabPanelToTop(tab));
  }, [scrollTabPanelToTop]);

  const handleStockPageChange = useCallback((page: number) => {
    setStockPage(page);
    queueScrollAfterLoad("stock");
  }, [queueScrollAfterLoad]);

  const handleHistoryPageChange = useCallback((page: number) => {
    setHistoryPage(page);
    queueScrollAfterLoad("history");
  }, [queueScrollAfterLoad]);

  const handleTodayPageChange = useCallback((page: number) => {
    setTodayPage(page);
    queueScrollAfterLoad("today");
  }, [queueScrollAfterLoad]);

  const handlePageSizeChange = useCallback((value: string) => {
    setStockPageSize(Number(value));
    setStockPage(1);
    setHistoryPage(1);
    setTodayPage(1);
    queueScrollAfterLoad(activeTab);
  }, [activeTab, queueScrollAfterLoad]);

  // Form state

  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    supplierId: "",
    unitCost: "" as string | number,
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    branchId: "",
    quantityChange: "" as string | number,
    reason: "",
  });

  const [removeForm, setRemoveForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    reason: "WASTE",
    notes: "",
  });

  // Instant filtered products from global store
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return globalProducts.slice(0, 50);
    const search = productSearch.toLowerCase().trim();
    return globalProducts.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.sku?.toLowerCase().includes(search) ||
      p.barcode?.includes(search)
    ).slice(0, 50);
  }, [globalProducts, productSearch]);

  // 1) Fetch branches on mount
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const bRes = await apiClient.get(`${API_BASE}/branches?fetch_all=true`);
        setBranches(bRes.data.data);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load branches");
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadMeta();
  }, []);

  const showErrorToast = (e: any) => {
    console.error("Inventory Operation Error:", e);
    const message = e.response?.data?.message || e.message || "An unexpected operation failure occurred";
    toast.error(message);
  };

  useEffect(() => {
    setStockPage(1);
    setHistoryPage(1);
    setTodayPage(1);
  }, [branchFilter, categoryFilter, searchTerm, stockPageSize]);

  useLayoutEffect(() => {
    setIsLoading(true);
  }, [activeTab, stockPage, historyPage, todayPage, branchFilter, categoryFilter, searchTerm, stockPageSize]);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams({
      limit: stockPageSize.toString(),
    });

    if (branchFilter && branchFilter !== "all") params.append("branchId", branchFilter);
    if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
    if (searchTerm.trim()) params.append("search", searchTerm.trim());

    return params;
  }, [branchFilter, categoryFilter, searchTerm, stockPageSize]);

  const refreshAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseParams = buildFilterParams();
      const todaySummaryParams = new URLSearchParams(baseParams);
      todaySummaryParams.set("page", "1");
      todaySummaryParams.set("limit", "1");

      if (activeTab === "stock") {
        const params = new URLSearchParams(baseParams);
        params.set("page", stockPage.toString());
        const [sRes, tSummaryRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/today?${todaySummaryParams}`),
        ]);

        setAllStocks(sRes.data.data || []);
        setTotalStocks(sRes.data.meta?.total || 0);
        if (sRes.data.meta) setStockMeta(sRes.data.meta);
        setTodayTotal(tSummaryRes.data.meta?.total ?? 0);
      } else if (activeTab === "history") {
        const params = new URLSearchParams(baseParams);
        params.set("page", historyPage.toString());
        const [hRes, tSummaryRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock/history?${params}`),
          apiClient.get(`${API_BASE}/stock/today?${todaySummaryParams}`),
        ]);

        setHistory(hRes.data.data || []);
        setHistoryMeta({
          page: hRes.data.meta?.page ?? historyPage,
          limit: hRes.data.meta?.limit ?? stockPageSize,
          totalPages: hRes.data.meta?.totalPages ?? 1,
          total: hRes.data.meta?.total ?? 0,
        });
        setTodayTotal(tSummaryRes.data.meta?.total ?? 0);
      } else {
        const params = new URLSearchParams(baseParams);
        params.set("page", todayPage.toString());
        const tRes = await apiClient.get(`${API_BASE}/stock/today?${params}`);

        setTodayMovements(tRes.data.data || []);
        const meta = {
          page: tRes.data.meta?.page ?? todayPage,
          limit: tRes.data.meta?.limit ?? stockPageSize,
          totalPages: tRes.data.meta?.totalPages ?? 1,
          total: tRes.data.meta?.total ?? 0,
        };
        setTodayMeta(meta);
        setTodayTotal(meta.total);
      }
    } catch (e: any) {
      toast.error("Failed to load stock data");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, buildFilterParams, stockPage, historyPage, todayPage, stockPageSize]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  useEffect(() => {
    if (!isLoading && scrollAfterLoadTab.current) {
      const tab = scrollAfterLoadTab.current;
      scrollAfterLoadTab.current = null;
      requestAnimationFrame(() => scrollTabPanelToTop(tab));
    }
  }, [isLoading, scrollTabPanelToTop]);

  // Fetch initial data
  const { suppliers, fetchSuppliers } = usePosData();
  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Handle clicks outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addProductDropdownRef.current && !addProductDropdownRef.current.contains(event.target as Node)) setAddProductDropdownOpen(false);
      if (adjustProductDropdownRef.current && !adjustProductDropdownRef.current.contains(event.target as Node)) setAdjustProductDropdownOpen(false);
      if (removeProductDropdownRef.current && !removeProductDropdownRef.current.contains(event.target as Node)) setRemoveProductDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Derived analytics
  const paginationOptions = [20, 50, 100, 500];
  const totalUnits = stockMeta.totalQuantity || 0;
  const alerts = stockMeta.lowStockCount || 0;
  const totalStockPages = stockMeta.totalPages || 1;

  // Handlers

  const handleAddStock = async () => {
    const quantity = typeof addForm.quantity === "string"
      ? (addForm.quantity === "" ? 0 : Number(addForm.quantity) || 0)
      : addForm.quantity;

    if (!addForm.productId || !quantity || quantity <= 0) {
      toast.error("Please select a product and enter quantity");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId: addForm.productId,
        branchId: addForm.branchId,
        quantity: quantity,
        supplierId: addForm.supplierId,
        unitCost: addForm.unitCost ? Number(addForm.unitCost) : undefined
      });

      setIsAddOpen(false);
      clearProductUI();
      refreshAllData();

      toast.success("Stock added successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    const quantityChange = typeof adjustForm.quantityChange === "string"
      ? (adjustForm.quantityChange === "" || adjustForm.quantityChange === "-" ? 0 : Number(adjustForm.quantityChange) || 0)
      : adjustForm.quantityChange;

    if (!adjustForm.productId || quantityChange === 0) {
      toast.error("Please select a product and enter an adjustment amount");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId: adjustForm.productId,
        branchId: adjustForm.branchId,
        quantityChange: quantityChange,
        reason: adjustForm.reason,
      });

      setIsAdjustOpen(false);
      setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "" });
      setProductSearch("");
      setAdjustProductDropdownOpen(false);
      refreshAllData();

      toast.success("Stock adjusted successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRemoveStock = async () => {
    const quantity = typeof removeForm.quantity === "string"
      ? (removeForm.quantity === "" ? 0 : Number(removeForm.quantity) || 0)
      : removeForm.quantity;

    if (!removeForm.productId || !quantity || quantity <= 0) {
      toast.error("Please select a product and enter quantity to remove");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.delete(`${API_BASE}/stock/remove`, {
        data: {
          productId: removeForm.productId,
          branchId: removeForm.branchId,
          quantity: quantity,
          reason: removeForm.reason,
        },
      });

      setIsRemoveOpen(false);
      setRemoveForm({ productId: "", branchId: "", quantity: "", reason: "WASTE", notes: "" });
      setProductSearch("");
      setRemoveProductDropdownOpen(false);
      refreshAllData();

      toast.success("Stock removed successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const incoming = ["PURCHASE", "TRANSFER_IN", "RETURN"];
    const outgoing = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED"];
    if (incoming.includes(type)) return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{type}</Badge>;
    if (outgoing.includes(type)) return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{type}</Badge>;
    if (type === "ADJUSTMENT") return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{type}</Badge>;
    return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">{type}</Badge>;
  };

  const formatQty = (value: number) => {
    const num = Number(value || 0);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const getStockStatusMeta = (qty: number) => {
    if (qty <= 0) return { label: "Out", className: "bg-red-100 text-red-800 border-red-200" };
    if (qty <= 10) return { label: "Low", className: "bg-amber-100 text-amber-800 border-amber-200" };
    return { label: "In Stock", className: "bg-green-100 text-green-800 border-green-200" };
  };

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
  };

  const clearProductUI = () => {
    setProductSearch("");
    setAddProductDropdownOpen(false);
    setAdjustProductDropdownOpen(false);
    setRemoveProductDropdownOpen(false);
    // Reset forms to default
    setAddForm({ productId: "", branchId: "", quantity: "", supplierId: "", unitCost: "" });
    setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "CORRECTION" });
    setRemoveForm({ productId: "", branchId: "", quantity: "", reason: "WASTE", notes: "" });
  };

  const handleExport = () => {
    if (allStocks.length === 0) return;

    const headers = ["Product", "Branch", "Item code", "Category", "Quantity", "Last Updated"];
    const csvContent = [
      headers.join(","),
      ...allStocks.map(s => [
        `"${s.product.name}"`,
        `"${s.branch?.name || 'N/A'}"`,
        `"${s.product.sku || 'N/A'}"`,
        `"${categories.find(c => c.id === s.product.category_id)?.name || 'N/A'}"`,
        s.current_quantity,
        new Date(s.last_updated).toLocaleString()
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export Protocol Success", { description: "The inventory ledger has been serialized and downloaded." });
  };

  if (isInitialLoading) {
    return (
      <PageLoader message="Syncing Operational Data..." />
    );
  }

  return (
    <div className="p-4 md:p-5 space-y-8 bg-slate-50/30 min-h-screen">
      {/* HEADER SECTION: THE COMMAND CENTER */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-slate-900 rounded-lg shadow-md shadow-slate-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Stock Management
              </h1>
            </div>
          </div>
        </div>

        {/* Primary action buttons: RECORD / ADJUST / DISPOSE */}
        <div className="flex items-center bg-white p-1 rounded-md border border-slate-200 shadow-sm gap-1">
            <Dialog
              open={isAddOpen}
              onOpenChange={(open) => {
                setIsAddOpen(open);
                if (!open) clearProductUI();
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-slate-900 hover:bg-black text-white font-medium h-8 px-4 rounded-sm text-xs gap-2">
                  <Plus className="h-3.5 w-3.5" /> RECORD
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-white border border-slate-100 shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-slate-900">Add Stock</DialogTitle>
                  <DialogDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Add new stock entry to inventory levels
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2 relative" ref={addProductDropdownRef}>
                    <Label className="text-xs font-semibold text-slate-700">Product</Label>
                    <div className="relative group">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <Input
                        placeholder="Search product..."
                        value={productSearch}
                        onFocus={() => setAddProductDropdownOpen(true)}
                        autoComplete="off"
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setAddProductDropdownOpen(true);
                        }}
                        className="pl-10 h-10 border-slate-300 rounded-md bg-white text-sm"
                      />
                      {addProductDropdownOpen && (
                        <Card className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {filteredProducts.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400">No products found</div>
                          ) : (
                            <div className="p-1">
                              {filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-all rounded-sm group"
                                  onClick={() => {
                                    setAddForm({ ...addForm, productId: p.id });
                                    setProductSearch(p.name);
                                    setAddProductDropdownOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-800">{p.name}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Quantity</Label>
                    <div className="relative">
                      <Input
                        placeholder="0"
                        type="number"
                        value={addForm.quantity}
                        onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                        className="h-10 border-slate-300 rounded-md bg-white pr-12 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">QTY</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Supplier</Label>
                      <Select value={addForm.supplierId} onValueChange={(v) => setAddForm({ ...addForm, supplierId: v })}>
                        <SelectTrigger className="h-10 border-slate-300 rounded-md bg-white text-sm">
                          <SelectValue placeholder="Select Supplier" />
                        </SelectTrigger>
                        <SelectContent className="rounded-md shadow-xl">
                          {suppliers?.map((s: any) => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Cost Price</Label>
                      <Input
                        placeholder="0.00"
                        type="number"
                        value={addForm.unitCost}
                        onChange={(e) => setAddForm({ ...addForm, unitCost: e.target.value })}
                        className="h-10 border-slate-300 rounded-md bg-white text-sm"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2 border-t border-slate-100 pt-5">
                  <Button variant="outline" className="h-10 px-6" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button className="bg-slate-900 hover:bg-slate-800 text-white h-10 px-6 font-medium rounded-md shadow-sm text-sm transition-all" onClick={handleAddStock} disabled={isTransferring}>
                    {isTransferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Stock
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isAdjustOpen}
              onOpenChange={(open) => {
                setIsAdjustOpen(open);
                if (!open) clearProductUI();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 font-bold h-8 px-4 rounded-lg text-xs gap-2">
                  <Edit className="h-3.5 w-3.5 text-slate-500" /> ADJUST
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-white border border-slate-100 shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-slate-900">Adjust Stock</DialogTitle>
                  <DialogDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Modify existing stock levels for correction
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2 relative" ref={adjustProductDropdownRef}>
                    <Label className="text-xs font-semibold text-slate-700">Search Product</Label>
                    <div className="relative group">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <Input
                        placeholder="Search product…"
                        value={productSearch}
                        onFocus={() => setAdjustProductDropdownOpen(true)}
                        autoComplete="off"
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setAdjustProductDropdownOpen(true);
                        }}
                        className="pl-10 h-10 border-slate-300 rounded-md bg-white text-sm"
                      />
                      {adjustProductDropdownOpen && (
                        <Card className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {filteredProducts.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400">No matching products</div>
                          ) : (
                            <div className="p-1">
                              {filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-all rounded-sm group"
                                  onClick={() => {
                                    setAdjustForm({ ...adjustForm, productId: p.id });
                                    setProductSearch(p.name);
                                    setAdjustProductDropdownOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-800">{p.name}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Action</Label>
                      <Select value={adjustForm.reason === 'CORRECTION' ? 'FIXED' : 'DELTA'} onValueChange={() => {}}>
                        <SelectTrigger className="h-10 border-slate-300 rounded-md bg-white text-sm">
                          <SelectValue placeholder="Set Fixed Qty" />
                        </SelectTrigger>
                        <SelectContent className="rounded-md shadow-xl">
                          <SelectItem value="FIXED" className="text-sm">Set Fixed Qty</SelectItem>
                          <SelectItem value="DELTA" className="text-sm">Adjust Delta (±)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Reason</Label>
                      <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
                        <SelectTrigger className="h-10 border-slate-300 rounded-md bg-white text-sm">
                          <SelectValue placeholder="Correction" />
                        </SelectTrigger>
                        <SelectContent className="rounded-md shadow-xl">
                          <SelectItem value="CORRECTION" className="text-sm">Correction</SelectItem>
                          <SelectItem value="DAMAGE" className="text-sm">Damage</SelectItem>
                          <SelectItem value="EXPIRED" className="text-sm">Expired</SelectItem>
                          <SelectItem value="THEFT" className="text-sm">Theft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Qty</p>
                      <h4 className="text-2xl font-bold text-slate-900">—</h4>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">New Total Qty</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={adjustForm.quantityChange}
                        onChange={(e) => setAdjustForm({ ...adjustForm, quantityChange: e.target.value })}
                        className="h-10 bg-white border border-slate-300 rounded-md text-sm font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Remarks (Optional)</Label>
                    <Input
                      placeholder="Add any additional details..."
                      className="h-10 border-slate-300 rounded-md bg-white text-sm"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 border-t border-slate-100 pt-5">
                  <Button variant="outline" className="h-10 px-6" onClick={() => setIsAdjustOpen(false)}>Cancel</Button>
                  <Button className="bg-slate-900 hover:bg-slate-800 text-white h-10 px-6 font-medium rounded-md shadow-sm text-sm transition-all" onClick={handleAdjustStock} disabled={isTransferring}>
                    {isTransferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Adjustment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isRemoveOpen}
              onOpenChange={(open) => {
                setIsRemoveOpen(open);
                if (!open) clearProductUI();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 font-bold h-8 px-4 rounded-lg text-xs gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-slate-500" /> DISPOSE
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-white border border-slate-100 shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-slate-900">Remove Stock</DialogTitle>
                  <DialogDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Dispose or write off inventory items
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2 relative" ref={removeProductDropdownRef}>
                    <Label className="text-xs font-semibold text-slate-700">Select Asset</Label>
                    <div className="relative group">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <Input
                        placeholder="Search product to dispose..."
                        value={productSearch}
                        onFocus={() => setRemoveProductDropdownOpen(true)}
                        autoComplete="off"
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setRemoveProductDropdownOpen(true);
                        }}
                        className="pl-10 h-10 border-slate-300 rounded-md bg-white text-sm"
                      />
                      {removeProductDropdownOpen && (
                        <Card className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {filteredProducts.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400">No products found</div>
                          ) : (
                            <div className="p-1">
                              {filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-all rounded-sm group"
                                  onClick={() => {
                                    setRemoveForm({ ...removeForm, productId: p.id });
                                    setProductSearch(p.name);
                                    setRemoveProductDropdownOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-800">{p.name}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Quantity</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={removeForm.quantity}
                        onChange={(e) => setRemoveForm({ ...removeForm, quantity: e.target.value })}
                        className="h-10 border-slate-300 rounded-md bg-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-700">Reason</Label>
                      <Select value={removeForm.reason} onValueChange={(v) => setRemoveForm({ ...removeForm, reason: v })}>
                        <SelectTrigger className="h-10 border-slate-300 rounded-md bg-white text-sm">
                          <SelectValue placeholder="Select Reason" />
                        </SelectTrigger>
                        <SelectContent className="rounded-md shadow-xl">
                          <SelectItem value="DAMAGE" className="text-sm">Damaged / Defected</SelectItem>
                          <SelectItem value="WASTE" className="text-sm">Wastage / Garbage</SelectItem>
                          <SelectItem value="THEFT" className="text-sm">Theft / Loss</SelectItem>
                          <SelectItem value="EXPIRED" className="text-sm">Expired Goods</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Disposal Notes</Label>
                    <Input
                      placeholder="Explain the reason for removal..."
                      value={removeForm.notes}
                      onChange={(e) => setRemoveForm({ ...removeForm, notes: e.target.value })}
                      className="h-10 border-slate-300 rounded-md bg-white text-sm"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 border-t border-slate-100 pt-5">
                  <Button variant="outline" className="h-10 px-6" onClick={() => setIsRemoveOpen(false)}>Cancel</Button>
                  <Button className="bg-slate-900 hover:bg-slate-800 text-white h-10 px-6 font-medium rounded-md shadow-sm text-sm transition-all" onClick={handleRemoveStock} disabled={isTransferring}>
                    {isTransferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirm Disposal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
      </div>

      {/* Secondary buttons row: Export / Catalog import (Excel) / Reload */}
      <div className="flex flex-wrap items-center gap-2 justify-end pt-2">
        <Button
          variant="outline"
          onClick={handleExport}
          className="h-8 border-slate-200 rounded-md text-slate-500 bg-white hover:bg-slate-50 text-xs font-medium gap-2 px-3 shadow-sm"
        >
          <FileDown className="h-3.5 w-3.5" /> Export
        </Button>

        <div className="relative group">
          <Button
            variant="outline"
            onClick={() => setIsBulkImportOpen(true)}
            className="h-8 border-slate-200 rounded-md text-slate-500 bg-white hover:bg-slate-50 text-xs font-medium gap-2 px-3 shadow-sm"
          >
            <Upload className="h-3.5 w-3.5" /> New products (Excel)
          </Button>
          <span className="absolute top-full right-0 mt-1 w-[200px] text-[9px] text-slate-400 text-right leading-tight hidden sm:block">
            Adds catalog items + opening qty — not stock-in/out slips
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => { refreshAllData(); triggerGlobalRefresh(); }}
          disabled={isLoading || globalLoading}
          className="h-8 w-8 border-slate-200 rounded-md bg-white shadow-sm flex-shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading || globalLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* KPI GRID: THE POWER PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Tracked product / stock lines */}
        <Card className="border-none shadow-md bg-white rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Products tracked</p>
                {isLoading ? (
                  <div className="h-9 w-20 bg-slate-100 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-2xl font-medium text-slate-800 tracking-tighter">{totalStocks}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="h-1 w-full bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AGGREGATE QUANTITY */}
        <Card className="border-none shadow-md bg-white rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Total Units</p>
                {isLoading ? (
                  <div className="h-9 w-24 bg-emerald-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className={`text-2xl font-bold tracking-tighter ${totalUnits < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatQty(totalUnits)}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-bold text-slate-300 uppercase italic">Across Active Clusters</p>
          </CardContent>
        </Card>

        {/* LOW STOCK */}
        <Card className="border-none shadow-md bg-white rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 border-l-4 border-l-rose-500">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Restock Alerts</p>
                {isLoading ? (
                  <div className="h-9 w-16 bg-rose-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-2xl font-bold text-rose-600 tracking-tighter">{alerts}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-black text-rose-400/80 uppercase">Threshold: &le; 10 Units</p>
          </CardContent>
        </Card>

        {/* TODAY'S MOVEMENTS */}
        <Card className="border-none shadow-md bg-white rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Daily Events</p>
                {isLoading ? (
                  <div className="h-9 w-12 bg-blue-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-2xl font-bold text-blue-600 tracking-tighter">{todayTotal}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-bold text-blue-400 uppercase tracking-tight">Recent LifeCycle Logs</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white p-4 rounded-md shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-4">
        <div className="flex-1 w-full relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by product name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 rounded-md border-slate-300 bg-white text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-48 h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm">
              <Filter className="h-3.5 w-3.5 mr-2 text-slate-400" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-md shadow-xl">
              <SelectItem value="all" className="text-sm">All Categories</SelectItem>
              {categories.filter((c: any) => c.name?.toLowerCase() !== 'all' && c.id !== 'all').map((c: any) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(stockPageSize)}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="w-full md:w-36 h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm">
              <SelectValue placeholder="Per page" />
            </SelectTrigger>
            <SelectContent className="rounded-md shadow-xl">
              {paginationOptions.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-sm">
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-2">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-2">Status Legend:</span>
        <Badge variant="outline" className="bg-slate-100 text-slate-600">In Stock</Badge>
        <Badge variant="outline" className="bg-slate-100 text-slate-600">Low</Badge>
        <Badge variant="outline" className="bg-slate-100 text-slate-600">Out</Badge>
      </div>

      {/* Tabs for Stock and History */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setIsLoading(true);
          setActiveTab(value as "stock" | "history" | "today");
        }}
        className="space-y-6"
      >
        <div className="flex px-1">
          <TabsList className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-10 shrink-0 w-full max-w-md grid grid-cols-3">
            <TabsTrigger value="stock" className="rounded-lg h-8 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Stock List</TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg h-8 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Movement Log</TabsTrigger>
            <TabsTrigger value="today" className="rounded-lg h-8 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Today's Phase</TabsTrigger>
          </TabsList>
        </div>

        {/* Current Stock Tab Content */}
        <TabsContent value="stock" className="mt-0 outline-none">
          <Card ref={stockTabRef} className="border-none shadow-sm rounded-xl overflow-hidden bg-white scroll-mt-24">
            <CardHeader className="bg-slate-50/50 px-8 py-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">Active Inventory Ledger</CardTitle>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">Total Assets Registered: {totalStocks}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 relative min-h-[320px]">
              <TabLoadingOverlay show={isLoading && activeTab === "stock"} message="Syncing Ledger..." />

              <div className={isLoading && activeTab === "stock" ? "opacity-40 pointer-events-none select-none" : ""}>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="w-[300px] font-black text-[10px] uppercase tracking-widest text-slate-400 p-5 py-4">Product Detail</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4">Item code</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 text-center">In-Hand Units</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4">Status</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 p-5 py-4 text-right">Synchronization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && allStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center p-24">
                        <div className="flex flex-col items-center opacity-20">
                          <Package className="h-12 w-12 mb-3 text-slate-300" />
                          <p className="font-black text-xs uppercase tracking-widest italic">Inventory Domain Empty</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    allStocks.map((s) => {
                      const qty = Number(s.current_quantity || 0);
                      const status = getStockStatusMeta(qty);
                      return (
                        <TableRow key={s.id} className="hover:bg-slate-50/50 group transition-all duration-200 border-slate-50">
                          <TableCell className="p-5 py-5">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{s.product.name}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{s.branch?.name} Cluster</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-[11px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded inline-block">
                              {s.product.sku || (s.product.id ? s.product.id.slice(0, 8) : "—")}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-sm font-black text-slate-900 ${qty <= 10 ? 'text-rose-600' : ''}`}>{formatQty(qty)}</span>
                          </TableCell>
                          <TableCell>
                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase inline-block border ${status.className.split(' ').slice(0, 2).join(' ')}`}>
                              {status.label}
                            </div>
                          </TableCell>
                          <TableCell className="p-5 py-5 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{new Date(s.last_updated).toLocaleDateString()}</span>
                              <span className="text-[9px] font-medium text-slate-300 uppercase italic">Checked: {new Date(s.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
              </div>

              <TabPagination
                page={stockPage}
                totalPages={totalStockPages}
                total={totalStocks}
                pageSize={stockPageSize}
                onPageChange={handleStockPageChange}
                itemLabel="products"
                loading={isLoading && activeTab === "stock"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movement History Tab Content */}
        <TabsContent value="history" className="mt-0 outline-none">
          <Card ref={historyTabRef} className="border-none shadow-sm rounded-xl overflow-hidden bg-white scroll-mt-24">
            <CardHeader className="bg-slate-50/50 px-8 py-5 border-b border-slate-100">
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">Movement Log</CardTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">
                Total movements: {historyMeta.total}
              </p>
            </CardHeader>
            <CardContent className="p-0 relative min-h-[320px]">
            <TabLoadingOverlay show={isLoading && activeTab === "history"} message="Retrieving Logs..." />
            <div className={isLoading && activeTab === "history" ? "opacity-40 pointer-events-none select-none" : ""}>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/30">
                <TableRow className="border-slate-100">
                  <TableHead className="font-black text-[10px] uppercase p-5 py-4 text-slate-400 tracking-widest">Chronology</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Entity Profile</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Action Protocol</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-center text-slate-400 tracking-widest">$\Delta$ Quantity</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">State Sync (Old &rarr; New)</TableHead>
                  <TableHead className="font-black text-[10px] uppercase p-5 py-4 text-right text-slate-400 tracking-widest">Executor ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center p-20 italic text-slate-300 text-xs uppercase font-black">No movement history discovered</TableCell>
                  </TableRow>
                ) : (
                  history.map((m) => (
                    <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                      <TableCell className="p-5 py-4 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col min-w-[200px]">
                          <span className="text-sm font-medium text-slate-900s uppercase tracking-tighter">{m.product.name}</span>
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{m.branch?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-black ${m.quantity_change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-slate-400">
                          <span className="bg-slate-50 px-2 py-0.5 rounded">{formatQty(Number(m.previous_qty))}</span>
                          <ArrowRightLeft className="h-2.5 w-2.5 opacity-30" />
                          <span className="bg-slate-900 text-white px-2 py-0.5 rounded font-black">{formatQty(Number(m.new_qty))}</span>
                        </div>
                      </TableCell>
                      <TableCell className="p-5 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-tighter max-w-[120px] truncate">
                        {m.user?.email.split('@')[0] || "SYSTEM"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            </div>
            <TabPagination
              page={historyPage}
              totalPages={historyMeta.totalPages}
              total={historyMeta.total}
              pageSize={stockPageSize}
              onPageChange={handleHistoryPageChange}
              itemLabel="movements"
              loading={isLoading && activeTab === "history"}
            />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Movement Tab */}
        <TabsContent value="today" className="mt-0 outline-none">
          <Card ref={todayTabRef} className="border-none shadow-sm rounded-3xl overflow-hidden bg-white scroll-mt-24">
            <CardHeader className="bg-slate-50/50 px-8 py-5 border-b border-slate-100">
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">Today&apos;s Phase</CardTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">
                Events today: {todayMeta.total}
              </p>
            </CardHeader>
            <CardContent className="p-0 relative min-h-[320px]">
            <TabLoadingOverlay show={isLoading && activeTab === "today"} message="Syncing Today's Phase..." />
            <div className={isLoading && activeTab === "today" ? "opacity-40 pointer-events-none select-none" : ""}>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/30">
                <TableRow className="border-slate-100">
                  <TableHead className="font-black text-[10px] uppercase p-5 py-4 text-slate-400 tracking-widest">Timestamp</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Target Entity</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Protocol</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-center text-slate-400 tracking-widest">Variance</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Final State</TableHead>
                  <TableHead className="font-black text-[10px] uppercase p-5 py-4 text-right text-slate-400 tracking-widest">Audit Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && todayMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center p-20 italic text-slate-300 text-xs uppercase font-black">No events recorded today</TableCell>
                  </TableRow>
                ) : (
                  todayMovements.map((m) => (
                    <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                      <TableCell className="p-5 py-4 text-[10px] font-black text-indigo-600 uppercase">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-black text-slate-700 text-xs uppercase tracking-tighter">{m.product.name}</TableCell>
                      <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                      <TableCell className="text-center font-black text-sm text-slate-900">{m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}</TableCell>
                      <TableCell>
                        <div className="bg-slate-900 text-white px-2 py-0.5 rounded font-black text-[10px] inline-block">{formatQty(Number(m.new_qty))}</div>
                      </TableCell>
                      <TableCell className="p-5 py-4 text-right text-[10px] font-bold text-slate-400 max-w-[150px] truncate italic uppercase tracking-tighter">
                        {m.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            </div>
            <TabPagination
              page={todayPage}
              totalPages={todayMeta.totalPages}
              total={todayMeta.total}
              pageSize={stockPageSize}
              onPageChange={handleTodayPageChange}
              itemLabel="events"
              loading={isLoading && activeTab === "today"}
            />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <BulkImporter open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen} />
    </div>
  );
}
