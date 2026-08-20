'use client';

import React, { useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Edit, Trash2, Plus, CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CheckCircle2, XCircle, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Employee {
    id: string;
    name: string;
}

interface Salary {
    id: string;
    employee_id: string;
    employee: Employee;
    month: number;
    year: number;
    amount: number;
    is_paid?: boolean;
    paid_date?: string;
    notes?: string;
}

const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const SALARY_DIALOG_CLASS =
    "sm:max-w-2xl w-[calc(100vw-2rem)] max-h-[min(90vh,640px)] flex flex-col gap-0 p-0 overflow-hidden";

function SalaryFormFields({
    form,
    setForm,
    employees,
    idPrefix = "",
}: {
    form: Partial<Salary>;
    setForm: React.Dispatch<React.SetStateAction<Partial<Salary>>>;
    employees: Employee[];
    idPrefix?: string;
}) {
    const paidCheckboxId = `${idPrefix}is_paid`;

    const handlePaidToggle = (checked: boolean) => {
        setForm((f) => ({
            ...f,
            is_paid: checked,
            paid_date: checked
                ? f.paid_date || new Date().toISOString()
                : undefined,
        }));
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${idPrefix}employee`} className="text-sm">Employee</Label>
                <Select
                    value={form.employee_id || ""}
                    onValueChange={(val) => setForm((f) => ({ ...f, employee_id: val }))}
                >
                    <SelectTrigger id={`${idPrefix}employee`} className="h-9">
                        <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                        {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}month`} className="text-sm">Month</Label>
                <Select
                    value={form.month ? String(form.month) : ""}
                    onValueChange={(val) => setForm((f) => ({ ...f, month: Number(val) }))}
                >
                    <SelectTrigger id={`${idPrefix}month`} className="h-9">
                        <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map((m, idx) => (
                            <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}year`} className="text-sm">Year</Label>
                <Select
                    value={form.year ? String(form.year) : ""}
                    onValueChange={(val) => setForm((f) => ({ ...f, year: Number(val) }))}
                >
                    <SelectTrigger id={`${idPrefix}year`} className="h-9">
                        <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from(
                            { length: new Date().getFullYear() + 2 - 2020 + 1 },
                            (_, i) => 2020 + i
                        ).map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}amount`} className="text-sm">Amount (Rs)</Label>
                <Input
                    id={`${idPrefix}amount`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9"
                    value={form.amount ?? ""}
                    onChange={(e) =>
                        setForm((f) => ({
                            ...f,
                            amount: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                    }
                    placeholder="0"
                />
            </div>
            <div
                className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2",
                    form.is_paid ? "border-green-200 bg-green-50/80" : "border-border bg-muted/30"
                )}
            >
                <div className="min-w-0">
                    <Label htmlFor={paidCheckboxId} className="text-sm font-medium cursor-pointer">
                        Mark as paid
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {form.is_paid ? "Salary recorded as paid" : "Leave off if not paid yet"}
                    </p>
                </div>
                <Switch
                    id={paidCheckboxId}
                    checked={!!form.is_paid}
                    onCheckedChange={handlePaidToggle}
                    className="shrink-0"
                />
            </div>
            <div className={cn("space-y-1.5 sm:col-span-2", !form.is_paid && "opacity-50 pointer-events-none")}>
                <Label className="text-sm">Paid date</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!form.is_paid}
                            className={cn(
                                "w-full h-9 justify-start text-left font-normal",
                                !form.paid_date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            {form.paid_date
                                ? format(new Date(form.paid_date), "dd MMM yyyy")
                                : "Pick a date"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={form.paid_date ? new Date(form.paid_date) : undefined}
                            onSelect={(date) =>
                                setForm((f) => ({
                                    ...f,
                                    paid_date: date
                                        ? new Date(date.setHours(0, 0, 0, 0)).toISOString()
                                        : undefined,
                                }))
                            }
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${idPrefix}notes`} className="text-sm">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                    id={`${idPrefix}notes`}
                    className="h-9"
                    value={form.notes || ""}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                />
            </div>
        </div>
    );
}

export function Salaries() {
    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [form, setForm] = useState<Partial<Salary>>({});
    const [editId, setEditId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    
    // Fetch employees for dropdown
    useEffect(() => {
        apiClient.get("/employee", { params: { page: 1, limit: 500 } })
            .then(res => setEmployees(res.data.data))
            .catch(() => setEmployees([]));
    }, []);

    // Fetch salaries
    const fetchSalaries = async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.get("/salaries");
            setSalaries(res.data.data || []);
        } catch (e) {
            setSalaries([]);
        } finally {
            setIsLoading(false);
            setIsInitialLoading(false);
        }
    };
    useEffect(() => { fetchSalaries(); }, []);

    // Add salary
    const handleAddSalary = async () => {
        setIsSubmitting(true);
        setError(null);
        if (!form.year || form.year < 2020) {
            setError("Year must be 2020 or later");
            setIsSubmitting(false);
            return;
        }
        try {
            await apiClient.post("/salaries", {
                employee_id: form.employee_id,
                month: Number(form.month),
                year: Number(form.year),
                amount: Number(form.amount),
                is_paid: form.is_paid || false,
                paid_date: form.paid_date || undefined,
                notes: form.notes || undefined,
            });
            setIsDialogOpen(false);
            setForm({});
            fetchSalaries();
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to add salary");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Edit salary
    const handleEditSalary = async () => {
        if (!editId) return;
        setIsSubmitting(true);
        setError(null);
        if (!form.year || form.year < 2020) {
            setError("Year must be 2020 or later");
            setIsSubmitting(false);
            return;
        }
        try {
            await apiClient.put(`/salaries/${editId}`, {
                employee_id: form.employee_id,
                month: Number(form.month),
                year: Number(form.year),
                amount: Number(form.amount),
                is_paid: form.is_paid || false,
                paid_date: form.paid_date || undefined,
                notes: form.notes || undefined,
            });
            setIsEditDialogOpen(false);
            setForm({});
            setEditId(null);
            fetchSalaries();
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to update salary");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete salary
    const handleDeleteSalary = async () => {
        if (!deleteId) return;
        setIsLoading(true);
        try {
            await apiClient.delete(`/salaries/${deleteId}`);
            fetchSalaries();
        } catch (e) {
            // Optionally show error
        } finally {
            setIsLoading(false);
            setDeleteId(null);
        }
    };

    // Open edit dialog
    const openEditDialog = (salary: Salary) => {
        setEditId(salary.id);
        setForm({
            employee_id: salary.employee_id,
            month: salary.month,
            year: salary.year,
            amount: salary.amount,
            is_paid: salary.is_paid,
            paid_date: salary.paid_date ? salary.paid_date.slice(0, 10) : undefined,
            notes: salary.notes,
        });
        setIsEditDialogOpen(true);
    };

    // Stats calculations
    const totalSalaries = salaries.length;
    const totalPaid = salaries
        .filter(s => s.is_paid === true)
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const totalUnpaid = salaries
        .filter(s => !s.is_paid)
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    if (isInitialLoading) {
        return <PageLoader message="Loading salaries data..." />
    }

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6">
            {/* Header & Add Dialog */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Salary Management</h1>
                    <p className="text-sm md:text-base text-gray-600">Manage employee salary records</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" /> Add Salary
                        </Button>
                    </DialogTrigger>
                    <DialogContent className={SALARY_DIALOG_CLASS}>
                        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
                            <DialogTitle>Add Salary</DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
                            <SalaryFormFields form={form} setForm={setForm} employees={employees} />
                            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                        </div>
                        <DialogFooter className="shrink-0 px-6 py-4 border-t bg-background gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsDialogOpen(false);
                                    setForm({});
                                    setError(null);
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddSalary}
                                disabled={
                                    isSubmitting ||
                                    !form.employee_id ||
                                    !form.month ||
                                    !form.year ||
                                    form.amount == null ||
                                    Number.isNaN(Number(form.amount))
                                }
                            >
                                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                                Add Salary
                            </Button>
                        </DialogFooter>
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
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Salaries</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{totalSalaries}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Rs {totalPaid.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
                                <XCircle className="h-4 w-4 text-red-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">Rs {totalUnpaid.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Table with Loader */}
            <Card>
                <CardHeader>
                    <CardTitle>Salaries ({salaries.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <PageLoader message="Loading salaries..." />
                    ) : salaries.length === 0 ? (
                        <div className="text-center py-10">
                            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No salaries found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-4 md:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[150px]">Employee</TableHead>
                                            <TableHead className="min-w-[100px]">Month</TableHead>
                                            <TableHead className="min-w-[80px]">Year</TableHead>
                                            <TableHead className="min-w-[100px]">Amount</TableHead>
                                            <TableHead className="min-w-[100px]">Status</TableHead>
                                            <TableHead className="min-w-[120px]">Paid Date</TableHead>
                                            <TableHead className="min-w-[150px]">Notes</TableHead>
                                            <TableHead className="min-w-[120px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                            <TableBody>
                                {salaries.map(sal => (
                                    <TableRow key={sal.id}>
                                        <TableCell>{sal.employee?.name || "-"}</TableCell>
                                        <TableCell>{months[(sal.month || 1) - 1]}</TableCell>
                                        <TableCell>{sal.year}</TableCell>
                                        <TableCell>Rs {sal.amount}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={sal.is_paid ? "default" : "secondary"}
                                                className={sal.is_paid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                                            >
                                                {sal.is_paid ? "Paid" : "Unpaid"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{sal.paid_date ? sal.paid_date.split("T")[0] : "-"}</TableCell>
                                        <TableCell>{sal.notes || "-"}</TableCell>
                                        <TableCell>
                                            <div className="flex space-x-2">
                                                <Button size="sm" variant="outline" onClick={() => openEditDialog(sal)}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(sal.id)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure you want to delete this salary record?</AlertDialogTitle>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDeleteSalary}>Yes, Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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

            {/* Edit Salary Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className={SALARY_DIALOG_CLASS}>
                    <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
                        <DialogTitle>Edit Salary</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
                        <SalaryFormFields
                            form={form}
                            setForm={setForm}
                            employees={employees}
                            idPrefix="edit-"
                        />
                        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                    </div>
                    <DialogFooter className="shrink-0 px-6 py-4 border-t bg-background gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setIsEditDialogOpen(false);
                                setForm({});
                                setEditId(null);
                                setError(null);
                            }}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleEditSalary}
                            disabled={
                                isSubmitting ||
                                !form.employee_id ||
                                !form.month ||
                                !form.year ||
                                form.amount == null ||
                                Number.isNaN(Number(form.amount))
                            }
                        >
                            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                            Update Salary
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}