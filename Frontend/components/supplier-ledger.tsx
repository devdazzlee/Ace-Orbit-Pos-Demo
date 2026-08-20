"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArrowLeft,
  Download,
  Search,
  Receipt,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  DollarSign,
  Plus,
  Loader2,
  Printer,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/apiClient";
import { notifyDashboardStatsChanged } from "@/lib/dashboard-stats-sync";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import {
  downloadSupplierLedgerPdf,
  printSupplierLedgerPdf,
  buildSupplierLedgerExportParams,
  type SupplierLedgerExportParams,
} from "@/lib/supplier-ledger-pdf";

interface LedgerEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  reference_no: string | null;
  debit: number;
  credit: number;
  balance: number;
  amount?: number;
  invoiceDue?: number;
  invoicePaid?: number;
  invoiceTotal?: number;
  purchaseId?: string | null;
  paymentStatus?: string | null;
  isPayable?: boolean;
  isEditable?: boolean;
  isDeletable?: boolean;
  editRestrictedReason?: string | null;
  payment_method: string | null;
}

interface SupplierDetails {
  id: string;
  name: string;
  phone_number: string | null;
  mobile_number: string | null;
  email: string | null;
  outstanding_balance: number;
  code: string;
}

interface ProductSummary {
  productId: string;
  productName: string;
  sku: string | null;
  totalQuantity: number;
  totalAmount: number;
  purchaseCount: number;
  lastPurchaseDate: string;
  lastRate: number;
}

interface PurchaseDetail {
  id: string;
  purchaseNumber: string | null;
  invoiceRef: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  costPrice: number;
  lineTotal: number;
  purchaseDate: string;
}

interface SupplierLedgerProps {
  supplierId: string;
  onBack?: () => void;
  embedded?: boolean;
  hideToolbarActions?: boolean;
  onLedgerChange?: () => void;
  requestOpenPayment?: number;
  /** When embedded in supplier profile, reuse parent fetch to avoid duplicate sync API calls. */
  sharedLedgerData?: {
    supplier?: SupplierDetails;
    entries?: LedgerEntry[];
    productSummary?: ProductSummary[];
    purchaseDetails?: PurchaseDetail[];
    summary?: Record<string, unknown>;
  } | null;
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Replace em/en dashes in API copy with simpler punctuation for display */
function cleanDisplayText(text: string) {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ": ").trim();
}

function entryTypeLabel(type: string) {
  if (type === "CREDIT_PURCHASE") return "Credit Purchase";
  if (type === "CASH_PURCHASE") return "Cash Purchase";
  if (type === "PAYMENT_MADE") return "Payment";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "REFUND") return "Refund";
  return type.replace(/_/g, " ");
}

/** Positive outstanding = we owe the supplier; negative = advance paid to supplier */
function getNetBalancePresentation(balance: number) {
  if (balance > 0.009) {
    return {
      label: "Amount Payable",
      amount: balance,
      className: "text-amber-700",
      cardClass: "bg-amber-50 border-amber-200",
      labelClass: "text-amber-600",
      hint: "Outstanding amount payable to this supplier",
      variant: "due" as const,
    };
  }
  if (balance < -0.009) {
    return {
      label: "Advance Paid",
      amount: Math.abs(balance),
      className: "text-emerald-700",
      cardClass: "bg-emerald-50 border-emerald-200",
      labelClass: "text-emerald-600",
      hint: "Extra amount paid to supplier beyond current purchases",
      variant: "credit" as const,
    };
  }
  return {
    label: "Account Balance",
    amount: 0,
    className: "text-slate-600",
    cardClass: "bg-slate-50 border-slate-200",
    labelClass: "text-slate-500",
    hint: "No outstanding balance on this account",
    variant: "settled" as const,
  };
}

function formatRunningBalance(running: number) {
  const net = getNetBalancePresentation(running);
  return {
    text: net.variant === "settled" ? "0" : money(net.amount),
    className: net.className,
    hint: net.hint,
  };
}

/** Signed running balance for ledger math (Before + Change = After). Never strips the sign. */
function formatSignedBalance(running: number) {
  if (Math.abs(running) <= 0.009) {
    return { text: "0", className: "text-slate-600", hint: "No payable balance" };
  }
  const presentation = getNetBalancePresentation(running);
  if (running < -0.009) {
    return {
      text: `−${money(Math.abs(running))}`,
      className: presentation.className,
      hint: "Advance paid to supplier",
    };
  }
  return {
    text: money(running),
    className: presentation.className,
    hint: "Amount payable to supplier",
  };
}

function formatSignedChange(signedChange: number) {
  if (Math.abs(signedChange) <= 0.009) return "—";
  const prefix = signedChange > 0 ? "+" : "−";
  return `${prefix}${money(Math.abs(signedChange))}`;
}

type EnrichedLedgerEntry = LedgerEntry & {
  balanceBefore: number;
  signedChange: number;
  changeAmount: number;
  changeDirection: "increase" | "decrease" | "none";
  humanType: string;
  humanChangeLabel: string;
  humanExplanation: string;
  statusLabel: string;
  statusClass: string;
  changeClass: string;
  borderClass: string;
  badgeClass: string;
  relatedRef: string | null;
  relatedEntries: LedgerEntry[];
};

