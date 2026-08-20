"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Plus,
  Edit,
  Building2,
  MapPin,
  Loader2,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import apiClient from "@/lib/apiClient"
import { PageLoader } from "@/components/ui/page-loader"


interface Branch {
  id: string
  name: string
  code: string
  address?: string
  branch_type?: "WAREHOUSE" | "BRANCH"
  allow_neg_pos_stock: boolean
  allow_neg_stock_grrn: boolean
  allow_neg_transferout: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface CreateBranchData {
  name: string
  address?: string
  branch_type?: "WAREHOUSE" | "BRANCH"
  allow_neg_pos_stock?: boolean
  allow_neg_stock_grrn?: boolean
  allow_neg_transferout?: boolean
  is_active?: boolean
}

interface BranchListResponse {
  data: Branch[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function Branches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalBranches, setTotalBranches] = useState(0)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [loading, setLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const [newBranch, setNewBranch] = useState<CreateBranchData>({
    name: "",
    address: "",
    branch_type: "BRANCH",
    allow_neg_pos_stock: false,
    allow_neg_stock_grrn: false,
    allow_neg_transferout: false,
    is_active: true,
  })

  // Fetch branches from API
  const fetchBranches = async (page = 1, search = "", isActive?: boolean) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "12",
      })

      if (search) params.append("search", search)
      if (isActive !== undefined) params.append("is_active", isActive.toString())

      const response = await apiClient.get(`/branches?${params}`)

      // Handle the actual API response structure
      const responseData = response.data

