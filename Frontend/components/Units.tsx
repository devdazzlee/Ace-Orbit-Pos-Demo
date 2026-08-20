"use client";

import React, { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Loader2, Edit, Eye, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PageLoader } from "@/components/ui/page-loader";
import { API_BASE } from "@/config/constants";



interface Unit {
  id: string;
  code: string;
  name: string;
  product_count: number;
  created_at: string;
}

const Units: React.FC = () => {
  const { toast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [current, setCurrent] = useState<Unit | null>(null);
  const [formName, setFormName] = useState("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async (q: string = search) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get(`${API_BASE}/units`, { params: { search: q } });
      setUnits(res.data.data);
    } catch (err: any) {
      setError("Failed to load units");
      toast({
        title: "Error",
        description: err?.response?.data?.message || err?.message || "Failed to load units",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    fetchUnits(v);
  };

  const openAdd = () => {
    setFormName("");
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (u: Unit) => {
    setCurrent(u);
    setFormName(u.name);
    setEditOpen(true);
  };

  const openDetail = (u: Unit) => {
    setCurrent(u);
    setDetailOpen(true);
  };

  const openDelete = (u: Unit) => {
    setUnitToDelete(u);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!unitToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`${API_BASE}/units/${unitToDelete.id}`);
      toast({ title: "Deleted", description: `Unit "${unitToDelete.name}" has been deleted.` });
      setDeleteOpen(false);
      setUnitToDelete(null);
      fetchUnits();
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.message || "Failed to delete unit", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const submit = async () => {
    if (!formName.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = { name: formName };
      if (current) {
        await apiClient.patch(`${API_BASE}/units/${current.id}`, payload);
        setEditOpen(false);
        toast({
          title: "Success",
          description: "Unit updated successfully",
        });
      } else {
        await apiClient.post(`${API_BASE}/units`, payload);
        setAddOpen(false);
        toast({
          title: "Success",
          description: "Unit created successfully",
        });
      }
      fetchUnits();
    } catch (err: any) {
      setError("Submission failed");
      toast({
        title: "Error",
        description: err?.response?.data?.message || err?.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = units.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.code.includes(search)
  );

  if (isInitialLoading) {
    return <PageLoader message="Loading units..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Units</h1>
          <p className="text-sm md:text-base text-gray-600">Create & manage product units</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New Unit
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search by name or code"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
          {error}
        </div>
      )}

      {/* Units Table */}
      <Card>
        <CardHeader><CardTitle>List of Units</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading units..." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-600">No units found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Code</TableHead>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[100px]">Products</TableHead>
                      <TableHead className="min-w-[120px]">Created</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id} className="hover:bg-gray-50">
                    <TableCell>{u.code}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.product_count}</TableCell>
                    <TableCell>{u.created_at.split('T')[0]}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openDetail(u)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}><Edit className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200" onClick={() => openDelete(u)}><Trash2 className="h-4 w-4" /></Button>
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

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen || editOpen} onOpenChange={() => { setAddOpen(false); setEditOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{current ? 'Edit Unit' : 'Create Unit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="unit-name">Name</Label>
              <Input
                id="unit-name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Enter unit name"
                className={formName.trim() === "" ? "border-red-500" : ""}
                disabled={submitting}
              />
              {formName.trim() === "" && (
                <p className="text-xs text-red-600 mt-1">Name is required</p>
              )}
            </div>
            <LoadingButton onClick={submit} loading={submitting} className="w-full">
              {current ? 'Update' : 'Create'}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={() => setDetailOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Unit Details</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-2">
              <p><strong>Code:</strong> {current.code}</p>
              <p><strong>Name:</strong> {current.name}</p>
              <p><strong>Products:</strong> {current.product_count}</p>
              <p><strong>Created:</strong> {current.created_at.split('T')[0]}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) { setDeleteOpen(open); if (!open) setUnitToDelete(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the unit <span className="font-semibold text-gray-900">"{unitToDelete?.name}"</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : <><Trash2 className="h-4 w-4 mr-2" /> Delete</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Units;