function extractPurchaseRef(entry: LedgerEntry): string | null {
  if (entry.reference_no?.trim()) return entry.reference_no.trim();
  if (entry.purchaseId?.trim()) return entry.purchaseId.trim();
  const match = entry.description.match(/PUR-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function enrichLedgerEntry(entry: LedgerEntry, allEntries: LedgerEntry[]): EnrichedLedgerEntry {
  const signedChange = Number((entry.debit - entry.credit).toFixed(2));
  const balanceBefore = Number((entry.balance - signedChange).toFixed(2));
  const changeAmount = Math.abs(signedChange);
  const changeDirection =
    signedChange > 0.009 ? "increase" : signedChange < -0.009 ? "decrease" : "none";

  const relatedRef = extractPurchaseRef(entry);
  const relatedEntries = relatedRef
    ? allEntries.filter((e) => e.id !== entry.id && extractPurchaseRef(e) === relatedRef)
    : [];

  const desc = cleanDisplayText(entry.description).toLowerCase();
  const isOpening = desc.includes("opening balance");
  const isDeletedAudit = desc.includes("deleted");
  const isPurchaseEdit =
    desc.includes("purchase edit") || desc.includes("credit removed") || desc.includes("credit assigned");

  let humanType = entryTypeLabel(entry.type);
  let humanExplanation = "This entry updated the supplier account balance.";
  let statusLabel = "Recorded";
  let statusClass = "text-slate-500";
  let changeClass = "text-slate-700";
  let borderClass = "border-l-slate-200";

  if (entry.type === "CREDIT_PURCHASE") {
    humanType = "Credit Purchase";
    humanExplanation =
      "Purchase on credit from supplier. This amount was added to what you owe them.";
    changeClass = "text-rose-700";
    borderClass = "border-l-rose-400";
    const invoiceDue = entry.invoiceDue ?? 0;
    const invoicePaid = entry.invoicePaid ?? 0;
    if (invoiceDue <= 0.009) {
      statusLabel = "Paid";
      statusClass = "text-emerald-600";
    } else if (invoicePaid > 0.009) {
      statusLabel = "Partially Paid";
      statusClass = "text-amber-600";
    } else {
      statusLabel = "Unpaid";
      statusClass = "text-rose-600";
    }
  } else if (entry.type === "CASH_PURCHASE") {
    const paidVia =
      entry.payment_method === "CARD"
        ? "Card"
        : entry.payment_method === "CASH"
          ? "Cash"
          : "Paid";
    humanType = `${paidVia} Purchase`;
    humanExplanation =
      "Paid in full at the time of purchase. This does not change the supplier payable balance.";
    statusLabel = "Paid";
    statusClass = "text-emerald-600";
    changeClass = "text-slate-600";
    borderClass = "border-l-slate-300";
  } else if (entry.type === "PAYMENT_MADE") {
    humanType = "Payment Made";
    const createdAdvance = entry.balance < -0.009;
    humanExplanation = createdAdvance
      ? "Payment made before any payable existed. This created advance credit with the supplier."
      : "Payment made to supplier. It reduced the outstanding payable balance.";
    statusLabel = createdAdvance ? "Advance" : "Paid";
    statusClass = createdAdvance ? "text-sky-600" : "text-emerald-600";
    changeClass = "text-emerald-700";
    borderClass = "border-l-emerald-400";
  } else if (entry.type === "REFUND") {
    humanType = "Refund";
    humanExplanation = "Supplier credit or refund. It reduced what you owe the supplier.";
    statusLabel = "Refunded";
    statusClass = "text-emerald-600";
    changeClass = "text-emerald-700";
    borderClass = "border-l-emerald-400";
  } else if (entry.type === "ADJUSTMENT") {
    if (isOpening) {
      humanType = "Opening Balance";
      humanExplanation = "Existing amount owed to supplier before this POS system was used.";
      changeClass = "text-rose-700";
      borderClass = "border-l-slate-400";
    } else if (isDeletedAudit) {
      humanType = "Audit Note";
      humanExplanation = "Record of a deleted or reversed entry. Balance was already recalculated.";
      statusLabel = "Audit";
      statusClass = "text-slate-500";
      borderClass = "border-l-slate-300";
    } else if (isPurchaseEdit && relatedRef) {
      humanType = "Purchase Adjustment";
      humanExplanation = `Linked to ${relatedRef} from a purchase edit or supplier change.`;
      statusLabel = "Linked";
      statusClass = "text-blue-600";
      changeClass = changeDirection === "decrease" ? "text-emerald-700" : "text-rose-700";
      borderClass = changeDirection === "decrease" ? "border-l-emerald-400" : "border-l-blue-400";
    } else {
      humanType = "Adjustment";
      humanExplanation =
        changeDirection === "increase"
          ? "Manual correction that increased what you owe the supplier."
          : changeDirection === "decrease"
            ? "Manual correction that reduced what you owe the supplier."
            : "Manual balance correction on this account.";
      statusLabel = "Adjusted";
      statusClass = "text-blue-600";
      changeClass = changeDirection === "decrease" ? "text-emerald-700" : "text-rose-700";
      borderClass = changeDirection === "decrease" ? "border-l-emerald-400" : "border-l-rose-400";
    }
  }

  if (changeDirection === "decrease" && entry.type !== "PAYMENT_MADE" && entry.type !== "REFUND") {
    if (!isPurchaseEdit || !relatedRef) {
      changeClass = "text-emerald-700";
    }
  } else if (changeDirection === "increase" && entry.type === "ADJUSTMENT" && !isOpening && !isDeletedAudit && !(isPurchaseEdit && relatedRef)) {
    changeClass = "text-rose-700";
  }

  const humanChangeLabel = formatSignedChange(signedChange);

  return {
    ...entry,
    balanceBefore,
    signedChange,
    changeAmount,
    changeDirection,
    humanType,
    humanChangeLabel,
    humanExplanation,
    statusLabel,
    statusClass,
    changeClass,
    borderClass,
    badgeClass: "",
    relatedRef,
    relatedEntries,
  };
}

function BalanceFlow({
  before,
  signedChange,
  after,
}: {
  before: number;
  signedChange: number;
  after: number;
}) {
  const changeDirection =
    signedChange > 0.009 ? "increase" : signedChange < -0.009 ? "decrease" : "none";

  return (
    <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Before</p>
        <p className="font-medium text-slate-800">{formatSignedBalance(before).text}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Change</p>
        <p
          className={cn(
            "font-semibold",
            changeDirection === "increase"
              ? "text-rose-700"
              : changeDirection === "decrease"
                ? "text-emerald-700"
                : "text-slate-700",
          )}
        >
          {formatSignedChange(signedChange)}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">After</p>
        <p className={cn("font-semibold tabular-nums", formatSignedBalance(after).className)}>
          {formatSignedBalance(after).text}
        </p>
      </div>
    </div>
  );
}

export function SupplierLedger({
  supplierId,
  onBack,
  embedded = false,
  hideToolbarActions = false,
  onLedgerChange,
  requestOpenPayment = 0,
  sharedLedgerData = null,
}: SupplierLedgerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [supplier, setSupplier] = useState<SupplierDetails | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [summary, setSummary] = useState({
    totalDebits: 0,
    totalCredits: 0,
    totalPaid: 0,
    totalPurchases: 0,
    balance: 0,
    balanceDue: 0,
    advanceBalance: 0,
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentPurchaseKey, setPaymentPurchaseKey] = useState<string>("");
  const [productSummary, setProductSummary] = useState<ProductSummary[]>([]);
  const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetail[]>([]);
  const [purchaseHistoryTotal, setPurchaseHistoryTotal] = useState(0);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editReferenceNo, setEditReferenceNo] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editDirection, setEditDirection] = useState<"debit" | "credit">("debit");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [viewEntry, setViewEntry] = useState<EnrichedLedgerEntry | null>(null);

  const applyLedgerResponse = useCallback((payload: NonNullable<SupplierLedgerProps["sharedLedgerData"]>) => {
    if (payload.supplier) setSupplier(payload.supplier);
    setEntries(payload.entries || []);
    setProductSummary(payload.productSummary || []);
    setPurchaseDetails(payload.purchaseDetails || []);
    setPurchaseHistoryTotal(Number(payload.summary?.purchaseHistoryTotal ?? 0));
    const bal = Number(payload.summary?.currentBalance ?? 0);
    setSummary({
      totalDebits: Number(payload.summary?.totalDebits ?? payload.summary?.totalPurchases ?? 0),
      totalCredits: Number(payload.summary?.totalCredits ?? payload.summary?.totalPayments ?? 0),
      totalPaid:
        Number(payload.summary?.totalPaid ?? 0) ||
        Number(payload.summary?.totalPayments ?? 0) + Number(payload.summary?.totalCashPaid ?? 0),
      totalPurchases: Number(payload.summary?.totalPurchases ?? payload.summary?.purchaseHistoryTotal ?? 0),
      balance: bal,
      balanceDue: Number(payload.summary?.balanceDue ?? Math.max(0, bal)),
      advanceBalance: Number(payload.summary?.advanceBalance ?? Math.max(0, -bal)),
    });
  }, []);

  const fetchLedgerData = useCallback(async (options?: { silent?: boolean }): Promise<boolean> => {
    const silent = options?.silent ?? false;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [supplierRes, ledgerRes] = await Promise.all([
        apiClient.get(`${API_BASE}/suppliers/${supplierId}`, {
          headers: { "X-Skip-Offline-Cache": "true" },
        }),
        apiClient.get(`${API_BASE}/supplier-ledger/${supplierId}`, {
          params: {
            limit: 200,
            ...(dateFrom ? { startDate: format(dateFrom, "yyyy-MM-dd") } : {}),
            ...(dateTo ? { endDate: format(dateTo, "yyyy-MM-dd") } : {}),
          },
          headers: { "X-Skip-Offline-Cache": "true" },
        }),
      ]);

      setSupplier(supplierRes.data.data);

      const data = ledgerRes.data.data;
      applyLedgerResponse({
        supplier: supplierRes.data.data,
        entries: data.entries,
        productSummary: data.productSummary,
        purchaseDetails: data.purchaseDetails,
        summary: data.summary,
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load ledger",
        variant: "destructive",
      });
      return false;
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [supplierId, dateFrom, dateTo, toast, applyLedgerResponse]);

  useEffect(() => {
    const canReuseParentData =
      embedded && sharedLedgerData && !dateFrom && !dateTo;

    if (canReuseParentData) {
      applyLedgerResponse(sharedLedgerData);
      setLoading(false);
      return;
    }

    fetchLedgerData();
  }, [embedded, sharedLedgerData, dateFrom, dateTo, fetchLedgerData, applyLedgerResponse]);

  const ledgerTotals = useMemo(() => {
    let purchaseVolume = 0;
    let paidVolume = 0;
    for (const e of entries) {
      const amt = Number(e.amount ?? 0);
      if (e.type === "CREDIT_PURCHASE" || e.type === "CASH_PURCHASE") {
        purchaseVolume += amt;
      }
      if (e.type === "CASH_PURCHASE" || e.type === "PAYMENT_MADE") {
        paidVolume += amt;
      } else if (e.type === "CREDIT_PURCHASE") {
        paidVolume += Number(e.invoicePaid ?? 0);
      }
    }
    return { purchaseVolume, paidVolume };
  }, [entries]);

  const filteredEntries = entries
    .filter((e) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.reference_no || "").toLowerCase().includes(q) ||
        (e.type || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortOrder === "desc" ? db - da : da - db;
    });

  const enrichedEntries = useMemo(
    () => filteredEntries.map((e) => enrichLedgerEntry(e, entries)),
    [filteredEntries, entries],
  );

  type PaymentTarget = {
    key: string;
    purchaseId: string | null;
    referenceNo: string | null;
    label: string;
    detail: string;
    suggestedAmount: number;
    kind: "invoice" | "account";
  };

  const paymentTargets = useMemo(() => {
    const seen = new Set<string>();
    const targets: PaymentTarget[] = [];

    for (const e of entries) {
      const ref = e.purchaseId || e.reference_no;
      if (!ref || seen.has(ref)) continue;
      const due = e.invoiceDue ?? 0;
      if (due <= 0.009) continue;
      seen.add(ref);
      targets.push({
        key: ref,
        purchaseId: e.purchaseId ?? ref,
        referenceNo: e.reference_no ?? ref,
        label: e.reference_no ?? ref,
        detail: cleanDisplayText(entryTypeLabel(e.type)),
        suggestedAmount: due,
        kind: "invoice",
      });
    }

    if (summary.balanceDue > 0.009) {
      targets.push({
        key: "__account__",
        purchaseId: null,
        referenceNo: null,
        label: "Whole account balance",
        detail: "Applies to total amount payable on this supplier account",
        suggestedAmount: summary.balanceDue,
        kind: "account",
      });
    }

    targets.push({
      key: "__general__",
      purchaseId: null,
      referenceNo: null,
      label: "General payment",
      detail: "Payment not linked to a specific invoice",
      suggestedAmount: summary.balanceDue > 0.009 ? summary.balanceDue : 0,
      kind: "account",
    });

    return targets;
  }, [entries, summary.balanceDue]);

  const resolvePaymentTarget = useCallback(
    (targetKey: string) => {
      if (!targetKey || targetKey === "__account__" || targetKey === "__general__") {
        return { purchaseId: null as string | null, referenceNo: null as string | null };
      }
      const t = paymentTargets.find(
        (i) => i.key === targetKey || i.purchaseId === targetKey || i.referenceNo === targetKey
      );
      return {
        purchaseId: t?.purchaseId || t?.referenceNo || targetKey,
        referenceNo: t?.referenceNo ?? null,
      };
    },
    [paymentTargets]
  );

  const applyPaymentTarget = useCallback((targetKey: string) => {
    setPaymentPurchaseKey(targetKey);
    const t = paymentTargets.find((x) => x.key === targetKey);
    if (!t) return;
    if (t.kind === "account") {
      setPaymentDescription(
        t.key === "__general__" ? "General payment to supplier" : "Payment toward account balance",
      );
      setPaymentAmount(t.suggestedAmount > 0 ? String(t.suggestedAmount) : "");
      return;
    }
    setPaymentDescription(`Payment for ${t.referenceNo ?? t.label}`);
    setPaymentAmount(String(t.suggestedAmount));
  }, [paymentTargets]);

  const resetPaymentModal = useCallback(() => {
    setSelectedEntry(null);
    setPaymentAmount("");
    setPaymentDescription("");
    setPaymentPurchaseKey("");
  }, []);

  const openPaymentModal = useCallback(
    (entry?: LedgerEntry | null) => {
      setSelectedEntry(entry ?? null);

      if (entry) {
        const ref = entry.purchaseId || entry.reference_no || "";
        const match = paymentTargets.find(
          (t) => t.key === ref || t.purchaseId === ref || t.referenceNo === ref
        );
        if (match) {
          applyPaymentTarget(match.key);
        } else if (summary.balanceDue > 0) {
          applyPaymentTarget("__account__");
        } else {
          setPaymentPurchaseKey(ref);
          setPaymentAmount(String(entry.invoiceDue ?? entry.debit ?? ""));
          setPaymentDescription(
            entry.reference_no ? `Payment for ${entry.reference_no}` : "Payment made to supplier"
          );
        }
      } else {
        const general = paymentTargets.find((t) => t.key === "__general__");
        if (general) {
          applyPaymentTarget(general.key);
        } else if (paymentTargets.length === 1) {
          applyPaymentTarget(paymentTargets[0].key);
        } else {
          setPaymentPurchaseKey("");
          setPaymentAmount("");
          setPaymentDescription("General payment to supplier");
        }
      }

      setIsPaymentModalOpen(true);
    },
    [paymentTargets, summary.balanceDue, applyPaymentTarget]
  );

  useEffect(() => {
    if (requestOpenPayment > 0 && !loading && supplier) {
      openPaymentModal(null);
    }
  }, [requestOpenPayment, loading, supplier, openPaymentModal]);

  const formatDate = (d: string) => {
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "N/A" : format(dt, "dd MMM yyyy");
    } catch {
      return "N/A";
    }
  };

  const formatTime = (d: string) => {
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "" : format(dt, "hh:mm a");
    } catch {
      return "";
    }
  };

  const getExportParams = useCallback((): SupplierLedgerExportParams | null => {
    if (!supplier) return null;
    return buildSupplierLedgerExportParams({
      supplier: {
        name: supplier.name,
        code: supplier.code,
        phone_number: supplier.phone_number,
        mobile_number: supplier.mobile_number,
        email: supplier.email,
      },
      summary: {
        totalPurchases: summary.totalPurchases || ledgerTotals.purchaseVolume,
        totalPaid: summary.totalPaid || ledgerTotals.paidVolume,
        balanceDue: summary.balanceDue,
        advanceBalance: summary.advanceBalance,
        balance: summary.balance,
      },
      enrichedEntries: enrichedEntries.map((entry) => ({
        date: entry.date,
        humanType: entry.humanType,
        description: cleanDisplayText(entry.description),
        reference_no: entry.reference_no,
        relatedRef: entry.relatedRef,
        balanceBefore: entry.balanceBefore,
        signedChange: entry.signedChange,
        balance: entry.balance,
      })),
      dateFrom,
      dateTo,
    });
  }, [supplier, summary, ledgerTotals, enrichedEntries, dateFrom, dateTo]);

  const handleDownloadPDF = async () => {
    const params = getExportParams();
    if (!params || !supplier) return;
    await downloadSupplierLedgerPdf(
      params,
      `${supplier.name.replace(/[^\w\s-]/g, "").trim()}_Statement_${format(new Date(), "yyyyMMdd")}.pdf`,
    );
  };

  const handlePrint = async () => {
    const params = getExportParams();
    if (!params) return;
    await printSupplierLedgerPdf(params);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const targetKey =
      paymentPurchaseKey ||
      selectedEntry?.purchaseId ||
      selectedEntry?.reference_no ||
      "";

    const invoiceTargets = paymentTargets.filter((t) => t.kind === "invoice");
    if (invoiceTargets.length > 0 && !targetKey) {
      toast({
        title: "Select payment for",
        description: "Choose which invoice this payment applies to",
        variant: "destructive",
      });
      return;
    }

    const { purchaseId } = resolvePaymentTarget(targetKey);

    setIsSubmittingPayment(true);
    try {
      const operationId = crypto.randomUUID();
      await apiClient.post(`${API_BASE}/supplier-ledger/${supplierId}/payment`, {
        amount: Number(paymentAmount),
        description: paymentDescription,
        purchaseId,
      }, {
        headers: { "X-Operation-Id": operationId },
      });

      const synced = await fetchLedgerData({ silent: true });
      if (!synced) return;

      notifyDashboardStatsChanged();
      onLedgerChange?.();

      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      setIsPaymentModalOpen(false);
      resetPaymentModal();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const openEditModal = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setEditAmount(String(entry.amount ?? entry.debit ?? entry.credit ?? ""));
    setEditDescription(entry.description);
    setEditReferenceNo(entry.reference_no ?? "");
    setEditDate(new Date(entry.date));
    setEditDirection(entry.debit > 0.009 ? "debit" : "credit");
    setIsEditModalOpen(true);
  };

  const resetEditModal = () => {
    setEditingEntry(null);
    setEditAmount("");
    setEditDescription("");
    setEditReferenceNo("");
    setEditDate(undefined);
    setEditDirection("debit");
  };

  const handleEditSubmit = async () => {
    if (!editingEntry) return;
    if (!editAmount || isNaN(Number(editAmount)) || Number(editAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await apiClient.patch(
        `${API_BASE}/supplier-ledger/${supplierId}/entries/${editingEntry.id}`,
        {
          amount: Number(editAmount),
          description: editDescription,
          referenceNo: editReferenceNo,
          date: editDate ? format(editDate, "yyyy-MM-dd") : undefined,
          ...(editingEntry.type === "ADJUSTMENT" ? { direction: editDirection } : {}),
        },
        { headers: { "X-Skip-Offline-Cache": "true" } },
      );

      const synced = await fetchLedgerData({ silent: true });
      if (!synced) return;

      toast({
        title: "Updated",
        description: "Ledger entry updated successfully",
      });
      setIsEditModalOpen(false);
      resetEditModal();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update entry",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setIsDeletingEntry(true);
    try {
      await apiClient.delete(
        `${API_BASE}/supplier-ledger/${supplierId}/entries/${deleteTarget.id}`,
        {
          data: { reason: deleteReason.trim() || undefined },
          headers: { "X-Skip-Offline-Cache": "true" },
        },
      );

      const synced = await fetchLedgerData({ silent: true });
      if (!synced) return;

      toast({
        title: "Deleted",
        description: "Entry removed. A reversal record was added for audit.",
      });
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete entry",
        variant: "destructive",
      });
    } finally {
      setIsDeletingEntry(false);
    }
  };

  if (loading) {
    return embedded ? (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    ) : (
      <PageLoader message="Loading ledger..." />
    );
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">Supplier not found</p>
        {onBack && (
          <Button variant="outline" onClick={onBack}>Go Back</Button>
        )}
      </div>
    );
  }

  const netBalance = getNetBalancePresentation(summary.balance);
  const selectedTarget = paymentTargets.find((t) => t.key === paymentPurchaseKey);
  const isLedgerBusy =
    isRefreshing || isSubmittingPayment || isSubmittingEdit || isDeletingEntry;

  return (
    <div
      className={cn(
        embedded
          ? "bg-white rounded-xl border border-slate-200 overflow-hidden"
          : "flex flex-col min-h-0 flex-1 bg-slate-100 h-full",
      )}
    >
      {!embedded && (
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
            <Button
              size="sm"
              onClick={onBack}
              className="h-9 shrink-0 gap-1.5 bg-sky-600 font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{supplier.name}</h1>
              {supplier.phone_number && (
                <p className="text-xs text-slate-500 truncate">{supplier.phone_number}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLedgerData({ silent: true })}
              disabled={isRefreshing}
              className="h-9"
            >
              <RefreshCw className={`h-4 w-4 sm:mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="h-9 hidden md:inline-flex">
              <Download className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 hidden md:inline-flex">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Button
              size="sm"
              className="h-9 bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => openPaymentModal(null)}
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Make Payment</span>
              <span className="sm:hidden">Pay</span>
            </Button>
          </div>
        </div>
      </div>
      )}

      <div className={cn("overflow-x-hidden", embedded ? "" : "flex-1 overflow-y-auto p-4 lg:p-6")}>
        <div className={cn("mx-auto w-full relative", embedded ? "" : "space-y-5 max-w-[1400px]")}>
        {isLedgerBusy && (
          <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-slate-100/75 pt-24 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Syncing ledger...</span>
            </div>
          </div>
        )}

        {!embedded && (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${isLedgerBusy ? "opacity-50" : ""}`}>
          <div className="bg-white rounded-lg border border-rose-100 border-l-4 border-l-rose-500 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Purchases</p>
            <p className="text-xl font-semibold text-rose-700 mt-1 tabular-nums">{money(summary.totalDebits)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Credit purchases &amp; charges</p>
          </div>
          <div className="bg-white rounded-lg border border-emerald-100 border-l-4 border-l-emerald-500 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Paid to Supplier</p>
            <p className="text-xl font-semibold text-emerald-700 mt-1 tabular-nums">
              {money(summary.totalPaid || ledgerTotals.paidVolume)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Cash purchases &amp; payments made</p>
          </div>
          <div className={cn("rounded-lg border p-4 border-l-4", netBalance.cardClass, netBalance.variant === "due" ? "border-l-amber-500" : netBalance.variant === "credit" ? "border-l-emerald-500" : "border-l-slate-400")}>
            <p className={cn("text-[11px] font-medium uppercase tracking-wide", netBalance.labelClass)}>{netBalance.label}</p>
            <p className={cn("text-xl font-semibold mt-1 tabular-nums", netBalance.className)}>
              {netBalance.variant === "settled" ? "0" : money(netBalance.amount)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 border-l-4 border-l-slate-400 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Purchase History</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
              {money(purchaseHistoryTotal)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">{productSummary.length} products</p>
          </div>
        </div>
        )}

        {!embedded && (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-600 transition-opacity ${isLedgerBusy ? "opacity-50" : ""}`}>
          <span className="font-medium text-slate-700">Legend:</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5 align-middle" />Purchases / payable</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 align-middle" />Paid / reduced</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5 align-middle" />Amount payable</span>
        </div>
        )}

        <div
          className={cn(
            "transition-opacity",
            embedded ? "" : "bg-white rounded-lg border border-slate-200",
            isLedgerBusy ? "opacity-50" : "",
          )}
        >
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Supplier Transaction History</h2>
                <span className="text-xs text-slate-500">{entries.length} transactions</span>
              </div>
              {embedded && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchLedgerData({ silent: true })}
                    disabled={isRefreshing}
                    className="h-9"
                    title="Refresh ledger"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {!hideToolbarActions && (
                      <span className="hidden sm:inline sm:ml-1.5">Refresh</span>
                    )}
                  </Button>
                  {!hideToolbarActions && (
                    <Button
                      size="sm"
                      className="h-9 bg-emerald-700 hover:bg-emerald-800 text-white"
                      onClick={() => openPaymentModal(null)}
                    >
                      <Plus className="h-4 w-4 sm:mr-1.5" />
                      Add Payment
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-white"
                />
              </div>
              <DatePicker date={dateFrom} onDateChange={setDateFrom} placeholder="From" />
              <DatePicker date={dateTo} onDateChange={setDateTo} placeholder="To" />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full justify-center text-slate-600 bg-white"
                onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
              >
                {sortOrder === "desc" ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
                {sortOrder === "desc" ? "Newest" : "Oldest"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-[108px]" />
                <col className="w-[130px]" />
                <col />
                <col className="w-[150px]" />
                <col className="w-[104px]" />
                <col className="w-[104px]" />
                <col className="w-[104px]" />
                <col className="w-[148px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Type</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reference</th>
                  <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Before</th>
                  <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Change</th>
                  <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">After</th>
                  <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrichedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400">
                      <Receipt className="h-8 w-8 opacity-20 mx-auto mb-2" />
                      <p className="text-sm">No transactions found</p>
                    </td>
                  </tr>
                ) : (
                  enrichedEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={cn(
                        "border-b border-slate-100 hover:bg-slate-50/80 border-l-[3px]",
                        entry.borderClass,
                      )}
                    >
                      <td className="px-3 py-3 align-middle">
                        <p className="text-xs font-medium text-slate-800 leading-tight whitespace-nowrap">
                          {formatDate(entry.date)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-tight whitespace-nowrap">
                          {formatTime(entry.date)}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-800">{entry.humanType}</p>
                        <p className={cn("text-[11px] mt-0.5 whitespace-nowrap", entry.statusClass)}>
                          {entry.statusLabel}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <p className="text-sm text-slate-800 leading-snug truncate" title={cleanDisplayText(entry.description)}>
                          {cleanDisplayText(entry.description)}
                        </p>
                        {entry.relatedEntries.length > 0 && (
                          <p className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">
                            {entry.relatedEntries.length} related
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap">
                        <span className="text-[11px] font-mono text-slate-600">
                          {entry.relatedRef || entry.reference_no || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums text-slate-700 whitespace-nowrap">
                        <span title={formatSignedBalance(entry.balanceBefore).hint}>
                          {formatSignedBalance(entry.balanceBefore).text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
                        <span className={entry.changeClass}>{entry.humanChangeLabel}</span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
                        <span
                          className={formatSignedBalance(entry.balance).className}
                          title={formatSignedBalance(entry.balance).hint}
                        >
                          {formatSignedBalance(entry.balance).text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                            onClick={() => setViewEntry(entry)}
                            disabled={isLedgerBusy}
                          >
                            View
                          </Button>
                          {entry.isPayable && (entry.invoiceDue ?? 0) > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              onClick={() => openPaymentModal(entry)}
                              disabled={isLedgerBusy}
                            >
                              Pay
                            </Button>
                          )}
                          {(entry.isEditable ??
                            (entry.type !== "CREDIT_PURCHASE" &&
                              entry.type !== "CASH_PURCHASE" &&
                              entry.type !== "REFUND")) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800"
                              title="Edit"
                              onClick={() => openEditModal(entry)}
                              disabled={isLedgerBusy}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(entry.isDeletable ??
                            (entry.type !== "CREDIT_PURCHASE" &&
                              entry.type !== "CASH_PURCHASE" &&
                              entry.type !== "REFUND")) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800"
                              title="Delete"
                              onClick={() => setDeleteTarget(entry)}
                              disabled={isLedgerBusy}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {enrichedEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-100/80">
                    <td colSpan={4} className="px-3 py-4 text-sm font-bold uppercase tracking-wide text-slate-700">
                      Totals
                    </td>
                    <td className="px-3 py-4 text-right text-sm text-slate-500 tabular-nums">—</td>
                    <td className="px-3 py-4 text-right text-sm font-bold tabular-nums whitespace-nowrap">
                      {ledgerTotals.purchaseVolume > 0.009 ? (
                        <span className="text-slate-800">{money(ledgerTotals.purchaseVolume)}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-4 text-right text-base font-bold tabular-nums whitespace-nowrap", netBalance.className)}>
                      {netBalance.variant === "settled" ? "0" : money(netBalance.amount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {(!embedded && productSummary.length > 0) && (
          <div className={`bg-white rounded-lg border border-slate-200 transition-opacity ${isLedgerBusy ? "opacity-50" : ""}`}>
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Products Purchased</h2>
                <span className="text-xs text-slate-500">{productSummary.length} products</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">SKU</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last Rate</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Amount</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {productSummary.map((p) => (
                    <tr key={p.productId} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.productName}</td>
                      <td className="px-4 py-3 text-slate-600">{p.sku || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(p.totalQuantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(p.lastRate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(p.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{p.purchaseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(!embedded && purchaseDetails.length > 0) && (
          <div className={`bg-white rounded-lg border border-slate-200 transition-opacity ${isLedgerBusy ? "opacity-50" : ""}`}>
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Purchase Details</h2>
                <span className="text-xs text-slate-500">{purchaseDetails.length} line items</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reference</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rate</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseDetails.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.purchaseDate)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.productName}</p>
                        {p.sku && <p className="text-xs text-slate-500">{p.sku}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {p.invoiceRef || p.purchaseNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(p.quantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(p.costPrice)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(p.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>

      <Dialog open={!!viewEntry} onOpenChange={(open) => !open && setViewEntry(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {viewEntry && (
            <>
              <DialogHeader>
                <DialogTitle>Transaction Details</DialogTitle>
                <DialogDescription>
                  {viewEntry.humanType} · {viewEntry.statusLabel} · {formatDate(viewEntry.date)} at{" "}
                  {formatTime(viewEntry.date)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="border border-slate-200 p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {cleanDisplayText(viewEntry.description)}
                  </p>
                  <p className="text-xs text-slate-500">{viewEntry.humanExplanation}</p>
                </div>

                <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200 text-sm">
                  <div className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Reference</p>
                    <p className="font-mono text-xs mt-1 text-slate-800">
                      {viewEntry.relatedRef || viewEntry.reference_no || "—"}
                    </p>
                  </div>
                  <div className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="font-semibold mt-1 tabular-nums text-slate-900">
                      {money(viewEntry.amount ?? viewEntry.changeAmount)}
                    </p>
                  </div>
                  <div className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Balance Before</p>
                    <p className="font-semibold mt-1 tabular-nums text-slate-900">
                      {formatSignedBalance(viewEntry.balanceBefore).text}
                    </p>
                  </div>
                  <div className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Balance After</p>
                    <p className={cn("font-semibold mt-1 tabular-nums", formatSignedBalance(viewEntry.balance).className)}>
                      {formatSignedBalance(viewEntry.balance).text}
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-3">Balance impact</p>
                  <BalanceFlow
                    before={viewEntry.balanceBefore}
                    signedChange={viewEntry.signedChange}
                    after={viewEntry.balance}
                  />
                </div>

                {(viewEntry.type === "CREDIT_PURCHASE" || viewEntry.type === "CASH_PURCHASE") &&
                  (viewEntry.invoiceTotal ?? 0) > 0 && (
                  <div className="border border-slate-200 p-3 text-xs space-y-1 text-slate-700">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">Invoice</p>
                    <p>Total: {money(viewEntry.invoiceTotal ?? 0)}</p>
                    <p>Paid: {money(viewEntry.invoicePaid ?? 0)}</p>
                    <p className="font-semibold text-slate-900">
                      Due: {money(viewEntry.invoiceDue ?? 0)}
                    </p>
                  </div>
                )}

                {viewEntry.relatedEntries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                      Related — {viewEntry.relatedRef}
                    </p>
                    <div className="border border-slate-200 divide-y divide-slate-100">
                      {viewEntry.relatedEntries.map((rel) => {
                        const relEnriched = enrichLedgerEntry(rel, entries);
                        return (
                          <button
                            key={rel.id}
                            type="button"
                            className="w-full px-3 py-2.5 text-left text-xs hover:bg-slate-50 transition-colors"
                            onClick={() => setViewEntry(relEnriched)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-800 truncate">
                                {cleanDisplayText(rel.description)}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                                {relEnriched.humanChangeLabel}
                              </span>
                            </div>
                            <p className="text-slate-500 mt-0.5">
                              {relEnriched.humanType} · {formatDate(rel.date)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {viewEntry.editRestrictedReason && (
                  <p className="text-xs text-slate-600 border border-slate-200 rounded px-3 py-2">
                    {viewEntry.editRestrictedReason}
                  </p>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {viewEntry.isPayable && (viewEntry.invoiceDue ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    className="sm:mr-auto border-slate-300"
                    onClick={() => {
                      setViewEntry(null);
                      openPaymentModal(viewEntry);
                    }}
                  >
                    Pay {money(viewEntry.invoiceDue ?? 0)}
                  </Button>
                )}
                {(viewEntry.isEditable ??
                  (viewEntry.type !== "CREDIT_PURCHASE" &&
                    viewEntry.type !== "CASH_PURCHASE" &&
                    viewEntry.type !== "REFUND")) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setViewEntry(null);
                      openEditModal(viewEntry);
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button variant="outline" onClick={() => setViewEntry(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPaymentModalOpen}
        onOpenChange={(open) => {
          if (!open && isSubmittingPayment) return;
          setIsPaymentModalOpen(open);
          if (!open) resetPaymentModal();
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-x-hidden overflow-y-auto"
          onPointerDownOutside={(e) => isSubmittingPayment && e.preventDefault()}
          onEscapeKeyDown={(e) => isSubmittingPayment && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Make Payment
            </DialogTitle>
            <DialogDescription>
              {netBalance.variant === "due"
                ? `${netBalance.label}: ${money(netBalance.amount)}`
                : netBalance.variant === "credit"
                  ? `${netBalance.label}: ${money(netBalance.amount)}`
                  : "Account is settled."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4 py-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-target">
                Payment applies to <span className="text-destructive">*</span>
              </Label>
              <Select
                value={paymentPurchaseKey || undefined}
                onValueChange={applyPaymentTarget}
              >
                <SelectTrigger id="payment-target" className="h-10 min-w-0 w-full overflow-hidden">
                  <SelectValue placeholder="Select invoice or payment type">
                    {selectedTarget ? (
                      <span className="block truncate text-left">
                        {selectedTarget.label}
                        {selectedTarget.suggestedAmount > 0.009
                          ? ` · ${money(selectedTarget.suggestedAmount)}`
                          : ""}
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                  {paymentTargets.map((t) => (
                    <SelectItem
                      key={t.key}
                      value={t.key}
                      textValue={`${t.label}${t.detail ? ` ${t.detail}` : ""}`}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
                        <span className="truncate font-medium">{t.label}</span>
                        {t.detail ? (
                          <span className="truncate text-xs text-muted-foreground">{t.detail}</span>
                        ) : null}
                        {t.suggestedAmount > 0.009 && (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            Due: {money(t.suggestedAmount)}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTarget?.detail && (
                <p className="text-xs text-muted-foreground">{selectedTarget.detail}</p>
              )}
              {selectedTarget?.kind === "account" && selectedTarget.key !== "__general__" && (
                <p className="text-xs text-muted-foreground">
                  Applies to total amount due on this account.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                  id="amount"
                  type="number"
                  className="h-10"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              {selectedTarget && selectedTarget.suggestedAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Due on selection: {money(selectedTarget.suggestedAmount)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)} disabled={isSubmittingPayment}>
              Cancel
            </Button>
            <Button
              onClick={handlePaymentSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={
                isSubmittingPayment ||
                !paymentPurchaseKey ||
                !paymentAmount ||
                Number(paymentAmount) <= 0
              }
            >
              {isSubmittingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isRefreshing ? "Syncing ledger..." : "Saving payment..."}
                </>
              ) : (
                "Save Payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (!open && isSubmittingEdit) return;
          setIsEditModalOpen(open);
          if (!open) resetEditModal();
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => isSubmittingEdit && e.preventDefault()}
          onEscapeKeyDown={(e) => isSubmittingEdit && e.preventDefault()}
        >
          {isSubmittingEdit && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/85 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-slate-700">
                {isRefreshing ? "Updating ledger..." : "Saving changes..."}
              </p>
            </div>
          )}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit Transaction
            </DialogTitle>
            <DialogDescription>
              {editingEntry
                ? `${entryTypeLabel(editingEntry.type)} · ${formatDate(editingEntry.date)}`
                : "Update ledger entry details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Date</Label>
              <DatePicker
                date={editDate}
                onDateChange={setEditDate}
                placeholder="Transaction date"
                disabled={isSubmittingEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-amount">Amount</Label>
              <Input
                  id="edit-amount"
                  type="number"
                  className="h-10"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  disabled={isSubmittingEdit}
                />
            </div>
            {editingEntry?.type === "ADJUSTMENT" && (
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={editDirection}
                  onValueChange={(v) => setEditDirection(v as "debit" | "credit")}
                  disabled={isSubmittingEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Amount added (payable increases)</SelectItem>
                    <SelectItem value="credit">Amount paid / reduced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={isSubmittingEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-reference">Reference No.</Label>
              <Input
                id="edit-reference"
                value={editReferenceNo}
                onChange={(e) => setEditReferenceNo(e.target.value)}
                placeholder="Optional"
                disabled={isSubmittingEdit}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isSubmittingEdit}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSubmittingEdit || !editAmount}>
              {isSubmittingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isRefreshing ? "Syncing ledger..." : "Saving changes..."}
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && isDeletingEntry) return;
          if (!open) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          {isDeletingEntry && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/85 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-red-600" />
              <p className="text-sm font-medium text-slate-700">
                {isRefreshing ? "Updating ledger..." : "Deleting entry..."}
              </p>
            </div>
          )}
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will remove the entry and add a reversal adjustment for audit. Supplier
                  balance and purchase allocations will be recalculated.
                </p>
                {deleteTarget && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                    <p className="font-medium">{cleanDisplayText(deleteTarget.description)}</p>
                    <p className="mt-1 text-xs">
                      {entryTypeLabel(deleteTarget.type)} · {formatDate(deleteTarget.date)} ·{" "}
                      {deleteTarget.debit > 0
                        ? `Debit ${money(deleteTarget.debit)}`
                        : deleteTarget.credit > 0
                          ? `Credit ${money(deleteTarget.credit)}`
                          : money(deleteTarget.amount ?? 0)}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="delete-reason">Reason (optional)</Label>
                  <Input
                    id="delete-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. Duplicate entry, wrong amount recorded"
                    disabled={isDeletingEntry}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingEntry}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeletingEntry}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingEntry ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isRefreshing ? "Syncing ledger..." : "Deleting..."}
                </>
              ) : (
                "Delete Entry"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
