"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLoader } from "@/components/ui/page-loader"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Search, Plus, Edit, Package, AlertTriangle, Upload, X, ImageIcon, RefreshCw, Trash2, Loader2, Mail, History, User } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { useStore, mapProductFromApi } from "@/lib/store"
import { isPendingImageUrl } from "@/lib/offline-queue-payload"
import { usePosData } from "@/hooks/use-pos-data"
import { shareInventoryReportOnEmail } from "@/lib/pdf-generator"
import { cn } from "@/lib/utils"

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

// Types and Interfaces
interface DropdownOption {
  id: string
  name: string
  percentage?: number // for taxes
  is_active?: boolean
}

interface Product {
  id: string
  name: string
  sku: string
  code: string
  pct_or_hs_code?: string
  description?: string
  purchase_rate: number
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  discount_amount?: number
  min_qty?: number
  max_qty?: number
  is_active: boolean
  display_on_pos: boolean
  is_batch: boolean
  auto_fill_on_demand_sheet: boolean
  non_inventory_item: boolean
  is_deal: boolean
  is_featured: boolean
  unit?: DropdownOption
  tax?: DropdownOption
  category?: DropdownOption
  subcategory?: DropdownOption
  supplier?: DropdownOption
  brand?: DropdownOption
  color?: DropdownOption
  size?: DropdownOption
  created_at: string
  updated_at: string
  images?: { image: string }[]
  available_stock?: number
  current_stock?: number
  reserved_stock?: number
  minimum_stock?: number
  maximum_stock?: number
}

