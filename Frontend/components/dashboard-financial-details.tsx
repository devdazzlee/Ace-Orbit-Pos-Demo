"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  DollarSign,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/page-loader";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { isAdminRole, normalizeBranchId } from "@/lib/branch-utils";
import apiClient from "@/lib/apiClient";
import { fetchDashboardStatsFresh } from "@/lib/dashboard-stats-sync";
import {
  getCurrentReportingPeriod,
  getReportingPeriodDescription,
  msUntilNextReportingBoundary,
} from "@/lib/reporting-period";

type DetailMode = "revenue" | "cash" | "credit" | "expenses";

interface SaleRow {
  id: string;
  sale_number: string;
  total_amount: number | string;
  payment_method?: string;
  payment_status?: string;
  status?: string;
  sale_date?: string;
  created_at?: string;
  customer?: { name?: string | null; email?: string | null; phone_number?: string | null } | null;
}

interface ExpenseRow {
  id: string;
  particular: string;
  description?: string | null;
  amount: number | string;
  created_at: string;
}

interface CollectionRow {
  id: string;
  amount: number | string;
  description?: string | null;
  reference_no?: string | null;
  created_at: string;
  customer?: { id: string; name?: string | null; phone_number?: string | null } | null;
}

type CashTableRow =
  | { kind: "sale"; id: string; date: string; label: string; customer: string; amount: number; paymentMethod: string }
  | { kind: "payment"; id: string; date: string; label: string; customer: string; amount: number; reference?: string };

