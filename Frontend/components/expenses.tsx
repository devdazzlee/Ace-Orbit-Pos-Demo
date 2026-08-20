"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { isWithinCurrentReportingPeriod } from "@/lib/reporting-period";
import { Calendar, Eye, Plus, Receipt, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { PageLoader } from "@/components/ui/page-loader";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import apiClient from "@/lib/apiClient";
import { notifyDashboardStatsChanged } from "@/lib/dashboard-stats-sync";

interface ExpenseRow {
  id: string;
  particular: string;
  description?: string | null;
  amount: number | string;
  created_at: string;
}

interface ExpenseMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

const truncateWords = (text: string, maxWords = 8) => {
  const trimmed = text.trim();
  if (!trimmed) return "—";
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ")}...`;
};

export function Expenses() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewExpense, setViewExpense] = useState<ExpenseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [meta, setMeta] = useState<ExpenseMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [form, setForm] = useState({ particular: "", amount: "", description: "" });

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit,
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (dateFrom) params.startDate = format(dateFrom, "yyyy-MM-dd");
      if (dateTo) params.endDate = format(dateTo, "yyyy-MM-dd");

      const res = await apiClient.get("/expenses", { params });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setExpenses(rows);
      const m = res.data?.meta || {};
      setMeta({
        total: Number(m.total || rows.length || 0),
        page: Number(m.page || page),
        limit: Number(m.limit || limit),
        totalPages: Math.max(1, Number(m.totalPages || 1)),
      });
    } catch (error: any) {
      setExpenses([]);
      setMeta({ total: 0, page: 1, limit, totalPages: 1 });
      toast({
        variant: "destructive",
        title: "Failed to load expenses",
        description: error?.response?.data?.message || "Could not fetch expenses from server.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchExpenses();
  }, [page, limit, searchTerm, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayTotal = 0;
    let monthTotal = 0;
    for (const e of expenses) {
      const amount = Number(e.amount || 0);
      const created = new Date(e.created_at);
      if (created >= startOfMonth) monthTotal += amount;
      if (isWithinCurrentReportingPeriod(created)) todayTotal += amount;
    }

    return {
      count: meta.total,
      todayTotal,
      monthTotal,
    };
  }, [expenses, meta.total]);

  const submitNewExpense = async () => {
    const particular = form.particular.trim();
    const description = form.description.trim();
    const amount = Number(form.amount);

    if (!particular) {
      toast({ variant: "destructive", title: "Validation", description: "Particular is required." });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Validation", description: "Amount must be greater than 0." });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post("/expenses", {
        particular,
        amount,
        description: description || null,
      });
      toast({ variant: "success", title: "Expense added", description: "Expense saved successfully." });
      setForm({ particular: "", amount: "", description: "" });
      setIsAddDialogOpen(false);
      setPage(1);
      await fetchExpenses();
      notifyDashboardStatsChanged();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to add expense",
        description: error?.response?.data?.message || "Could not save expense.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openView = async (expense: ExpenseRow) => {
    try {
      const res = await apiClient.get(`/expenses/${expense.id}`);
      const row = res.data?.data ?? expense;
      setViewExpense(row);
    } catch {
      setViewExpense(expense);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/expenses/${deleteTarget.id}`);
      toast({ variant: "success", title: "Expense deleted", description: "The expense record was removed." });
      setDeleteTarget(null);
      if (viewExpense?.id === deleteTarget.id) setViewExpense(null);
      await fetchExpenses();
      notifyDashboardStatsChanged();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete expense",
        description: error?.response?.data?.message || "Could not delete expense.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <PageLoader message="Loading expenses..." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm md:text-base text-gray-600">Track daily expenses with backend-connected records.</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="expense-particular">Particular *</Label>
                  <Input
                    id="expense-particular"
                    placeholder="e.g. Office stationery"
                    value={form.particular}
                    onChange={(e) => setForm((p) => ({ ...p, particular: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-description">Description</Label>
                  <Textarea
                    id="expense-description"
                    placeholder="What was this expense for? e.g. Tea for staff meeting"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional — explain the purpose of this expense.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-amount">Amount *</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <Button className="w-full" onClick={() => void submitNewExpense()} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Expense"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{money(totals.todayTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{money(totals.monthTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-medium">Entries</CardTitle>
            <Receipt className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{totals.count}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Expense Records</CardTitle>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 mt-2">
            <div className="relative lg:col-span-2">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search by particular or description..."
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
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Particular</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No expense records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium max-w-[180px]">
                        <p className="truncate" title={expense.particular}>
                          {expense.particular}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <p
                          className="text-sm text-muted-foreground truncate"
                          title={expense.description?.trim() || undefined}
                        >
                          {truncateWords(expense.description || "")}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
                          {formatDate(expense.created_at)}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight whitespace-nowrap">
                          {formatTime(expense.created_at)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(Number(expense.amount || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="View"
                            onClick={() => void openView(expense)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                            onClick={() => setDeleteTarget(expense)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing page {meta.page} of {meta.totalPages} • {meta.total} total entries
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
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!viewExpense} onOpenChange={(open) => !open && setViewExpense(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {viewExpense && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Particular</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{viewExpense.particular}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap">
                  {viewExpense.description?.trim() || "—"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">
                    {money(Number(viewExpense.amount || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</p>
                  <p className="mt-1 text-gray-900 font-medium">{formatDate(viewExpense.created_at)}</p>
                  <p className="text-sm text-muted-foreground">{formatTime(viewExpense.created_at)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteTarget(open ? deleteTarget : null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.particular}</span> (
              {deleteTarget ? money(Number(deleteTarget.amount || 0)) : ""}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
