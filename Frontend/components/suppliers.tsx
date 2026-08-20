"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  Edit,
  ToggleRight,
  ToggleLeft,
  Trash2,
  AlertTriangle,
  Phone,
  ShoppingBag,
  Wallet,
  Calendar,
  Building2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageLoader } from "@/components/ui/page-loader";
import { cn } from "@/lib/utils";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "ADVANCE" | "NONE";

interface SupplierSummary {
  id: string;
  code: string;
  name: string;
  phone_number?: string;
  mobile_number?: string;
  email?: string;
  status: string;
  is_active: boolean;
  display_on_pos: boolean;
  outstanding_balance: number;
  product_count: number;
  created_at: string;
  totalPurchases: number;
  totalPaid: number;
  lastPurchaseDate: string | null;
  paymentStatus: PaymentStatus;
}

interface SuppliersProps {
  onViewSupplier?: (supplierId: string) => void;
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const statusMeta = (status: PaymentStatus) => {
  switch (status) {
    case "PAID":
      return { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    case "PARTIAL":
      return { label: "Partial", className: "bg-amber-100 text-amber-800 border-amber-200" };
    case "DUE":
      return { label: "Due", className: "bg-rose-100 text-rose-800 border-rose-200" };
    case "ADVANCE":
      return { label: "Advance", className: "bg-sky-100 text-sky-800 border-sky-200" };
    default:
      return { label: "No Activity", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
};

const Suppliers: React.FC<SuppliersProps> = ({ onViewSupplier }) => {
  const { toast } = useToast();
  const [list, setList] = useState<SupplierSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [current, setCurrent] = useState<SupplierSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone_number: "",
    fax_number: "",
    mobile_number: "",
    country: "",
    city: "",
    email: "",
    ntn: "",
    strn: "",
    gov_id: "",
    address: "",
    display_on_pos: true,
  });

  const [nameError, setNameError] = useState("");

  useEffect(() => {
    fetchList();
  }, []);

  const fetchList = async (q: string = search) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get(`${API_BASE}/supplier-ledger/list-summaries`, {
        params: { search: q || undefined },
        headers: { "X-Skip-Offline-Cache": "true" },
      });
      setList(res.data.data ?? []);
    } catch (e: any) {
      setError("Failed to load suppliers");
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Failed to load suppliers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    fetchList(v);
  };

  const filtered = useMemo(() => {
    return list.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.includes(q) ||
        (s.mobile_number || "").includes(q) ||
        (s.phone_number || "").includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "due" && (s.paymentStatus === "DUE" || s.paymentStatus === "PARTIAL")) ||
        (statusFilter === "paid" && s.paymentStatus === "PAID") ||
        (statusFilter === "partial" && s.paymentStatus === "PARTIAL") ||
        (statusFilter === "advance" && s.paymentStatus === "ADVANCE") ||
        (statusFilter === "volume" && s.totalPurchases > 100000);

      return matchesSearch && matchesStatus;
    });
  }, [list, search, statusFilter]);

  const totals = useMemo(
    () => ({
      suppliers: list.length,
      due: list.filter((s) => s.paymentStatus === "DUE" || s.paymentStatus === "PARTIAL").length,
      payable: list.reduce((sum, s) => sum + Math.max(0, Number(s.outstanding_balance || 0)), 0),
      purchases: list.reduce((sum, s) => sum + Number(s.totalPurchases || 0), 0),
    }),
    [list],
  );

  const openAdd = () => {
    setForm({
      name: "",
      phone_number: "",
      fax_number: "",
      mobile_number: "",
      country: "",
      city: "",
      email: "",
      ntn: "",
      strn: "",
      gov_id: "",
      address: "",
      display_on_pos: true,
    });
    setCurrent(null);
    setNameError("");
    setAddOpen(true);
  };

  const openEdit = (s: SupplierSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrent(s);
    setForm({
      name: s.name,
      phone_number: s.phone_number || "",
      fax_number: "",
      mobile_number: s.mobile_number || "",
      country: "",
      city: "",
      email: s.email || "",
      ntn: "",
      strn: "",
      gov_id: "",
      address: "",
      display_on_pos: s.display_on_pos,
    });
    setEditOpen(true);
    setNameError("");
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError("");
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form };
      if (current) {
        await apiClient.put(`${API_BASE}/suppliers/${current.id}`, payload);
        setEditOpen(false);
        toast({ title: "Success", description: "Supplier updated successfully" });
      } else {
        await apiClient.post(`${API_BASE}/suppliers`, payload);
        setAddOpen(false);
        toast({ title: "Success", description: "Supplier created successfully" });
      }
      fetchList();
    } catch (e: any) {
      setError("Submission failed");
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await apiClient.patch(`${API_BASE}/suppliers/${id}/toggle-status`);
      fetchList();
    } catch (e) {
      console.log(e);
    }
  };

  const openDelete = (s: SupplierSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrent(s);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!current) return;
    setDeleting(true);
    try {
      await apiClient.delete(`${API_BASE}/suppliers/${current.id}`);
      toast({ title: "Success", description: "Supplier deleted successfully" });
      setDeleteOpen(false);
      fetchList();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Failed to delete supplier",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (isInitialLoading) {
    return <PageLoader message="Loading suppliers..." />;
  }

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm md:text-base text-slate-600">
            Manage supplier accounts, purchases, and payables
          </p>
        </div>
        <Button onClick={openAdd} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4 mr-2" />
          New Supplier
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Suppliers", value: totals.suppliers, tone: "bg-white border-slate-200" },
          { label: "With Balance Due", value: totals.due, tone: "bg-amber-50 border-amber-200" },
          { label: "Total Payable", value: `Rs ${money(totals.payable)}`, tone: "bg-rose-50 border-rose-200" },
          { label: "Total Purchases", value: `Rs ${money(totals.purchases)}`, tone: "bg-emerald-50 border-emerald-200" },
        ].map((item) => (
          <Card key={item.label} className={cn("border", item.tone)}>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            placeholder="Search suppliers by name, code, or phone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-[220px] bg-white">
            <Filter className="h-4 w-4 mr-2 text-slate-500" />
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            <SelectItem value="due">Due / Partial</SelectItem>
            <SelectItem value="paid">Fully Paid</SelectItem>
            <SelectItem value="partial">Partial Payment</SelectItem>
            <SelectItem value="advance">Advance Paid</SelectItem>
            <SelectItem value="volume">High Purchase Volume</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">{error}</div>
      )}

      {loading ? (
        <PageLoader message="Loading suppliers..." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No suppliers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const badge = statusMeta(s.paymentStatus);
            const contact = s.mobile_number || s.phone_number || "—";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onViewSupplier?.(s.id)}
                className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-sky-200 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 truncate group-hover:text-sky-700">
                        {s.name}
                      </h3>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Code: {s.code}</p>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => openEdit(s, e)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => toggleStatus(s.id, e)}>
                      {s.status === "active" ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-rose-500" />
                      )}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={(e) => openDelete(s, e)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{contact}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" /> Purchases
                      </p>
                      <p className="font-semibold text-slate-900 tabular-nums">Rs {money(s.totalPurchases)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> Paid
                      </p>
                      <p className="font-semibold text-emerald-700 tabular-nums">Rs {money(s.totalPaid)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2.5">
                      <p className="text-[10px] uppercase text-amber-700">Outstanding</p>
                      <p className="font-semibold text-amber-800 tabular-nums">
                        Rs {money(Math.max(0, s.outstanding_balance))}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Last Purchase
                      </p>
                      <p className="font-medium text-slate-800 text-xs">
                        {s.lastPurchaseDate
                          ? format(new Date(s.lastPurchaseDate), "dd MMM yyyy")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen || editOpen} onOpenChange={() => { setAddOpen(false); setEditOpen(false); setNameError(""); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{current ? "Edit Supplier" : "Create Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Name", key: "name", required: true },
              { label: "Phone", key: "phone_number" },
              { label: "Fax", key: "fax_number" },
              { label: "Mobile", key: "mobile_number" },
              { label: "Email", key: "email" },
              { label: "Country", key: "country" },
              { label: "City", key: "city" },
              { label: "NTN", key: "ntn" },
              { label: "STRN", key: "strn" },
              { label: "Gov ID", key: "gov_id" },
            ].map(({ label, key, required }) => (
              <div key={key}>
                <Label htmlFor={key}>{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
                <Input
                  id={key}
                  value={(form as any)[key] || ""}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, [key]: e.target.value }));
                    if (key === "name" && nameError) setNameError("");
                  }}
                  disabled={submitting}
                  className={key === "name" && nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {key === "name" && nameError && (
                  <p className="text-xs text-red-600 mt-1">{nameError}</p>
                )}
              </div>
            ))}
            <div className="flex items-center space-x-2">
              <input
                id="pos"
                type="checkbox"
                checked={form.display_on_pos}
                onChange={(e) => setForm((f) => ({ ...f, display_on_pos: e.target.checked }))}
                disabled={submitting}
              />
              <Label htmlFor="pos">Display on POS</Label>
            </div>
            <div className="col-span-full">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="col-span-full">
              <LoadingButton onClick={submit} loading={submitting} className="w-full" disabled={submitting}>
                {current ? "Update" : "Create"}
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete supplier?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-bold">{current?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Suppliers;
