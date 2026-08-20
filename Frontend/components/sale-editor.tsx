"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Save, Loader2, AlertTriangle, Trash2, Search, Users, ChevronsUpDown, Check, X, Barcode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import apiClient from "@/lib/apiClient";
import { notifyCustomerLedgerChanged } from "@/lib/customer-ledger-sync";
import { notifyDashboardStatsChanged } from "@/lib/dashboard-stats-sync";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { creditLedgerFields, creditPaidAtSaleForEditor, type SaleWithLedgerFields } from "@/lib/credit-sale-ledger";

interface SaleItem {
  id: string;
  product_id: string;
  product: { name: string; sku?: string };
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
}

interface Sale extends SaleWithLedgerFields {
  id: string;
  sale_number: string;
  total_amount: string | number;
  subtotal: string | number;
  discount_amount: string | number;
  payment_method: string;
  payment_received?: string | number;
  notes?: string;
  customer?: { id: string; name: string; email: string } | null;
  sale_items: SaleItem[];
}

interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  code?: string;
  sales_rate_inc_dis_and_tax?: number;
  sales_rate_exc_dis_and_tax?: number;
  purchase_rate?: number;
  current_stock?: number;
  available_stock?: number;
}

function productUnitPrice(product: ProductOption): number {
  return (
    num(product.sales_rate_inc_dis_and_tax) ||
    num(product.sales_rate_exc_dis_and_tax) ||
    num(product.purchase_rate)
  );
}

function matchesProductSearch(product: ProductOption, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    String(product.sku || "").toLowerCase().includes(q) ||
    String(product.barcode || "").toLowerCase().includes(q) ||
    String(product.code || "").toLowerCase().includes(q)
  );
}

function findProductByScan(products: ProductOption[], raw: string): ProductOption | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  for (const p of products) {
    const barcode = String(p.barcode || "").toLowerCase().trim();
    const code = String(p.code || "").toLowerCase().trim();
    const sku = String(p.sku || "").toLowerCase().trim();
    if (barcode === key || code === key || sku === key) return p;
  }
  for (const p of products) {
    const barcode = String(p.barcode || "").toLowerCase().trim();
    const code = String(p.code || "").toLowerCase().trim();
    const sku = String(p.sku || "").toLowerCase().trim();
    if (
      (barcode && barcode.startsWith(key)) ||
      (code && code.startsWith(key)) ||
      (sku && sku.startsWith(key))
    ) {
      return p;
    }
  }
  return null;
}

type EditorLine = SaleItem & {
  price: number;
  quantity: number;
  lineDiscount: number;
  originalQuantity: number;
};

interface SaleEditorProps {
  sale: Sale | null;
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getAvailableStock(product?: ProductOption): number {
  if (!product) return 0;
  return num(product.available_stock ?? product.current_stock ?? 0);
}

function extractSaleItems(sale: Record<string, unknown>): unknown[] {
  const raw = (sale.sale_items ?? sale.saleItems) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item: any) => {
    const type = String(item?.item_type ?? "ORIGINAL").toUpperCase();
    return type === "ORIGINAL";
  });
}

function normalizeSaleItems(raw: unknown): EditorLine[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((item: any) => {
    const qty = Math.max(1, num(item.quantity));
    const unitPrice = num(item.unit_price ?? item.unitPrice);
    const lineDisc = num(item.discount_amount ?? item.lineDiscount ?? 0);
    const productId = String(item.product_id ?? item.productId ?? item.product?.id ?? "");
    return {
      ...item,
      id: String(item.id ?? `line-${productId}`),
      product_id: productId,
      quantity: qty,
      unit_price: unitPrice,
      line_total: Math.max(0, unitPrice * qty - lineDisc),
      price: unitPrice,
      lineDiscount: lineDisc,
      originalQuantity: qty,
      product: {
        name: String(item.product?.name ?? "Unknown product"),
        sku: item.product?.sku ? String(item.product.sku) : undefined,
      },
    };
  });
}