/** Raw sale record returned by GET /sale (only the fields we use here). */
interface SaleApiItem {
  product_id: string
  quantity: string | number
  unit_price?: string | number
  line_total?: string | number
}
interface SaleApiRecord {
  id: string
  sale_number: string
  sale_date: string
  customer?: { name?: string | null; phone_number?: string | null } | null
  sale_items: SaleApiItem[]
}
/** One flattened line of a product's sales history. */
interface ProductSaleRow {
  saleId: string
  saleNumber: string
  date: string
  customerName: string
  customerPhone: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

/** Table-filter value; must never be sent as product.category_id / unit_id. */
const RELATION_SENTINEL_ALL = "all"

function pickRealRelationId(
  id: string | undefined,
  fallback?: string
): string {
  if (id && id !== RELATION_SENTINEL_ALL) return id
  return fallback ?? ""
}

function mapApiProductToInventoryRow(item: any): Product {
  return mapGlobalProductToInventoryRow(mapProductFromApi(item))
}

function getBranchIdForProducts(): string | undefined {
  if (typeof window === "undefined") return undefined
  const userRole = localStorage.getItem("role")
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"
  if (isAdmin) return undefined

  try {
    const branchStr = localStorage.getItem("branch")
    if (!branchStr || branchStr === "Not Found") return undefined
    const branchObj = JSON.parse(branchStr)
    return branchObj.id || branchStr
  } catch {
    const branchId = localStorage.getItem("branch")
    return branchId && branchId !== "Not Found" ? branchId : undefined
  }
}

function mapGlobalProductToInventoryRow(product: any): Product {
  const rel = (id?: string, name?: string) =>
    id ? { id, name: name || "" } : undefined
  return {
    id: product.id,
    name: product.name,
    sku: product.sku || "",
    code: product.code || "",
    pct_or_hs_code: product.pct_or_hs_code,
    description: product.description,
    purchase_rate: product.purchase_rate || 0,
    sales_rate_exc_dis_and_tax: product.sales_rate_exc_dis_and_tax || 0,
    sales_rate_inc_dis_and_tax: product.sales_rate_inc_dis_and_tax || 0,
    discount_amount: product.discount_amount,
    min_qty: product.min_qty,
    max_qty: product.max_qty,
    is_active: product.is_active ?? true,
    display_on_pos: product.display_on_pos ?? true,
    is_batch: product.is_batch ?? false,
    auto_fill_on_demand_sheet: product.auto_fill_on_demand_sheet ?? false,
    non_inventory_item: product.non_inventory_item ?? false,
    is_deal: product.is_deal ?? false,
    is_featured: product.is_featured ?? false,
    unit: rel(product.unitId, product.unitName),
    tax: rel(product.taxId, product.taxName),
    category: rel(product.categoryId, product.category),
    subcategory: rel(product.subcategoryId, product.subcategory),
    supplier: rel(product.supplierId, product.supplierName),
    brand: rel(product.brandId, product.brandName),
    color: rel(product.colorId, product.colorName),
    size: rel(product.sizeId, product.sizeName),
    created_at: product.created_at || new Date().toISOString(),
    updated_at: product.updated_at || new Date().toISOString(),
    images: product.images || [],
    available_stock: product.available_stock ?? product.current_stock ?? product.stock ?? 0,
    current_stock: product.current_stock ?? product.stock ?? 0,
    reserved_stock: product.reserved_stock ?? 0,
    minimum_stock: product.minimum_stock ?? 0,
    maximum_stock: product.maximum_stock ?? 0,
  }
}

interface ProductFormData {
  name: string
  unit_id: string
  pct_or_hs_code?: string
  description?: string
  sku: string
  purchase_rate: number | string
  sales_rate_exc_dis_and_tax: number | string
  sales_rate_inc_dis_and_tax: number | string
  discount_amount?: number | string
  tax_id?: string
  category_id: string
  subcategory_id?: string
  min_qty?: number | string
  max_qty?: number | string
  supplier_id?: string
  brand_id?: string
  color_id?: string
  size_id?: string
  is_active?: boolean
  display_on_pos?: boolean
  is_batch?: boolean
  auto_fill_on_demand_sheet?: boolean
  non_inventory_item?: boolean
  is_deal?: boolean
  is_featured?: boolean
  images?: (string | File)[]
  initial_stock?: number | string
}

const ProductForm = ({
  onSubmit,
  loading,
  submitText,
  formData,
  formErrors,
  updateFormData,
  units,
  categories,
  subcategories,
  taxes,
  suppliers,
  brands,
  colors,
  sizes,
  imagePreviews,
  handleRemoveImage,
  fileInputRef,
  handleImageSelect,
}: {
  onSubmit: () => void
  loading: boolean
  submitText: string
  formData: ProductFormData
  formErrors: { sku?: string; pct_or_hs_code?: string }
  updateFormData: (field: keyof ProductFormData, value: any) => void
  units: DropdownOption[]
  categories: DropdownOption[]
  subcategories: DropdownOption[]
  taxes: DropdownOption[]
  suppliers: DropdownOption[]
  brands: DropdownOption[]
  colors: DropdownOption[]
  sizes: DropdownOption[]
  imagePreviews: string[]
  handleRemoveImage: (index: number) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleImageSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
}) => {
  const hasErrors = Object.values(formErrors).some((error) => !!error)
  const isEditing = submitText === "Update Product"

  return (
    <>
      <div className="relative space-y-6">
      {loading && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium">Saving...</span>
          </div>
        </div>
      )}
      <div className={loading ? "pointer-events-none opacity-50" : undefined}>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Required Information</h3>
        <p className="text-sm text-muted-foreground">
          Bulk Excel import (Stock Management → New products, or Stock In → Step 1) uses the same columns: product name, unit,
          category, purchase rate, sales rate, min stock, and stock — see the upload guide when you import a file.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateFormData("name", e.target.value)}
              placeholder="Enter product name"
            />
          </div>
          <div>
            <Label htmlFor="unit_id">Unit</Label>
            <Select value={formData.unit_id} onValueChange={(value) => updateFormData("unit_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units
                  .filter(
                    (u) =>
                      u?.id &&
                      u.id !== RELATION_SENTINEL_ALL &&
                      String(u.name || "").toLowerCase() !== "all"
                  )
                  .map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="category_id">Category</Label>
            <Select value={formData.category_id} onValueChange={(value) => updateFormData("category_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter(
                    (c) =>
                      c?.id &&
                      c.id !== RELATION_SENTINEL_ALL &&
                      String(c.name || "").toLowerCase() !== "all"
                  )
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier_id">Supplier</Label>
            <Select
              value={formData.supplier_id || "none"}
              onValueChange={(value) =>
                updateFormData("supplier_id", value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {suppliers
                  .filter(
                    (s) =>
                      s?.id &&
                      s.id !== RELATION_SENTINEL_ALL &&
                      String(s.name || "").toLowerCase() !== "all"
                  )
                  .map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="purchase_rate">Purchase Rate *</Label>
            <Input
              id="purchase_rate"
              type="number"
              step="0.01"
              value={formData.purchase_rate || ""}
              onChange={(e) => updateFormData("purchase_rate", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="sales_rate_inc_dis_and_tax">Sales Rate *</Label>
            <Input
              id="sales_rate_inc_dis_and_tax"
              type="number"
              step="0.01"
              value={formData.sales_rate_inc_dis_and_tax || ""}
              onChange={(e) => {
                const val = e.target.value;
                // Update both to keep backend happy, but only show one to user
                updateFormData("sales_rate_inc_dis_and_tax", val);
                updateFormData("sales_rate_exc_dis_and_tax", val);
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="min_qty">Min Stock</Label>
            <Input
              id="min_qty"
              type="number"
              value={formData.min_qty === "" || formData.min_qty === undefined ? "" : formData.min_qty}
              onChange={(e) => updateFormData("min_qty", e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="initial_stock">{isEditing ? "Current stock" : "Stock"}</Label>
            <Input
              id="initial_stock"
              type="number"
              value={
                formData.initial_stock === "" || formData.initial_stock === undefined
                  ? ""
                  : formData.initial_stock
              }
              onChange={(e) => updateFormData("initial_stock", e.target.value)}
              placeholder="0"
              readOnly={isEditing}
              title={
                isEditing
                  ? "On hand quantity for this branch. Use stock adjustment to change quantity."
                  : undefined
              }
              className={isEditing ? "bg-muted/80 cursor-not-allowed" : undefined}
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground mt-1">
                Read-only here. To change quantity, use stock adjustment or receiving.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Product Images */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Product Images</h3>
        <div className="space-y-2">
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveImage(index)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div
            className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Click or drag to upload images</p>
            <p className="text-xs text-gray-400">PNG, JPG up to 5MB (max 10 images)</p>
          </div>
          <input
            ref={fileInputRef}
            id="images"
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
            disabled={loading || imagePreviews.length >= 10}
          />
        </div>
      </div>



      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onSubmit}
          size="lg"
          disabled={
            loading || !formData.name || hasErrors
          }
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {submitText}...
            </>
          ) : (
            submitText
          )}
        </Button>
      </div>
      </div>
    </div>
    </>
  )
}

export default function Inventory() {
  const { toast } = useToast()

  // Global store data
  const { 
    products: globalProducts, 
    categories: globalCategories, 
    isAnyLoading: globalLoading,
    productsLoading: globalProductsLoading,
    fetchProducts,
  } = usePosData()
  const upsertProductFromApi = useStore((s) => s.upsertProductFromApi)

  // State for products and pagination
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [totalProducts, setTotalProducts] = useState(0)
  const [apiTotalPages, setApiTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [gotoPage, setGotoPage] = useState<string>("")

  // State for filters
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedSubcategory, setSelectedSubcategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState<"all" | "active" | "inactive">("all")

  // State for dropdown options (these will be loaded from global store)
  const [units, setUnits] = useState<DropdownOption[]>([])
  const [taxes, setTaxes] = useState<DropdownOption[]>([])
  const [categories, setCategories] = useState<DropdownOption[]>([])
  const [subcategories, setSubcategories] = useState<DropdownOption[]>([])
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([])
  const [brands, setBrands] = useState<DropdownOption[]>([])
  const [colors, setColors] = useState<DropdownOption[]>([])
  const [sizes, setSizes] = useState<DropdownOption[]>([])

  // State for form
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [sharing, setSharing] = useState(false)

  // Per-product sales history dialog
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ProductSaleRow[]>([])
  const [historySearch, setHistorySearch] = useState("")
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 10
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    unit_id: "",
    sku: "",
    purchase_rate: "",
    sales_rate_exc_dis_and_tax: "",
    sales_rate_inc_dis_and_tax: "",
    category_id: "",
    supplier_id: "",
    is_active: true,
    display_on_pos: true,
    is_batch: false,
    auto_fill_on_demand_sheet: false,
    non_inventory_item: false,
    is_deal: false,
    is_featured: false,
    images: [],
    initial_stock: "",
  })
  const [formErrors, setFormErrors] = useState<{ sku?: string; pct_or_hs_code?: string }>({})
  const [imagePreviews, setImagePreviews] = useState<string[]>([])     // URLs for display (all are Cloudinary URLs)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]) // URLs to send in PATCH/POST
  const fileInputRef = useRef<HTMLInputElement>(null)

  // API Service Functions
  const apiService = {
    // Dropdown data fetchers
    async getUnits() {
      const response = await apiClient.get("/units")
      return response.data
    },

    async getTaxes() {
      const response = await apiClient.get("/taxes")
      return response.data
    },

    async getCategories() {
      const response = await apiClient.get("/categories")
      return response.data
    },

    async getSubcategories() {
      const response = await apiClient.get("/subcategories")
      return response.data
    },

    async getSuppliers() {
      const response = await apiClient.get("/suppliers")
      return response.data
    },

    async getBrands() {
      const response = await apiClient.get("/brands")
      return response.data
    },

    async getColors() {
      const response = await apiClient.get("/colors")
      return response.data
    },

    async getSizes() {
      const response = await apiClient.get("/sizes")
      return response.data
    },

    // Product operations
    async getProducts(params?: {
      page?: number
      limit?: number
      search?: string
      category_id?: string
      subcategory_id?: string
      is_active?: boolean
      display_on_pos?: boolean
      branch_id?: string
      fetch_all?: boolean
    }) {
      const response = await apiClient.get("/products", {
        params,
        headers: { "X-Skip-Offline-Cache": "true" },
      })
      return response.data
    },

    /**
     * Upload a single image file to Cloudinary via backend. Returns the URL.
     */
    async uploadImage(file: File): Promise<string> {
      const fd = new FormData()
      fd.append("image", file)
      const response = await apiClient.post("/products/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000, // 60s per image
      })
      return response.data.data.url
    },

    async createProduct(productData: ProductFormData, imageUrls: string[]) {
      const { images, ...dataWithoutImages } = productData
      const response = await apiClient.post("/products", {
        ...dataWithoutImages,
        image_urls: imageUrls,
      })
      return response.data?.data ?? response.data
    },

    async updateProduct(id: string, productData: any, imageUrls: string[]) {
      const { images, ...dataWithoutImages } = productData
      const response = await apiClient.patch(`/products/${id}`, {
        ...dataWithoutImages,
        existing_images: imageUrls,
      })
      return response.data?.data ?? response.data
    },

    async toggleProductStatus(id: string) {
      const response = await apiClient.patch(`/products/${id}/toggle-status`)
      return response.data
    },
  }

  // Load dropdown data on component mount
  useEffect(() => {
    loadDropdownData()
  }, [])

  useEffect(() => {
    if (globalCategories.length > 0) {
      setCategories(globalCategories.filter((c) => c.id !== "all"))
    }
  }, [globalCategories])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  // Server-side product list — refetch when filters or pagination change
  useEffect(() => {
    void loadProducts()
  }, [currentPage, debouncedSearch, selectedCategory, selectedSubcategory, selectedStatus, pageSize])

  const loadDropdownData = async () => {
    try {
      // Use global categories data
      setCategories(globalCategories)

      // Load other dropdown data that's not in global store
      const [
        unitsData,
        taxesData,
        subcategoriesData,
        suppliersData,
        brandsData,
        colorsData,
        sizesData,
      ] = await Promise.all([
        apiService.getUnits(),
        apiService.getTaxes(),
        apiService.getSubcategories(),
        apiService.getSuppliers(),
        apiService.getBrands(),
        apiService.getColors(),
        apiService.getSizes(),
      ])

      setUnits(unitsData.data || unitsData)
      setTaxes(taxesData.data || taxesData)
      setSubcategories(subcategoriesData.data || subcategoriesData)
      setSuppliers(suppliersData.data || suppliersData)
      setBrands(brandsData.data || brandsData)
      setColors(colorsData.data || colorsData)
      setSizes(sizesData.data || sizesData)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load dropdown data",
        variant: "destructive",
      })
    }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const branchId = getBranchIdForProducts()
      const fetchAll = pageSize === 0

      const response = await apiService.getProducts({
        page: fetchAll ? 1 : currentPage,
        limit: fetchAll ? 100 : pageSize,
        fetch_all: fetchAll,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(selectedCategory !== "all" ? { category_id: selectedCategory } : {}),
        ...(selectedSubcategory !== "all" ? { subcategory_id: selectedSubcategory } : {}),
        ...(selectedStatus === "active"
          ? { is_active: true }
          : selectedStatus === "inactive"
            ? { is_active: false }
            : {}),
        ...(branchId ? { branch_id: branchId } : {}),
      })

      const rawProducts = Array.isArray(response?.data) ? response.data : []
      const meta = response?.meta ?? {}
      const productsData = rawProducts.map(mapApiProductToInventoryRow)

      setProducts(productsData)
      setTotalProducts(meta.total ?? productsData.length)
      setApiTotalPages(Math.max(1, meta.totalPages ?? 1))
      setIsInitialLoading(false)
    } catch (error) {
      console.log("Failed to load products:", error)
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = async () => {
    setFormLoading(true)
    try {
      const dataToSubmit = {
        ...formData,
        unit_id: pickRealRelationId(formData.unit_id),
        category_id: pickRealRelationId(formData.category_id),
        subcategory_id: pickRealRelationId(formData.subcategory_id) || undefined,
        sku: String(formData.sku),
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
        purchase_rate: Number(formData.purchase_rate) || 0,
        sales_rate_exc_dis_and_tax: Number(formData.sales_rate_exc_dis_and_tax) || 0,
        sales_rate_inc_dis_and_tax: Number(formData.sales_rate_inc_dis_and_tax) || 0,
        discount_amount: Number(formData.discount_amount) || 0,
        min_qty: Number(formData.min_qty) || 0,
        max_qty: Number(formData.max_qty) || 0,
        initial_stock: Number(formData.initial_stock) || 0,
        supplier_id:
          formData.supplier_id && formData.supplier_id !== RELATION_SENTINEL_ALL
            ? formData.supplier_id
            : undefined,
      }

      // Images are already uploaded - existingImageUrls has all Cloudinary URLs
      const created = await apiService.createProduct(dataToSubmit, existingImageUrls)
      if (created?.id) upsertProductFromApi(created)
      await fetchProducts({ force: true })
      await loadProducts()

      toast({
        title: "Success",
        description: "Product created successfully",
      })

      setIsAddDialogOpen(false)
      resetForm()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdateProduct = async () => {
    if (!editingProduct) return

    setFormLoading(true)
    try {
      const { initial_stock: _omitStock, images: _omitImages, ...formRest } = formData
      const dataToSubmit = {
        ...formRest,
        unit_id: pickRealRelationId(formData.unit_id, editingProduct.unit?.id),
        category_id: pickRealRelationId(formData.category_id, editingProduct.category?.id),
        subcategory_id: pickRealRelationId(
          formData.subcategory_id,
          editingProduct.subcategory?.id
        ),
        sku: String(formData.sku),
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
        purchase_rate: Number(formData.purchase_rate) || 0,
        sales_rate_exc_dis_and_tax: Number(formData.sales_rate_exc_dis_and_tax) || 0,
        sales_rate_inc_dis_and_tax: Number(formData.sales_rate_inc_dis_and_tax) || 0,
        discount_amount: Number(formData.discount_amount) || 0,
        min_qty: Number(formData.min_qty) || 0,
        max_qty: Number(formData.max_qty) || 0,
        supplier_id:
          formData.supplier_id && formData.supplier_id !== RELATION_SENTINEL_ALL
            ? formData.supplier_id
            : "",
      }
      // All images are already Cloudinary URLs - no base64, no large payload
      const updated = await apiService.updateProduct(editingProduct.id, dataToSubmit, existingImageUrls)
      if (updated?.id) upsertProductFromApi(updated)
      await fetchProducts({ force: true })
      await loadProducts()

      toast({
        title: "Success",
        description: "Product updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingProduct(null)
      resetForm()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleToggleStatus = async (product: Product) => {
    const id = product.id
    if (togglingProductId === id) return
    const previousActive = product.is_active
    const nextActive = !previousActive

    setTogglingProductId(id)
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: nextActive } : p))
    )
    const globalProd = globalProducts.find((p) => p.id === id)
    if (globalProd) {
      upsertProductFromApi({ ...globalProd, is_active: nextActive })
    }

    try {
      await apiService.toggleProductStatus(id)
      await fetchProducts({ force: true })
      await loadProducts()
      toast({
        title: "Status updated",
        description: `Product is now ${nextActive ? "active" : "inactive"}.`,
      })
    } catch (error: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: previousActive } : p))
      )
      if (globalProd) {
        upsertProductFromApi({ ...globalProd, is_active: previousActive })
      }
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to update product status",
        variant: "destructive",
      })
    } finally {
      setTogglingProductId(null)
    }
  }
  
  const handleDeleteProduct = async () => {
    if (!productToDelete) return
    
    setDeleteLoading(true)
    try {
      await apiClient.delete(`/products/${productToDelete.id}`)
      toast({
        title: "Success",
        description: "Product deleted successfully",
      })
      setIsDeleteDialogOpen(false)
      setProductToDelete(null)
      await fetchProducts({ force: true })
      await loadProducts()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete product. It might be used in sales or other records.",
        variant: "destructive",
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const openHistoryDialog = async (product: Product) => {
    setHistoryProduct(product)
    setHistoryOpen(true)
    setHistoryRows([])
    setHistorySearch("")
    setHistoryPage(1)
    setHistoryLoading(true)
    try {
      const branchId = getBranchIdForProducts()
      const response = await apiClient.get<{ data: SaleApiRecord[] }>("/sale", {
        params: {
          productId: product.id,
          ...(branchId ? { branchId } : {}),
        },
        headers: { "X-Skip-Offline-Cache": "true" },
      })

      const sales = Array.isArray(response.data?.data) ? response.data.data : []
      const rows: ProductSaleRow[] = []
      for (const sale of sales) {
        for (const item of sale.sale_items || []) {
          if (item.product_id !== product.id) continue
          const quantity = Number(item.quantity) || 0
          const lineTotal = Number(item.line_total) || 0
          const unitPrice =
            item.unit_price !== undefined && item.unit_price !== null
              ? Number(item.unit_price)
              : quantity > 0
                ? lineTotal / quantity
                : 0
          rows.push({
            saleId: sale.id,
            saleNumber: sale.sale_number,
            date: sale.sale_date,
            customerName: sale.customer?.name || "Walk-in Customer",
            customerPhone: sale.customer?.phone_number || "",
            quantity,
            unitPrice,
            lineTotal,
          })
        }
      }
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setHistoryRows(rows)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load sales history for this product",
        variant: "destructive",
      })
    } finally {
      setHistoryLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      unit_id: "",
      sku: "",
      purchase_rate: "",
      sales_rate_exc_dis_and_tax: "",
      sales_rate_inc_dis_and_tax: "",
      category_id: "",
      subcategory_id: "",
      pct_or_hs_code: "",
      description: "",
      discount_amount: 0,
      tax_id: "",
      min_qty: "",
      max_qty: "",
      supplier_id: "",
      brand_id: "",
      color_id: "",
      size_id: "",
      is_active: true,
      display_on_pos: true,
      is_batch: false,
      auto_fill_on_demand_sheet: false,
      non_inventory_item: false,
      is_deal: false,
      is_featured: false,
      images: [],
      initial_stock: "",
    })
    setImagePreviews([])
    setExistingImageUrls([])
    setFormErrors({})
  }

