"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Grid3X3,
  Package,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Upload,
  X,
  ImageIcon,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { PageLoader } from "@/components/ui/page-loader"
import apiClient from "@/lib/apiClient"

// Image compression utility
const compressImage = (file: File, quality = 0.7, maxWidth = 800, maxHeight = 600): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            reject(new Error("Canvas to Blob conversion failed"))
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => reject(new Error("Image load failed"))
    img.src = URL.createObjectURL(file)
  })
}

interface Category {
  id: string
  name: string
  slug: string
  description?: string
  display_on_branches?: string[]
  image?: string
  get_tax_from_item?: boolean
  editable_sale_rate?: boolean
  display_on_pos?: boolean
  branch_id?: string
  productCount?: number
  color?: string
  status?: "active" | "inactive"
  createdDate?: string
}

interface CreateCategoryData {
  name: string
  slug: string
  display_on_branches?: string[]
  image?: string
  get_tax_from_item?: boolean
  editable_sale_rate?: boolean
  display_on_pos?: boolean
  branch_id?: string
}

interface Branch {
  id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [selectedCategoryForProducts, setSelectedCategoryForProducts] = useState<Category | null>(null)
  const [categoryProducts, setCategoryProducts] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [newCategory, setNewCategory] = useState<CreateCategoryData>({
    name: "",
    slug: "",
    display_on_branches: [],
    image: "",
    get_tax_from_item: false,
    editable_sale_rate: false,
    display_on_pos: true,
    branch_id: "",
  })

  // Generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  }

