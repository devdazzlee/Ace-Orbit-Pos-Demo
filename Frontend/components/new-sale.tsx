"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  Pencil,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Share2,
  CheckCircle2,
  Users,
  Printer,
  Mail,
} from "lucide-react";
import { downloadA4Invoice, shareOnWhatsApp, shareOnEmail, printA4Invoice, type InvoiceData } from "@/lib/pdf-generator";
import apiClient from "@/lib/apiClient";
import { offlineAPIClient } from "@/lib/offline-api-client";
import { offlineDB } from "@/lib/offline-db";
import { syncManager } from "@/lib/offline-sync";
import { usePosData } from "@/hooks/use-pos-data";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHoldSales } from "@/hooks/use-hold-sales";
import { normalizeBranchId } from "@/lib/branch-utils";
import { notifyDashboardStatsChanged } from "@/lib/dashboard-stats-sync";
import {
  CUSTOMER_LEDGER_REFRESH_EVENT,
  notifyCustomerLedgerChanged,
  type CustomerLedgerRefreshDetail,
} from "@/lib/customer-ledger-sync";
import { refreshCustomerListGlobally } from "@/lib/customer-list-sync";

type SalePaymentMethod = "Cash" | "Credit" | "Card";

function getStoredBranchIdForSale(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const id = normalizeBranchId(localStorage.getItem("branch"));
  return id || undefined;
}

function toApiPaymentMethod(method: SalePaymentMethod): "CASH" | "CARD" | "CREDIT" {
  if (method === "Cash") return "CASH";
  if (method === "Card") return "CARD";
  return "CREDIT";
}

interface CartItem {
  id: string; // Unique cart item ID (product.id + timestamp for separate entries)
  productId?: string; // Original product ID for reference (optional for backward compatibility)
  name: string;
  price: number; // Display price (barcode price if scanned, otherwise original price)
  originalPrice: number; // Original product price (used for line total calculations)
  actualUnitPrice: number; // Actual unit price for calculations (always original product price)
  quantity: number;
  category: string;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  barcode?: string;
  code?: string; // Product code for barcode matching
  sku?: string; // SKU for barcode matching
  available_stock?: number;
  current_stock?: number;
  reserved_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unitId?: string;
  unitName?: string;
}

// Printer type from global hook
type Printer = ReturnType<typeof usePrinterSettings>["printers"][number];

/** Best-effort message from axios/API errors (validation, stock, discount, etc.) */
function formatSaleApiError(error: unknown): string {
  const e = error as {
    message?: string;
    response?: { data?: unknown };
  };
  const d = e?.response?.data;
  if (d !== undefined && d !== null) {
    if (typeof d === "string" && d.trim()) return d.trim();
    if (typeof d === "object") {
      const o = d as Record<string, unknown>;
      if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
      if (Array.isArray(o.message)) {
        const parts = o.message.map((x) =>
          typeof x === "string" ? x : (x as { message?: string })?.message ?? JSON.stringify(x)
        );
        const joined = parts.filter(Boolean).join(", ");
        if (joined) return joined;
      }
      if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
      if (Array.isArray(o.errors)) {
        const parts = (o.errors as unknown[]).map((x) =>
          typeof x === "string" ? x : (x as { message?: string })?.message ?? JSON.stringify(x)
        );
        const joined = parts.filter(Boolean).join(", ");
        if (joined) return joined;
      }
      if (o.errors && typeof o.errors === "object" && !Array.isArray(o.errors)) {
        const parts = Object.entries(o.errors as Record<string, unknown>).map(([k, v]) => {
          const val = Array.isArray(v) ? v.join(", ") : String(v);
          return `${k}: ${val}`;
        });
        if (parts.length) return parts.join("; ");
      }
      if (typeof o.detail === "string" && o.detail.trim()) return o.detail.trim();
    }
  }
  if (typeof e?.message === "string" && e.message.trim()) return e.message.trim();
  return "Something went wrong while processing the sale.";
}

const SALE_ERROR_NOTIFIED = "__saleErrorNotified" as const;

