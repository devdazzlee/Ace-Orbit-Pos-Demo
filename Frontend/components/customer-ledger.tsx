"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Info,
  DollarSign,
  Plus,
  Loader2,
  Printer,
  Pencil,
  Trash2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/apiClient";
import { notifyDashboardStatsChanged } from "@/lib/dashboard-stats-sync";
import { refreshCustomerListGlobally } from "@/lib/customer-list-sync";
import {
  CUSTOMER_LEDGER_REFRESH_EVENT,
  type CustomerLedgerRefreshDetail,
} from "@/lib/customer-ledger-sync";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { SaleBillDialog } from "@/components/sale-bill-dialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SaleAdjustmentHistoryItem {
  id: string;
  field: string;
  previousAmount: number;
  newAmount: number;
  signedDelta: number;
  reason: string | null;
  createdAt: string;
}

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
  saleId?: string | null;
  paymentStatus?: string | null;
  isCollectable?: boolean;
  isEditable?: boolean;
  isDeletable?: boolean;
  editRestrictedReason?: string | null;
  payment_method: string | null;
  originalLedgerAmount?: number;
  adjustmentHistory?: SaleAdjustmentHistoryItem[];
}

interface CustomerDetails {
  id: string;
  name: string;
  phone_number: string | null;
  mobile_number: string | null;
  email: string;
  outstanding_balance: number;
  credit_limit: number;
}

interface CustomerLedgerProps {
  customerId: string;
  onBack: () => void;
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatSignedMoney = (n: number, direction: "increase" | "decrease" | "none") => {
  if (direction === "none") return "—";
  const prefix = direction === "increase" ? "+" : "−";
  return `${prefix}${money(n)}`;
};

/** Replace em/en dashes in API copy with simpler punctuation for display */
function cleanDisplayText(text: string) {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ": ").trim();
}

function entryTypeLabel(type: string) {
  if (type === "CREDIT_SALE") return "Credit Sale";
  if (type === "CASH_SALE") return "Cash Sale";
  if (type === "PAYMENT_RECEIVED") return "Payment";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "REFUND") return "Refund";
  return type.replace(/_/g, " ");
}