  /** Add dialog shares form state with Edit — always clear when opening Add. */
  const handleAddDialogOpenChange = (open: boolean) => {
    if (open) {
      setEditingProduct(null)
      setIsEditDialogOpen(false)
      resetForm()
    }
    setIsAddDialogOpen(open)
  }

  const openEditDialog = (product: Product) => {
    setIsAddDialogOpen(false)
    setEditingProduct(product)
    const existingUrls = product.images?.map((img) => img.image) || []
    const minFromProduct = product.min_qty != null ? Number(product.min_qty) : NaN
    const minFromStock = product.minimum_stock != null ? Number(product.minimum_stock) : NaN
    const effectiveMinQty =
      Number.isFinite(minFromProduct) && minFromProduct > 0
        ? minFromProduct
        : Number.isFinite(minFromStock) && minFromStock > 0
          ? minFromStock
          : Number.isFinite(minFromProduct)
            ? minFromProduct
            : Number.isFinite(minFromStock)
              ? minFromStock
              : 0
    const maxFromProduct = product.max_qty != null ? Number(product.max_qty) : NaN
    const maxFromStock = product.maximum_stock != null ? Number(product.maximum_stock) : NaN
    const effectiveMaxQty =
      Number.isFinite(maxFromProduct) && maxFromProduct > 0
        ? maxFromProduct
        : Number.isFinite(maxFromStock) && maxFromStock > 0
          ? maxFromStock
          : Number.isFinite(maxFromProduct)
            ? maxFromProduct
            : Number.isFinite(maxFromStock)
              ? maxFromStock
              : 0
    const currentQty =
      product.current_stock != null
        ? Number(product.current_stock)
        : product.available_stock != null
          ? Number(product.available_stock)
          : 0
    setFormData({
      name: product.name,
      unit_id: product.unit?.id || "",
      pct_or_hs_code: product.pct_or_hs_code || "",
      description: product.description || "",
      sku: product.sku,
      purchase_rate: product.purchase_rate,
      sales_rate_exc_dis_and_tax: product.sales_rate_exc_dis_and_tax,
      sales_rate_inc_dis_and_tax: product.sales_rate_inc_dis_and_tax,
      discount_amount: product.discount_amount || 0,
      tax_id: product.tax?.id || "",
      category_id: product.category?.id || "",
      subcategory_id: product.subcategory?.id || "",
      min_qty: effectiveMinQty,
      max_qty: effectiveMaxQty,
      supplier_id: product.supplier?.id || "",
      brand_id: product.brand?.id || "",
      color_id: product.color?.id || "",
      size_id: product.size?.id || "",
      is_active: product.is_active,
      display_on_pos: product.display_on_pos,
      is_batch: product.is_batch,
      auto_fill_on_demand_sheet: product.auto_fill_on_demand_sheet,
      non_inventory_item: product.non_inventory_item,
      is_deal: product.is_deal,
      is_featured: product.is_featured,
      images: existingUrls,
      initial_stock: Number.isFinite(currentQty) ? currentQty : 0,
    })
    setImagePreviews(existingUrls)
    setExistingImageUrls(existingUrls)
    setIsEditDialogOpen(true)
  }