  // Handle image file selection for new category with compression
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 5MB",
        variant: "destructive",
      })
      return
    }

    try {
      // Compress the image
      const compressedFile = await compressImage(file, 0.7, 800, 600)

      // Convert to base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64String = e.target?.result as string
        setImagePreview(base64String)
        setNewCategory({ ...newCategory, image: base64String })
      }
      reader.readAsDataURL(compressedFile)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process image",
        variant: "destructive",
      })
    }
  }

  // Handle image file selection for edit category with compression
  const handleEditImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !editingCategory) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 5MB",
        variant: "destructive",
      })
      return
    }

    try {
      // Compress the image
      const compressedFile = await compressImage(file, 0.7, 800, 600)

      // Convert to base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64String = e.target?.result as string
        setEditImagePreview(base64String)
        setEditingCategory({ ...editingCategory, image: base64String })
      }
      reader.readAsDataURL(compressedFile)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process image",
        variant: "destructive",
      })
    }
  }

  // Remove image for new category
  const handleRemoveImage = () => {
    setImagePreview(null)
    setNewCategory({ ...newCategory, image: "" })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Remove image for edit category
  const handleRemoveEditImage = () => {
    if (!editingCategory) return
    setEditImagePreview(null)
    setEditingCategory({ ...editingCategory, image: "" })
    if (editFileInputRef.current) {
      editFileInputRef.current.value = ""
    }
  }

  // Fetch branches from API
  const fetchBranches = async () => {
    try {
      setBranchesLoading(true)
      const response = await apiClient.get("/branches?is_active=true&fetch_all=true")
      setBranches(response.data.data || [])
    } catch (error: any) {
      console.log("Error fetching branches:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch branches",
        variant: "destructive",
      })
    } finally {
      setBranchesLoading(false)
    }
  }

  // Fetch categories from API with product counts
  const fetchCategories = async () => {
    try {
      setIsLoading(true)
      // Check if user is ADMIN - admins should see all categories
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      const params: any = {
        fetch_all: true,
      };
      
      const response = await apiClient.get("/categories", { params })
      const categoriesData = response.data.data || []
      
      // Fetch product counts for each category
      const categoriesWithCounts = await Promise.all(
        categoriesData.map(async (category: Category) => {
          try {
            // Check if user is ADMIN - admins should see all products
            const userRole = localStorage.getItem("role");
            const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
            
            const params: any = {
              category_id: category.id,
              fetch_all: true,
            };
            
            // Don't filter by branch_id for admin users
            if (!isAdmin) {
              const branchStr = localStorage.getItem("branch");
              if (branchStr && branchStr !== "Not Found") {
                try {
                  const branchObj = JSON.parse(branchStr);
                  params.branch_id = branchObj.id || branchStr;
                } catch (e) {
                  params.branch_id = branchStr;
                }
              }
            }
            
            const productsResponse = await apiClient.get("/products", { params });
            const products = productsResponse.data?.data || [];
            return {
              ...category,
              productCount: Array.isArray(products) ? products.length : 0,
            };
          } catch (error) {
            console.error(`Error fetching products for category ${category.id}:`, error);
            return {
              ...category,
              productCount: 0,
            };
          }
        })
      );
      
      setCategories(categoriesWithCounts);
    } catch (error: any) {
      console.log("Error fetching categories:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch categories",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch products for a specific category
  const fetchCategoryProducts = async (categoryId: string) => {
    try {
      setLoadingProducts(true);
      // Check if user is ADMIN - admins should see all products
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      const params: any = {
        category_id: categoryId,
        fetch_all: true,
      };
      
      // Don't filter by branch_id for admin users
      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch");
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr);
            params.branch_id = branchObj.id || branchStr;
          } catch (e) {
            params.branch_id = branchStr;
          }
        }
      }
      
      const response = await apiClient.get("/products", { params });
      const products = response.data?.data || [];
      setCategoryProducts(Array.isArray(products) ? products : []);
    } catch (error: any) {
      console.error("Error fetching category products:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch products",
        variant: "destructive",
      });
      setCategoryProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  // Handle category card click to show products
  const handleCategoryClick = (category: Category) => {
    setSelectedCategoryForProducts(category);
    fetchCategoryProducts(category.id);
  }

  // Create category
  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      const categoryData = {
        ...newCategory,
        slug: newCategory.slug || generateSlug(newCategory.name),
      }

      const response = await apiClient.post("/categories", categoryData)

      toast({
        title: "Success",
        description: "Category created successfully",
      })

      setCategories([...categories, response.data.data])
      setNewCategory({
        name: "",
        slug: "",
        display_on_branches: [],
        image: "",
        get_tax_from_item: false,
        editable_sale_rate: false,
        display_on_pos: true,
        branch_id: "",
      })
      setImagePreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setIsAddDialogOpen(false)
    } catch (error: any) {
      console.log("Error creating category:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to create category",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Update category
  const handleEditCategory = async () => {
    if (!editingCategory) return

    try {
      setLoading(true)
      const response = await apiClient.patch(`/categories/${editingCategory.id}`, {
        name: editingCategory.name,
        slug: editingCategory.slug,
        display_on_branches: editingCategory.display_on_branches,
        image: editingCategory.image,
        get_tax_from_item: editingCategory.get_tax_from_item,
        editable_sale_rate: editingCategory.editable_sale_rate,
        display_on_pos: editingCategory.display_on_pos,
        branch_id: editingCategory.branch_id,
      })

      toast({
        title: "Success",
        description: "Category updated successfully",
      })

      setCategories(categories.map((c) => (c.id === editingCategory.id ? response.data.data : c)))
      setEditingCategory(null)
      setEditImagePreview(null)
    } catch (error: any) {
      console.log("Error updating category:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update category",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Toggle category status
  const handleToggleStatus = async (id: string) => {
    try {
      setLoading(true)
      const response = await apiClient.patch(`/categories/${id}/toggle-status`)

      toast({
        title: "Success",
        description: "Category status updated successfully",
      })

      // Since API returns data: null, manually toggle the status locally
      setCategories(
        categories.map((c) => (c.id === id ? { ...c, status: c.status === "active" ? "inactive" : "active" } : c)),
      )
    } catch (error: any) {
      console.log("Error toggling category status:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update category status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Open delete confirmation modal
  const openDeleteDialog = (category: Category) => {
    setCategoryToDelete(category)
    setDeleteOpen(true)
  }

  // Delete category
  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return
    setDeleting(true)
    try {
      await apiClient.delete(`/categories/${categoryToDelete.id}`)
      toast({
        title: "Success",
        description: `Category "${categoryToDelete.name}" deleted successfully`,
      })
      setCategories(categories.filter((c) => c.id !== categoryToDelete.id))
      setDeleteOpen(false)
      setCategoryToDelete(null)
    } catch (error: any) {
      console.log("Error deleting category:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete category",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  // Handle branch selection for display_on_branches
  const handleBranchToggle = (branchId: string, checked: boolean) => {
    const currentBranches = newCategory.display_on_branches || []
    if (checked) {
      setNewCategory({
        ...newCategory,
        display_on_branches: [...currentBranches, branchId],
      })
    } else {
      setNewCategory({
        ...newCategory,
        display_on_branches: currentBranches.filter((id) => id !== branchId),
      })
    }
  }

  // Handle branch selection for editing
  const handleEditBranchToggle = (branchId: string, checked: boolean) => {
    if (!editingCategory) return

    const currentBranches = editingCategory.display_on_branches || []
    if (checked) {
      setEditingCategory({
        ...editingCategory,
        display_on_branches: [...currentBranches, branchId],
      })
    } else {
      setEditingCategory({
        ...editingCategory,
        display_on_branches: currentBranches.filter((id) => id !== branchId),
      })
    }
  }

  // Get branch name by ID
  const getBranchName = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId)
    return branch ? branch.name : branchId
  }

  // Handle edit dialog open
  const handleEditDialogOpen = (category: Category) => {
    setEditingCategory(category)
    setEditImagePreview(category.image || null)
  }

  // Handle edit dialog close
  const handleEditDialogClose = () => {
    setEditingCategory(null)
    setEditImagePreview(null)
    if (editFileInputRef.current) {
      editFileInputRef.current.value = ""
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (newCategory.name) {
      setNewCategory((prev) => ({
        ...prev,
        slug: generateSlug(prev.name),
      }))
    }
  }, [newCategory.name])

  const filteredCategories = categories.filter(
    (category) =>
      category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (category.description && category.description.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  // Count active categories - check both status field and is_active field
  const activeCategories = categories.filter((c) => 
    c.status === "active" || (c as any).is_active === true
  ).length
  const totalProducts = categories.reduce((sum, c) => sum + (c.productCount || 0), 0)

  if (isLoading) {
    return <PageLoader message="Loading categories..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Category Management</h1>
          <p className="text-sm md:text-base text-gray-600">Organize your products into categories</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Category Name *</Label>
                  <Input
                    id="name"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    placeholder="Enter category name"
                  />
                </div>
                <div>
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={newCategory.slug}
                    onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
                    placeholder="category-slug"
                  />
                </div>
              </div>

              {/* Image Upload Section */}
              <div className="space-y-2">
                <Label>Category Image</Label>
                {imagePreview ? (
                  <div className="relative">
                    <div className="relative w-full h-32 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
                      <img
                        src={imagePreview || "/placeholder.svg"}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={handleRemoveImage}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Click to upload image</p>
                    <p className="text-xs text-gray-400">PNG, JPG up to 5MB (will be compressed)</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {imagePreview ? "Change Image" : "Upload Image"}
                </Button>
              </div>

              <div>
                <Label htmlFor="branch">Branch</Label>
                <Select
                  value={newCategory.branch_id || ""}
                  onValueChange={(value) => setNewCategory({ ...newCategory, branch_id: value })}
                  disabled={branchesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={branchesLoading ? "Loading branches..." : "Select a branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Display on Branches</Label>
                {branchesLoading ? (
                  <PageLoader message="Loading branches..." size="sm" />
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {branches.map((branch) => (
                      <div key={branch.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`branch-${branch.id}`}
                          checked={(newCategory.display_on_branches || []).includes(branch.id)}
                          onCheckedChange={(checked) => handleBranchToggle(branch.id, checked as boolean)}
                        />
                        <Label htmlFor={`branch-${branch.id}`} className="text-sm">
                          {branch.name} ({branch.code})
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="get_tax_from_item"
                    checked={newCategory.get_tax_from_item || false}
                    onCheckedChange={(checked) =>
                      setNewCategory({ ...newCategory, get_tax_from_item: checked as boolean })
                    }
                  />
                  <Label htmlFor="get_tax_from_item" className="text-sm">
                    Get Tax from Item
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="editable_sale_rate"
                    checked={newCategory.editable_sale_rate || false}
                    onCheckedChange={(checked) =>
                      setNewCategory({ ...newCategory, editable_sale_rate: checked as boolean })
                    }
                  />
                  <Label htmlFor="editable_sale_rate" className="text-sm">
                    Editable Sale Rate
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="display_on_pos"
                    checked={newCategory.display_on_pos !== false}
                    onCheckedChange={(checked) =>
                      setNewCategory({ ...newCategory, display_on_pos: checked as boolean })
                    }
                  />
                  <Label htmlFor="display_on_pos" className="text-sm">
                    Display on POS
                  </Label>
                </div>
              </div>

              <Button onClick={handleAddCategory} className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Add Category"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Categories</CardTitle>
            <Grid3X3 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCategories}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {filteredCategories.map((category) => (
          <Card 
            key={category.id} 
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handleCategoryClick(category)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {category.image ? (
                    <img
                      src={category.image || "/placeholder.svg"}
                      alt={category.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500" />
                  )}
                  <CardTitle className="text-lg">{category.name}</CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={category.status === "active" ? "default" : "secondary"}
                    className={category.status === "active" ? "bg-green-100 text-green-800" : ""}
                  >
                    {category.status || "active"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(category.id)} disabled={loading}>
                    {category.status === "active" ? (
                      <ToggleRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>Slug:</strong> {category.slug}
                </p>
                {category.branch_id && (
                  <p className="text-sm text-gray-600">
                    <strong>Branch:</strong> {getBranchName(category.branch_id)}
                  </p>
                )}
                {category.display_on_branches && category.display_on_branches.length > 0 && (
                  <div className="text-sm text-gray-600">
                    <strong>Display on:</strong>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {category.display_on_branches.map((branchId) => (
                        <Badge key={branchId} variant="outline" className="text-xs">
                          {getBranchName(branchId)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {category.display_on_pos && (
                    <Badge variant="outline" className="text-xs">
                      POS
                    </Badge>
                  )}
                  {category.get_tax_from_item && (
                    <Badge variant="outline" className="text-xs">
                      Tax from Item
                    </Badge>
                  )}
                  {category.editable_sale_rate && (
                    <Badge variant="outline" className="text-xs">
                      Editable Rate
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">{category.productCount || 0} products</span>
                </div>
                <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => handleEditDialogOpen(category)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDeleteDialog(category)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                    disabled={deleting}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Category Dialog */}
      <Dialog open={!!editingCategory} onOpenChange={handleEditDialogClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name">Category Name</Label>
                  <Input
                    id="edit-name"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-slug">Slug</Label>
                  <Input
                    id="edit-slug"
                    value={editingCategory.slug}
                    onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })}
                  />
                </div>
              </div>

              {/* Edit Image Upload Section */}
              <div className="space-y-2">
                <Label>Category Image</Label>
                {editImagePreview ? (
                  <div className="relative">
                    <div className="relative w-full h-32 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
                      <img
                        src={editImagePreview || "/placeholder.svg"}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={handleRemoveEditImage}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Click to upload image</p>
                    <p className="text-xs text-gray-400">PNG, JPG up to 5MB (will be compressed)</p>
                  </div>
                )}
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageSelect}
                  className="hidden"
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => editFileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {editImagePreview ? "Change Image" : "Upload Image"}
                </Button>
              </div>

              <div>
                <Label>Branch</Label>
                <Select
                  value={editingCategory.branch_id || ""}
                  onValueChange={(value) => setEditingCategory({ ...editingCategory, branch_id: value })}
                  disabled={branchesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={branchesLoading ? "Loading branches..." : "Select a branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Display on Branches</Label>
                {branchesLoading ? (
                  <PageLoader message="Loading branches..." size="sm" />
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {branches.map((branch) => (
                      <div key={branch.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-branch-${branch.id}`}
                          checked={(editingCategory.display_on_branches || []).includes(branch.id)}
                          onCheckedChange={(checked) => handleEditBranchToggle(branch.id, checked as boolean)}
                        />
                        <Label htmlFor={`edit-branch-${branch.id}`} className="text-sm">
                          {branch.name} ({branch.code})
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-get_tax_from_item"
                    checked={editingCategory.get_tax_from_item || false}
                    onCheckedChange={(checked) =>
                      setEditingCategory({ ...editingCategory, get_tax_from_item: checked as boolean })
                    }
                  />
                  <Label htmlFor="edit-get_tax_from_item" className="text-sm">
                    Get Tax from Item
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-editable_sale_rate"
                    checked={editingCategory.editable_sale_rate || false}
                    onCheckedChange={(checked) =>
                      setEditingCategory({ ...editingCategory, editable_sale_rate: checked as boolean })
                    }
                  />
                  <Label htmlFor="edit-editable_sale_rate" className="text-sm">
                    Editable Sale Rate
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-display_on_pos"
                    checked={editingCategory.display_on_pos !== false}
                    onCheckedChange={(checked) =>
                      setEditingCategory({ ...editingCategory, display_on_pos: checked as boolean })
                    }
                  />
                  <Label htmlFor="edit-display_on_pos" className="text-sm">
                    Display on POS
                  </Label>
                </div>
              </div>

              <Button onClick={handleEditCategory} className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Category"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Products Dialog - Show products in selected category */}
      <Dialog open={!!selectedCategoryForProducts} onOpenChange={(open) => !open && setSelectedCategoryForProducts(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Products in "{selectedCategoryForProducts?.name}" Category
            </DialogTitle>
          </DialogHeader>
          {loadingProducts ? (
            <PageLoader message="Loading products..." size="sm" />
          ) : categoryProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No products found in this category.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-4">
                Total: <span className="font-semibold">{categoryProducts.length}</span> products
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryProducts.map((product: any) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.sku || "N/A"}</TableCell>
                        <TableCell>
                          Rs {product.sales_rate_inc_dis_and_tax || product.sales_rate_exc_dis_and_tax || product.purchase_rate || 0}
                        </TableCell>
                        <TableCell>
                          {product.available_stock ?? product.current_stock ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={product.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                          >
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) { setDeleteOpen(open); if (!open) setCategoryToDelete(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category{" "}
              <span className="font-semibold text-gray-900">"{categoryToDelete?.name}"</span>?{" "}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteCategory(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" /> Delete</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