export function SaleEditor({ sale, open, loading = false, onOpenChange, onSuccess }: SaleEditorProps) {
  const { customers, fetchCustomers, products: storeProducts, productsLoading, fetchProducts } = useStore();
  const [items, setItems] = useState<EditorLine[]>([]);
  const [discount, setDiscount] = useState<number | string>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<number | string>(0);
  const [notes, setNotes] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const products = storeProducts as ProductOption[];

  useEffect(() => {
    if (!open || !sale) {
      if (!open) setItems([]);
      return;
    }
    const rawItems = extractSaleItems(sale as unknown as Record<string, unknown>);
    setItems(normalizeSaleItems(rawItems));
    setDiscount(num(sale.discount_amount));
    setPaymentMethod(String(sale.payment_method ?? "CASH"));
    const method = String(sale.payment_method ?? "CASH").toUpperCase();
    const total = num(sale.total_amount);
    const cashReceived = num(sale.payment_received ?? 0);
    setPaidAmount(
      method === "CREDIT"
        ? creditPaidAtSaleForEditor(sale as SaleWithLedgerFields)
        : cashReceived > 0
          ? cashReceived
          : total,
    );
    setNotes(String(sale.notes ?? ""));
    setSelectedCustomerId(sale.customer?.id ? String(sale.customer.id) : null);
    setFormError("");
  }, [sale, open]);

  useEffect(() => {
    if (!open) return;
    void fetchCustomers();
    void fetchProducts({ force: true });
    setProductSearch("");
    setProductDropdownOpen(false);
  }, [open, fetchCustomers, fetchProducts]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!productDropdownRef.current?.contains(e.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const stockMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim();
    const list = term
      ? products.filter((p) => matchesProductSearch(p, term))
      : products.filter((p) => (p as { is_active?: boolean }).is_active !== false);
    return list.slice(0, 50);
  }, [products, productSearch]);

  // Keep the keyboard highlight in range and reset it whenever the list changes.
  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [productSearch]);

  // Scroll the highlighted row into view as the user arrows through the list.
  useEffect(() => {
    if (!productDropdownOpen) return;
    productItemRefs.current[highlightedProductIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedProductIndex, productDropdownOpen]);

  const grossSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + num(item.price) * num(item.quantity), 0),
    [items],
  );
  const lineDiscountTotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, num(item.lineDiscount)), 0),
    [items],
  );
  const orderDiscount = Math.max(0, num(discount));
  const taxAmount = 0;
  const subtotalAfterLineDiscount = Math.max(0, grossSubtotal - lineDiscountTotal);
  const grandTotal = Math.max(0, subtotalAfterLineDiscount - orderDiscount + taxAmount);
  const paid = Math.max(0, num(paidAmount));
  const creditLedger = sale ? creditLedgerFields(sale as SaleWithLedgerFields) : null;
  // Payments collected after the sale via the customer ledger (Receive Payment).
  // "Paid at Sale" only holds the counter payment, so these must be added back when
  // computing what the customer still owes — otherwise Remaining Balance ignores them.
  const collectedViaLedger =
    paymentMethod === "CREDIT" && creditLedger
      ? Math.max(0, creditLedger.invoiceTotalPaid - creditLedger.paidAtSale)
      : 0;
  const changeAmount = paymentMethod === "CREDIT" ? 0 : Math.max(0, paid - grandTotal);
  // Remaining = full invoice − paid at counter − collected later, so it matches the ledger's Amount Due.
  const dueAmount = Math.max(0, grandTotal - paid - collectedViaLedger);

  // Switching the payment method resets the paid amount to the intent of that method:
  // - CREDIT  → 0, so the customer owes the full total (a partial upfront can be typed back in)
  // - non-credit → full total, i.e. fully paid at the counter
  // Without this, converting a paid cash sale to credit kept paid=total, which made the
  // ledger post an offsetting payment and net the balance to 0 instead of charging the customer.
  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method);
    setPaidAmount(method === "CREDIT" ? 0 : grandTotal);
  };

  const updateItem = (index: number, patch: Partial<EditorLine>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setFormError("");
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error("A sale must have at least one item.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    setFormError("");
  };

  const addProductToSale = (product: ProductOption) => {
    const existingIndex = items.findIndex((i) => i.product_id === product.id);
    if (existingIndex >= 0) {
      const row = items[existingIndex];
      updateItem(existingIndex, { quantity: num(row.quantity) + 1 });
      toast.success(`${product.name} — quantity increased`);
    } else {
      const price = productUnitPrice(product);
      setItems((prev) => [
        ...prev,
        {
          id: `new-${product.id}-${Date.now()}`,
          product_id: product.id,
          product: { name: product.name, sku: product.sku },
          quantity: 1,
          originalQuantity: 0,
          unit_price: price,
          line_total: price,
          price,
          lineDiscount: 0,
        },
      ]);
      toast.success(`${product.name} added`);
    }
    setProductSearch("");
    setProductDropdownOpen(false);
    setFormError("");
    requestAnimationFrame(() => productSearchRef.current?.focus());
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setProductDropdownOpen(true);
      setHighlightedProductIndex((i) => Math.min(i + 1, Math.max(0, filteredProducts.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setProductDropdownOpen(true);
      setHighlightedProductIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      setProductDropdownOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = productSearch.trim();

    // Exact scan (barcode/SKU) always wins so scanners add instantly.
    const scanned = term ? findProductByScan(products, term) : null;
    if (scanned) {
      addProductToSale(scanned);
      return;
    }
    // Otherwise add the row the user has highlighted with the arrow keys.
    if (filteredProducts.length > 0) {
      addProductToSale(filteredProducts[highlightedProductIndex] ?? filteredProducts[0]);
      return;
    }
    if (term) toast.error("No matching product found");
  };

  const validateBeforeSave = (): boolean => {
    if (!sale) return false;
    if (items.length === 0) return setErrorAndReturn("A sale must contain at least one item.");

    for (const item of items) {
      if (!item.product_id) return setErrorAndReturn("One or more lines are missing product selection.");
      if (num(item.quantity) < 1) return setErrorAndReturn(`Quantity for ${item.product?.name || "a product"} must be at least 1.`);
      if (num(item.price) < 0) return setErrorAndReturn(`Price for ${item.product?.name || "a product"} cannot be negative.`);
      if (num(item.lineDiscount) < 0) return setErrorAndReturn(`Line discount for ${item.product?.name || "a product"} cannot be negative.`);

      const base = num(item.price) * num(item.quantity);
      if (num(item.lineDiscount) > base) {
        return setErrorAndReturn(`Line discount for ${item.product?.name || "a product"} cannot exceed line amount.`);
      }

      const available = getAvailableStock(stockMap.get(item.product_id));
      const allowed = available + num(item.originalQuantity);
      if (num(item.quantity) > allowed) {
        return setErrorAndReturn(
          `Insufficient stock for ${item.product?.name || "product"}. Available: ${allowed}, requested: ${num(item.quantity)}.`,
        );
      }
    }

    if (orderDiscount > subtotalAfterLineDiscount) return setErrorAndReturn("Order discount cannot be greater than subtotal.");
    if (paymentMethod !== "CREDIT" && paid < grandTotal) return setErrorAndReturn("For non-credit sales, paid amount cannot be less than grand total.");
    if (paymentMethod === "CREDIT" && !selectedCustomerId) return setErrorAndReturn("Credit sale requires a customer.");

    setFormError("");
    return true;
  };

  const setErrorAndReturn = (message: string) => {
    setFormError(message);
    return false;
  };

  const handleSave = async () => {
    if (!sale) return;
    if (!validateBeforeSave()) {
      toast.error("Please fix validation errors before saving.");
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.patch(`/sale/${sale.id}`, {
        items: items.map((item) => {
          const q = Math.max(1, num(item.quantity));
          const discountedLine = Math.max(0, num(item.price) * q - num(item.lineDiscount));
          return {
            productId: item.product_id,
            quantity: q,
            price: discountedLine / q,
          };
        }),
        discountAmount: orderDiscount,
        paymentMethod,
        paidAmount: paymentMethod === "CREDIT" ? Math.min(paid, grandTotal) : paid,
        customerId: selectedCustomerId,
        notes,
      });

      notifyDashboardStatsChanged();
      notifyCustomerLedgerChanged(selectedCustomerId ?? sale.customer_id ?? undefined);

      toast.success("Sale updated successfully.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to update sale.");
    } finally {
      setIsSaving(false);
    }
  };

  const showForm = sale && !loading;
  const saleLabel = sale?.sale_number ?? "…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[95vw] max-w-5xl h-[90vh] max-h-[90vh] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 overflow-hidden bg-white">
        <DialogHeader className="px-6 py-4 border-b space-y-0">
          <div className="flex justify-between items-start gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold flex flex-wrap items-center gap-2">
                <Edit3 className="h-5 w-5 text-gray-500 shrink-0" />
                Edit Sale
                <span className="text-gray-400 font-normal">#{saleLabel}</span>
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Add/remove products, adjust quantity, pricing, discounts, payment and notes.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-medium shrink-0">LIVE RECALC</Badge>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-3 text-gray-500 min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="text-sm">Loading sale details…</p>
          </div>
        ) : !showForm ? null : (
          <>
            <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Cannot save yet</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</label>
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        className="w-full justify-between h-11 font-medium text-left bg-white"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Users className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="truncate">
                            {selectedCustomerId
                              ? customers.find((c) => c.id === selectedCustomerId)?.name ?? sale.customer?.name
                              : "Walk-in Customer"}
                          </span>
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(320px,90vw)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search customer..." className="h-10" />
                        <CommandList className="max-h-[280px]">
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="walk-in"
                              onSelect={() => {
                                setSelectedCustomerId(null);
                                setCustomerSearchOpen(false);
                              }}
                            >
                              <Check className={cn("h-4 w-4 mr-2", !selectedCustomerId ? "opacity-100" : "opacity-0")} />
                              <span className="italic text-gray-500">Walk-in Customer</span>
                            </CommandItem>
                            {customers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={`${customer.name} ${customer.phone_number || ""}`}
                                onSelect={() => {
                                  setSelectedCustomerId(customer.id);
                                  setCustomerSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4 mr-2",
                                    selectedCustomerId === customer.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium">{customer.name}</span>
                                  {customer.phone_number ? (
                                    <span className="text-xs text-gray-500">{customer.phone_number}</span>
                                  ) : null}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</label>
                  <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CREDIT">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {paymentMethod === "CREDIT" ? "Paid at sale" : "Paid Amount"}
                  </label>
                  <Input type="number" min={0} step="0.01" className="h-11" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                  {paymentMethod === "CREDIT" && collectedViaLedger > 0.009 && (
                    <p className="text-xs text-amber-700">
                      Rs {collectedViaLedger.toLocaleString()} was collected later via Customer Ledger and is not included here.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-white p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Barcode className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-gray-900">Add product</h4>
                  </div>
                  <span className="text-xs text-gray-500">Scan barcode, SKU, or type name</span>
                </div>

                <div className="relative" ref={productDropdownRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    ref={productSearchRef}
                    placeholder={productsLoading ? "Loading products…" : "Search name, SKU, barcode — press Enter to add"}
                    className="pl-10 pr-10 h-11 text-base"
                    value={productSearch}
                    disabled={productsLoading}
                    onFocus={() => {
                      setHighlightedProductIndex(0);
                      setProductDropdownOpen(true);
                    }}
                    onClick={() => setProductDropdownOpen(true)}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setProductDropdownOpen(true);
                    }}
                    onKeyDown={handleProductSearchKeyDown}
                  />
                  {productSearch ? (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      onClick={() => {
                        setProductSearch("");
                        productSearchRef.current?.focus();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}

                  {productDropdownOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                      {productsLoading ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading products…
                        </div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-500 text-center">
                          {productSearch.trim() ? "No products match your search" : "Type to search or scan a barcode"}
                        </div>
                      ) : (
                        filteredProducts.map((p, index) => {
                          const stock = getAvailableStock(p);
                          const price = productUnitPrice(p);
                          return (
                            <button
                              key={p.id}
                              ref={(el) => {
                                productItemRefs.current[index] = el;
                              }}
                              type="button"
                              className={cn(
                                "w-full px-4 py-3 text-left border-b border-gray-50 last:border-0 transition-colors",
                                index === highlightedProductIndex ? "bg-blue-50" : "hover:bg-blue-50",
                              )}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={() => setHighlightedProductIndex(index)}
                              onClick={() => addProductToSale(p)}
                            >
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-gray-900 truncate">{p.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {p.sku ? `SKU: ${p.sku}` : "No SKU"}
                                    {p.barcode ? ` · Barcode: ${p.barcode}` : ""}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold text-primary">Rs {price.toLocaleString()}</p>
                                  <p className="text-xs text-gray-500">Stock: {stock}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {productSearch.trim() && filteredProducts.length > 0 ? (
                  <p className="text-xs text-gray-500">
                    {filteredProducts.length} match{filteredProducts.length !== 1 ? "es" : ""} — click a row or press Enter
                  </p>
                ) : null}
              </div>

              {/* Line items — explicit height so the list never collapses */}
              <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
                  <h4 className="text-sm font-semibold text-gray-800">
                    Line items
                    <span className="ml-2 text-gray-500 font-normal">({items.length})</span>
                  </h4>
                </div>

                <div
                  className="overflow-y-auto overflow-x-auto border-b"
                  style={{ height: "clamp(260px, 38vh, 420px)" }}
                >
                  <Table>
                    <TableHeader className="bg-gray-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead className="w-[130px]">Qty</TableHead>
                        <TableHead className="w-[120px] text-right">Unit Price</TableHead>
                        <TableHead className="w-[110px] text-right">Line Disc.</TableHead>
                        <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-16 text-gray-500 text-sm">
                            No products on this sale yet. Use &quot;Add product&quot; above to add lines.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {items.map((item, idx) => (
                        <TableRow key={item.id || idx} className="align-middle">
                          <TableCell className="py-3">
                            <div className="font-medium leading-snug">{item.product?.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">SKU: {item.product?.sku || "N/A"}</div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="space-y-1">
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                className="h-9 w-24 text-center"
                                value={item.quantity}
                                onChange={(e) => updateItem(idx, { quantity: e.target.value as any })}
                                onBlur={(e) => {
                                  const nextQty = Math.max(1, num(e.target.value));
                                  updateItem(idx, { quantity: nextQty });
                                }}
                              />
                              <p className="text-[10px] text-gray-400 leading-none">Type quantity</p>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Input type="number" min={0} step="0.01" className="h-9 w-24 ml-auto text-right" value={item.price} onChange={(e) => updateItem(idx, { price: e.target.value as any })} />
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Input type="number" min={0} step="0.01" className="h-9 w-24 ml-auto text-right" value={item.lineDiscount} onChange={(e) => updateItem(idx, { lineDiscount: e.target.value as any })} />
                          </TableCell>
                          <TableCell className="py-3 text-right font-semibold whitespace-nowrap">
                            Rs {Math.max(0, num(item.price) * num(item.quantity) - num(item.lineDiscount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="py-3">
                            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-600 h-8 w-8" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="rounded-lg border p-4 bg-gray-50 space-y-2">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>Rs {grossSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-sm"><span>Line discounts</span><span className="text-red-600">- Rs {lineDiscountTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between items-center text-sm">
                  <span>Order discount</span>
                  <Input type="number" className="h-8 w-24 text-right bg-white" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="flex justify-between text-sm"><span>Tax</span><span>Rs {taxAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-semibold text-lg">Grand Total</span>
                  <span className="font-bold text-xl text-primary">Rs {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                {paymentMethod === "CREDIT" ? (
                  <>
                    <div className="flex justify-between text-sm"><span>Paid at sale</span><span className="text-emerald-700">Rs {paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                    {collectedViaLedger > 0 ? (
                      <div className="flex justify-between text-sm"><span>Collected later (ledger)</span><span className="text-emerald-700">Rs {collectedViaLedger.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                    ) : null}
                  </>
                ) : null}
                <div className="flex justify-between text-sm"><span>Remaining Balance</span><span className={dueAmount > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}>Rs {dueAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                {paymentMethod !== "CREDIT" && changeAmount > 0 ? (
                  <div className="flex justify-between text-sm"><span>Change</span><span className="text-blue-700">Rs {changeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-sale-notes">Notes</Label>
                <Input id="edit-sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for this edit" />
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-3 flex gap-3">
                <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Saving recalculates totals, updates stock, and adjusts customer credit (if applicable).
                </p>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-gray-50">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving || items.length === 0} className="min-w-[150px]">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Update Sale
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