interface DashboardFinancialDetailsProps {
  mode: DetailMode;
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

const TAB_CONFIG: Array<{ id: string; mode: DetailMode; label: string; icon: LucideIcon }> = [
  { id: "today-revenue", mode: "revenue", label: "Today Revenue", icon: Banknote },
  { id: "today-cash-sales", mode: "cash", label: "Today Cash Sales", icon: DollarSign },
  { id: "today-credit-sales", mode: "credit", label: "Today Credit Sales", icon: CreditCard },
  { id: "today-expenses", mode: "expenses", label: "Today Expenses", icon: Receipt },
];

const MODE_META: Record<
  DetailMode,
  { heading: string; sub: string; tone: string; badge: string; icon: LucideIcon }
> = {
  revenue: {
    heading: "Today Revenue",
    sub: `All completed sales · ${getReportingPeriodDescription()}`,
    tone: "text-blue-700",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Banknote,
  },
  cash: {
    heading: "Today Cash Sales",
    sub: `Cash/card sales and ledger payments · ${getReportingPeriodDescription()}`,
    tone: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: Wallet,
  },
  credit: {
    heading: "Today Credit Sales",
    sub: `Credit invoices · ${getReportingPeriodDescription()}`,
    tone: "text-amber-700",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    icon: CreditCard,
  },
  expenses: {
    heading: "Today Expenses",
    sub: `Outgoing cash · ${getReportingPeriodDescription()}`,
    tone: "text-red-700",
    badge: "bg-red-100 text-red-800 border-red-200",
    icon: Receipt,
  },
};

const money = (n: number) =>
  `Rs ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const formatDate = (value: string) => {
  try {
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? "N/A" : format(dt, "dd MMM yyyy");
  } catch {
    return "N/A";
  }
};

const formatTime = (value: string) => {
  try {
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? "" : format(dt, "hh:mm a");
  } catch {
    return "";
  }
};

function getDefaultDateFrom() {
  return getCurrentReportingPeriod().start;
}

function getDefaultReportingEndExclusive() {
  return getCurrentReportingPeriod().end;
}

function getSaleQueryParams() {
  if (typeof window === "undefined") return {};
  if (isAdminRole(localStorage.getItem("role"))) return {};
  const branchId = normalizeBranchId(localStorage.getItem("branch"));
  return branchId ? { branchId } : {};
}

function paymentBadge(method?: string) {
  const pm = String(method || "").toUpperCase();
  if (pm === "CASH") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Cash</Badge>;
  if (pm === "CARD") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Card</Badge>;
  if (pm === "CREDIT") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Credit</Badge>;
  return <Badge variant="outline">{pm || "—"}</Badge>;
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "blue" | "emerald" | "amber" | "red" | "default";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/60",
    emerald: "border-emerald-200 bg-emerald-50/60",
    amber: "border-amber-200 bg-amber-50/60",
    red: "border-red-200 bg-red-50/60",
    default: "",
  };

  return (
    <Card className={cn("shadow-sm", tones[tone])}>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export function DashboardFinancialDetails({ mode, onBack, onNavigate }: DashboardFinancialDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [salesMeta, setSalesMeta] = useState({ total: 0, totalPages: 1 });
  const [expenseMeta, setExpenseMeta] = useState({ total: 0, totalPages: 1 });

  const meta = MODE_META[mode];
  const isAdminView = typeof window !== "undefined" && isAdminRole(localStorage.getItem("role"));

  const dateParams = useMemo(() => {
    const params: Record<string, string> = {
      dateField: "created_at",
      endExclusive: dateTo ? "false" : "true",
    };
    if (dateFrom) params.startDate = dateFrom.toISOString();
    if (dateTo) {
      const inclusiveEnd = new Date(dateTo);
      inclusiveEnd.setHours(23, 59, 59, 999);
      params.endDate = inclusiveEnd.toISOString();
    } else {
      params.endDate = getDefaultReportingEndExclusive().toISOString();
    }
    return params;
  }, [dateFrom, dateTo]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      if (mode === "expenses") {
        const res = await apiClient.get("/expenses", {
          params: {
            page,
            limit,
            ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
            ...(dateFrom ? { startDate: dateFrom.toISOString() } : {}),
            ...(dateTo
              ? { endDate: format(dateTo, "yyyy-MM-dd") }
              : { endDate: getDefaultReportingEndExclusive().toISOString() }),
          },
          headers: { "X-Skip-Offline-Cache": "true" },
        });
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setExpenses(rows);
        const m = res.data?.meta || {};
        setExpenseMeta({
          total: Number(m.total || rows.length || 0),
          totalPages: Math.max(1, Number(m.totalPages || 1)),
        });
        setSales([]);
        setCollections([]);
        return;
      }

      const salesRes = await apiClient.get("/sale", {
        params: {
          ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
          ...dateParams,
          ...getSaleQueryParams(),
        },
        headers: { "X-Skip-Offline-Cache": "true" },
      });

      const saleRows: SaleRow[] = (Array.isArray(salesRes.data?.data) ? salesRes.data.data : []).filter(
        (s: SaleRow) => String(s.status || "COMPLETED").toUpperCase() === "COMPLETED"
      );

      const salesPmFilter = (s: SaleRow) => {
        const pm = String(s.payment_method || "").toUpperCase();
        if (mode === "cash") return pm === "CASH" || pm === "CARD";
        if (mode === "credit") return pm === "CREDIT";
        return true;
      };

      const filteredSales = saleRows.filter(salesPmFilter);
      setSales(filteredSales);
      setSalesMeta({
        total: filteredSales.length,
        totalPages: Math.max(1, Math.ceil(filteredSales.length / limit)),
      });

      if (mode === "cash") {
        const colRes = await apiClient.get("/dashboard/collections", {
          params: {
            ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
            ...dateParams,
          },
          headers: { "X-Skip-Offline-Cache": "true" },
        });
        setCollections(Array.isArray(colRes.data?.data) ? colRes.data.data : []);
      } else {
        setCollections([]);
      }

      setExpenses([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, page, limit, searchTerm, dateFrom, dateTo, dateParams]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReportingBoundaryRefresh = () => {
      const delay = msUntilNextReportingBoundary() + 1000;
      timer = setTimeout(() => {
        void loadData(true);
        scheduleReportingBoundaryRefresh();
      }, delay);
    };

    scheduleReportingBoundaryRefresh();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadData]);

  const cashRows: CashTableRow[] = useMemo(() => {
    const saleEntries: CashTableRow[] = sales.map((s) => ({
      kind: "sale" as const,
      id: s.id,
      date: s.sale_date || s.created_at || "",
      label: s.sale_number,
      customer: s.customer?.name || s.customer?.email || "Walk-in Customer",
      amount: Number(s.total_amount || 0),
      paymentMethod: String(s.payment_method || "").toUpperCase(),
    }));

    const paymentEntries: CashTableRow[] = collections.map((c) => ({
      kind: "payment" as const,
      id: c.id,
      date: c.created_at,
      label: c.reference_no || "Ledger Payment",
      customer: c.customer?.name || c.customer?.phone_number || "Customer",
      amount: Number(c.amount || 0),
      reference: c.description || undefined,
    }));

    return [...saleEntries, ...paymentEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [sales, collections]);

  const paginatedCashRows = useMemo(() => {
    const start = (page - 1) * limit;
    return cashRows.slice(start, start + limit);
  }, [cashRows, page, limit]);

  const cashMeta = useMemo(
    () => ({
      total: cashRows.length,
      totalPages: Math.max(1, Math.ceil(cashRows.length / limit)),
    }),
    [cashRows.length, limit]
  );

  const summary = useMemo(() => {
    if (mode === "expenses") {
      const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const count = expenseMeta.total || expenses.length;
      return {
        total,
        count,
        average: count > 0 ? total / count : 0,
        salesTotal: 0,
        paymentsTotal: 0,
      };
    }

    const salesTotal = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const paymentsTotal = collections.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const count = mode === "cash" ? cashRows.length : sales.length;
    const total =
      mode === "cash" ? salesTotal + paymentsTotal : mode === "credit" ? salesTotal : salesTotal;

    return {
      total,
      count,
      average: count > 0 ? total / count : 0,
      salesTotal,
      paymentsTotal,
    };
  }, [mode, sales, collections, expenses, expenseMeta.total, cashRows.length]);

  const clearFilters = () => {
    setSearchTerm("");
    setDateFrom(getDefaultDateFrom());
    setDateTo(undefined);
    setPage(1);
  };

  const paginatedSales = useMemo(() => {
    const start = (page - 1) * limit;
    return sales.slice(start, start + limit);
  }, [sales, page, limit]);

  const activeMeta = mode === "cash" ? cashMeta : mode === "expenses" ? expenseMeta : salesMeta;

  if (loading) return <PageLoader message="Loading financial details..." />;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <meta.icon className={cn("h-6 w-6", meta.tone)} />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{meta.heading}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{meta.sub}</p>
          {isAdminView ? (
            <Badge variant="outline" className="mt-2 text-xs">
              Admin view · all locations
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Sub navigation */}
      {onNavigate ? (
        <div className="flex flex-wrap gap-2">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const active = tab.mode === mode;
            return (
              <Button
                key={tab.id}
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn("h-9", active && "shadow-sm")}
                onClick={() => onNavigate(tab.id)}
              >
                <Icon className="h-4 w-4 mr-1.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Period Total"
          value={money(summary.total)}
          sub={isAdminView ? "All locations" : "Selected branch"}
          tone={mode === "expenses" ? "red" : mode === "credit" ? "amber" : mode === "cash" ? "emerald" : "blue"}
        />
        <SummaryCard
          label="Entries"
          value={String(summary.count)}
          sub={mode === "cash" ? "Sales + ledger payments" : mode === "expenses" ? "Expense records" : "Transactions"}
        />
        <SummaryCard
          label="Average"
          value={money(summary.average)}
          sub="Per entry"
        />
        {mode === "cash" ? (
          <SummaryCard
            label="Breakdown"
            value={money(summary.salesTotal)}
            sub={`Sales · Payments ${money(summary.paymentsTotal)}`}
            tone="emerald"
          />
        ) : mode === "revenue" ? (
          <SummaryCard
            label="Cash Share"
            value={money(
              sales
                .filter((s) => ["CASH", "CARD"].includes(String(s.payment_method || "").toUpperCase()))
                .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
            )}
            sub={`Credit ${money(
              sales
                .filter((s) => String(s.payment_method || "").toUpperCase() === "CREDIT")
                .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
            )}`}
            tone="blue"
          />
        ) : (
          <SummaryCard
            label="Highest Entry"
            value={money(
              Math.max(
                0,
                ...(mode === "expenses"
                  ? expenses.map((e) => Number(e.amount || 0))
                  : sales.map((s) => Number(s.total_amount || 0)))
              )
            )}
            sub="Single largest amount"
          />
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder={
                  mode === "expenses"
                    ? "Search particular or description..."
                    : mode === "cash"
                      ? "Search sale #, customer, or reference..."
                      : "Search sale # or customer..."
                }
                className="pl-9"
                value={searchTerm}
                onChange={(e) => {
                  setPage(1);
                  setSearchTerm(e.target.value);
                }}
              />
            </div>
            <DatePicker
              date={dateFrom}
              placeholder="From"
              onDateChange={(date) => {
                setPage(1);
                setDateFrom(date);
              }}
            />
            <DatePicker
              date={dateTo}
              placeholder="To"
              onDateChange={(date) => {
                setPage(1);
                setDateTo(date);
              }}
            />
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {mode === "expenses" ? "Expense Records" : mode === "cash" ? "Cash Inflow Records" : "Sales Records"}
          </CardTitle>
          <Badge variant="outline" className={meta.badge}>
            {activeMeta.total} total
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {mode === "expenses" ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Particular</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                        No expenses found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.map((e) => (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap">
                          <p className="text-sm font-medium">{formatDate(e.created_at)}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTime(e.created_at)}</p>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px]">
                          <p className="truncate" title={e.particular}>
                            {e.particular}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-[240px] text-sm text-muted-foreground">
                          <p className="truncate" title={e.description || undefined}>
                            {e.description?.trim() || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-700 whitespace-nowrap">
                          {money(Number(e.amount || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : mode === "cash" ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCashRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No cash sales or ledger payments found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCashRows.map((row) => (
                      <TableRow key={`${row.kind}-${row.id}`} className="hover:bg-muted/30">
                        <TableCell>
                          {row.kind === "sale" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Sale</Badge>
                          ) : (
                            <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">Payment</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{row.label}</TableCell>
                        <TableCell className="max-w-[180px]">
                          <p className="truncate" title={row.customer}>
                            {row.customer}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <p className="text-sm font-medium">{formatDate(row.date)}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTime(row.date)}</p>
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                          {row.kind === "sale" ? (
                            paymentBadge(row.paymentMethod)
                          ) : (
                            <p className="truncate" title={row.reference}>
                              {row.reference || "Customer payment"}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {money(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Sale #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No sales found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSales.map((s) => (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium whitespace-nowrap">{s.sale_number}</TableCell>
                        <TableCell className="max-w-[180px]">
                          <p className="truncate" title={s.customer?.name || undefined}>
                            {s.customer?.name || s.customer?.email || "Walk-in Customer"}
                          </p>
                        </TableCell>
                        <TableCell>{paymentBadge(s.payment_method)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.payment_status || s.status || "COMPLETED"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <p className="text-sm font-medium">
                            {formatDate(s.sale_date || s.created_at || "")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatTime(s.sale_date || s.created_at || "")}
                          </p>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold whitespace-nowrap",
                            mode === "credit" ? "text-amber-700" : "text-blue-700"
                          )}
                        >
                          {money(Number(s.total_amount || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page} of {activeMeta.totalPages} · {activeMeta.total} entries
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={String(limit)}
                onValueChange={(value) => {
                  setPage(1);
                  setLimit(Number(value));
                }}
              >
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= activeMeta.totalPages}
                onClick={() => setPage((p) => Math.min(activeMeta.totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
