"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Users,
  Phone,
  Mail,
  Loader2,
  DollarSign,
  UserCheck,
  FileText,
  ArrowUpCircle,
  LayoutGrid,
  List,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { offlineDB } from "@/lib/offline-db";
import { queueMutation } from "@/lib/offline-helpers";
import {
  fetchCustomersForManagementTab,
  refreshCustomerListGlobally,
  upsertCustomerInStore,
} from "@/lib/customer-list-sync";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { cn } from "@/lib/utils";

type CustomerViewMode = "cards" | "table";

const CUSTOMER_VIEW_KEY = "customers-view-mode";

function formatBalance(amount: number | string | undefined) {
  return Number(amount || 0).toLocaleString();
}

function balanceClass(amount: number | string | undefined) {
  return Number(amount || 0) > 0 ? "text-red-600" : "text-green-600";
}

interface Customer {
  id: string;
  name: string | null;
  email: string;
  phone_number: string | null;
  address: string | null;
  is_active: boolean;
  outstanding_balance: number | string;
  credit_limit: number | string;
  created_at: string;
}

interface CustomersProps {
  onViewLedger: (customerId: string) => void;
}

export function Customers({ onViewLedger }: CustomersProps) {
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer & { billing_address?: string }>>({});
  const [editingCustomer, setEditingCustomer] = useState<(Customer & { billing_address?: string }) | null>(null);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [creditSummary, setCreditSummary] = useState({ totalOutstanding: 0, totalPayable: 0 });
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [viewMode, setViewMode] = useState<CustomerViewMode>("cards");

  useEffect(() => {
    const saved = localStorage.getItem(CUSTOMER_VIEW_KEY);
    if (saved === "cards" || saved === "table") {
      setViewMode(saved);
    }
  }, []);

  const setCustomerViewMode = (mode: CustomerViewMode) => {
    setViewMode(mode);
    localStorage.setItem(CUSTOMER_VIEW_KEY, mode);
  };
  // 1) Fetch customers — shared with New Sale via global store + cache invalidation
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      if (!navigator.onLine) {
        const cached = await offlineDB.getCustomers();
        if (cached.length > 0) {
          const list = cached.map((c) => c.data as Customer);
          setCustomers(list);
          return;
        }
      }
      const data = await fetchCustomersForManagementTab();
      setCustomers(data);
    } catch (err: any) {
      console.log(err);
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCreditSummary = async () => {
    if (!navigator.onLine) return; // skip when offline — cached value stays
    setIsSummaryLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/customer-ledger/summary`);
      setCreditSummary({
        totalOutstanding: res.data.data?.totalOutstanding || 0,
        totalPayable: res.data.data?.totalPayable || 0,
      });
    } catch (err) {
      console.error("Summary fetch error:", err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsInitialLoading(true);
      try {
        await Promise.all([fetchCustomers(), fetchCreditSummary()]);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, []);

  const buildCustomerPayload = (data: Partial<Customer & { billing_address?: string }>, includeBalance = true) => {
    const name = data.name?.trim() || "";
    const phone_number = data.phone_number?.trim() || "";
    return {
      name,
      phone_number,
      ...(data.email?.trim() && { email: data.email.trim().toLowerCase() }),
      ...(data.address?.trim() && { address: data.address.trim() }),
      ...((data as { billing_address?: string }).billing_address?.trim() && {
        billing_address: (data as { billing_address?: string }).billing_address!.trim(),
      }),
      credit_limit: data.credit_limit ? Number(data.credit_limit) : 0,
      ...(includeBalance && {
        outstanding_balance:
          data.outstanding_balance !== undefined &&
          data.outstanding_balance !== null &&
          String(data.outstanding_balance).trim() !== ""
            ? Math.max(0, Number(data.outstanding_balance))
            : 0,
      }),
    };
  };

  const canSubmitCustomer = (data: Partial<Customer & { billing_address?: string }>) =>
    Boolean(data.name?.trim() && data.phone_number?.trim());

  // 2) Create customer
  const handleAddCustomer = async () => {
    if (!canSubmitCustomer(newCustomer)) {
      toast({
        title: "Required fields",
        description: "Name and phone number are required.",
        variant: "destructive",
      });
      return;
    }
    setIsAdding(true);
    try {
      const payload = buildCustomerPayload(newCustomer);
      const { queued, data } = await queueMutation<Customer>('POST', '/customer', payload, 'customer');
      setNewCustomer({});
      setIsAddDialogOpen(false);
      if (queued) {
        toast({ title: "Saved Offline", description: "Customer will sync when connected." });
      } else {
        if (data?.id) upsertCustomerInStore(data);
        await refreshCustomerListGlobally();
        setCustomers(useStore.getState().customers);
        toast({ title: "Success", description: "Customer created successfully." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to create customer", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  // Edit customer
  const handleEditCustomer = async () => {
    if (!editingCustomer) return;
    if (!canSubmitCustomer(editingCustomer)) {
      toast({
        title: "Required fields",
        description: "Name and phone number are required.",
        variant: "destructive",
      });
      return;
    }
    setIsEditing(true);
    try {
      const payload = buildCustomerPayload(editingCustomer, false);
      const { queued } = await queueMutation('PUT', `/customer/${editingCustomer.id}`, payload, 'customer');
      setEditingCustomer(null);
      if (queued) {
        // Optimistic local update
        setCustomers((prev) => prev.map((c) => c.id === editingCustomer.id ? { ...c, ...payload } : c));
        toast({ title: "Saved Offline", description: "Customer update will sync when connected." });
      } else {
        await refreshCustomerListGlobally();
        setCustomers(useStore.getState().customers);
        toast({ title: "Success", description: "Customer updated successfully." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to update customer", variant: "destructive" });
    } finally {
      setIsEditing(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async () => {
    if (!deleteTargetCustomer) return;
    setIsDeletingCustomer(true);
    try {
      const { queued } = await queueMutation('DELETE', `/customer/${deleteTargetCustomer.id}`, undefined, 'customer');
      if (queued) {
        // Optimistic local removal
        setCustomers((prev) => prev.filter((c) => c.id !== deleteTargetCustomer.id));
        toast({ title: "Deleted Offline", description: "Deletion will sync when connected." });
      } else {
        await refreshCustomerListGlobally();
        setCustomers(useStore.getState().customers);
        toast({ title: "Success", description: "Customer deleted successfully." });
      }
      setDeleteTargetCustomer(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to delete customer", variant: "destructive" });
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // Stats (total, active, revenue — revenue = 0 since API doesn't return it)
  const activeCount = customers.filter((c) => c.is_active).length;
  const totalRevenue = 0;

  // Filter by name/email/phone
  const filteredCustomers = customers.filter((customer) =>
    (customer.name || customer.email || customer.phone_number || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  if (isInitialLoading) {
    return <PageLoader message="Loading customers data..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header & Add Dialog */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Customer Management
          </h1>
          <p className="text-sm md:text-base text-gray-600">Manage your customer database</p>
        </div>
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={newCustomer.name || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="phone_number">Phone Number *</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={newCustomer.phone_number || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="email">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomer.email || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      email: e.target.value,
                    })
                  }
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <Label htmlFor="address">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="address"
                  type="text"
                  value={newCustomer.address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="billing_address">
                  Billing Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="billing_address"
                  type="text"
                  value={newCustomer.billing_address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="credit_limit">
                    Credit limit (Rs){" "}
                    <span className="text-gray-400 font-normal">(empty = unlimited)</span>
                  </Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCustomer.credit_limit || ""}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        credit_limit: e.target.value,
                      })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="previous_balance">
                    Previous credit balance (Rs){" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="previous_balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      newCustomer.outstanding_balance !== undefined &&
                      newCustomer.outstanding_balance !== null
                        ? String(newCustomer.outstanding_balance)
                        : ""
                    }
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        outstanding_balance: e.target.value,
                      })
                    }
                    placeholder="Amount owed before POS"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use for existing customers who already owed you money before using this software.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleAddCustomer}
                className="w-full"
                disabled={isAdding || !canSubmitCustomer(newCustomer)}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating Customer...
                  </>
                ) : (
                  "Create Customer"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="bg-slate-900 border-slate-800 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Total Market Credit
                </CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-white">
                  Rs {creditSummary.totalOutstanding.toLocaleString()}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold italic tracking-tighter">Sum of all outstanding receivables</p>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-600">
                  Customer Collections
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-emerald-700">
                   {customers.length}
                </div>
                <p className="text-[10px] text-emerald-500 mt-1 uppercase font-bold italic tracking-tighter">Active wholesale profiles</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Active Reach
                </CardTitle>
                <UserCheck className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-blue-700">
                  {activeCount}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold italic tracking-tighter">Network utilization index</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Customer list */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
          <div className="flex items-center rounded-lg border bg-muted/40 p-1 self-start sm:self-auto">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3"
              onClick={() => setCustomerViewMode("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              className="h-8 gap-1.5 px-3"
              onClick={() => setCustomerViewMode("table")}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoader message="Loading customers..." />
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No customers found</p>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewLedger(customer.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onViewLedger(customer.id);
                    }
                  }}
                  className={cn(
                    "group relative flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
                    "cursor-pointer transition-all hover:border-indigo-300 hover:shadow-md hover:ring-1 hover:ring-indigo-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">
                        {customer.name || customer.email || "Unnamed"}
                      </p>
                      {customer.email && customer.name && (
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          {customer.email}
                        </p>
                      )}
                      {customer.phone_number && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {customer.phone_number}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="status"
                      className={cn(
                        "shrink-0",
                        customer.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800",
                      )}
                    >
                      {customer.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Balance</p>
                      <p className={cn("font-bold tabular-nums", balanceClass(customer.outstanding_balance))}>
                        Rs {formatBalance(customer.outstanding_balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Limit</p>
                      <p className="font-medium text-slate-700 tabular-nums">
                        Rs {formatBalance(customer.credit_limit)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wider mb-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to open ledger
                  </p>

                  <div
                    className="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 h-8 font-semibold text-[10px] uppercase tracking-wider gap-1.5"
                      onClick={() => onViewLedger(customer.id)}
                    >
                      <FileText className="h-3 w-3" /> Ledger
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => setEditingCustomer(customer)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      onClick={() => setDeleteTargetCustomer(customer)}
                      disabled={isDeletingCustomer}
                    >
                      {isDeletingCustomer && deleteTargetCustomer?.id === customer.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Contact</TableHead>
                      <TableHead className="min-w-[120px]">Balance</TableHead>
                      <TableHead className="min-w-[120px]">Limit</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-indigo-50/50"
                    onClick={() => onViewLedger(customer.id)}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center text-sm">
                          <Mail className="h-3 w-3 mr-1" />
                          {customer.email}
                        </div>
                        {customer.name && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Users className="h-3 w-3 mr-1" />
                            {customer.name}
                          </div>
                        )}
                        {customer.phone_number && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Phone className="h-3 w-3 mr-1" />
                            {customer.phone_number}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("font-bold", balanceClass(customer.outstanding_balance))}>
                        Rs {formatBalance(customer.outstanding_balance)}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600 font-medium whitespace-nowrap">
                      Rs {formatBalance(customer.credit_limit)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="status"
                        className={
                          customer.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }
                      >
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 h-8 px-2 font-black text-[10px] uppercase tracking-wider gap-2 rounded-lg border border-indigo-100"
                          onClick={() => onViewLedger(customer.id)}
                        >
                          <FileText className="h-3 w-3" /> Ledger
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingCustomer(customer)
                          }
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTargetCustomer(customer)}
                          disabled={isDeletingCustomer}
                          className="text-red-600 hover:text-red-700"
                        >
                          {isDeletingCustomer && deleteTargetCustomer?.id === customer.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingCustomer}
        onOpenChange={() => setEditingCustomer(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editingCustomer.name || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingCustomer.phone_number || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="edit-email">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingCustomer.email || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      email: e.target.value,
                    })
                  }
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <Label htmlFor="edit-address">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-address"
                  type="text"
                  value={editingCustomer.address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="edit-billing-address">
                  Billing Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-billing-address"
                  type="text"
                  value={editingCustomer.billing_address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-credit-limit">
                    Credit limit (Rs){" "}
                    <span className="text-gray-400 font-normal">(empty = unlimited)</span>
                  </Label>
                  <Input
                    id="edit-credit-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingCustomer.credit_limit || ""}
                    onChange={(e) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        credit_limit: e.target.value,
                      })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-outstanding-balance">
                    Credit balance{" "}
                    <span className="text-gray-400 font-normal">(amount owed)</span>
                  </Label>
                  <Input
                    id="edit-outstanding-balance"
                    type="text"
                    readOnly
                    value={Number(editingCustomer.outstanding_balance || 0).toLocaleString()}
                    className="bg-slate-50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Balance is managed through Customer Ledger. Use Receive Payment or opening balance entries there.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleEditCustomer}
                className="w-full"
                disabled={isEditing || !canSubmitCustomer(editingCustomer)}
              >
                {isEditing ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Updating Customer...
                  </>
                ) : (
                  "Update Customer"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTargetCustomer}
        onOpenChange={(open) => {
          if (!open && !isDeletingCustomer) {
            setDeleteTargetCustomer(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTargetCustomer?.name || deleteTargetCustomer?.email || "this customer"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomer}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCustomer();
              }}
              disabled={isDeletingCustomer}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingCustomer ? (
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
    </div>
  );
}