  const updateFormData = (field: keyof ProductFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (field === "sku" || field === "pct_or_hs_code") {
      // Basic validation: prevent purely numeric strings that might be misinterpreted as numbers.
      if (value && /^\d+$/.test(value)) {
        setFormErrors((prev) => ({ ...prev, [field]: "This field must be a string (e.g., add a letter)." }))
      } else {
        setFormErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field]
          return newErrors
        })
      }
    }
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    setFormLoading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "Error", description: `${file.name} is not an image.`, variant: "destructive" })
          continue
        }
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: "Error", description: `Image ${file.name} is larger than 5MB.`, variant: "destructive" })
          continue
        }

        // Compress the image
        const compressed = await compressImage(file)

        // Upload immediately to Cloudinary via backend - returns a URL (or offline placeholder)
        const url = await apiService.uploadImage(compressed)

        if (isPendingImageUrl(url)) {
          setImagePreviews((prev) => [...prev, URL.createObjectURL(compressed)])
        } else {
          setImagePreviews((prev) => [...prev, url])
        }
        setExistingImageUrls((prev) => [...prev, url])
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to upload image.", variant: "destructive" })
    } finally {
      setFormLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemoveImage = (index: number) => {
    const removedPreview = imagePreviews[index]
    if (removedPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(removedPreview)
    }
    const removedSubmit = existingImageUrls[index]
    setExistingImageUrls((prev) => prev.filter((url) => url !== removedSubmit))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const totalPages = pageSize === 0 ? 1 : apiTotalPages

  // Derived sales-history view: filter by customer/invoice, then paginate client-side.
  const historyFilter = historySearch.trim().toLowerCase()
  const historyFilteredRows = historyFilter
    ? historyRows.filter(
        (r) =>
          r.customerName.toLowerCase().includes(historyFilter) ||
          r.customerPhone.toLowerCase().includes(historyFilter) ||
          r.saleNumber.toLowerCase().includes(historyFilter),
      )
    : historyRows
  const historyTotalPages = Math.max(1, Math.ceil(historyFilteredRows.length / HISTORY_PAGE_SIZE))
  const historyCurrentPage = Math.min(historyPage, historyTotalPages)
  const historyPageRows = historyFilteredRows.slice(
    (historyCurrentPage - 1) * HISTORY_PAGE_SIZE,
    historyCurrentPage * HISTORY_PAGE_SIZE,
  )

  if (isInitialLoading && loading && products.length === 0) {
    return <PageLoader message="Loading inventory..." />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Product Management</h1>
            <p className="text-sm md:text-base text-gray-600">Manage your products and inventory</p>
            {globalLoading && (
              <p className="text-xs md:text-sm text-blue-600 mt-1">Loading data from cache...</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                setSharing(true);
                try {
                  await shareInventoryReportOnEmail({
                    storeName: "ACE ORBITS",
                    date: new Date(),
                    products: products.map(p => ({
                      name: p.name,
                      sku: p.sku || p.code || "-",
                      category: p.category?.name || "-",
                      stock: p.available_stock ?? p.current_stock ?? 0,
                      unit: p.unit?.name || "pcs",
                      purchaseRate: p.purchase_rate || 0,
                      salesRate: p.sales_rate_inc_dis_and_tax || 0
                    }))
                  });
                  toast({ title: "Inventory report shared successfully" });
                } catch (e) {
                  toast({ title: "Failed to share report", variant: "destructive" });
                } finally {
                  setSharing(false);
                }
              }}
              disabled={sharing || products.length === 0}
            >
              {sharing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Email Stock List
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={handleAddDialogOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <ProductForm
                onSubmit={handleCreateProduct}
                loading={formLoading}
                submitText="Create Product"
                formData={formData}
                formErrors={formErrors}
                updateFormData={updateFormData}
                units={units}
                categories={categories}
                subcategories={subcategories}
                taxes={taxes}
                suppliers={suppliers}
                brands={brands}
                colors={colors}
                sizes={sizes}
                imagePreviews={imagePreviews}
                handleRemoveImage={handleRemoveImage}
                fileInputRef={fileInputRef}
                handleImageSelect={handleImageSelect}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{globalProducts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Products</CardTitle>
              <Package className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {globalProducts.filter((p) => p.is_active).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive Products</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {globalProducts.filter((p) => !p.is_active).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-[1px]">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading products...
              </span>
            </div>
          )}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-10"
            />
          </div>
          <Select
            value={selectedCategory}
            onValueChange={(value) => {
              setSelectedCategory(value)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.filter(c => c.name?.toLowerCase() !== 'all' && c.id !== 'all').map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedSubcategory}
            onValueChange={(value) => {
              setSelectedSubcategory(value)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Subcategories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {subcategories.filter(s => s.name?.toLowerCase() !== 'all' && s.id !== 'all').map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedStatus}
            onValueChange={(value) => {
              setSelectedStatus(value as "all" | "active" | "inactive")
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-sm font-medium whitespace-nowrap">
              Items per page:
            </Label>
            <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setCurrentPage(1); }}>
              <SelectTrigger className="w-32" id="page-size">
                <SelectValue placeholder="Page Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        </div>

        {/* Products grid */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Products ({totalProducts})</CardTitle>
            {loading && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </span>
            )}
          </CardHeader>
          <CardContent className="relative min-h-[200px]">
            {loading && products.length === 0 ? (
              <PageLoader message="Loading products..." />
            ) : products.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No products match your filters</p>
                <p className="text-sm mt-1">Try changing category, status, or search.</p>
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
                    loading && "opacity-60 pointer-events-none",
                  )}
                >
                  {products.map((product) => {
                    const stock = product.available_stock ?? product.current_stock ?? 0
                    return (
                      <Card
                        key={product.id}
                        className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm text-slate-900 truncate" title={product.name}>
                                {product.name}
                              </h3>
                              <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                                {product.sku || "—"}
                              </p>
                            </div>
                            {product.is_featured && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">
                                Featured
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            <Badge variant="outline" className="font-normal">
                              {product.category?.name || "No category"}
                            </Badge>
                            <Badge variant="outline" className="font-normal">
                              {product.unit?.name || "No unit"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stock</p>
                              <p
                                className={cn(
                                  "text-base font-bold tabular-nums",
                                  stock <= 0 ? "text-rose-600" : "text-slate-900",
                                )}
                              >
                                {stock}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Purchase</p>
                              <p className="text-sm font-semibold tabular-nums">
                                {product.purchase_rate.toFixed(0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sale</p>
                              <p className="text-sm font-semibold tabular-nums text-emerald-700">
                                {product.sales_rate_inc_dis_and_tax.toFixed(0)}
                              </p>
                            </div>
                          </div>

                          {(product.reserved_stock ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Reserved: {product.reserved_stock}
                            </p>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={togglingProductId === product.id}
                              onClick={() => void handleToggleStatus(product)}
                              className={cn(
                                "h-8 flex-1 min-w-0 font-medium text-xs",
                                product.is_active
                                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                              )}
                            >
                              {togglingProductId === product.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  Saving
                                </>
                              ) : product.is_active ? (
                                "Active"
                              ) : (
                                "Inactive"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void openHistoryDialog(product)}
                              title="Sales history"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(product)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setProductToDelete(product)
                                setIsDeleteDialogOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                {/* Pagination */}
                {(totalPages > 1 || pageSize === 0) && (
                  <div className="flex flex-col gap-4 mt-6 pt-4 border-t">
                    {/* Pagination Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="text-sm text-gray-600">
                        {pageSize === 0 ? (
                          <>Showing all <span className="font-semibold">{totalProducts}</span> products</>
                        ) : (
                          <>
                            Showing <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                            <span className="font-semibold">{Math.min(currentPage * pageSize, totalProducts)}</span> of{" "}
                            <span className="font-semibold">{totalProducts}</span> products
                            {" "}(Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>)
                          </>
                        )}
                      </div>
                      
                      {/* Page Size Selector */}
                      {pageSize !== 0 && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor="pagination-page-size" className="text-sm font-medium whitespace-nowrap">
                            Items per page:
                          </Label>
                          <Select 
                            value={String(pageSize)} 
                            onValueChange={value => { 
                              setPageSize(Number(value)); 
                              setCurrentPage(1); 
                            }}
                          >
                            <SelectTrigger className="w-32" id="pagination-page-size">
                              <SelectValue placeholder="Page Size" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="25">25</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                              <SelectItem value="200">200</SelectItem>
                              <SelectItem value="500">500</SelectItem>
                              <SelectItem value="0">All</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Pagination Controls */}
                    {pageSize !== 0 && totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="min-w-[80px]"
                          >
                            First
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="min-w-[80px]"
                          >
                            Previous
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Go to page:</span>
                          <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={gotoPage}
                            onChange={e => setGotoPage(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const page = Math.max(1, Math.min(Number(gotoPage), totalPages))
                                if (!isNaN(page)) setCurrentPage(page)
                                setGotoPage("")
                              }
                            }}
                            placeholder="Page #"
                            className="w-20 h-9 px-2 text-sm text-center"
                          />
                          <span className="text-sm text-gray-500">/ {totalPages}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="min-w-[80px]"
                          >
                            Next
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="min-w-[80px]"
                          >
                            Last
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Product Sales History Dialog */}
        <Dialog
          open={historyOpen}
          onOpenChange={(open) => {
            setHistoryOpen(open)
            if (!open) {
              setHistoryProduct(null)
              setHistoryRows([])
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Sales History{historyProduct ? ` — ${historyProduct.name}` : ""}
              </DialogTitle>
            </DialogHeader>

            {historyLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading sales history...
              </div>
            ) : historyRows.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No sales recorded for this product</p>
                <p className="text-sm mt-1">Sales of this item will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Times Sold</p>
                    <p className="text-lg font-bold tabular-nums">{historyRows.length}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Qty Sold</p>
                    <p className="text-lg font-bold tabular-nums">
                      {historyRows.reduce((sum, r) => sum + r.quantity, 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Revenue</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-700">
                      {historyRows.reduce((sum, r) => sum + r.lineTotal, 0).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Filter by customer, phone, or invoice..."
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value)
                      setHistoryPage(1)
                    }}
                    className="pl-10"
                  />
                </div>

                {/* Records table */}
                <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Customer</th>
                        <th className="px-3 py-2 font-medium">Invoice</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Rate</th>
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyPageRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            No records match "{historySearch}".
                          </td>
                        </tr>
                      ) : (
                        historyPageRows.map((row, i) => (
                        <tr key={`${row.saleId}-${i}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                            <span className="block text-[11px] text-muted-foreground">
                              {new Date(row.date).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[140px]" title={row.customerName}>
                                {row.customerName}
                              </span>
                            </span>
                            {row.customerPhone && (
                              <span className="block text-[11px] text-muted-foreground">
                                {row.customerPhone}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {row.saleNumber}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            {row.quantity}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.unitPrice.toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                            {row.lineTotal.toFixed(0)}
                          </td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {historyFilteredRows.length === 0 ? (
                      "No records"
                    ) : (
                      <>
                        Showing{" "}
                        <span className="font-semibold">
                          {(historyCurrentPage - 1) * HISTORY_PAGE_SIZE + 1}
                        </span>
                        –
                        <span className="font-semibold">
                          {Math.min(historyCurrentPage * HISTORY_PAGE_SIZE, historyFilteredRows.length)}
                        </span>{" "}
                        of <span className="font-semibold">{historyFilteredRows.length}</span> records
                      </>
                    )}
                  </p>
                  {historyTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyCurrentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        Page {historyCurrentPage} of {historyTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                        disabled={historyCurrentPage === historyTotalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Product Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <ProductForm
              onSubmit={handleUpdateProduct}
              loading={formLoading}
              submitText="Update Product"
              formData={formData}
              formErrors={formErrors}
              updateFormData={updateFormData}
              units={units}
              categories={categories}
              subcategories={subcategories}
              taxes={taxes}
              suppliers={suppliers}
              brands={brands}
              colors={colors}
              sizes={sizes}
              imagePreviews={imagePreviews}
              handleRemoveImage={handleRemoveImage}
              fileInputRef={fileInputRef}
              handleImageSelect={handleImageSelect}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the product
                "{productToDelete?.name}" from the system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeleteProduct()
                }}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
    </div>
  )
}