      if (responseData.success) {
        // Check if data has meta information or is just an array
        if (Array.isArray(responseData.data)) {
          // If data is just an array (no pagination info)
          setBranches(responseData.data)
          setTotalPages(1)
          setTotalBranches(responseData.data.length)
          setCurrentPage(1)
        } else if (responseData.data && responseData.data.data) {
          // If data has nested structure with meta
          setBranches(responseData.data.data || [])
          setTotalPages(responseData.data.meta?.totalPages || 1)
          setTotalBranches(responseData.data.meta?.total || 0)
          setCurrentPage(responseData.data.meta?.page || 1)
        } else {
          // Fallback
          setBranches([])
          setTotalPages(1)
          setTotalBranches(0)
          setCurrentPage(1)
        }
      } else {
        setBranches([])
        setTotalPages(1)
        setTotalBranches(0)
        setCurrentPage(1)
      }
    } catch (error: any) {
      console.log("Error fetching branches:", error)
      setBranches([])
      setTotalPages(1)
      setTotalBranches(0)
      setCurrentPage(1)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch branches",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Create branch
  const handleAddBranch = async () => {
    if (!newBranch.name.trim()) {
      toast({
        title: "Error",
        description: "Branch name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      const response = await apiClient.post("/branches", newBranch)

      if (response.data.success) {
        toast({
          title: "Success",
          description: "Branch created successfully",
        })

        // Refresh the list
        await fetchBranches(currentPage, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")

        setNewBranch({
          name: "",
          address: "",
          allow_neg_pos_stock: false,
          allow_neg_stock_grrn: false,
          allow_neg_transferout: false,
          is_active: true,
        })
        setIsAddDialogOpen(false)
      }
    } catch (error: any) {
      console.log("Error creating branch:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to create branch",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Update branch
  const handleEditBranch = async () => {
    if (!editingBranch) return

    try {
      setLoading(true)
      const updateData = {
        name: editingBranch.name,
        address: editingBranch.address,
        branch_type: editingBranch.branch_type || "BRANCH",
        allow_neg_pos_stock: editingBranch.allow_neg_pos_stock,
        allow_neg_stock_grrn: editingBranch.allow_neg_stock_grrn,
        allow_neg_transferout: editingBranch.allow_neg_transferout,
        is_active: editingBranch.is_active,
      }

      const response = await apiClient.patch(`/branches/${editingBranch.id}`, updateData)

      if (response.data.success) {
        toast({
          title: "Success",
          description: "Branch updated successfully",
        })

        // Update the branch in the list
        setBranches(branches.map((b) => (b.id === editingBranch.id ? response.data.data : b)))
        setEditingBranch(null)
      }
    } catch (error: any) {
      console.log("Error updating branch:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update branch",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Toggle branch status
  const handleToggleStatus = async (id: string) => {
    try {
      setLoading(true)
      const response = await apiClient.patch(`/branches/${id}/status`)

      if (response.data.success) {
        toast({
          title: "Success",
          description: "Branch status updated successfully",
        })

        // Since API returns data: null, manually toggle the status locally
        setBranches(branches.map((b) => (b.id === id ? { ...b, is_active: !b.is_active } : b)))
      }
    } catch (error: any) {
      console.log("Error toggling branch status:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update branch status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
    fetchBranches(1, value, statusFilter === "all" ? undefined : statusFilter === "active")
  }

  // Handle status filter
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
    fetchBranches(1, searchTerm, value === "all" ? undefined : value === "active")
  }

  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchBranches(page, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")
  }

  // Handle edit dialog open
  const handleEditDialogOpen = (branch: Branch) => {
    setEditingBranch({ ...branch })
  }

  // Handle edit dialog close
  const handleEditDialogClose = () => {
    setEditingBranch(null)
  }

  useEffect(() => {
    fetchBranches()
  }, [])

  const activeBranches = branches?.filter((b) => b.is_active).length || 0
  const inactiveBranches = branches?.filter((b) => !b.is_active).length || 0

  if (isLoading) {
    return <PageLoader message="Loading branches..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Branch Management</h1>
          <p className="text-sm md:text-base text-gray-600">Manage your store locations and branches</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Branch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Branch Name *</Label>
                <Input
                  id="name"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="Enter branch name"
                />
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={newBranch.address || ""}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                  placeholder="Enter branch address"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newBranch.branch_type || "BRANCH"}
                  onValueChange={(v: "WAREHOUSE" | "BRANCH") =>
                    setNewBranch({ ...newBranch, branch_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRANCH">Branch</SelectItem>
                    <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Stock Management Settings</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow_neg_pos_stock"
                      checked={newBranch.allow_neg_pos_stock || false}
                      onCheckedChange={(checked) =>
                        setNewBranch({ ...newBranch, allow_neg_pos_stock: checked as boolean })
                      }
                    />
                    <Label htmlFor="allow_neg_pos_stock" className="text-sm">
                      Allow Negative POS Stock
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow_neg_stock_grrn"
                      checked={newBranch.allow_neg_stock_grrn || false}
                      onCheckedChange={(checked) =>
                        setNewBranch({ ...newBranch, allow_neg_stock_grrn: checked as boolean })
                      }
                    />
                    <Label htmlFor="allow_neg_stock_grrn" className="text-sm">
                      Allow Negative Stock GRRN
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow_neg_transferout"
                      checked={newBranch.allow_neg_transferout || false}
                      onCheckedChange={(checked) =>
                        setNewBranch({ ...newBranch, allow_neg_transferout: checked as boolean })
                      }
                    />
                    <Label htmlFor="allow_neg_transferout" className="text-sm">
                      Allow Negative Transfer Out
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={newBranch.is_active !== false}
                  onCheckedChange={(checked) => setNewBranch({ ...newBranch, is_active: checked as boolean })}
                />
                <Label htmlFor="is_active" className="text-sm">
                  Active Branch
                </Label>
              </div>

              <Button onClick={handleAddBranch} className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Add Branch"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Branches</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Branches</CardTitle>
            <Building2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Branches</CardTitle>
            <Building2 className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inactiveBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Page</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentPage} / {totalPages}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search branches by name or code..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {branches.map((branch) => (
          <Card key={branch.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{branch.name}</CardTitle>
                    <p className="text-sm text-gray-500">Code: {branch.code}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={branch.is_active ? "default" : "secondary"}
                    className={branch.is_active ? "bg-green-100 text-green-800" : ""}
                  >
                    {branch.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(branch.id)} disabled={loading}>
                    {branch.is_active ? (
                      <ToggleRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {branch.address && (
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <p className="text-sm text-gray-600">{branch.address}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Stock Settings:</p>
                  <div className="flex flex-wrap gap-1">
                    {branch.allow_neg_pos_stock && (
                      <Badge variant="outline" className="text-xs">
                        Neg POS Stock
                      </Badge>
                    )}
                    {branch.allow_neg_stock_grrn && (
                      <Badge variant="outline" className="text-xs">
                        Neg GRRN Stock
                      </Badge>
                    )}
                    {branch.allow_neg_transferout && (
                      <Badge variant="outline" className="text-xs">
                        Neg Transfer Out
                      </Badge>
                    )}
                    {!branch.allow_neg_pos_stock && !branch.allow_neg_stock_grrn && !branch.allow_neg_transferout && (
                      <Badge variant="outline" className="text-xs text-gray-500">
                        No Negative Stock
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-500">Created: {new Date(branch.created_at).toLocaleDateString()}</div>
              </div>

              <div className="flex items-center justify-end mt-4 space-x-2">
                <Button size="sm" variant="outline" onClick={() => handleEditDialogOpen(branch)}>
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(page)}
                  disabled={loading}
                >
                  {page}
                </Button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit Branch Dialog */}
      <Dialog open={!!editingBranch} onOpenChange={handleEditDialogClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
          </DialogHeader>
          {editingBranch && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Branch Name *</Label>
                <Input
                  id="edit-name"
                  value={editingBranch.name}
                  onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="edit-code">Branch Code</Label>
                <Input id="edit-code" value={editingBranch.code} disabled className="bg-gray-100" />
                <p className="text-xs text-gray-500 mt-1">Branch code is auto-generated and cannot be changed</p>
              </div>

              <div>
                <Label htmlFor="edit-address">Address</Label>
                <Textarea
                  id="edit-address"
                  value={editingBranch.address || ""}
                  onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editingBranch.branch_type || "BRANCH"}
                  onValueChange={(v: "WAREHOUSE" | "BRANCH") =>
                    setEditingBranch({ ...editingBranch, branch_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRANCH">Branch</SelectItem>
                    <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Stock Management Settings</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-allow_neg_pos_stock"
                      checked={editingBranch.allow_neg_pos_stock}
                      onCheckedChange={(checked) =>
                        setEditingBranch({ ...editingBranch, allow_neg_pos_stock: checked as boolean })
                      }
                    />
                    <Label htmlFor="edit-allow_neg_pos_stock" className="text-sm">
                      Allow Negative POS Stock
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-allow_neg_stock_grrn"
                      checked={editingBranch.allow_neg_stock_grrn}
                      onCheckedChange={(checked) =>
                        setEditingBranch({ ...editingBranch, allow_neg_stock_grrn: checked as boolean })
                      }
                    />
                    <Label htmlFor="edit-allow_neg_stock_grrn" className="text-sm">
                      Allow Negative Stock GRRN
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-allow_neg_transferout"
                      checked={editingBranch.allow_neg_transferout}
                      onCheckedChange={(checked) =>
                        setEditingBranch({ ...editingBranch, allow_neg_transferout: checked as boolean })
                      }
                    />
                    <Label htmlFor="edit-allow_neg_transferout" className="text-sm">
                      Allow Negative Transfer Out
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-is_active"
                  checked={editingBranch.is_active}
                  onCheckedChange={(checked) => setEditingBranch({ ...editingBranch, is_active: checked as boolean })}
                />
                <Label htmlFor="edit-is_active" className="text-sm">
                  Active Branch
                </Label>
              </div>

              <Button onClick={handleEditBranch} className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Branch"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