function markSaleErrorUserNotified(error: unknown) {
  try {
    Object.defineProperty(error as object, SALE_ERROR_NOTIFIED, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    (error as Record<string, unknown>)[SALE_ERROR_NOTIFIED] = true;
  }
}

function wasSaleErrorUserNotified(error: unknown): boolean {
  return Boolean((error as Record<string, unknown>)?.[SALE_ERROR_NOTIFIED]);
}

export function NewSale() {
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  // Track input values as strings to allow decimal point typing
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [quantityModes, setQuantityModes] = useState<Record<string, "preset" | "custom">>({});
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [showAmountEditors, setShowAmountEditors] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethodPending, setPaymentMethodPending] = useState<SalePaymentMethod | null>(null);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [calculatedChange, setCalculatedChange] = useState(0);
  const [calculatedCredit, setCalculatedCredit] = useState(0);
  /** Advance credit the cashier is putting toward this sale (auto-filled, editable). */
  const [advanceToApply, setAdvanceToApply] = useState(0);
  /**
   * Park any overpayment on the customer's account instead of handing back change.
   * Defaults off so cash never silently stays behind the counter — the cashier opts in.
   */
  const [keepExcessAsCredit, setKeepExcessAsCredit] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const { holdSales, holdSale, retrieveHoldSale, deleteHoldSale, holdSalesLoading, refreshHoldSales } =
    useHoldSales();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Refs for price and quantity inputs for keyboard navigation
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityInputRefs = useRef<Record<string, HTMLElement | null>>({});
  const quantityPlusRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const quickQtyPlusRef = useRef<HTMLButtonElement | null>(null);
  const quickQtyInputRef = useRef<HTMLInputElement | null>(null);
  const quantityEnterConfirmedRef = useRef<string | null>(null);
  /** Line id that owns the focused quantity field — survives quick-qty rebind to another line */
  const quantityFocusLineIdRef = useRef<string | null>(null);
  const activeCartLineIdRef = useRef<string | null>(null);
  const cartRef = useRef(cart);
  const quantityInputsRef = useRef(quantityInputs);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);
  const searchDropdownItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [quickQtyFocusTick, setQuickQtyFocusTick] = useState(0);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const lastAddedProductId = useRef<string | null>(null);
  const [activeCartLineId, setActiveCartLineId] = useState<string | null>(null);
  // Refs for cart items and scrollable container
  const cartItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cartScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  // Ref to track scan timeout for rapid scanning
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to prevent duplicate processing of the same scan
  const lastProcessedScanRef = useRef<string>('');
  const isProcessingScanRef = useRef<boolean>(false);
  const enterKeyPressedRef = useRef<boolean>(false);
  // Track when user is actively interacting with other inputs (prevent auto-refocus)
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [scanLoading, setScanLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    email: "",
    phone_number: "",
    whatsapp_number: "",
    credit_limit: "",
    previous_balance: "",
  });
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [holdSearch, setHoldSearch] = useState("");
  const [checkoutSuccessData, setCheckoutSuccessData] = useState<InvoiceData | null>(null);
  const [manualWhatsAppNumber, setManualWhatsAppNumber] = useState("");
  const [isAskingWhatsApp, setIsAskingWhatsApp] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [isAskingEmail, setIsAskingEmail] = useState(false);
  const [isHoldingSale, setIsHoldingSale] = useState(false);
  const [isViewingHeldSales, setIsViewingHeldSales] = useState(false);
  const [deleteTargetHoldSale, setDeleteTargetHoldSale] = useState<number | null>(null);
  const [isDeletingHoldSale, setIsDeletingHoldSale] = useState(false);
  const [resumingHoldIndex, setResumingHoldIndex] = useState<number | null>(null);

  const [globalDiscountType, setGlobalDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>("");

  // Global store with custom hook
  const {
    products,
    categories,
    customers,
    productsLoading,
    categoriesLoading,
    customersLoading,
    isAnyLoading,
    fetchProducts,
    fetchCategories,
    fetchCustomers,
  } = usePosData();
  // Fetch initial data and focus search input
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      if (!mounted) return;

      try {
        await Promise.all([
          fetchProducts(),
          fetchCategories(),
          fetchCustomers(true),
        ]);
      } catch (error) {
        // Error loading data - no toast shown
      }
    };

    fetchData();

    // Cleanup function to prevent memory leaks and state updates after unmount
    return () => {
      mounted = false;
      // Clear scan timeout on unmount
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, []); // Empty dependency array since we only want to fetch once on mount

  // Customer balances are cached in the store for 5 minutes, so the "Current Due" line
  // would keep showing a pre-sale figure until a hard refresh. Re-pull on any ledger
  // change — our own sales, sale edits, and payments taken on the ledger screen.
  useEffect(() => {
    const onLedgerChange = (event: Event) => {
      const { customerId } = (event as CustomEvent<CustomerLedgerRefreshDetail>).detail ?? {};
      if (!customerId) return; // walk-in sale — no balance moved
      // Busts the cachedGet keys as well as the store's 5-minute window.
      void refreshCustomerListGlobally().catch(() => {
        // Stale balance is better than a crash; the next fetch will catch up.
      });
    };

    window.addEventListener(CUSTOMER_LEDGER_REFRESH_EVENT, onLedgerChange);
    return () => window.removeEventListener(CUSTOMER_LEDGER_REFRESH_EVENT, onLedgerChange);
  }, []);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    quantityInputsRef.current = quantityInputs;
  }, [quantityInputs]);

  useEffect(() => {
    activeCartLineIdRef.current = activeCartLineId;
  }, [activeCartLineId]);

  // Keep search input always focused (professional POS behavior)
  // Uses intelligent focus management: only refocuses when user is idle
  useEffect(() => {
    const IDLE_TIMEOUT = 2000; // 2 seconds of inactivity before refocusing search
    const INTERACTION_TIMEOUT = 500; // 500ms to detect if user is still interacting

    const markUserInteracting = () => {
      isUserInteractingRef.current = true;
      // Clear any pending refocus
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
        userInteractionTimeoutRef.current = null;
      }
      // Reset interaction flag after a short delay
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, INTERACTION_TIMEOUT);
    };

    const isInteractiveElement = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      
      // Check data attributes for special inputs
      if (element.getAttribute('data-price-input') === 'true' ||
          element.getAttribute('data-quantity-input') === 'true' ||
          element.getAttribute('data-quantity-select') === 'true' ||
          element.getAttribute('data-amount-input') === 'true') {
        return true;
      }
      
      // Check element types
      const tagName = element.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      
      // Check if it's inside a select dropdown (for Radix UI or custom selects)
      if (element.closest('[role="listbox"]') || 
          element.closest('[role="combobox"]') ||
          element.closest('[data-radix-select-content]') ||
          element.closest('select')) {
        return true;
      }
      
      // Check if it's a button (but allow clicking buttons)
      if (tagName === 'BUTTON' || element.closest('button')) {
        return true;
      }
      
      return false;
    };

    const scheduleRefocus = () => {
      // Clear any existing timeout
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
      
      // Only refocus if user is not actively interacting
      if (!isUserInteractingRef.current && searchInputRef.current && !paymentDialogOpen) {
        userInteractionTimeoutRef.current = setTimeout(() => {
          const activeElement = document.activeElement as HTMLElement;
          
          // Don't refocus if user is still on an interactive element
          if (!isInteractiveElement(activeElement) && activeElement !== searchInputRef.current) {
            if (searchInputRef.current && !paymentDialogOpen) {
              searchInputRef.current.focus();
            }
          }
        }, IDLE_TIMEOUT);
      }
    };

    // Refocus on click anywhere (but respect interactive elements)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // If clicking on interactive element, mark as interacting
      if (isInteractiveElement(target)) {
        markUserInteracting();
        return;
      }
      
      // Schedule refocus after idle period
      scheduleRefocus();
    };

    // Refocus when window regains focus (tab switching back)
    const handleFocus = () => {
      scheduleRefocus();
    };

    // Global keyboard listener to capture barcode scans even when search is not focused
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if in payment dialog
      if (paymentDialogOpen) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      
      // If typing in any interactive input (price/quantity), allow it
      if (isInteractiveElement(activeElement)) {
        markUserInteracting();
        return;
      }
      
      // If typing anywhere else (or search is not focused), focus search and capture the key
      if (searchInputRef.current) {
        // If it's a printable character (not a control key)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          // If search is not focused, focus it and append the character
          if (activeElement !== searchInputRef.current) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            // Append the character to the input value
            const currentValue = searchInputRef.current.value || '';
            searchInputRef.current.value = currentValue + e.key;
            // Trigger onChange manually to update state
            const event = new Event('input', { bubbles: true });
            searchInputRef.current.dispatchEvent(event);
            // Also update state directly
            setSearchTerm(currentValue + e.key);
          }
        }
        // Handle Enter key - process the scan
        else if (e.key === 'Enter' && activeElement !== searchInputRef.current) {
          const currentValue = searchInputRef.current.value || '';
          if (currentValue.trim().length > 0) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            handleScannerInput(currentValue);
          }
        }
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // Initial focus
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      // Clear timeout on unmount
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
    };
  }, [paymentDialogOpen]);

  // Client-side filtering for instant search results
  // This provides instant feedback without API calls
  const filteredProducts = products.filter((product) => {
    if (!product.is_active) return false;
    if (product.display_on_pos === false) return false;

    // Filter by category
    const matchesCategory =
      selectedCategory === "all" || product.categoryId === selectedCategory;

    // Filter by search term (client-side)
    const matchesSearch = !searchTerm || (() => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (searchLower.length === 0) return true;
      
      // Search in name, code, barcode, SKU (same fields used for POS scanning)
      const nameMatch = product.name?.toLowerCase().includes(searchLower);
      const codeMatch = product.code?.toLowerCase().includes(searchLower);
      const barcodeMatch = product.barcode?.toLowerCase().includes(searchLower);
      const skuMatch = product.sku?.toLowerCase().includes(searchLower);

      return nameMatch || codeMatch || barcodeMatch || skuMatch;
    })();

    return matchesCategory && matchesSearch;
  });

  const SEARCH_DROPDOWN_LIMIT = 25;

  const searchDropdownProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return filteredProducts.slice(0, SEARCH_DROPDOWN_LIMIT);
  }, [filteredProducts, searchTerm]);

  const searchDropdownOverflowCount = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    return Math.max(0, filteredProducts.length - SEARCH_DROPDOWN_LIMIT);
  }, [filteredProducts.length, searchTerm]);

  useEffect(() => {
    if (!productSearchOpen) return;
    const highlightedEl = searchDropdownItemRefs.current[highlightedProductIndex];
    if (!highlightedEl) return;
    highlightedEl.scrollIntoView({ block: "nearest" });
  }, [highlightedProductIndex, productSearchOpen, searchDropdownProducts.length]);

  const focusSearchInput = useCallback((options?: { clear?: boolean }) => {
    setProductSearchOpen(false);
    setHighlightedProductIndex(0);
    if (options?.clear) setSearchTerm("");
    requestAnimationFrame(() => {
      const el = searchInputRef.current;
      if (!el || paymentDialogOpen) return;
      el.focus({ preventScroll: true });
      el.select();
    });
  }, [paymentDialogOpen]);

  const focusQuantityInput = useCallback(() => {
    // Focus synchronously (no rAF) so the quantity box grabs focus before the
    // browser can deliver the next keystroke. With a deferred (rAF) focus the
    // search input stayed focused for ~1-2 frames and fast-typed quantity digits
    // leaked into the search field, leaving the product stuck at qty 1.
    const el = quickQtyInputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);

  useEffect(() => {
    focusSearchInput();
    // Initial focus only — paymentDialogOpen changes are handled inside focusSearchInput
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getProductStock = useCallback(
    (productId: string): number => {
      const product = products.find((p) => p.id === productId);
      if (!product) return 0;
      return Number(product.available_stock ?? product.stock ?? 0);
    },
    [products],
  );

  const resolveCartLineProductId = (line: CartItem) =>
    line.productId || line.id.split("_")[0];

  const validateCartStock = useCallback(
    (cartItems: CartItem[]): string | null => {
      if (cartItems.length === 0) return null;

      const qtyByProduct = new Map<string, number>();
      const nameByProduct = new Map<string, string>();

      for (const line of cartItems) {
        const productId = resolveCartLineProductId(line);
        qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + line.quantity);
        nameByProduct.set(productId, line.name);
      }

      for (const [productId, requested] of qtyByProduct) {
        const available = getProductStock(productId);
        const name = nameByProduct.get(productId) ?? "Product";
        if (available <= 0) {
          return `${name} is out of stock.`;
        }
        if (requested > available + 0.0001) {
          return `Insufficient stock for ${name}. Available: ${available}, requested: ${requested}.`;
        }
      }

      return null;
    },
    [getProductStock],
  );

  const addToCart = (product: Product, quantity: number = 1, customPrice?: number) => {
    const availableStock = getProductStock(product.id);
    if (availableStock <= 0) {
      toast({
        variant: "destructive",
        title: "Out of stock",
        description: `${product.name} has no available stock.`,
      });
      return;
    }

    // When custom price is provided, it represents the TOTAL PRICE from barcode
    // Calculate quantity: barcodePrice / originalPrice
    // Original price is the price of 1 unit
    // Barcode price is the total price
    const originalProductPrice = product.price;
    
    // Calculate quantity from scanned price if custom price is provided
    let finalQuantity = quantity;
    let displayPrice = originalProductPrice; // Price to display in price field
    let actualUnitPrice = originalProductPrice; // Actual unit price for line total calculations (always original)
    
    if (customPrice !== undefined && originalProductPrice > 0) {
      // Calculate quantity: barcodePrice / originalPrice
      finalQuantity = customPrice / originalProductPrice;
      const minFromUnit = isWeightUnit(product.unitName) ? 0.01 : 1;
      finalQuantity = Math.max(minFromUnit, finalQuantity);
      
      // Show the scanned price (barcode value) in the price field for display
      displayPrice = customPrice; // Display barcode price in price field
      // But keep actualUnitPrice as original for calculations
      actualUnitPrice = originalProductPrice; // Always use original price for line total
    } else {
      // If no custom price, ensure minimum quantity of 1
      finalQuantity = Math.max(1, quantity);
    }
    
    const isBarcodeLine = customPrice !== undefined && originalProductPrice > 0;

    // Decide merge-vs-new and the resulting cart deterministically BEFORE setState.
    // Reading cartRef.current (kept in sync by setCartSync) keeps the updater pure so
    // the affected line id is reliable — it must not be derived from a reducer side
    // effect, which React may run asynchronously and leave the active line stale.
    const prevCart = cartRef.current;
    let affectedLineId: string;
    let nextCart: CartItem[];

    const lastLineIndex = isBarcodeLine
      ? -1
      : prevCart.findLastIndex(
          (line) => line.productId === product.id || line.id === product.id,
        );

    if (lastLineIndex >= 0) {
      const existing = prevCart[lastLineIndex];
      const unitName = existing.unitName || existing.unit;
      const bumpBy = isPieceUnit(unitName) ? 1 : getQuantityIncrement(unitName);
      const nextQty = isPieceUnit(unitName)
        ? Math.round(existing.quantity + bumpBy)
        : Number((existing.quantity + bumpBy).toFixed(3));
      const minQ = isPieceUnit(unitName) ? 1 : 0.01;
      nextCart = [...prevCart];
      nextCart[lastLineIndex] = { ...existing, quantity: Math.max(minQ, nextQty) };
      affectedLineId = existing.id;
    } else {
      affectedLineId = `${product.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      nextCart = [
        ...prevCart,
        {
          id: affectedLineId,
          productId: product.id,
          name: product.name,
          price: displayPrice,
          originalPrice: originalProductPrice,
          actualUnitPrice: actualUnitPrice,
          quantity: finalQuantity,
          category: product.category,
          unitId: product.unitId,
          unitName: product.unitName,
          unit: product.unitName,
        },
      ];
    }

    const stockError = validateCartStock(nextCart);
    if (stockError) {
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: stockError,
      });
      return;
    }

    setCartSync(() => nextCart);

    lastAddedProductId.current = affectedLineId;
    activeCartLineIdRef.current = affectedLineId;
    setActiveCartLineId(affectedLineId);
    setQuickQtyFocusTick((n) => n + 1);

    // Toast removed as per user request - no toast when selecting products
  };

  // Helper function to format quantity with unit
  const formatQuantityWithUnit = (quantity: number, unitName?: string): string => {
    if (!unitName) return quantity.toFixed(2);
    
    const unitLower = unitName.toLowerCase();
    const qty = quantity;
    const formatSmart = (value: number, maxDecimals = 2) =>
      Number(value.toFixed(maxDecimals)).toString();
    
    // For weight units (kgs, kg, kilograms)
    if (unitLower.includes('kg') || unitLower.includes('kilogram')) {
      if (qty >= 1) {
        return `${formatSmart(qty)} kg`;
      } else {
        // Convert to grams for values less than 1kg
        const grams = qty * 1000;
        return `${grams.toFixed(0)} g`;
      }
    }
    
    // For gram units
    if (unitLower.includes('gram') || unitLower === 'g') {
      if (qty >= 1000) {
        const kg = qty / 1000;
        return `${formatSmart(kg)} kg`;
      } else {
        return `${qty.toFixed(0)} g`;
      }
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return `${qty.toFixed(0)} pcs`;
    }
    
    // For other units, show with unit name
    return `${formatSmart(qty)} ${unitName}`;
  };

  const roundMoney = (value: number) => Number(value.toFixed(2));

  const formatMoney = (value: number) => {
    const rounded = Number(value);
    if (Number.isInteger(rounded)) {
      return rounded.toLocaleString();
    }
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatQuantityValue = (value: number) => {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toFixed(3)).toString();
  };

  const isWeightUnit = (unitName?: string): boolean => {
    if (!unitName) return false;
    const unitLower = unitName.toLowerCase();
    return (
      unitLower.includes("kg") ||
      unitLower.includes("kilogram") ||
      unitLower.includes("gram") ||
      unitLower === "g"
    );
  };

  /** Sell by whole number unless the unit is weight (kg/g). Unknown/empty = pieces. */
  const isPieceUnit = (unitName?: string): boolean => !isWeightUnit(unitName);

  const getQuantityPresetOptions = (unitName?: string) => {
    if (isWeightUnit(unitName)) {
      return [
        { value: "0.25", label: "250g", quantity: 0.25 },
        { value: "0.50", label: "500g", quantity: 0.5 },
        { value: "0.75", label: "750g", quantity: 0.75 },
        { value: "1.00", label: "1 KG", quantity: 1 },
        { value: "1.50", label: "1.5 KG", quantity: 1.5 },
        { value: "2.00", label: "2 KG", quantity: 2 },
      ];
    }

    if (isPieceUnit(unitName)) {
      return [
        { value: "1", label: "1", quantity: 1 },
        { value: "2", label: "2", quantity: 2 },
        { value: "3", label: "3", quantity: 3 },
        { value: "5", label: "5", quantity: 5 },
        { value: "10", label: "10", quantity: 10 },
      ];
    }

    return [
      { value: "0.50", label: "0.5", quantity: 0.5 },
      { value: "1.00", label: "1", quantity: 1 },
      { value: "2.00", label: "2", quantity: 2 },
    ];
  };

  const getPresetValueForQuantity = (quantity: number, unitName?: string): string => {
    const presets = getQuantityPresetOptions(unitName);
    const matched = presets.find((preset) => Math.abs(preset.quantity - quantity) < 0.0001);
    return matched?.value ?? "custom";
  };

  // Helper function to get quantity increment based on unit
  const getQuantityIncrement = (unitName?: string): number => {
    if (!unitName) return 1;
    const unitLower = unitName.toLowerCase();
    
    // For weight units (kgs, kg, kilograms, gram, grams, g)
    if (unitLower.includes('kg') || unitLower.includes('kilogram') || 
        unitLower.includes('gram') || unitLower === 'g') {
      // Increment by 0.1 (100 grams) for weight units
      return 0.1;
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return 1;
    }
    
    // Default increment
    return 1;
  };

  const computeQuantityAfterChange = (
    currentQuantity: number,
    direction: 1 | -1,
    unitName?: string,
    mode: "preset" | "custom" = "custom",
  ): number => {
    const minQuantity = isPieceUnit(unitName) ? 1 : 0.01;
    let targetQuantity = currentQuantity;

    if (mode === "preset" && isWeightUnit(unitName)) {
      const presets = getQuantityPresetOptions(unitName).map((preset) => preset.quantity);
      const presetMin = Math.min(...presets);
      const presetMax = Math.max(...presets);
      targetQuantity =
        direction > 0
          ? Math.min(presetMax, Math.max(presetMin, currentQuantity * 2))
          : Math.max(presetMin, currentQuantity / 2);
      targetQuantity = presets.reduce((best, candidate) =>
        Math.abs(candidate - targetQuantity) < Math.abs(best - targetQuantity) ? candidate : best,
      presets[0]);
    } else {
      const increment = getQuantityIncrement(unitName);
      targetQuantity = currentQuantity + (direction > 0 ? increment : -increment);
    }

    const normalizedQuantity = isPieceUnit(unitName)
      ? Math.round(targetQuantity)
      : Number(targetQuantity.toFixed(3));
    return Math.max(minQuantity, normalizedQuantity);
  };

  const parseCustomQuantityInput = (rawValue: string, unitName?: string): number | null => {
    const value = rawValue.trim().toLowerCase().replace(/\s+/g, "");
    if (!value) return null;

    if (isWeightUnit(unitName)) {
      const match = value.match(/^(\d*\.?\d+)(kg|kgs|g|gram|grams)?$/);
      if (!match) return null;
      const numericValue = parseFloat(match[1]);
      if (Number.isNaN(numericValue) || numericValue < 0) return null;
      const unitSuffix = match[2];

      if (unitSuffix === "g" || unitSuffix === "gram" || unitSuffix === "grams") {
        return numericValue / 1000;
      }

      if (unitSuffix === "kg" || unitSuffix === "kgs") {
        return numericValue;
      }

      // No suffix provided:
      // - Large integer-like values are usually grams in POS usage (e.g. 250 => 250g)
      // - Smaller values are treated as kg (e.g. 1 => 1kg, 0.5 => 0.5kg)
      if (numericValue >= 10) {
        return numericValue / 1000;
      }
      return numericValue;
    }

    const numericOnly = value.match(/^(\d*\.?\d+)$/);
    if (!numericOnly) return null;
    const parsed = parseFloat(numericOnly[1]);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  };

  const setCartSync = (updater: (prev: CartItem[]) => CartItem[]) => {
    setCart((prev) => {
      const next = updater(prev);
      cartRef.current = next;
      return next;
    });
  };

  const updateQuantityManual = (id: string, newQuantity: number, unitName?: string) => {
    const minQuantity = isPieceUnit(unitName) ? 1 : 0.01;
    const normalizedQuantity = isPieceUnit(unitName)
      ? Math.round(Number(newQuantity))
      : Number(newQuantity);
    const validQuantity = Math.max(minQuantity, normalizedQuantity);
    const nextCart = cartRef.current.map((line) =>
      line.id === id ? { ...line, quantity: validQuantity } : line,
    );
    const stockError = validateCartStock(nextCart);
    if (stockError) {
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: stockError,
      });
      return;
    }
    setCartSync(() => nextCart);
  };

  const clearQuantityOverlay = (lineId: string) => {
    setQuantityInputs((prev) => {
      if (!(lineId in prev)) return prev;
      const next = { ...prev };
      delete next[lineId];
      quantityInputsRef.current = next;
      return next;
    });
  };

  /** Merge typed overlay into cart only when user is mid-edit (non-empty string). */
  const applyTypedOverlayToCart = (lineId: string) => {
    const pending = quantityInputsRef.current[lineId];
    if (pending === undefined || pending.trim() === "") return;
    const line = cartRef.current.find((l) => l.id === lineId);
    if (!line) return;
    const unitName = line.unitName || line.unit;
    const parsed = parseCustomQuantityInput(pending.trim(), unitName);
    if (parsed === null || parsed <= 0) return;
    updateQuantityManual(lineId, parsed, unitName);
  };

  const switchActiveCartLine = (newId: string | null) => {
    const prevId = activeCartLineIdRef.current;
    if (prevId && prevId !== newId) {
      applyTypedOverlayToCart(prevId);
      clearQuantityOverlay(prevId);
    }
    activeCartLineIdRef.current = newId;
    setActiveCartLineId(newId);
  };

  const bumpQuantity = (id: string, direction: 1 | -1) => {
    activeCartLineIdRef.current = id;
    setActiveCartLineId(id);
    clearQuantityOverlay(id);
    const nextCart = cartRef.current.map((line) => {
      if (line.id !== id) return line;
      const unitName = line.unitName || line.unit;
      const mode = quantityModes[id] ?? "preset";
      return {
        ...line,
        quantity: computeQuantityAfterChange(line.quantity, direction, unitName, mode),
      };
    });
    const stockError = validateCartStock(nextCart);
    if (stockError) {
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: stockError,
      });
      return;
    }
    setCartSync(() => nextCart);
  };

  const updateItemPrice = (id: string, newPrice: number) => {
    // Ensure price is valid (>= 0)
    const validPrice = Math.max(0, Number(newPrice));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, price: validPrice };
        }
        return item;
      })
    );
  };

  const isPriceOverridden = (item: CartItem) => {
    const effectivePrice = Number(item.actualUnitPrice ?? item.price ?? 0);
    const basePrice = Number(item.originalPrice ?? 0);
    return Math.abs(effectivePrice - basePrice) > 0.0001;
  };

  // Runtime selling price for this sale only.
  // Do not fall back to originalPrice when building print/sale payloads.
  const getSellingPrice = (item: CartItem) => {
    const fromEdited = Number(item.actualUnitPrice);
    if (!Number.isNaN(fromEdited) && fromEdited >= 0) return fromEdited;

    const fromDisplay = Number(item.price);
    if (!Number.isNaN(fromDisplay) && fromDisplay >= 0) return fromDisplay;

    return 0;
  };

  const holdCurrentSale = async () => {
    if (cart.length === 0) {
      return;
    }

    setIsHoldingSale(true);
    const held = await holdSale(cart, selectedCustomer || undefined);
    if (held) {
      setCart([]);
      setGlobalDiscountValue("");
    }
    setIsHoldingSale(false);
  };

  const handleRetrieveHoldSale = async (index: number) => {
    if (cart.length > 0) {
      const shouldReplace = window.confirm(
        "Current cart will be replaced. Continue?"
      );
      if (!shouldReplace) return;
    }
    setResumingHoldIndex(index);
    const heldSale = await retrieveHoldSale(index);
    if (heldSale) {
      setCart(
        heldSale.items.map((item) => ({
          ...item,
          originalPrice: Number(item.originalPrice ?? item.price ?? 0),
          actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
        }))
      );
      if (heldSale.customerId) {
        setSelectedCustomer(heldSale.customerId);
      } else {
        setSelectedCustomer(null);
      }
    }
    setResumingHoldIndex(null);
  };

  const handleViewHeldSales = async () => {
    if (showHeldSales) {
      setShowHeldSales(false);
      return;
    }

    setIsViewingHeldSales(true);
    await refreshHoldSales();
    setShowHeldSales(true);
    setIsViewingHeldSales(false);
    const element = document.getElementById('held-sales-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Printer loading is handled globally by usePrinterSettings hook

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
    setQuantityInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setQuantityModes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setAmountInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setShowAmountEditors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearCart = () => {
    setCart([]);
    setQuantityInputs({});
    setQuantityModes({});
    setAmountInputs({});
    setShowAmountEditors({});
    setGlobalDiscountValue("");
  };

  const subtotal = cart.reduce((sum, item) => sum + getSellingPrice(item) * item.quantity, 0);

  const parsedDiscount = parseFloat(globalDiscountValue) || 0;
  const globalDiscountAmount = globalDiscountType === "percentage" 
    ? (subtotal * parsedDiscount) / 100 
    : parsedDiscount;

  const total = Math.max(0, subtotal - globalDiscountAmount);

  // A negative outstanding balance means the customer paid extra earlier and is in
  // credit with us. That advance settles a cash/card sale before any cash is taken.
  const selectedCustomerBalance = selectedCustomer
    ? Number(customers.find((c) => c.id === selectedCustomer)?.outstanding_balance || 0)
    : 0;
  const advanceAvailable = Math.max(0, -selectedCustomerBalance);
  const advanceApplicable = Math.min(advanceAvailable, total);
  const advanceApplied =
    paymentMethodPending === "Credit" ? 0 : Math.min(advanceToApply, advanceApplicable);
  const netPayable = Math.max(0, roundMoney(total - advanceApplied));

  // Anything tendered above the net payable either goes back as change or stays on the
  // customer's account as fresh advance credit — only one of the two, never both.
  const tenderedNumeric = parseFloat(tenderedAmount);
  const tenderedExcess = Number.isNaN(tenderedNumeric)
    ? 0
    : Math.max(0, roundMoney(tenderedNumeric - (paymentMethodPending === "Credit" ? total : netPayable)));
  // Credit sales settle their own overpayment through the ledger, so the choice is
  // only offered on cash/card sales for a known customer.
  const canKeepExcessAsCredit =
    Boolean(selectedCustomer) && paymentMethodPending !== "Credit" && tenderedExcess > 0;
  const excessKeptAsCredit = canKeepExcessAsCredit && keepExcessAsCredit ? tenderedExcess : 0;
  const changeReturned = roundMoney(tenderedExcess - excessKeptAsCredit);

  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  useEffect(() => {
    if (!paymentDialogOpen) {
      return;
    }

    const parsed = parseFloat(tenderedAmount);
    const numericValue = Number.isNaN(parsed) ? 0 : parsed;

    if (paymentMethodPending === "Credit") {
      setCalculatedChange(changeReturned);
      setCalculatedCredit(Math.max(0, total - numericValue));
    } else {
      setCalculatedChange(changeReturned);
      setCalculatedCredit(0);
    }
  }, [paymentDialogOpen, tenderedAmount, total, changeReturned, paymentMethodPending]);

  const generateTransactionId = () => {
    return `TXN${Date.now().toString().slice(-6)}`;
  };

  const generateReceiptData = (
    transactionId: string,
    paymentMethod: string,
    cart: CartItem[],
    subtotal: number,
    total: number,
    amountPaid: number,
    changeAmount: number
  ) => {
    return {
      transactionId,
      timestamp: new Date().toISOString(),
      items: cart,
      subtotal,
      total,
      paymentMethod,
      cashier: localStorage.getItem("userName") || "Admin",
      storeName: "ACE ORBITS",
      address: "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
      storePhone: "02132727444",
      amountPaid,
      changeAmount,
    };
  };


  const resetPaymentState = () => {
    setPaymentDialogOpen(false);
    setPaymentMethodPending(null);
    setTenderedAmount("");
    setCalculatedChange(0);
    setCalculatedCredit(0);
    setAdvanceToApply(0);
    setKeepExcessAsCredit(false);
    setPaymentError("");
  };

  const handlePaymentDialogOpenChange = (open: boolean) => {
    if (open) {
      setPaymentDialogOpen(true);
      return;
    }
    resetPaymentState();
  };

  const startPayment = (method: SalePaymentMethod) => {
    if (method === "Credit" && !selectedCustomer) {
      toast({
        variant: "destructive",
        title: "Customer required",
        description: "Please select or add a customer for credit sales.",
      });
      return;
    }

    const stockError = validateCartStock(cart);
    if (stockError) {
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: stockError,
      });
      return;
    }

    // Auto-apply whatever advance the customer has; the cashier can dial it back
    // in the dialog if they'd rather leave the credit on the account.
    const autoAdvance = method === "Credit" ? 0 : advanceApplicable;

    setPaymentMethodPending(method);
    setAdvanceToApply(autoAdvance);
    setKeepExcessAsCredit(false);
    setTenderedAmount(method === "Credit" ? "0" : (total - autoAdvance).toFixed(2));
    setPaymentError("");
    setCalculatedChange(0);
    setCalculatedCredit(method === "Credit" ? total : 0);
    setPaymentDialogOpen(true);
  };

  const handleTenderedInputChange = (value: string) => {
    setTenderedAmount(value);
    if (paymentError) {
      setPaymentError("");
    }
  };

  const confirmPayment = async () => {
    if (!paymentMethodPending) {
      return;
    }

    const stockError = validateCartStock(cart);
    if (stockError) {
      setPaymentError(stockError);
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: stockError,
      });
      return;
    }

    if (paymentMethodPending === "Credit" && !selectedCustomer) {
      setPaymentError("Select a customer for credit sales.");
      toast({
        variant: "destructive",
        title: "Customer required",
        description: "Please select or add a customer for credit sales.",
      });
      return;
    }

    const parsed = parseFloat(tenderedAmount);
    const amountNumber = Number.isNaN(parsed) ? 0 : parsed;

    if (paymentMethodPending !== "Credit" && amountNumber < netPayable) {
      setPaymentError("Received amount cannot be less than the payable total.");
      return;
    }

    setPaymentError("");

    const result = await handlePayment(
      paymentMethodPending,
      amountNumber,
      changeReturned,
      advanceApplied,
      excessKeptAsCredit
    );
    if (result) {
      resetPaymentState();
      // Clear cart AFTER dialog closes so the total doesn't flicker to 0 while processing
      setCart([]);
      setGlobalDiscountValue("");
      setSelectedCustomer(null);
      setCheckoutSuccessData(result);
    }
  };

  const handlePayment = async (
    method: SalePaymentMethod,
    amountPaid: number,
    changeAmount: number,
    advanceUsed = 0,
    excessKept = 0
  ): Promise<InvoiceData | null> => {
    const cartSnapshot = cart.map((item) => ({ ...item }));

    return await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cartSnapshot.map((item) => {
          // Use productId if available, otherwise fallback to extracting from id
          // (for backward compatibility, though productId should always be set)
          const productId = item.productId || item.id.split('_')[0];
          if (!productId) {
            throw new Error(`Missing product ID for item: ${item.name}`);
          }
          const effectivePrice = getSellingPrice(item);
          return {
            productId,
            quantity: item.quantity,
            price: effectivePrice,
          };
        });

        // Prepare payload
        const payload: any = {
          items: saleItems,
          paymentMethod: toApiPaymentMethod(method),
          discountAmount: globalDiscountAmount,
        };
        if (selectedCustomer) {
          payload.customerId = selectedCustomer;
        }
        if (method === "Credit") {
          payload.paidAmount = amountPaid;
        } else if (selectedCustomer) {
          // Explicit, even when 0 — otherwise the server auto-applies the full advance
          // and would ignore a cashier who chose to leave the credit on the account.
          payload.advanceApplied = advanceUsed;
          payload.excessToCredit = excessKept;
        }

        // Check if online
        const isOnline = syncManager.canMakeRequest();
        
        let saleData: any;
        let transactionId: string;
        
        if (isOnline) {
          // Online: Call create sale API
          try {
            const saleResponse = await apiClient.post("/sale", payload);
            saleData = saleResponse.data.data;
            transactionId = saleData.sale_number || generateTransactionId();
            notifyDashboardStatsChanged();
            notifyCustomerLedgerChanged(payload.customerId);
          } catch (error: any) {
            // Distinguish real API errors (validation, business rules) from network failures.
            // - 4xx/5xx with a server response → surface the actual error to the user, do NOT silently queue
            // - true network failure (no response) → fall back to offline queue
            const hasServerResponse = !!error?.response;
            const isNetworkFailure =
              !hasServerResponse ||
              error?.code === "ERR_NETWORK" ||
              error?.code === "ECONNABORTED";

            if (hasServerResponse && !isNetworkFailure) {
              const apiMsg = formatSaleApiError(error);
              console.error("Sale API error:", error.response?.data ?? error);
              toast({
                variant: "destructive",
                title: "Sale failed",
                description: apiMsg,
              });
              markSaleErrorUserNotified(error);
              throw error;
            }

            // True offline / unreachable backend: queue for sync
            console.warn("Network unreachable, saving offline:", error);
            transactionId = generateTransactionId();
            saleData = {
              sale_number: transactionId,
              id: `offline_${transactionId}`,
              _pending: true,
              _offline: true
            };

            await offlineDB.saveSale({
              id: transactionId,
              products: saleItems,
              total: total,
              customer: selectedCustomer ? { id: selectedCustomer } : null,
              payment: {
                method: toApiPaymentMethod(method),
                amountPaid,
                changeAmount
              },
              employeeId: localStorage.getItem("userId") || undefined,
              branchId: getStoredBranchIdForSale(),
              timestamp: Date.now(),
              synced: false,
              discountAmount: globalDiscountAmount,
            });

            await offlineDB.enqueue({
              operationId: crypto.randomUUID(),
              type: 'sale',
              url: '/sale',
              method: 'POST',
              payload,
              maxRetries: 5,
              priority: 10,
              headers: {},
            });

            toast({
              title: "Saved offline",
              description: "Network is unavailable — sale will sync when you're back online.",
            });
          }
        } else {
          // Offline: Generate local sale ID and save to IndexedDB
          transactionId = generateTransactionId();
          saleData = {
            sale_number: transactionId,
            id: `offline_${transactionId}`,
            _pending: true,
            _offline: true
          };
          
          // Save sale to IndexedDB for later sync
          await offlineDB.saveSale({
            id: transactionId,
            products: saleItems,
            total: total,
            customer: selectedCustomer ? { id: selectedCustomer } : null,
            payment: {
              method: toApiPaymentMethod(method),
              amountPaid,
              changeAmount
            },
            employeeId: localStorage.getItem("userId") || undefined,
            branchId: getStoredBranchIdForSale(),
            timestamp: Date.now(),
            synced: false,
            discountAmount: globalDiscountAmount,
          });

          // Queue for sync — direct enqueue, no extra API call
          await offlineDB.enqueue({
            operationId: crypto.randomUUID(),
            type: 'sale',
            url: '/sale',
            method: 'POST',
            payload,
            maxRetries: 5,
            priority: 10,
            headers: {},
          });

          console.log("Sale saved offline, will sync when connection restored");
        }
        const receiptData = generateReceiptData(
          transactionId,
          method,
          cartSnapshot,
          subtotal,
          total,
          amountPaid,
          changeAmount
        );

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);

        let receiptDataForServer: any = null;
        const storedBranchName = localStorage.getItem("branchName");
        const fullAddress = "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.";

        const selectedCustomerObj = customers.find((c) => c.id === selectedCustomer);
        const openingBalance = Number(selectedCustomerObj?.outstanding_balance || 0);
        // Credit sales move the balance by whatever went unpaid; cash sales move it by the
        // advance consumed less any overpayment parked back on the account.
        const derivedClosing =
          method === "Credit"
            ? openingBalance + total - amountPaid
            : openingBalance + advanceUsed - excessKept;

        return {
          storeName: receiptDataForServer?.storeName || "ACE ORBITS",
          storeAddress: fullAddress,
          storePhone: "02132727444",
          customerName: selectedCustomerObj?.name || "Walk-in Customer",
          customerPhone:
            selectedCustomerObj?.phone_number || selectedCustomerObj?.phone || "",
          customerWhatsApp:
            selectedCustomerObj?.whatsapp_number ||
            selectedCustomerObj?.phone_number ||
            selectedCustomerObj?.phone ||
            "",
          customerEmail: selectedCustomerObj?.email || "",
          saleNumber: transactionId,
          date: new Date(),
          items: cartSnapshot.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: getSellingPrice(item),
            lineTotal: getSellingPrice(item) * item.quantity,
            unit: (item as any)?.unit?.name || (item as any)?.unitName || "",
          })),
          subtotal: subtotal,
          discount: globalDiscountAmount,
          total: total,
          paymentMethod: method === "Cash" ? "CASH" : method === "Credit" ? "CREDIT" : "CARD",
          balanceDue: method === "Credit" ? Math.max(0, total - amountPaid) : 0,
          // Cash that actually crossed the counter, before any change was handed back.
          amountPaid,
          advanceApplied: advanceUsed,
          excessKeptAsCredit: excessKept,
          changeReturned: changeAmount,
          // Customer's unpaid balance from prior transactions (snapshot before this sale settled)
          previousBalance: openingBalance,
          // Negative = customer is in credit with us once this sale is settled. Prefer the
          // server's recalculated figure; fall back to local maths for offline sales.
          closingBalance: roundMoney(Number(saleData?.closing_balance ?? derivedClosing)),
        };
      } catch (error: unknown) {
        console.error("Payment error:", error);
        if (!wasSaleErrorUserNotified(error)) {
          toast({
            variant: "destructive",
            title: "Sale failed",
            description: formatSaleApiError(error),
          });
        }
        return null;
      }
    });
  };

  // Create optimized lookup maps for O(1) product access
  // Build comprehensive barcode map indexing by barcode, code, and SKU
  // This ensures products can be found by any identifier
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    const exactMatches = new Map<string, Product>(); // Track exact matches separately
    
    products.forEach(product => {
      // Index by barcode (if exists)
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower) {
          exactMatches.set(barcodeLower, product);
          map.set(barcodeLower, product);
        }
      }
      
      // Index by code (if exists) - this is critical for CODE-PRICE format scanning
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower) {
          exactMatches.set(codeLower, product);
          map.set(codeLower, product);
        }
      }
      
      // Index by SKU (if exists)
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower) {
          exactMatches.set(skuLower, product);
          map.set(skuLower, product);
        }
      }
    });
    
    // Store exact matches map for priority lookup
    (map as any).exactMatches = exactMatches;
    
    return map;
  }, [products]);

  const findProductByBarcode = (barcode: string): Product | null => {
    if (!barcode) return null;
    
    const searchKey = barcode.toLowerCase().trim();
    if (!searchKey) return null;
    
    const exactMatches = (barcodeMap as any).exactMatches as Map<string, Product>;
    
    // CRITICAL: Try exact match FIRST - this prevents wrong product matches
    // Exact match has highest priority to avoid prefix matching issues
    if (exactMatches) {
      const exactMatch = exactMatches.get(searchKey);
      if (exactMatch) {
        console.log('Exact match found:', searchKey, '->', exactMatch.name);
        return exactMatch;
      }
    }
    
    // Try exact match from main map
    const exactMatch = barcodeMap.get(searchKey);
    if (exactMatch) {
      console.log('Exact match found (main map):', searchKey, '->', exactMatch.name);
      return exactMatch;
    }
    
    // Only if no exact match, try linear search for startsWith matches
    // This ensures we find the most specific match first
    let bestMatch: Product | null = null;
    let bestMatchLength = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Check barcode field
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (barcodeLower.startsWith(searchKey) && barcodeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = barcodeLower.length;
        }
      }
      
      // Check code field
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (codeLower.startsWith(searchKey) && codeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = codeLower.length;
        }
      }
      
      // Check SKU field
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (skuLower.startsWith(searchKey) && skuLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = skuLower.length;
        }
      }
    }
    
    if (bestMatch) {
      console.log('Best match found:', searchKey, '->', bestMatch.name);
      return bestMatch;
    }
    
    console.warn('No product found for barcode:', searchKey);
    return null;
  };

  const handleBarcodeScan = async () => {
    setScanLoading(true);
    try {
      // Simulate barcode scanning
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate finding a product by barcode
      const randomProduct =
        products[Math.floor(Math.random() * products.length)];
      await addToCart(randomProduct);
    } catch (error) {
      // Scan failed - no toast shown
    } finally {
      setScanLoading(false);
    }
  };

  const handleScannerInput = (scannedValue: string) => {
    // Prevent duplicate processing of the same scan
    const trimmedValue = scannedValue.trim();
    
    // Skip if already processing or if this is the same value we just processed
    if (isProcessingScanRef.current || lastProcessedScanRef.current === trimmedValue) {
      return;
    }
    
    // Mark as processing and store the value
    isProcessingScanRef.current = true;
    lastProcessedScanRef.current = trimmedValue;
    
    // Process immediately - zero delays, zero async operations
    
    // Ultra-fast parsing - single pass extraction
    const dashIndex = trimmedValue.indexOf('-');
    let productCode: string;
    let customPrice: number | undefined = undefined;
    
    if (dashIndex > 0) {
      // Extract code and price in one operation
      productCode = trimmedValue.substring(0, dashIndex).trim();
      const priceStr = trimmedValue.substring(dashIndex + 1).trim();
      // Parse price - handle both integer and decimal values
      // Remove any non-numeric characters except decimal point
      const cleanPriceStr = priceStr.replace(/[^\d.]/g, '');
      const parsedPrice = parseFloat(cleanPriceStr);
      if (!isNaN(parsedPrice) && parsedPrice >= 0 && isFinite(parsedPrice)) {
        customPrice = parsedPrice;
        console.log('Barcode scan - Code:', productCode, 'Raw price string:', priceStr, 'Parsed price:', customPrice);
      } else {
        console.error('Failed to parse price from:', priceStr, 'Cleaned:', cleanPriceStr, 'Parsed:', parsedPrice);
      }
    } else {
      productCode = trimmedValue.trim();
    }

    // Product lookup - use exact code first, then fallback to best match
    const codeLower = productCode.toLowerCase().trim();
    let product: Product | null = null;
    
    // CRITICAL: Try multiple matching strategies to find the correct product
    // 1. First try exact match on the full code (highest priority)
    product = findProductByBarcode(codeLower);
    console.log('Step 1 - Exact code match:', codeLower, 'Found:', product?.name || 'NOT FOUND');
    
    // 2. If not found and we have a price, try matching by price number in product name
    // This handles cases like "ROA432910-180" where "180" is in product name "Roasted Cashew Nuts (180)"
    if (!product && customPrice !== undefined) {
      const priceNumber = Math.round(customPrice).toString();
      // Look for products where name contains the price number in parentheses or as suffix
      const priceMatch = products.find(p => {
        const nameLower = p.name.toLowerCase();
        // Match patterns like "(180)", " 180", or ending with "180"
        return nameLower.includes(`(${priceNumber})`) || 
               nameLower.includes(` ${priceNumber} `) || 
               nameLower.endsWith(` ${priceNumber}`) ||
               nameLower.match(new RegExp(`[^0-9]${priceNumber}[^0-9]`));
      });
      if (priceMatch) {
        product = priceMatch;
        console.log('Step 2 - Price number match:', priceNumber, 'Found:', product.name);
      }
    }
    
    // 3. If not found and code contains numbers, try matching by extracting numeric part
    if (!product && /\d/.test(codeLower)) {
      const numericMatch = codeLower.match(/\d+/);
      if (numericMatch) {
        const numericPart = numericMatch[0];
        product = findProductByBarcode(numericPart);
        console.log('Step 3 - Numeric part match:', numericPart, 'Found:', product?.name || 'NOT FOUND');
      }
    }
    
    // 4. If still not found, try matching product name contains the code
    if (!product) {
      const codeInName = products.find(p => {
        const nameLower = p.name.toLowerCase();
        return nameLower.includes(`(${codeLower})`) || 
               nameLower.includes(` ${codeLower} `) || 
               nameLower.endsWith(` ${codeLower}`);
      });
      if (codeInName) {
        product = codeInName;
        console.log('Step 4 - Name pattern match:', codeLower, 'Found:', product.name);
      }
    }
    
    console.log('FINAL RESULT - Code:', codeLower, 'Price:', customPrice, 'Found Product:', product?.name || 'NOT FOUND', 'ID:', product?.id);
    
    if (!product) {
      console.error('Product not found for scanned code:', productCode, 'Price:', customPrice);
      // Reset processing flag to allow next scan
      isProcessingScanRef.current = false;
      lastProcessedScanRef.current = '';
      return; // Exit early - don't add to cart
    }
    // Add to cart immediately if found (synchronous, no delays)
    if (product) {
      console.log('✅ SUCCESS - Adding to cart:', {
        scannedCode: productCode,
        scannedPrice: customPrice,
        matchedProduct: product.name,
        productId: product.id,
        productCode: product.code,
        productSKU: product.sku,
        productBarcode: product.barcode,
        productPrice: product.price
      });
      addToCart(product, 1, customPrice);
    } else {
      console.error('Product not found for code:', productCode);
    }
    
    // Clear input instantly via direct DOM manipulation (fastest method)
    const input = searchInputRef.current;
    if (input) {
      input.value = '';
      // Reset interaction flag and refocus search input after processing scan
      isUserInteractingRef.current = false;
      setTimeout(() => {
        if (input && !paymentDialogOpen) {
          input.focus();
          input.select();
        }
      }, 10);
      // Use startTransition for non-urgent state update
      startTransition(() => {
        setSearchTerm("");
      });
    } else {
      setSearchTerm("");
    }
    
    // Brief loading indicator (50ms - just enough for visual feedback)
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      // Reset processing flag after a short delay to allow next scan
      setTimeout(() => {
        isProcessingScanRef.current = false;
        lastProcessedScanRef.current = '';
      }, 100);
    }, 50);
  };

  const selectProductForSale = (product: Product) => {
    addToCart(product, 1);
    setProductSearchOpen(false);
    // Clear the search field immediately so the focus handoff to the quantity box
    // (which happens one animation frame later) can't leak typed quantity digits
    // into the search input — that leak left products stuck at qty 1.
    setSearchTerm("");
    setHighlightedProductIndex(0);
  };

  const handleProductClick = (product: Product) => {
    selectProductForSale(product);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  // Global keyboard shortcuts - DISABLED during scanning to prevent interference
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable all shortcuts when scanning is active
      if (isScanning) {
        return;
      }
      
      // Don't handle shortcuts when typing in inputs or dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // If it's the search input, allow normal typing
        if (target === searchInputRef.current) {
          return;
        }
        // For other inputs, only handle special shortcuts
        // 'C' for Cash, 'D' for Card when in payment dialog
        if (paymentDialogOpen) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Cash");
            }
            return;
          }
          if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Card");
            }
            return;
          }
        }
        return;
      }

      // Global shortcuts (when not in input)
      // Ctrl+Enter for Cash payment
      if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // Shift+Enter for Card payment
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // 'C' for Cash payment
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // 'D' for Credit payment
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          if (!selectedCustomer) {
            toast({
              variant: "destructive",
              title: "Customer required",
              description: "Please select or add a customer for credit sales.",
            });
            return;
          }
          startPayment("Credit");
        }
        return;
      }

      // Any alphabet key (a-z, A-Z) focuses search input - DISABLED to prevent interference with scanning
      // Commented out to prevent focus issues during scanning
      /*
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
      */
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, total, paymentDialogOpen, paymentMethodPending, startPayment, isScanning, selectedCustomer, toast]);

  const quickAdjustLine = useMemo(() => {
    if (cart.length === 0) return null;
    if (activeCartLineId) {
      return cart.find((line) => line.id === activeCartLineId) ?? cart[cart.length - 1];
    }
    return cart[cart.length - 1];
  }, [cart, activeCartLineId]);

  const confirmQuantityAndReturnToSearch = useCallback((lineId?: string) => {
    const id = lineId ?? quantityFocusLineIdRef.current ?? activeCartLineIdRef.current;
    if (id) {
      quantityEnterConfirmedRef.current = id;
      // Cart already holds +/- and onChange updates — only drop typed overlay, never re-read stale values.
      applyTypedOverlayToCart(id);
      clearQuantityOverlay(id);
    }
    quantityFocusLineIdRef.current = null;
    focusSearchInput({ clear: true });
  }, [focusSearchInput]);

  // After adding a product, focus quantity input (keyboard sale flow).
  // useLayoutEffect runs synchronously after the DOM commit and before paint, so
  // focus moves to the qty box within the same event flush — before the next
  // keystroke arrives — preventing quantity digits from leaking into the search box.
  useLayoutEffect(() => {
    if (quickQtyFocusTick === 0) return;
    focusQuantityInput();
  }, [quickQtyFocusTick, focusQuantityInput]);

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Products Section */}
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">New Sales</h1>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cart.length > 0 && (
                <Button
                  variant="outline"
                  onClick={holdCurrentSale}
                  disabled={isHoldingSale}
                >
                  {isHoldingSale ? "Saving..." : "Hold Sale"}
                </Button>
              )}
              {holdSales.length > 0 && (
                <div className="flex items-center">
                  <Badge
                    variant="secondary"
                    className="mr-2 bg-blue-100 text-blue-800"
                  >
                    {holdSales.length} held
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={handleViewHeldSales}
                    disabled={isViewingHeldSales || holdSalesLoading}
                  >
                    {isViewingHeldSales || holdSalesLoading ? "Loading..." : "View Held Sales"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full max-w-2xl flex-wrap items-stretch gap-2">
            <div className="relative min-w-[12rem] w-full max-w-md flex-1">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${isScanning ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
              {isScanning && (
                <LoadingSpinner size="sm" className="absolute right-3 top-1/2 transform -translate-y-1/2" />
              )}
              <Input
                ref={searchInputRef}
                placeholder={isScanning ? "Processing scan..." : "Scan barcode or search products..."}
                value={searchTerm}
                onFocus={() => {
                  if (searchTerm.trim()) setProductSearchOpen(true);
                }}
                onBlur={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (relatedTarget && (
                    relatedTarget.closest('[data-product-search-dropdown]') ||
                    relatedTarget.getAttribute('data-price-input') === 'true' ||
                    relatedTarget.getAttribute('data-quantity-input') === 'true' ||
                    relatedTarget.getAttribute('data-quick-qty') === 'true' ||
                    relatedTarget.closest('[data-quick-qty="true"]') ||
                    relatedTarget.getAttribute('data-quantity-select') === 'true' ||
                    relatedTarget.getAttribute('data-amount-input') === 'true' ||
                    relatedTarget.tagName === 'SELECT' ||
                    relatedTarget.closest('select')
                  )) {
                    return;
                  }
                  setProductSearchOpen(false);
                }}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  setHighlightedProductIndex(0);
                  setProductSearchOpen(value.trim().length > 0);

                  // Clear any pending scan timeout
                  if (scanTimeoutRef.current) {
                    clearTimeout(scanTimeoutRef.current);
                    scanTimeoutRef.current = null;
                  }
                  
                  // Auto-detect barcode scan format (CODE-PRICE) even without Enter
                  // This handles scanners that send data quickly
                  // Only process if the price part looks complete (at least 3 digits to avoid premature processing)
                  if (value.includes('-') && value.length > 6) {
                    // Check if it looks like CODE-PRICE format
                    const parts = value.split('-');
                    if (parts.length >= 2) {
                      const codePart = parts[0].trim();
                      const pricePart = parts.slice(1).join('-').trim();
                      // If code part exists and price part is numeric with at least 3 digits, treat as barcode scan
                      // This prevents processing when user is still typing (e.g., "CODE-8" vs "CODE-8000")
                      if (codePart.length > 0 && /^\d{3,}(\.\d+)?$/.test(pricePart)) {
                        // Skip if Enter key was just pressed (onKeyDown will handle it)
                        if (enterKeyPressedRef.current) {
                          enterKeyPressedRef.current = false;
                          return;
                        }
                        // Small delay to ensure scanner finished sending all data
                        if (scanTimeoutRef.current) {
                          clearTimeout(scanTimeoutRef.current);
                        }
                        scanTimeoutRef.current = setTimeout(() => {
                          const currentValue = searchInputRef.current?.value || '';
                          if (currentValue === value && value.includes('-')) {
                            // Double-check we have a complete price value
                            const finalParts = currentValue.split('-');
                            if (finalParts.length >= 2 && finalParts[1].trim().length > 0) {
                              handleScannerInput(currentValue);
                            }
                          }
                          scanTimeoutRef.current = null;
                        }, 300); // Wait 300ms to ensure scanner finished sending all digits (8000, not just 8)
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  const trimmed = searchTerm.trim();

                  if (e.key === "Escape") {
                    e.preventDefault();
                    setProductSearchOpen(false);
                    setHighlightedProductIndex(0);
                    return;
                  }

                  if (e.key === "ArrowDown" && searchDropdownProducts.length > 0) {
                    e.preventDefault();
                    setProductSearchOpen(true);
                    setHighlightedProductIndex((i) =>
                      Math.min(i + 1, searchDropdownProducts.length - 1),
                    );
                    return;
                  }

                  if (e.key === "ArrowUp" && searchDropdownProducts.length > 0) {
                    e.preventDefault();
                    setProductSearchOpen(true);
                    setHighlightedProductIndex((i) => Math.max(i - 1, 0));
                    return;
                  }

                  if (e.key === "Enter" && trimmed) {
                    enterKeyPressedRef.current = true;

                    const isNumericBarcode =
                      /^\d{8,}$/.test(trimmed) ||
                      /^\d{12,13}$/.test(trimmed) ||
                      /^\d{8}$/.test(trimmed);
                    const isCodePriceFormat = trimmed.includes("-") && trimmed.length > 3;

                    if (isNumericBarcode || isCodePriceFormat) {
                      e.preventDefault();
                      handleScannerInput(trimmed);
                      setTimeout(() => {
                        enterKeyPressedRef.current = false;
                      }, 100);
                      return;
                    }

                    if (searchDropdownProducts.length > 0) {
                      e.preventDefault();
                      const product =
                        searchDropdownProducts[highlightedProductIndex] ??
                        searchDropdownProducts[0];
                      selectProductForSale(product);
                      setTimeout(() => {
                        enterKeyPressedRef.current = false;
                      }, 100);
                      return;
                    }

                    setTimeout(() => {
                      enterKeyPressedRef.current = false;
                    }, 100);
                  }
                }}
                className={cn(
                  "h-10 pl-10 border-gray-200 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-400 focus-visible:ring-offset-0",
                  isScanning && "border-blue-500 bg-blue-50/50 pr-10",
                )}
                autoFocus
              />

              {productSearchOpen && searchDropdownProducts.length > 0 && (
                <div
                  ref={searchDropdownRef}
                  data-product-search-dropdown
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                >
                  {searchDropdownProducts.map((product, index) => (
                    <button
                      key={product.id}
                      ref={(el) => {
                        searchDropdownItemRefs.current[index] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedProductIndex}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                        index === highlightedProductIndex
                          ? "bg-blue-50 text-blue-900"
                          : "hover:bg-slate-50",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlightedProductIndex(index)}
                      onClick={() => selectProductForSale(product)}
                    >
                      <span className="truncate font-medium">{product.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-blue-600 tabular-nums">
                        Rs {product.price.toLocaleString()}
                      </span>
                    </button>
                  ))}
                  {searchDropdownOverflowCount > 0 && (
                    <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                      +{searchDropdownOverflowCount} more — type a more specific name or code
                    </p>
                  )}
                </div>
              )}
            </div>

            <div
              className={cn(
                "flex h-10 w-full min-w-[13rem] max-w-[15rem] shrink-0 items-stretch overflow-hidden rounded-md border bg-white shadow-sm transition-opacity sm:w-[15rem]",
                quickAdjustLine ? "border-gray-200" : "border-dashed border-gray-200 opacity-40",
              )}
              title={
                quickAdjustLine
                  ? `Adjust quantity for ${quickAdjustLine.name}`
                  : "Add a product to adjust quantity"
              }
            >
              <Button
                type="button"
                variant="ghost"
                disabled={!quickAdjustLine}
                className="h-10 w-11 shrink-0 rounded-none border-r border-gray-200 px-0 hover:bg-slate-100 disabled:opacity-40 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Decrease quantity"
                data-quick-qty="true"
                onClick={() => quickAdjustLine && bumpQuantity(quickAdjustLine.id, -1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center border-r border-gray-200 bg-slate-50/90 px-2 py-0.5">
                <Input
                  ref={quickQtyInputRef}
                  disabled={!quickAdjustLine}
                  type="text"
                  inputMode={
                    quickAdjustLine && isWeightUnit(quickAdjustLine.unitName || quickAdjustLine.unit)
                      ? "text"
                      : "decimal"
                  }
                  placeholder="Qty"
                  data-quantity-input="true"
                  data-quick-qty="true"
                  value={
                    quickAdjustLine
                      ? quantityInputs[quickAdjustLine.id] ??
                        formatQuantityValue(quickAdjustLine.quantity)
                      : ""
                  }
                  onFocus={() => {
                    if (!quickAdjustLine) return;
                    quantityFocusLineIdRef.current = quickAdjustLine.id;
                    isUserInteractingRef.current = true;
                    switchActiveCartLine(quickAdjustLine.id);
                  }}
                  onChange={(e) => {
                    // Always edit the line this box is actually displaying, never a
                    // stale shared ref — otherwise typing could update a different line.
                    const lineId = quickAdjustLine?.id;
                    if (!lineId) return;
                    const line =
                      cartRef.current.find((l) => l.id === lineId) ?? quickAdjustLine;
                    if (!line) return;
                    const unitName = line.unitName || line.unit;
                    const value = e.target.value.trim();
                    setQuantityModes((prev) => ({ ...prev, [lineId]: "custom" }));
                    if (value === "") {
                      setQuantityInputs((prev) => {
                        const next = { ...prev, [lineId]: "" };
                        quantityInputsRef.current = next;
                        return next;
                      });
                      return;
                    }
                    setQuantityInputs((prev) => {
                      const next = { ...prev, [lineId]: value };
                      quantityInputsRef.current = next;
                      return next;
                    });
                    const parsed = parseCustomQuantityInput(value, unitName);
                    if (parsed === null) return;
                    updateQuantityManual(lineId, parsed, unitName);
                  }}
                  onBlur={() => {
                    const lineId = quantityFocusLineIdRef.current;
                    if (!lineId) return;
                    if (quantityEnterConfirmedRef.current === lineId) {
                      quantityEnterConfirmedRef.current = null;
                      quantityFocusLineIdRef.current = null;
                      setTimeout(() => {
                        isUserInteractingRef.current = false;
                      }, 300);
                      return;
                    }
                    applyTypedOverlayToCart(lineId);
                    clearQuantityOverlay(lineId);
                    quantityFocusLineIdRef.current = null;
                    setTimeout(() => {
                      isUserInteractingRef.current = false;
                    }, 300);
                  }}
                  onKeyDown={(e) => {
                    if (!quickAdjustLine) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Pin the confirm to the displayed line (matches per-line input).
                      quantityFocusLineIdRef.current = quickAdjustLine.id;
                      confirmQuantityAndReturnToSearch(quickAdjustLine.id);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      bumpQuantity(quickAdjustLine.id, 1);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      bumpQuantity(quickAdjustLine.id, -1);
                    }
                  }}
                  className="h-7 w-full max-w-[5.5rem] border-0 bg-transparent p-0 text-center text-base font-bold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-50"
                />
                <span className="max-w-full truncate text-[10px] leading-none text-gray-500">
                  {quickAdjustLine
                    ? `Rs ${formatMoney(getSellingPrice(quickAdjustLine))} each`
                    : "each"}
                </span>
              </div>
              <Button
                ref={quickQtyPlusRef}
                type="button"
                variant="ghost"
                disabled={!quickAdjustLine}
                className="h-10 w-11 shrink-0 rounded-none px-0 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Increase quantity"
                data-quick-qty="true"
                onClick={() => quickAdjustLine && bumpQuantity(quickAdjustLine.id, 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

          {/* Printer info - configured globally in Printer Settings */}
          {receiptPrinter && (
            <div className="mb-4 px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50/60 flex items-center gap-2 text-sm text-blue-800">
              <span className="font-medium">🖨️ {receiptPrinter}</span>
              <span className="text-blue-600 text-xs">(change in Printer Settings)</span>
            </div>
          )}

        {/* Customer Selection */}
        <div className="mb-4 bg-white text-black rounded-lg border border-gray-200 shadow-sm p-4">
          <label className="block text-sm font-bold text-slate-800 mb-2">
            Customer <span className="text-[10px] text-slate-400 font-medium ml-1">(Optional/Required for Credit)</span>
          </label>
          <div className="flex gap-2">
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerSearchOpen}
                  className="w-full justify-between font-medium text-left bg-white border-gray-200 hover:bg-slate-50 overflow-hidden"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Users className="h-4 w-4 text-slate-400" />
                    <span className="truncate">
                      {selectedCustomer
                        ? customers.find((c) => c.id === selectedCustomer)?.name
                        : "Walk-in Customer"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command className="border-none shadow-none">
                  <CommandInput placeholder="Search customer by name or phone..." className="h-10" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          setSelectedCustomer(null);
                          setCustomerSearchOpen(false);
                        }}
                        className="flex items-center gap-2 py-2.5"
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 text-blue-600",
                            !selectedCustomer ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="italic text-gray-500 font-medium">Walk-in Customer</span>
                      </CommandItem>
                      {customers.map((customer: any) => (
                        <CommandItem
                          key={customer.id}
                          value={`${customer.name} ${customer.phone_number || ""}`}
                          onSelect={() => {
                            setSelectedCustomer(customer.id);
                            setCustomerSearchOpen(false);
                          }}
                          className="flex items-center gap-2 py-2.5"
                        >
                          <Check
                            className={cn(
                              "h-4 w-4 text-blue-600",
                              selectedCustomer === customer.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900">{customer.name}</span>
                            {customer.phone_number && (
                              <span className="text-[10px] text-blue-600 font-medium tracking-tight">
                                📞 {customer.phone_number}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="shrink-0 border-gray-200 hover:bg-blue-50" onClick={() => setIsAddCustomerOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {selectedCustomer && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1.5">
              {(() => {
                const customer = customers.find((c) => c.id === selectedCustomer);
                if (!customer) return null;
                const balance = Number(customer.outstanding_balance || 0);
                const limit = Number(customer.credit_limit || 0);
                const isOverLimit = limit > 0 && (balance + total) > limit;

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                        {balance < 0 ? 'Advance Available' : 'Current Due'}
                      </span>
                      <span className={`text-sm font-black ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        Rs {Math.abs(balance).toLocaleString()}
                      </span>
                    </div>
                    {balance < 0 && (
                      <p className="text-[11px] text-emerald-600 font-medium leading-relaxed">
                        Rs {Math.min(-balance, total).toLocaleString()} will be applied to this sale.
                      </p>
                    )}
                    {limit > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Credit limit</span>
                        <span className="text-sm font-bold text-slate-700">Rs {limit.toLocaleString()}</span>
                      </div>
                    )}
                    {isOverLimit && (
                      <div className="mt-2 px-3 py-2 bg-rose-50 text-rose-700 text-[11px] rounded-xl border border-rose-100 flex items-start gap-2 leading-relaxed font-bold">
                        <span className="mt-0.5 shrink-0">⚠️</span> 
                        <span>Sale exceeds customer's credit limit.</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => handleCategoryChange(category.id)}
              className="whitespace-nowrap"
              disabled={productsLoading}
            >
              {productsLoading && selectedCategory === category.id && (
                <LoadingSpinner size="sm" className="mr-2" />
              )}
              {category.name}
            </Button>
          ))}
        </div>

        {/* Products Grid */}
        {productsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-200 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 col-span-full">
            <span className="text-2xl mb-2">🛒</span>
            <p className="text-gray-500 text-lg">
              No products found in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => {
              // Find cart items by productId (for separate entries) or id (backward compatibility)
              const cartItems = cart.filter((item) => 
                (item as any).productId === product.id || item.id === product.id
              );
              const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-2 space-y-1">
                    <h3 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-bold text-blue-600">
                        Rs {product.price.toLocaleString()}
                      </span>
                      {totalQuantity > 0 && (
                        <Badge className="bg-blue-600 text-[10px] px-1.5 py-0.5">
                          {formatQuantityValue(totalQuantity)}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Section — fixed narrow width so product grid keeps more space */}
      <div className="w-full shrink-0 lg:w-[min(100%,300px)] xl:w-[320px] bg-white lg:border-l border-gray-200 flex flex-col">
        <div className="border-b border-gray-200 bg-slate-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sale Summary</h2>
              {cart.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Scan a product or search to start a new sale.
                </p>
              )}
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
                className="flex-1 min-w-[120px] border-dashed"
              >
                Clear Cart
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={holdCurrentSale}
                className="flex-1 min-w-[120px]"
                disabled={isHoldingSale}
              >
                {isHoldingSale ? "Saving..." : "Hold Sale (Save)"}
              </Button>
            </div>
          )}

          {holdSales.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewHeldSales}
              className="mt-3 w-full justify-between border border-gray-200 bg-white hover:bg-white"
              disabled={isViewingHeldSales || holdSalesLoading}
            >
              <span className="text-sm font-medium text-gray-700">
                {isViewingHeldSales || holdSalesLoading
                  ? "Loading held sales..."
                  : `Held Sales (${holdSales.length})`}
              </span>
              {showHeldSales ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}

          {showHeldSales && holdSalesLoading && (
            <div className="mt-2 rounded-lg border border-dashed border-blue-200 bg-white p-3 text-xs text-gray-500">
              Loading held sales...
            </div>
          )}

          {holdSales.length > 0 && showHeldSales && !holdSalesLoading && (
            <div id="held-sales-list" className="mt-2 rounded-lg border border-dashed border-blue-200 bg-white p-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, or Sale #..."
                  value={holdSearch}
                  onChange={(e) => setHoldSearch(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                />
              </div>
              <div className="max-h-60 pr-2 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                  {holdSales.map((sale, index) => {
                    const q = holdSearch.trim().toLowerCase();
                    if (q) {
                      const matchesName = sale.customerName.toLowerCase().includes(q);
                      const matchesPhone = sale.customerPhone.toLowerCase().includes(q);
                      const matchesNumber = `sale #${index + 1}`.includes(q) || String(index + 1) === q;
                      if (!matchesName && !matchesPhone && !matchesNumber) return null;
                    }
                    const saleTotal = sale.items.reduce(
                      (sum, item) => sum + getSellingPrice(item as CartItem) * item.quantity,
                      0
                    );
                    return (
                      <div key={sale.id} className="flex flex-col gap-2 rounded-md border border-gray-200 p-2.5 bg-gray-50/50 hover:border-blue-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col leading-tight">
                            <span className="font-semibold text-sm text-gray-800">
                              Sale #{index + 1} — {sale.customerName}
                            </span>
                            {sale.customerPhone && (
                              <span className="text-xs text-blue-600">{sale.customerPhone}</span>
                            )}
                            <span className="text-xs text-gray-500 mt-0.5">
                              {sale.items.length} items • Rs {saleTotal.toFixed(2)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 -mt-1 -mr-1 shrink-0"
                            disabled={isDeletingHoldSale}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetHoldSale(index);
                            }}
                          >
                            {isDeletingHoldSale && deleteTargetHoldSale === index ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetrieveHoldSale(index)}
                          className="w-full text-xs font-semibold text-blue-600 bg-white hover:bg-blue-50 hover:text-blue-700 border-blue-200 h-8 mt-1"
                          disabled={resumingHoldIndex === index}
                        >
                          {resumingHoldIndex === index ? "Resuming..." : "Resume Sale"}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

        </div>

        <div className="flex-1 overflow-hidden">
          <div ref={cartScrollContainerRef} className="h-full overflow-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="mt-8 text-center text-gray-500">
                <p className="font-medium text-gray-600">Your cart is empty</p>
                <p className="text-sm text-gray-500">Add products to see them here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => {
                  const unitName = item.unitName || item.unit;
                  const minQuantity = isPieceUnit(unitName) ? 1 : 0.01;
                  const minControlQuantity = minQuantity;
                  const effectiveUnitPrice = getSellingPrice(item);

                  return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      cartItemRefs.current[item.id] = el;
                    }}
                    onClick={() => switchActiveCartLine(item.id)}
                    className={cn(
                      "rounded-lg border bg-white p-2.5 shadow-sm transition-shadow",
                      activeCartLineId === item.id
                        ? "border-blue-400 ring-2 ring-blue-200/80"
                        : "border-gray-200",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-gray-900 leading-snug flex items-center gap-2">
                          <span>{item.name}</span>
                          {isPriceOverridden(item) && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                              <Pencil className="h-3 w-3 mr-1" />
                              Custom Price
                            </Badge>
                          )}
                        </h4>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-medium text-gray-500 shrink-0">
                          Unit price
                        </label>
                        {isPriceOverridden(item) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-amber-700"
                            onClick={() => {
                              setCart((prev) =>
                                prev.map((cartItem) =>
                                  cartItem.id === item.id
                                    ? {
                                        ...cartItem,
                                        actualUnitPrice: cartItem.originalPrice,
                                        price: cartItem.originalPrice,
                                      }
                                    : cartItem,
                                ),
                              );
                            }}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                      <Input
                        ref={(el) => {
                          priceInputRefs.current[item.id] = el;
                          if (el) el.setAttribute("data-price-input", "true");
                        }}
                        type="text"
                        inputMode="decimal"
                        value={
                          priceInputs[item.id] !== undefined
                            ? priceInputs[item.id]
                            : item.actualUnitPrice === 0
                              ? ""
                              : String(item.actualUnitPrice || item.price)
                        }
                        onFocus={() => {
                          isUserInteractingRef.current = true;
                          switchActiveCartLine(item.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") {
                            e.preventDefault();
                            quantityInputRefs.current[item.id]?.focus();
                          }
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPriceInputs((prev) => ({ ...prev, [item.id]: value }));
                          if (value === "") {
                            setCart((prev) =>
                              prev.map((cartItem) =>
                                cartItem.id === item.id
                                  ? { ...cartItem, actualUnitPrice: 0, price: 0 }
                                  : cartItem,
                              ),
                            );
                            return;
                          }
                          if (/^(\d*\.?\d*)$/.test(value) && value !== ".") {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setCart((prev) =>
                                prev.map((cartItem) =>
                                  cartItem.id === item.id
                                    ? { ...cartItem, actualUnitPrice: numValue, price: numValue }
                                    : cartItem,
                                ),
                              );
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          setPriceInputs((prev) => {
                            const newState = { ...prev };
                            delete newState[item.id];
                            return newState;
                          });
                          if (value === "" || value === "." || value === "0") {
                            setCart((prev) =>
                              prev.map((cartItem) =>
                                cartItem.id === item.id
                                  ? {
                                      ...cartItem,
                                      actualUnitPrice: cartItem.originalPrice,
                                      price: cartItem.originalPrice,
                                    }
                                  : cartItem,
                              ),
                            );
                          } else {
                            const numValue = parseFloat(value);
                            setCart((prev) =>
                              prev.map((cartItem) =>
                                cartItem.id === item.id
                                  ? {
                                      ...cartItem,
                                      actualUnitPrice:
                                        !isNaN(numValue) && numValue >= 0
                                          ? numValue
                                          : cartItem.originalPrice,
                                      price:
                                        !isNaN(numValue) && numValue >= 0
                                          ? numValue
                                          : cartItem.originalPrice,
                                    }
                                  : cartItem,
                              ),
                            );
                          }
                          setTimeout(() => {
                            isUserInteractingRef.current = false;
                          }, 300);
                        }}
                        className={cn(
                          "h-8 text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                          isPriceOverridden(item) && "border-amber-400 bg-amber-50",
                        )}
                      />

                      <div className="flex items-stretch gap-2">
                        <div className="flex flex-1 min-w-0 items-stretch overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-10 w-10 shrink-0 rounded-none border-r border-gray-200 hover:bg-slate-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                            aria-label="Decrease quantity"
                            onClick={() => bumpQuantity(item.id, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="flex flex-1 min-w-0 flex-col items-center justify-center px-1 py-0.5 border-r border-gray-200 bg-slate-50/80">
                            <Input
                              ref={(el) => {
                                quantityInputRefs.current[item.id] = el;
                                if (el) el.setAttribute("data-quantity-input", "true");
                              }}
                              type="text"
                              inputMode={isWeightUnit(unitName) ? "text" : "decimal"}
                              placeholder="Qty"
                              value={quantityInputs[item.id] ?? formatQuantityValue(item.quantity)}
                              onFocus={() => {
                                quantityFocusLineIdRef.current = item.id;
                                isUserInteractingRef.current = true;
                                switchActiveCartLine(item.id);
                              }}
                              onChange={(e) => {
                                const value = e.target.value.trim();
                                setQuantityModes((prev) => ({ ...prev, [item.id]: "custom" }));
                                if (value === "") {
                                  setQuantityInputs((prev) => {
                                    const next = { ...prev, [item.id]: "" };
                                    quantityInputsRef.current = next;
                                    return next;
                                  });
                                  return;
                                }
                                setQuantityInputs((prev) => {
                                  const next = { ...prev, [item.id]: value };
                                  quantityInputsRef.current = next;
                                  return next;
                                });
                                const parsed = parseCustomQuantityInput(value, unitName);
                                if (parsed === null) return;
                                updateQuantityManual(item.id, parsed, unitName);
                              }}
                              onBlur={() => {
                                const lineId = quantityFocusLineIdRef.current;
                                if (!lineId) return;
                                if (quantityEnterConfirmedRef.current === lineId) {
                                  quantityEnterConfirmedRef.current = null;
                                  quantityFocusLineIdRef.current = null;
                                  setTimeout(() => {
                                    isUserInteractingRef.current = false;
                                  }, 300);
                                  return;
                                }
                                applyTypedOverlayToCart(lineId);
                                clearQuantityOverlay(lineId);
                                quantityFocusLineIdRef.current = null;
                                setTimeout(() => {
                                  isUserInteractingRef.current = false;
                                }, 300);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  quantityFocusLineIdRef.current = item.id;
                                  confirmQuantityAndReturnToSearch(item.id);
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  bumpQuantity(item.id, 1);
                                }
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  bumpQuantity(item.id, -1);
                                }
                              }}
                              className="h-7 border-0 bg-transparent text-center text-base font-bold shadow-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] text-gray-500 leading-none pb-0.5">
                              Rs {formatMoney(effectiveUnitPrice)} each
                            </span>
                          </div>
                          <Button
                            ref={(el) => {
                              quantityPlusRefs.current[item.id] = el;
                            }}
                            type="button"
                            variant="ghost"
                            className="h-10 w-10 shrink-0 rounded-none hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                            aria-label="Increase quantity"
                            onClick={() => bumpQuantity(item.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex shrink-0 flex-col justify-center rounded-md border border-blue-100 bg-blue-50 px-2.5 min-w-[72px]">
                          <span className="text-[10px] font-medium text-blue-700/80 leading-none">Total</span>
                          <span className="text-sm font-bold text-blue-900 tabular-nums leading-tight">
                            Rs {formatMoney(effectiveUnitPrice * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5">
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600 text-xs font-medium">
                    <span>Subtotal</span>
                    <span className="text-sm font-semibold text-blue-700">{formatMoney(subtotal)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-gray-600 text-xs font-medium">Discount</span>
                    <div className="flex items-center space-x-1.5 w-32">
                      <select 
                        value={globalDiscountType} 
                        onChange={(e) => setGlobalDiscountType(e.target.value as "percentage" | "fixed")} 
                        className="h-7 w-12 rounded border border-gray-300 bg-white px-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="fixed">Rs</option>
                        <option value="percentage">%</option>
                      </select>
                      <Input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={globalDiscountValue} 
                        onChange={(e) => setGlobalDiscountValue(e.target.value)} 
                        className="h-7 w-full px-2 text-xs text-right"
                      />
                    </div>
                  </div>
                  
                  {globalDiscountAmount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-green-600 text-xs font-medium">
                      <span>Discount Given</span>
                      <span>-{formatMoney(globalDiscountAmount)}</span>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-blue-700 text-sm font-bold">
                    <span>Payable</span>
                    <span>{formatMoney(total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  onClick={() => startPayment("Cash")}
                  disabled={paymentLoading}
                  className="h-10 text-sm"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startPayment("Credit")}
                  disabled={paymentLoading || !selectedCustomer || cart.length === 0}
                  className="h-10 text-sm border-blue-200 hover:bg-blue-50 hover:text-blue-700 text-blue-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Credit Sale
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={paymentDialogOpen}
        onOpenChange={handlePaymentDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paymentMethodPending === "Credit" ? "Credit Invoice" : paymentMethodPending ? `${paymentMethodPending} Payment` : "Payment"}
            </DialogTitle>
            <DialogDescription>
              {paymentMethodPending === "Credit"
                ? "Enter the amount paid by the customer. The remaining balance will be recorded as credit."
                : "Enter the amount received to calculate the change due."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-2">
              <div className="flex items-center justify-between text-gray-600">
                <span>Payable Amount</span>
                <span className="font-semibold text-gray-900">
                  Rs {formatMoney(total)}
                </span>
              </div>
              {paymentMethodPending !== "Credit" && advanceAvailable > 0 && (
                <>
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Advance Available</span>
                    <span className="font-semibold">Rs {formatMoney(advanceAvailable)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-emerald-700">
                    <span className="shrink-0">Advance Applied</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">-Rs</span>
                      <Input
                        type="number"
                        min="0"
                        max={advanceApplicable}
                        step="0.01"
                        value={advanceToApply}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          const next = Number.isNaN(parsed) ? 0 : parsed;
                          const clamped = Math.min(Math.max(0, next), advanceApplicable);
                          setAdvanceToApply(clamped);
                          setTenderedAmount(roundMoney(total - clamped).toFixed(2));
                          setPaymentError("");
                        }}
                        className="h-7 w-24 text-right text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-blue-700 font-bold">
                    <span>Net Payable</span>
                    <span>Rs {formatMoney(netPayable)}</span>
                  </div>
                </>
              )}
              {paymentMethodPending === "Credit" && calculatedCredit > 0 && (
                <div className="flex items-center justify-between text-amber-600 font-semibold">
                  <span>Credit Balance</span>
                  <span>Rs {calculatedCredit.toFixed(2)}</span>
                </div>
              )}
              {canKeepExcessAsCredit && (
                <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                  <div className="flex items-center justify-between font-semibold text-slate-700">
                    <span>Extra Received</span>
                    <span>Rs {formatMoney(tenderedExcess)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={keepExcessAsCredit ? "default" : "outline"}
                      onClick={() => setKeepExcessAsCredit(true)}
                      className="h-8 text-xs"
                    >
                      Keep as credit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={keepExcessAsCredit ? "outline" : "default"}
                      onClick={() => setKeepExcessAsCredit(false)}
                      className="h-8 text-xs"
                    >
                      Return as change
                    </Button>
                  </div>
                </div>
              )}
              {excessKeptAsCredit > 0 && (
                <div className="flex items-center justify-between text-emerald-600 font-semibold">
                  <span>Added to Advance Credit</span>
                  <span>Rs {formatMoney(excessKeptAsCredit)}</span>
                </div>
              )}
              {calculatedChange > 0 && (
                <div className="flex items-center justify-between text-green-600 font-semibold">
                  <span>Change Due</span>
                  <span>Rs {calculatedChange.toFixed(2)}</span>
                </div>
              )}
              {paymentMethodPending === "Credit" && calculatedCredit === 0 && calculatedChange === 0 && (
                <div className="flex items-center justify-between text-emerald-600 font-semibold">
                  <span>Credit Balance</span>
                  <span>Rs 0.00</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {paymentMethodPending === "Credit" ? "Amount Paid (0 for full credit)" : "Amount Received"}
              </label>
              <Input
                type="number"
                autoFocus
                value={tenderedAmount}
                onChange={(e) => handleTenderedInputChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter: Confirm payment
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmPayment();
                  }
                  // Escape: Cancel payment
                  if (e.key === "Escape") {
                    e.preventDefault();
                    resetPaymentState();
                  }
                }}
                className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                min="0"
                step="0.01"
              />
            </div>
            {paymentError && (
              <p className="text-sm text-red-600">{paymentError}</p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={resetPaymentState}
              disabled={paymentLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPayment}
              disabled={paymentLoading || !paymentMethodPending}
            >
              {paymentLoading
                ? "Processing..."
                : `Confirm ${paymentMethodPending ?? "Payment"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTargetHoldSale !== null} onOpenChange={(open) => !open && !isDeletingHoldSale && setDeleteTargetHoldSale(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hold Sale</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discard this held sale permanently? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingHoldSale}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={isDeletingHoldSale}
              onClick={async (e) => {
                e.preventDefault();
                if (deleteTargetHoldSale !== null) {
                  setIsDeletingHoldSale(true);
                  try {
                    await deleteHoldSale(deleteTargetHoldSale);
                  } finally {
                    setIsDeletingHoldSale(false);
                    setDeleteTargetHoldSale(null);
                  }
                }
              }}
            >
              {isDeletingHoldSale ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add Customer</DialogTitle>
            <DialogDescription>
              Create a new customer profile for credit management and billing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Name *</label>
                <Input
                  placeholder="Customer name"
                  value={newCustomerData.name}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Contact Number *</label>
                <Input
                  placeholder="0300 0000000"
                  value={newCustomerData.phone_number}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, phone_number: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <Input
                  type="email"
                  placeholder="customer@example.com"
                  value={newCustomerData.email}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">WhatsApp <span className="text-gray-400 font-normal">(optional)</span></label>
                <Input
                  placeholder="Wa.me number"
                  value={newCustomerData.whatsapp_number}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, whatsapp_number: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Credit limit (Rs) <span className="text-gray-400 font-normal">(empty = unlimited)</span></label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Leave empty for unlimited"
                  value={newCustomerData.credit_limit}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, credit_limit: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Previous credit balance (Rs) <span className="text-gray-400 font-normal">(optional)</span></label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Owed before POS"
                  value={newCustomerData.previous_balance}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, previous_balance: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddCustomerOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newCustomerData.name || !newCustomerData.phone_number || isAddingCustomer}
              onClick={async () => {
                try {
                  setIsAddingCustomer(true);
                  const custPayload = {
                    name: newCustomerData.name,
                    ...(newCustomerData.email.trim() && { email: newCustomerData.email.trim().toLowerCase() }),
                    phone_number: newCustomerData.phone_number,
                    whatsapp_number: newCustomerData.whatsapp_number,
                    credit_limit: newCustomerData.credit_limit ? Number(newCustomerData.credit_limit) : 0,
                    outstanding_balance: newCustomerData.previous_balance
                      ? Math.max(0, Number(newCustomerData.previous_balance))
                      : 0,
                  };

                  if (!navigator.onLine) {
                    // Queue creation; proceed without selecting customer (no server ID yet)
                    await offlineDB.enqueue({
                      operationId: crypto.randomUUID(),
                      type: 'customer',
                      url: '/customer',
                      method: 'POST',
                      payload: custPayload,
                      maxRetries: 5,
                      priority: 7,
                      headers: {},
                    });
                    toast({
                      title: "Saved Offline",
                      description: "Customer will be created when connection is restored.",
                    });
                  } else {
                    try {
                      const res = await apiClient.post("/customer", custPayload);
                      await fetchCustomers(true);
                      if (res.data?.data?.id) setSelectedCustomer(res.data.data.id);
                      toast({
                        title: "Success",
                        description: "Customer added and selected successfully",
                        className: "bg-emerald-50 border-emerald-200 text-emerald-800",
                      });
                    } catch {
                      await offlineDB.enqueue({
                        operationId: crypto.randomUUID(),
                        type: 'customer',
                        url: '/customer',
                        method: 'POST',
                        payload: custPayload,
                        maxRetries: 5,
                        priority: 7,
                        headers: {},
                      });
                      toast({
                        title: "Saved for sync",
                        description: "Could not reach the server. Customer will be created when connection is stable.",
                      });
                    }
                  }

                  setIsAddCustomerOpen(false);
                  setNewCustomerData({
                    name: "",
                    email: "",
                    phone_number: "",
                    whatsapp_number: "",
                    credit_limit: "",
                    previous_balance: "",
                  });
                } catch (error: any) {
                  console.error("Customer Add Error:", error);
                  const errMsg = error.response?.data?.message || error.response?.data?.errors?.[0]?.message || "Failed to create customer";
                  toast({ variant: "destructive", title: "Registration Failed", description: errMsg });
                } finally {
                  setIsAddingCustomer(false);
                }
              }}
            >
              {isAddingCustomer ? "Saving..." : "Save Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Success Screen */}
      <Dialog open={!!checkoutSuccessData} onOpenChange={(open) => {
        if (!open) {
          setCheckoutSuccessData(null);
          setIsAskingWhatsApp(false);
          setIsAskingEmail(false);
          setManualWhatsAppNumber("");
          setManualEmail("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <DialogTitle className="text-xl">Payment Successful</DialogTitle>
              <DialogDescription className="text-center">
                Sale <span className="font-semibold text-gray-800">#{checkoutSuccessData?.saleNumber}</span> completed successfully.
              </DialogDescription>
            </div>
          </DialogHeader>

          {checkoutSuccessData && (
            <div className="py-2">
              {checkoutSuccessData.paymentMethod.toUpperCase() === 'CREDIT' ? (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bill Total</span>
                    <span className="font-semibold text-gray-900">
                      Rs {checkoutSuccessData.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-semibold text-green-600">
                      Rs {(checkoutSuccessData.amountPaid ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="font-medium text-gray-700">Balance Due</span>
                    <span className="text-xl font-bold text-orange-600">
                      Rs {(checkoutSuccessData.balanceDue ?? Math.max(0, checkoutSuccessData.total - (checkoutSuccessData.amountPaid ?? 0))).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-orange-600 font-medium text-xs text-center pt-1">
                    Payment Method: Credit Sale
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex flex-col items-center mb-6">
                  <p className="text-sm text-gray-500 mb-1">Total Received</p>
                  <p className="text-3xl font-bold text-gray-900">
                    <span className="text-xl mr-1">Rs</span>
                    {tenderedAmount
                      ? parseFloat(tenderedAmount).toLocaleString()
                      : (checkoutSuccessData.amountPaid ?? checkoutSuccessData.total).toLocaleString()}
                  </p>
                  {(checkoutSuccessData.advanceApplied ?? 0) > 0 && (
                    <p className="text-emerald-600 font-medium text-sm mt-2">
                      Rs {(checkoutSuccessData.advanceApplied ?? 0).toLocaleString()} settled from advance credit
                    </p>
                  )}
                  {(checkoutSuccessData.excessKeptAsCredit ?? 0) > 0 && (
                    <p className="text-emerald-600 font-medium text-sm mt-1">
                      Rs {(checkoutSuccessData.excessKeptAsCredit ?? 0).toLocaleString()} added to advance credit
                    </p>
                  )}
                  {(checkoutSuccessData.changeReturned ?? 0) > 0 && (
                    <p className="text-green-600 font-medium text-sm mt-1">
                      Change Due: Rs {(checkoutSuccessData.changeReturned ?? 0).toLocaleString()}
                    </p>
                  )}
                  {(checkoutSuccessData.closingBalance ?? 0) < -0.009 && (
                    <p className="text-slate-500 text-xs mt-2">
                      Advance credit balance: Rs{" "}
                      {Math.abs(checkoutSuccessData.closingBalance ?? 0).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4">
                {isAskingWhatsApp ? (
                  <div className="col-span-2 space-y-2 bg-green-50 p-3 rounded-lg border border-green-100 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-green-700 uppercase tracking-wider">Enter WhatsApp Number</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="0300 1234567"
                        value={manualWhatsAppNumber}
                        onChange={(e) => setManualWhatsAppNumber(e.target.value)}
                        className="bg-white border-green-200 focus-visible:ring-green-500"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#128C7E] text-white px-4 font-bold"
                        onClick={async () => {
                          if (!manualWhatsAppNumber) return;
                          const result = await shareOnWhatsApp({
                            ...checkoutSuccessData!,
                            customerWhatsApp: manualWhatsAppNumber
                          });
                          if (result.method === 'desktop') {
                            toast({
                              title: "PDF Downloaded",
                              description: "Invoice saved to your Downloads. Attach it in the WhatsApp chat that just opened.",
                              duration: 6000,
                            });
                          }
                          setIsAskingWhatsApp(false);
                        }}
                      >
                        Send
                      </Button>
                      <Button 
                        size="sm"
                        variant="ghost" 
                        onClick={() => setIsAskingWhatsApp(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : isAskingEmail ? (
                  <div className="col-span-2 space-y-2 bg-amber-50 p-3 rounded-lg border border-amber-100 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">Enter Email Address</label>
                    <div className="flex gap-2">
                      <Input 
                        type="email"
                        placeholder="customer@example.com"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="bg-white border-amber-200 focus-visible:ring-amber-500"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 font-bold"
                        onClick={async () => {
                          if (!manualEmail) return;
                          const result = await shareOnEmail({
                            ...checkoutSuccessData!,
                            customerEmail: manualEmail
                          });
                          if (result.method === 'desktop') {
                            toast({
                              title: "PDF Downloaded",
                              description: "Invoice saved to your Downloads. Attach it in the email draft that just opened.",
                              duration: 6000,
                            });
                          }
                          setIsAskingEmail(false);
                        }}
                      >
                        Send
                      </Button>
                      <Button 
                        size="sm"
                        variant="ghost" 
                        onClick={() => setIsAskingEmail(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 h-12 border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => downloadA4Invoice(checkoutSuccessData)}
                    >
                      <FileText className="h-5 w-5" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 h-12 border-gray-200 text-gray-700 hover:bg-gray-50"
                      onClick={() => printA4Invoice(checkoutSuccessData)}
                    >
                      <Printer className="h-5 w-5" />
                      Print
                    </Button>
                    <Button
                      className="w-full flex items-center justify-center gap-2 h-12 bg-[#25D366] hover:bg-[#128C7E] text-white"
                      onClick={async () => {
                        const number = checkoutSuccessData.customerWhatsApp || checkoutSuccessData.customerPhone;
                        if (!number) {
                          setIsAskingWhatsApp(true);
                          setIsAskingEmail(false);
                          return;
                        }
                        const result = await shareOnWhatsApp(checkoutSuccessData);
                        if (result.method === 'desktop') {
                          toast({
                            title: "PDF Downloaded",
                            description: result.whatsappOpened
                              ? "Invoice saved to Downloads. Attach it in the WhatsApp chat that just opened."
                              : "Invoice saved to your Downloads folder.",
                            duration: 6000,
                          });
                        }
                      }}
                    >
                      <Share2 className="h-5 w-5" />
                      WhatsApp
                    </Button>
                    <Button
                      className="w-full flex items-center justify-center gap-2 h-12 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={async () => {
                        const email = checkoutSuccessData.customerEmail;
                        if (!email) {
                          setIsAskingEmail(true);
                          setIsAskingWhatsApp(false);
                          return;
                        }
                        const result = await shareOnEmail(checkoutSuccessData);
                        if (result.method === 'desktop') {
                          toast({
                            title: "PDF Downloaded",
                            description: "Invoice saved to your Downloads folder. Attach it in the email draft that just opened.",
                            duration: 6000,
                          });
                        }
                      }}
                    >
                      <Mail className="h-5 w-5" />
                      Email
                    </Button>
                  </div>
                )}
              </div>
              <Button 
                variant="ghost" 
                className="w-full mt-3 h-10 text-gray-500"
                onClick={() => {
                  setCheckoutSuccessData(null);
                  setIsAskingWhatsApp(false);
                  setManualWhatsAppNumber("");
                }}
              >
                Start New Sale
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}