/** Positive outstanding = customer owes you; negative = prepaid credit in customer's favor */
function getNetBalancePresentation(balance: number) {
  if (balance > 0.009) {
    return {
      label: "Amount Due",
      amount: balance,
      className: "text-amber-700",
      cardClass: "bg-amber-50 border-amber-200",
      labelClass: "text-amber-600",
      hint: "Customer owes this amount on the account",
      variant: "due" as const,
    };
  }
  if (balance < -0.009) {
    return {
      label: "Available Credit",
      amount: Math.abs(balance),
      className: "text-emerald-700",
      cardClass: "bg-emerald-50 border-emerald-200",
      labelClass: "text-emerald-600",
      hint: "Customer has prepaid credit. Not an amount they need to pay now.",
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

type EnrichedLedgerEntry = LedgerEntry & {
  balanceBefore: number;
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

function extractSaleRef(entry: LedgerEntry): string | null {
  if (entry.reference_no?.trim()) return entry.reference_no.trim();
  if (entry.saleId?.trim()) return entry.saleId.trim();
  const match = entry.description.match(/SALE-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function isSaleBillEntry(entry: LedgerEntry): boolean {
  return (
    entry.type === "CREDIT_SALE" ||
    entry.type === "CASH_SALE" ||
    entry.type === "REFUND"
  );
}

function getSaleBillRef(entry: LedgerEntry): string | null {
  if (!isSaleBillEntry(entry)) return null;
  return entry.saleId || extractSaleRef(entry);
}

function enrichLedgerEntry(entry: LedgerEntry, allEntries: LedgerEntry[]): EnrichedLedgerEntry {
  const balanceBefore = Number((entry.balance - entry.debit + entry.credit).toFixed(2));
  const changeAmount =
    entry.debit > 0.009 ? entry.debit : entry.credit > 0.009 ? entry.credit : entry.amount ?? 0;
  const changeDirection =
    entry.debit > 0.009 ? "increase" : entry.credit > 0.009 ? "decrease" : "none";

  const relatedRef = extractSaleRef(entry);
  const relatedEntries = relatedRef
    ? allEntries.filter((e) => e.id !== entry.id && extractSaleRef(e) === relatedRef)
    : [];

  const desc = cleanDisplayText(entry.description).toLowerCase();
  const isOpening = desc.includes("opening balance");
  const isDeletedAudit = desc.includes("deleted");
  const hasAdjustmentHistory = (entry.adjustmentHistory?.length ?? 0) > 0;

  let humanType = entryTypeLabel(entry.type);
  let humanExplanation = "This entry updated the customer account balance.";
  let statusLabel = "Recorded";
  let statusClass = "text-slate-500";
  let changeClass = "text-slate-700";
  let borderClass = "border-l-slate-200";

  if (entry.type === "CREDIT_SALE") {
    humanType = "Credit Sale";
    humanExplanation =
      "Customer purchased on credit. This amount was added to what they owe you.";
    changeClass = "text-rose-700";
    borderClass = "border-l-rose-400";
    if (entry.paymentStatus === "PAID") {
      statusLabel = "Paid";
      statusClass = "text-emerald-600";
    } else if (entry.paymentStatus === "PARTIAL") {
      statusLabel = "Partially Paid";
      statusClass = "text-amber-600";
    } else if ((entry.invoiceDue ?? 0) > 0.009) {
      statusLabel = "Unpaid";
      statusClass = "text-rose-600";
    }
  } else if (entry.type === "CASH_SALE") {
    const paidVia =
      entry.payment_method === "CARD"
        ? "Card"
        : entry.payment_method === "CASH"
          ? "Cash"
          : "Paid";
    humanType = `${paidVia} Sale`;
    humanExplanation =
      "Customer paid in full at the time of sale. This does not change their account balance.";
    statusLabel = "Paid";
    statusClass = "text-emerald-600";
    changeClass = "text-slate-600";
    borderClass = "border-l-slate-300";
  } else if (entry.type === "PAYMENT_RECEIVED") {
    humanType = "Payment Received";
    humanExplanation = "Customer paid this amount. It reduced their outstanding balance.";
    statusLabel = "Received";
    statusClass = "text-emerald-600";
    changeClass = "text-emerald-700";
    borderClass = "border-l-emerald-400";
  } else if (entry.type === "REFUND") {
    humanType = "Refund";
    humanExplanation = "Refund or return credit. It reduced what the customer owes.";
    statusLabel = "Refunded";
    statusClass = "text-emerald-600";
    changeClass = "text-emerald-700";
    borderClass = "border-l-emerald-400";
  } else if (entry.type === "ADJUSTMENT") {
    if (isOpening) {
      humanType = "Opening Balance";
      humanExplanation = "Existing amount the customer owed before this POS system was used.";
      changeClass = "text-rose-700";
      borderClass = "border-l-slate-400";
    } else if (isDeletedAudit) {
      humanType = "Audit Note";
      humanExplanation = "Record of a deleted or reversed entry. Balance was already recalculated.";
      statusLabel = "Audit";
      statusClass = "text-slate-500";
      borderClass = "border-l-slate-300";
    } else {
      humanType = "Adjustment";
      humanExplanation =
        changeDirection === "increase"
          ? "Manual correction that increased what the customer owes."
          : changeDirection === "decrease"
            ? "Manual correction that reduced what the customer owes."
            : "Manual balance correction on this account.";
      statusLabel = "Adjusted";
      statusClass = "text-blue-600";
      changeClass = changeDirection === "decrease" ? "text-emerald-700" : "text-rose-700";
      borderClass = changeDirection === "decrease" ? "border-l-emerald-400" : "border-l-rose-400";
    }
  }

  if (changeDirection === "decrease" && entry.type !== "PAYMENT_RECEIVED" && entry.type !== "REFUND") {
    changeClass = "text-emerald-700";
  } else if (changeDirection === "increase" && entry.type === "ADJUSTMENT" && !isOpening && !isDeletedAudit) {
    changeClass = "text-rose-700";
  }

  if (hasAdjustmentHistory && (entry.type === "CREDIT_SALE" || entry.type === "CASH_SALE")) {
    humanExplanation = "Sale amount reflects all edits. Open details to view adjustment history.";
  }

  const humanChangeLabel =
    entry.type === "CASH_SALE"
      ? money(entry.amount ?? changeAmount)
      : formatSignedMoney(changeAmount, changeDirection);

  return {
    ...entry,
    balanceBefore,
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
  change,
  after,
  direction,
}: {
  before: number;
  change: number;
  after: number;
  direction: "increase" | "decrease" | "none";
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Before</p>
        <p className="font-medium text-slate-800">{money(before)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Change</p>
        <p
          className={cn(
            "font-semibold",
            direction === "increase"
              ? "text-rose-700"
              : direction === "decrease"
                ? "text-emerald-700"
                : "text-slate-700",
          )}
        >
          {direction === "increase" ? "+" : direction === "decrease" ? "−" : ""}
          {money(change)}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">After</p>
        <p className={cn("font-semibold tabular-nums", formatRunningBalance(after).className)}>
          {formatRunningBalance(after).text}
        </p>
      </div>
    </div>
  );
}

export function CustomerLedger({ customerId, onBack }: CustomerLedgerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [summary, setSummary] = useState({
    totalDebits: 0,
    totalCredits: 0,
    balance: 0,
    balanceDue: 0,
    advanceBalance: 0,
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentSaleKey, setPaymentSaleKey] = useState<string>("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
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
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [expandedAdjustments, setExpandedAdjustments] = useState<Set<string>>(new Set());
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const [breakdownType, setBreakdownType] = useState<null | "charged" | "paid">(null);
  const [billSaleRef, setBillSaleRef] = useState<string | null>(null);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const fetchInFlightRef = useRef<Promise<boolean> | null>(null);
  const hasLoadedRef = useRef(false);

  const openSaleBill = useCallback((entry: LedgerEntry) => {
    const ref = getSaleBillRef(entry);
    if (!ref) {
      toast({
        title: "Bill unavailable",
        description: "This transaction is not linked to a sale invoice.",
        variant: "destructive",
      });
      return;
    }
    setBillSaleRef(ref);
    setBillDialogOpen(true);
  }, [toast]);

  const fetchLedgerData = useCallback(async (): Promise<boolean> => {
    if (fetchInFlightRef.current) {
      return fetchInFlightRef.current;
    }

    const showInitialLoader = !hasLoadedRef.current;
    if (showInitialLoader) {
      setLoading(true);
    }

    const request = (async () => {
      try {
        const [custRes, ledgerRes] = await Promise.all([
          apiClient.get(`${API_BASE}/customer/${customerId}`, {
            headers: { "X-Skip-Offline-Cache": "true" },
          }),
          apiClient.get(`${API_BASE}/customer-ledger/${customerId}`, {
            params: {
              limit: 200,
              ...(dateFrom ? { startDate: format(dateFrom, "yyyy-MM-dd") } : {}),
              ...(dateTo ? { endDate: format(dateTo, "yyyy-MM-dd") } : {}),
            },
            headers: { "X-Skip-Offline-Cache": "true" },
          }),
        ]);

        setCustomer(custRes.data.data);

        const data = ledgerRes.data.data;
        setEntries(data.entries || []);
        const bal = Number(data.summary?.currentBalance ?? 0);
        setSummary({
          totalDebits: data.summary?.totalDebits ?? data.summary?.totalSales ?? 0,
          totalCredits: data.summary?.totalCredits ?? data.summary?.totalPayments ?? 0,
          balance: bal,
          balanceDue: data.summary?.balanceDue ?? Math.max(0, bal),
          advanceBalance: data.summary?.advanceBalance ?? Math.max(0, -bal),
        });
        hasLoadedRef.current = true;
        return true;
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.response?.data?.message || "Failed to load ledger",
          variant: "destructive",
        });
        return false;
      } finally {
        fetchInFlightRef.current = null;
        if (showInitialLoader) {
          setLoading(false);
        }
      }
    })();

    fetchInFlightRef.current = request;
    return request;
  }, [customerId, dateFrom, dateTo, toast]);

  useEffect(() => {
    void fetchLedgerData();
  }, [fetchLedgerData]);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<CustomerLedgerRefreshDetail>).detail;
      if (detail?.customerId && detail.customerId !== customerId) return;
      void fetchLedgerData();
    };

    window.addEventListener(CUSTOMER_LEDGER_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(CUSTOMER_LEDGER_REFRESH_EVENT, onRefresh);
    };
  }, [customerId, fetchLedgerData]);

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

  // Group each credit sale together with the payments/refunds made against it, so the
  // statement reads one row per invoice (expandable) instead of scattered payment rows.
  // Cash sales, opening balances, manual adjustments and account-level (unlinked) payments
  // stay as their own standalone rows.
  type LedgerRow =
    | { kind: "single"; key: string; entry: EnrichedLedgerEntry }
    | {
        kind: "invoice";
        key: string;
        parent: EnrichedLedgerEntry;
        children: EnrichedLedgerEntry[];
        charged: number;
        paid: number;
        remaining: number;
      };

  const groupedRows = useMemo<LedgerRow[]>(() => {
    const byRef = new Map<string, EnrichedLedgerEntry[]>();
    for (const e of enrichedEntries) {
      if (!e.relatedRef) continue;
      const arr = byRef.get(e.relatedRef);
      if (arr) arr.push(e);
      else byRef.set(e.relatedRef, [e]);
    }

    // Pass 1: pair each credit-sale parent with its sale-linked payments/refunds.
    const childIds = new Set<string>();
    const childrenByParent = new Map<string, EnrichedLedgerEntry[]>();
    for (const entry of enrichedEntries) {
      if (entry.type !== "CREDIT_SALE" || !entry.relatedRef) continue;
      const children = (byRef.get(entry.relatedRef) ?? []).filter(
        (e) =>
          e.id !== entry.id &&
          !childIds.has(e.id) &&
          (e.type === "PAYMENT_RECEIVED" || e.type === "REFUND"),
      );
      if (children.length > 0) {
        childrenByParent.set(entry.id, children);
        children.forEach((c) => childIds.add(c.id));
      }
    }

    // Pass 2: emit rows in the existing sorted order, skipping entries that are now nested.
    const rows: LedgerRow[] = [];
    for (const entry of enrichedEntries) {
      if (childIds.has(entry.id)) continue;
      const children = childrenByParent.get(entry.id);
      if (children && children.length > 0) {
        const charged = Number(entry.amount ?? entry.changeAmount ?? 0);
        const paid = children.reduce((sum, c) => sum + Number(c.changeAmount ?? 0), 0);
        const remaining = Math.max(0, Number((charged - paid).toFixed(2)));
        rows.push({ kind: "invoice", key: entry.id, parent: entry, children, charged, paid, remaining });
      } else {
        rows.push({ kind: "single", key: entry.id, entry });
      }
    }
    return rows;
  }, [enrichedEntries]);

  const toggleInvoice = (id: string) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAdjustments = (id: string) => {
    setExpandedAdjustments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // When the customer is in credit (paid more than charged), trace which entries created
  // that advance: walk the ledger oldest→newest and record every step where the running
  // balance dropped further below zero. Each such step is an over-payment that added credit.
  // NOTE: declared before any early return so the hook order stays stable across renders.
  const creditSources = useMemo(() => {
    if (summary.balance >= -0.009) return [] as { entry: EnrichedLedgerEntry; credit: number }[];
    const chrono = [...enrichedEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const sources: { entry: EnrichedLedgerEntry; credit: number }[] = [];
    let creditBefore = 0;
    for (const e of chrono) {
      const creditAfter = Math.max(0, -Number(e.balance));
      const delta = Number((creditAfter - creditBefore).toFixed(2));
      if (delta > 0.009) sources.push({ entry: e, credit: delta });
      creditBefore = creditAfter;
    }
    return sources;
  }, [enrichedEntries, summary.balance]);

  type PaymentTarget = {
    key: string;
    saleId: string | null;
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
      const ref = e.saleId || e.reference_no;
      if (!ref || seen.has(ref)) continue;
      const due = e.invoiceDue ?? 0;
      if (due <= 0.009) continue;
      seen.add(ref);
      targets.push({
        key: ref,
        saleId: e.saleId ?? ref,
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
        saleId: null,
        referenceNo: null,
        label: "Whole account balance",
        detail: "Applies to total amount due on this customer account",
        suggestedAmount: summary.balanceDue,
        kind: "account",
      });
    }

    return targets;
  }, [entries, summary.balanceDue]);

  const resolvePaymentTarget = useCallback(
    (targetKey: string) => {
      if (!targetKey || targetKey === "__account__") {
        return { saleId: null as string | null, referenceNo: null as string | null };
      }
      const t = paymentTargets.find(
        (i) => i.key === targetKey || i.saleId === targetKey || i.referenceNo === targetKey
      );
      return {
        saleId: t?.saleId || t?.referenceNo || targetKey,
        referenceNo: t?.referenceNo ?? null,
      };
    },
    [paymentTargets]
  );

  const applyPaymentTarget = useCallback((targetKey: string) => {
    setPaymentSaleKey(targetKey);
    const t = paymentTargets.find((x) => x.key === targetKey);
    if (!t) return;
    if (t.kind === "account") {
      setPaymentDescription("Payment toward account balance");
      setPaymentAmount(String(t.suggestedAmount));
      return;
    }
    setPaymentDescription(`Payment for ${t.referenceNo ?? t.label}`);
    setPaymentAmount(String(t.suggestedAmount));
  }, [paymentTargets]);

  const resetPaymentModal = useCallback(() => {
    setSelectedEntry(null);
    setPaymentAmount("");
    setPaymentDescription("");
    setPaymentSaleKey("");
  }, []);

  const openPaymentModal = useCallback(
    (entry?: LedgerEntry | null) => {
      setSelectedEntry(entry ?? null);

      if (entry) {
        const ref = entry.saleId || entry.reference_no || "";
        const match = paymentTargets.find(
          (t) => t.key === ref || t.saleId === ref || t.referenceNo === ref
        );
        if (match) {
          applyPaymentTarget(match.key);
        } else if (summary.balanceDue > 0) {
          applyPaymentTarget("__account__");
        } else {
          setPaymentSaleKey(ref);
          setPaymentAmount(String(entry.invoiceDue ?? entry.debit ?? ""));
          setPaymentDescription(
            entry.reference_no ? `Payment for ${entry.reference_no}` : "Payment received"
          );
        }
      } else if (paymentTargets.length === 1) {
        applyPaymentTarget(paymentTargets[0].key);
      } else {
        setPaymentSaleKey("");
        setPaymentAmount("");
        setPaymentDescription("");
      }

      setIsPaymentModalOpen(true);
    },
    [paymentTargets, summary.balanceDue, applyPaymentTarget]
  );

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

  const buildLedgerDoc = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header Color Bar
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("STATEMENT OF ACCOUNT", 15, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 15, 30);

    // Customer Info Box
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(15, 45, pageWidth - 30, 35, 3, 3, 'F');
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(customer.name.toUpperCase(), 20, 55);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Phone: ${customer.phone_number || "N/A"}`, 20, 63);
    doc.text(`Email: ${customer.email || "N/A"}`, 20, 68);
    doc.text(`Address: ${customer.mobile_number || "N/A"}`, 20, 73);

    // Summary Mini-Cards in PDF
    const cardWidth = (pageWidth - 30) / 3;
    
    const pdfNet = getNetBalancePresentation(summary.balance);

    doc.setFillColor(255, 251, 251);
    doc.roundedRect(15, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(8);
    doc.text("TOTAL DEBITS", 18, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalDebits.toLocaleString()}`, 18, 100);

    doc.setFillColor(240, 253, 244);
    doc.roundedRect(15 + cardWidth, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(8);
    doc.text("TOTAL CREDITS", 18 + cardWidth, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalCredits.toLocaleString()}`, 18 + cardWidth, 100);

    doc.setFillColor(
      pdfNet.variant === "credit" ? 240 : pdfNet.variant === "due" ? 255 : 248,
      pdfNet.variant === "credit" ? 253 : pdfNet.variant === "due" ? 251 : 250,
      pdfNet.variant === "credit" ? 244 : pdfNet.variant === "due" ? 235 : 252
    );
    doc.roundedRect(15 + cardWidth * 2, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(
      pdfNet.variant === "credit" ? 21 : pdfNet.variant === "due" ? 180 : 100,
      pdfNet.variant === "credit" ? 128 : pdfNet.variant === "due" ? 83 : 116,
      pdfNet.variant === "credit" ? 61 : pdfNet.variant === "due" ? 9 : 139
    );
    doc.setFontSize(8);
    doc.text(pdfNet.label.toUpperCase(), 18 + cardWidth * 2, 92);
    doc.setFontSize(11);
    doc.text(
      pdfNet.variant === "settled" ? "Rs 0" : `Rs ${pdfNet.amount.toLocaleString()}`,
      18 + cardWidth * 2,
      100
    );

    // Table
    const tableData = filteredEntries.map(entry => [
      `${formatDate(entry.date)}\n${formatTime(entry.date)}`,
      entry.description,
      entry.reference_no || "",
      entry.debit > 0 ? `Rs ${entry.debit.toLocaleString()}` : "",
      entry.credit > 0 ? `Rs ${entry.credit.toLocaleString()}` : "",
      formatRunningBalance(entry.balance).text
    ]);

    autoTable(doc, {
      startY: 115,
      head: [["Date & Time", "Description", "Reference", "Added", "Paid", "Balance Due"]],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [51, 65, 85], 
        textColor: 255, 
        fontSize: 9, 
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
      },
      styles: { fontSize: 8, cellPadding: 4 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 15, right: 15 },
      didDrawPage: (data: any) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Ace Orbits ERP - System Generated Statement", 15, doc.internal.pageSize.height - 10);
        doc.text(`Page ${data.pageNumber}`, pageWidth - 25, doc.internal.pageSize.height - 10);
      }
    });

    return doc;
  };

  const handleDownloadPDF = () => {
    const doc = buildLedgerDoc();
    doc.save(`${customer.name}_Statement_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handlePrint = () => {
    const doc = buildLedgerDoc();
    doc.autoPrint();
    const blobUrl = URL.createObjectURL(doc.output("blob"));
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
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
      paymentSaleKey ||
      selectedEntry?.saleId ||
      selectedEntry?.reference_no ||
      "";

    if (paymentTargets.length > 0 && !targetKey) {
      toast({
        title: "Select payment for",
        description: "Choose which invoice or account balance this payment applies to",
        variant: "destructive",
      });
      return;
    }

    const { saleId } = resolvePaymentTarget(targetKey);

    setIsSubmittingPayment(true);
    try {
      const operationId = crypto.randomUUID();
      await apiClient.post(`${API_BASE}/customer-ledger/${customerId}/payment`, {
        amount: Number(paymentAmount),
        description: paymentDescription,
        saleId,
      }, {
        headers: { "X-Operation-Id": operationId },
      });

      const synced = await fetchLedgerData();
      if (!synced) return;

      notifyDashboardStatsChanged();
      void refreshCustomerListGlobally();

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
        `${API_BASE}/customer-ledger/${customerId}/entries/${editingEntry.id}`,
        {
          amount: Number(editAmount),
          description: editDescription,
          referenceNo: editReferenceNo,
          date: editDate ? format(editDate, "yyyy-MM-dd") : undefined,
          ...(editingEntry.type === "ADJUSTMENT" ? { direction: editDirection } : {}),
        },
        { headers: { "X-Skip-Offline-Cache": "true" } },
      );

      const synced = await fetchLedgerData();
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
        `${API_BASE}/customer-ledger/${customerId}/entries/${deleteTarget.id}`,
        {
          data: { reason: deleteReason.trim() || undefined },
          headers: { "X-Skip-Offline-Cache": "true" },
        },
      );

      const synced = await fetchLedgerData();
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

  if (loading) return <PageLoader message="Loading ledger..." />;

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">Customer not found</p>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const netBalance = getNetBalancePresentation(summary.balance);
  const selectedTarget = paymentTargets.find((t) => t.key === paymentSaleKey);
  const isLedgerBusy = isSubmittingPayment || isSubmittingEdit || isDeletingEntry;

  // Renders one transaction row. `indented` is used for payment rows nested under an invoice.
  const renderEntryRow = (entry: EnrichedLedgerEntry, opts?: { indented?: boolean }) => {
    const indented = opts?.indented ?? false;
    const adjustments = entry.adjustmentHistory ?? [];
    const hasAdjustments = adjustments.length > 0 && !indented;
    const adjExpanded = expandedAdjustments.has(entry.id);
    return (
      <React.Fragment key={entry.id}>
      <tr
        className={cn(
          "border-b border-slate-100 hover:bg-slate-50/80 border-l-[3px]",
          entry.borderClass,
          indented && "bg-slate-50/60",
        )}
      >
        <td className={cn("px-3 py-3 align-middle", indented && "pl-7")}>
          <div className="flex items-center gap-2">
            {indented && <span className="text-slate-300 leading-none">└</span>}
            <div>
              <p className="text-xs font-medium text-slate-800 leading-tight whitespace-nowrap">
                {formatDate(entry.date)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-tight whitespace-nowrap">
                {formatTime(entry.date)}
              </p>
            </div>
          </div>
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
          {hasAdjustments && (
            <button
              type="button"
              onClick={() => toggleAdjustments(entry.id)}
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
            >
              {adjExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {adjustments.length} adjustment{adjustments.length === 1 ? "" : "s"} · {adjExpanded ? "hide" : "show"}
            </button>
          )}
          {!indented && entry.relatedEntries.length > 0 && (entry.adjustmentHistory?.length ?? 0) === 0 && (
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
          {money(entry.balanceBefore)}
        </td>
        <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
          <span className={entry.changeClass}>{entry.humanChangeLabel}</span>
        </td>
        <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
          <span className={formatRunningBalance(entry.balance).className}>
            {formatRunningBalance(entry.balance).text}
          </span>
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="inline-flex items-stretch rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-none px-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setViewEntry(entry)}
                disabled={isLedgerBusy}
              >
                View
              </Button>
              {getSaleBillRef(entry) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-none px-2.5 text-xs text-sky-700 border-l border-slate-200 hover:bg-sky-50"
                  onClick={() => openSaleBill(entry)}
                  disabled={isLedgerBusy}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Bill
                </Button>
              )}
            </div>
            {entry.isCollectable && (entry.invoiceDue ?? 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => openPaymentModal(entry)}
                disabled={isLedgerBusy}
              >
                Collect
              </Button>
            )}
            {(entry.isEditable ??
              (entry.type !== "CREDIT_SALE" &&
                entry.type !== "CASH_SALE" &&
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
              (entry.type !== "CREDIT_SALE" &&
                entry.type !== "CASH_SALE" &&
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
      {hasAdjustments && adjExpanded &&
        adjustments.map((adj) => (
          <tr
            key={`${entry.id}-adj-${adj.id}`}
            className="border-b border-slate-100 bg-amber-50/40 border-l-[3px] border-l-amber-200"
          >
            <td className="px-3 py-2 align-middle pl-7">
              <div className="flex items-center gap-2">
                <span className="text-slate-300 leading-none">└</span>
                <div>
                  <p className="text-[11px] font-medium text-slate-700 whitespace-nowrap">
                    {formatDate(adj.createdAt)}
                  </p>
                  <p className="text-[10px] text-slate-400 whitespace-nowrap">
                    {formatTime(adj.createdAt)}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-3 py-2 align-middle whitespace-nowrap">
              <p className="text-[11px] font-medium text-slate-700">Edit</p>
              <p className="text-[10px] text-amber-600 mt-0.5">Adjustment</p>
            </td>
            <td className="px-3 py-2 align-middle">
              <p className="text-xs text-slate-700 leading-snug">
                {cleanDisplayText(adj.reason || "Sale amount updated")}
              </p>
            </td>
            <td className="px-3 py-2 align-middle whitespace-nowrap">
              <span className="text-[11px] font-mono text-slate-400">—</span>
            </td>
            <td className="px-3 py-2 text-right align-middle tabular-nums text-xs text-slate-600 whitespace-nowrap">
              {money(adj.previousAmount)}
            </td>
            <td className="px-3 py-2 text-right align-middle tabular-nums text-xs font-semibold whitespace-nowrap">
              <span className={adj.signedDelta >= 0 ? "text-rose-700" : "text-emerald-700"}>
                {formatSignedMoney(
                  Math.abs(adj.signedDelta),
                  adj.signedDelta >= 0 ? "increase" : "decrease",
                )}
              </span>
            </td>
            <td className="px-3 py-2 text-right align-middle tabular-nums text-xs font-semibold text-slate-700 whitespace-nowrap">
              {money(adj.newAmount)}
            </td>
            <td />
          </tr>
        ))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-slate-100 h-full">
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              size="sm"
              onClick={onBack}
              className="h-9 shrink-0 gap-1.5 bg-sky-600 font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{customer.name}</h1>
              {customer.phone_number && (
                <p className="text-xs text-slate-500 truncate">{customer.phone_number}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              <span className="hidden sm:inline">Receive Payment</span>
              <span className="sm:hidden">Pay</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
        <div className="max-w-[1400px] mx-auto w-full space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setBreakdownType("charged")}
            className="text-left bg-white rounded-lg border border-rose-100 border-l-4 border-l-rose-500 p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
              Added to Balance
              <Info className="h-3 w-3" />
            </p>
            <p className="text-xl font-semibold text-rose-700 mt-1 tabular-nums">{money(summary.totalDebits)}</p>
            <p className="text-[10px] text-rose-500 mt-1 underline decoration-dotted">Sales &amp; charges — view</p>
          </button>
          <button
            type="button"
            onClick={() => setBreakdownType("paid")}
            className="text-left bg-white rounded-lg border border-emerald-100 border-l-4 border-l-emerald-500 p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
              Paid by Customer
              <Info className="h-3 w-3" />
            </p>
            <p className="text-xl font-semibold text-emerald-700 mt-1 tabular-nums">{money(summary.totalCredits)}</p>
            <p className="text-[10px] text-emerald-600 mt-1 underline decoration-dotted">Payments received — view</p>
          </button>
          {netBalance.variant === "credit" ? (
            <button
              type="button"
              onClick={() => setShowCreditInfo(true)}
              className={cn(
                "text-left rounded-lg border p-4 border-l-4 border-l-emerald-500 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-300",
                netBalance.cardClass,
              )}
            >
              <p className={cn("text-[11px] font-medium uppercase tracking-wide flex items-center gap-1", netBalance.labelClass)}>
                {netBalance.label}
                <Info className="h-3 w-3" />
              </p>
              <p className={cn("text-xl font-semibold mt-1 tabular-nums", netBalance.className)}>
                {money(netBalance.amount)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-1 underline decoration-dotted">
                Where did this come from?
              </p>
            </button>
          ) : (
            <div className={cn("rounded-lg border p-4 border-l-4", netBalance.cardClass, netBalance.variant === "due" ? "border-l-amber-500" : "border-l-slate-400")}>
              <p className={cn("text-[11px] font-medium uppercase tracking-wide", netBalance.labelClass)}>{netBalance.label}</p>
              <p className={cn("text-xl font-semibold mt-1 tabular-nums", netBalance.className)}>
                {netBalance.variant === "settled" ? "0" : money(netBalance.amount)}
              </p>
            </div>
          )}
          <div className="bg-white rounded-lg border border-slate-200 border-l-4 border-l-slate-400 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Credit Limit</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
              {money(Number(customer.credit_limit))}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-600">
          <span className="font-medium text-slate-700">Legend:</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5 align-middle" />Added to balance</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 align-middle" />Paid / reduced</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5 align-middle" />Amount due</span>
        </div>

        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Statement of Account</h2>
              <span className="text-xs text-slate-500">{entries.length} transactions</span>
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
            <table className="w-full min-w-[1180px] text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-[108px]" />
                <col className="w-[130px]" />
                <col />
                <col className="w-[150px]" />
                <col className="w-[118px]" />
                <col className="w-[118px]" />
                <col className="w-[118px]" />
                <col className="w-[210px]" />
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
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
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
                  groupedRows.map((row) => {
                    if (row.kind === "single") {
                      return renderEntryRow(row.entry);
                    }
                    const { parent, children, paid, remaining } = row;
                    const expanded = expandedInvoices.has(parent.id);
                    return (
                      <React.Fragment key={parent.id}>
                        <tr
                          className={cn(
                            "border-b border-slate-100 hover:bg-slate-50/80 border-l-[3px] cursor-pointer",
                            parent.borderClass,
                          )}
                          onClick={() => toggleInvoice(parent.id)}
                        >
                          <td className="px-3 py-3 align-middle">
                            <p className="text-xs font-medium text-slate-800 leading-tight whitespace-nowrap">
                              {formatDate(parent.date)}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight whitespace-nowrap">
                              {formatTime(parent.date)}
                            </p>
                          </td>
                          <td className="px-3 py-3 align-middle whitespace-nowrap">
                            <p className="text-xs font-medium text-slate-800">{parent.humanType}</p>
                            <p className={cn("text-[11px] mt-0.5 whitespace-nowrap", parent.statusClass)}>
                              {parent.statusLabel}
                            </p>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <p className="text-sm text-slate-800 leading-snug truncate" title={cleanDisplayText(parent.description)}>
                              {cleanDisplayText(parent.description)}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {paid > 0.009 && (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                                  Paid {money(paid)}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums whitespace-nowrap",
                                  remaining > 0.009 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
                                )}
                              >
                                {remaining > 0.009 ? `Due ${money(remaining)}` : "Settled"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleInvoice(parent.id);
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
                            >
                              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {children.length} payment{children.length === 1 ? "" : "s"} · {expanded ? "hide" : "show"}
                            </button>
                          </td>
                          <td className="px-3 py-3 align-middle whitespace-nowrap">
                            <span className="text-[11px] font-mono text-slate-600">
                              {parent.relatedRef || parent.reference_no || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-slate-700 whitespace-nowrap">
                            {money(parent.balanceBefore)}
                          </td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
                            <span className={parent.changeClass}>{parent.humanChangeLabel}</span>
                          </td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums font-semibold whitespace-nowrap">
                            <span className={formatRunningBalance(parent.balance).className}>
                              {formatRunningBalance(parent.balance).text}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-stretch rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 rounded-none px-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  onClick={() => setViewEntry(parent)}
                                  disabled={isLedgerBusy}
                                >
                                  View
                                </Button>
                                {getSaleBillRef(parent) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-none px-2.5 text-xs text-sky-700 border-l border-slate-200 hover:bg-sky-50"
                                    onClick={() => openSaleBill(parent)}
                                    disabled={isLedgerBusy}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    Bill
                                  </Button>
                                )}
                              </div>
                              {parent.isCollectable && (parent.invoiceDue ?? 0) > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() => openPaymentModal(parent)}
                                  disabled={isLedgerBusy}
                                >
                                  Collect
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && children.map((child) => renderEntryRow(child, { indented: true }))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {enrichedEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-100/80">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-bold uppercase tracking-wide text-slate-700">Totals</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Total charged minus total paid = balance
                          </p>
                        </div>
                        <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
                          <div className="rounded-lg border border-rose-100 bg-white px-4 py-2 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Charged</p>
                            <p className="text-base font-bold text-rose-600 tabular-nums whitespace-nowrap">
                              +{money(summary.totalDebits)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-white px-4 py-2 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Paid</p>
                            <p className="text-base font-bold text-emerald-600 tabular-nums whitespace-nowrap">
                              −{money(summary.totalCredits)}
                            </p>
                          </div>
                          <div className={cn("rounded-lg border px-4 py-2 shadow-sm", netBalance.cardClass)}>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              {netBalance.label}
                            </p>
                            <p className={cn("text-lg font-bold tabular-nums whitespace-nowrap", netBalance.className)}>
                              {netBalance.variant === "settled" ? "0" : money(netBalance.amount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        </div>
      </div>

      <Dialog open={!!breakdownType} onOpenChange={(open) => !open && setBreakdownType(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {breakdownType && (() => {
            const isCharged = breakdownType === "charged";
            const list = enrichedEntries.filter((e) =>
              isCharged ? Number(e.debit) > 0.009 : Number(e.credit) > 0.009,
            );
            const total = isCharged ? summary.totalDebits : summary.totalCredits;
            const amountClass = isCharged ? "text-rose-700" : "text-emerald-700";
            const sign = isCharged ? "+" : "−";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Info className={cn("h-4 w-4", isCharged ? "text-rose-600" : "text-emerald-600")} />
                    {isCharged ? "Added to balance" : "Paid by customer"}
                  </DialogTitle>
                  <DialogDescription>
                    {isCharged
                      ? "Every sale or charge that increased what this customer owes."
                      : "Every payment or credit that reduced what this customer owes."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                  {list.length === 0 ? (
                    <p className="text-sm text-slate-500">No entries.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                      {list.map((e) => {
                        const amt = isCharged ? Number(e.debit) : Number(e.credit);
                        return (
                          <div key={e.id} className="p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate" title={cleanDisplayText(e.description)}>
                                {cleanDisplayText(e.description)}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {e.humanType} · {formatDate(e.date)} {formatTime(e.date)}
                                {(e.relatedRef || e.reference_no) ? ` · ${e.relatedRef || e.reference_no}` : ""}
                              </p>
                            </div>
                            <p className={cn("text-sm font-bold tabular-nums whitespace-nowrap", amountClass)}>
                              {sign}{money(amt)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-sm font-semibold text-slate-700">
                      Total ({list.length} {list.length === 1 ? "entry" : "entries"})
                    </span>
                    <span className={cn("text-base font-bold tabular-nums", amountClass)}>
                      {sign}{money(total)}
                    </span>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setBreakdownType(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditInfo} onOpenChange={setShowCreditInfo}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-emerald-600" />
              Where the credit came from
            </DialogTitle>
            <DialogDescription>
              This customer has paid more than they were charged. The extra sits as advance
              credit and is automatically applied to their next credit sales.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200 text-sm rounded-md overflow-hidden">
              <div className="bg-white p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total charged</p>
                <p className="font-semibold mt-1 tabular-nums text-rose-700">{money(summary.totalDebits)}</p>
              </div>
              <div className="bg-white p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total paid</p>
                <p className="font-semibold mt-1 tabular-nums text-emerald-700">{money(summary.totalCredits)}</p>
              </div>
              <div className="bg-emerald-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-emerald-600">Available credit</p>
                <p className="font-bold mt-1 tabular-nums text-emerald-700">{money(netBalance.amount)}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                Over-payments that created this credit
              </p>
              {creditSources.length === 0 ? (
                <p className="text-sm text-slate-500">
                  The credit is the difference between total paid and total charged ({money(summary.totalCredits)} − {money(summary.totalDebits)} = {money(netBalance.amount)}).
                </p>
              ) : (
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {creditSources.map(({ entry, credit }) => (
                    <div key={entry.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate" title={cleanDisplayText(entry.description)}>
                          {cleanDisplayText(entry.description)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {entry.humanType} · {formatDate(entry.date)} {formatTime(entry.date)}
                          {(entry.relatedRef || entry.reference_no) ? ` · ${entry.relatedRef || entry.reference_no}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-wide text-emerald-600">Added to credit</p>
                        <p className="text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                          +{money(credit)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              Tip: use <span className="font-medium">Receive Payment</span> only for what a customer owes. Overpaying creates this advance credit.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditInfo(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      {money(viewEntry.balanceBefore)}
                    </p>
                  </div>
                  <div className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Balance After</p>
                    <p className="font-semibold mt-1 tabular-nums text-slate-900">
                      {formatRunningBalance(viewEntry.balance).text}
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-3">Balance impact</p>
                  <BalanceFlow
                    before={viewEntry.balanceBefore}
                    change={viewEntry.changeAmount}
                    after={viewEntry.balance}
                    direction={viewEntry.changeDirection}
                  />
                </div>

                {(viewEntry.type === "CREDIT_SALE" || viewEntry.type === "CASH_SALE") &&
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

                {(viewEntry.adjustmentHistory?.length ?? 0) > 0 && (
                  <div className="border border-slate-200 p-3 space-y-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                      Adjustment History
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Original</p>
                        <p className="font-semibold text-slate-900 tabular-nums">
                          {money(viewEntry.originalLedgerAmount ?? viewEntry.amount ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Net change</p>
                        <p className="font-semibold text-slate-900 tabular-nums">
                          {formatSignedMoney(
                            (viewEntry.amount ?? 0) - (viewEntry.originalLedgerAmount ?? viewEntry.amount ?? 0),
                            (viewEntry.amount ?? 0) >= (viewEntry.originalLedgerAmount ?? 0) ? "increase" : "decrease",
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Updated total</p>
                        <p className="font-semibold text-slate-900 tabular-nums">
                          {money(viewEntry.amount ?? 0)}
                        </p>
                      </div>
                    </div>
                    <div className="border border-slate-100 divide-y divide-slate-100">
                      {viewEntry.adjustmentHistory!.map((adj) => (
                        <div key={adj.id} className="py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                adj.signedDelta >= 0 ? "text-rose-700" : "text-emerald-700",
                              )}
                            >
                              {formatSignedMoney(
                                Math.abs(adj.signedDelta),
                                adj.signedDelta >= 0 ? "increase" : "decrease",
                              )}
                            </span>
                            <span className="text-slate-500 shrink-0">
                              {formatDate(adj.createdAt)} · {formatTime(adj.createdAt)}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">
                            {cleanDisplayText(adj.reason || "Sale amount updated")}
                          </p>
                          <p className="text-slate-400 mt-0.5 tabular-nums">
                            {money(adj.previousAmount)} → {money(adj.newAmount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewEntry.relatedEntries.length > 0 && (viewEntry.adjustmentHistory?.length ?? 0) === 0 && (
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
                {getSaleBillRef(viewEntry) && (
                  <Button
                    variant="outline"
                    className="sm:mr-auto border-sky-200 text-sky-700 hover:bg-sky-50"
                    onClick={() => {
                      openSaleBill(viewEntry);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    View Bill
                  </Button>
                )}
                {viewEntry.isCollectable && (viewEntry.invoiceDue ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    className="sm:mr-auto border-slate-300"
                    onClick={() => {
                      setViewEntry(null);
                      openPaymentModal(viewEntry);
                    }}
                  >
                    Collect {money(viewEntry.invoiceDue ?? 0)}
                  </Button>
                )}
                {(viewEntry.isEditable ??
                  (viewEntry.type !== "CREDIT_SALE" &&
                    viewEntry.type !== "CASH_SALE" &&
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
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => isSubmittingPayment && e.preventDefault()}
          onEscapeKeyDown={(e) => isSubmittingPayment && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Receive Payment
            </DialogTitle>
            <DialogDescription>
              {netBalance.variant === "due"
                ? `${netBalance.label}: ${money(netBalance.amount)}`
                : netBalance.variant === "credit"
                  ? `${netBalance.label}: ${money(netBalance.amount)}`
                  : "Account is settled."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-target">
                Payment applies to <span className="text-destructive">*</span>
              </Label>
              {paymentTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open balance to collect.</p>
              ) : (
                <Select
                  value={paymentSaleKey || undefined}
                  onValueChange={applyPaymentTarget}
                >
                  <SelectTrigger id="payment-target" className="h-10">
                    <SelectValue placeholder="Select invoice or account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentTargets.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="truncate">
                            {t.label}
                            {t.kind === "invoice" && t.detail ? (
                              <span className="text-muted-foreground"> · {t.detail}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {money(t.suggestedAmount)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedTarget?.kind === "account" && (
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
                (paymentTargets.length > 0 && !paymentSaleKey) ||
                !paymentAmount ||
                Number(paymentAmount) <= 0
              }
            >
              {isSubmittingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving payment...
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
                Saving changes...
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
                    <SelectItem value="debit">Amount added (customer owes more)</SelectItem>
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
                  Saving changes...
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
                Deleting entry...
              </p>
            </div>
          )}
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will remove the entry and add a reversal adjustment for audit. Customer
                  balance and invoice allocations will be recalculated.
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
                  Deleting...
                </>
              ) : (
                "Delete Entry"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaleBillDialog
        open={billDialogOpen}
        onOpenChange={setBillDialogOpen}
        saleRef={billSaleRef}
      />
    </div>
  );
}
