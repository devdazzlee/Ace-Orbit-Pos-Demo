"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Plus, Search, Eye, RotateCcw, CreditCard, DollarSign, CheckCircle, XCircle, Loader2, Minus, X, ChevronLeft, ChevronRight, FileText, Printer } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { PageLoader } from "@/components/ui/page-loader"
import {
  getCurrentReportingPeriod,
  getPreviousReportingPeriod,
} from "@/lib/reporting-period"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import apiClient from "@/lib/apiClient"
import { offlineDB } from "@/lib/offline-db"
import { downloadReturnNote, printReturnNote, shareReturnNoteOnWhatsApp, shareReturnNoteOnEmail, type ReturnNoteData } from "@/lib/pdf-generator"
import { Share2, Mail, ArrowLeftRight, Package } from "lucide-react"
import {
  RETURN_REASONS,
  REFUND_METHODS,
  EXCHANGE_PAYMENT_METHODS,
  INVENTORY_DISPOSITIONS,
  RETURN_REASON_LABEL,
  REFUND_METHOD_LABEL,
  EXCHANGE_PAYMENT_METHOD_LABEL,
  formatSaleStatusLabel,
  type InventoryDisposition,
  type ReturnReason,
  type ExchangePaymentMethod,
} from "@/components/returns-exchanges/constants"
import { ExchangeProductPicker } from "@/components/returns-exchanges/exchange-product-picker"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Sale {
  id: string
  sale_number: string
  customer?: {
    id?: string
    name: string
    email: string
    phone_number?: string
    whatsapp_number?: string
    outstanding_balance?: number
  }
  /** Set by GET /sale/for-returns for Process Return dropdown */
  return_eligibility?: {
    fully_returned: boolean
    has_prior_returns: boolean
  }
  sale_date: string
  total_amount: number
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    /** Units on the original sale line */
    quantity: number
    /** Units still allowed to return (original minus prior returns) — from GET /sale/:id */
    quantity_returnable?: number
    quantity_already_returned?: number
    /** Gross catalogue price — NOT what the customer paid when the sale had a discount. */
    unit_price: number
    /**
     * Price actually paid per unit: unit_price minus this line's share of the
     * invoice discount, computed by the API. Refund values must use this.
     */
    net_unit_price?: number
    line_total: number
  }>
}

interface ReturnItem {
  id: string
  sale_number: string
  original_sale_id?: string | null
  original_sale?: { id: string; sale_number: string } | null
  customer?: {
    id?: string
    name: string
    email: string
    phone_number?: string
    whatsapp_number?: string
  }
  sale_date: string
  total_amount: number
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "REFUNDED" | "EXCHANGED"
  payment_method: string
  notes?: string
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    unit_price: number
    line_total: number
    item_type: "ORIGINAL" | "RETURN" | "EXCHANGE"
  }>
}

interface NewReturn {
  saleId: string
  customerId?: string
  returnType: "REFUND" | "EXCHANGE"
  refundMethod?: string
  exchangePaymentMethod?: ExchangePaymentMethod
  returnReason?: ReturnReason | ""
  orderScope: "FULL" | "PARTIAL"
  returnedItems: Array<{
    productId: string
    quantity: number
    disposition?: InventoryDisposition
  }>
  exchangedItems: Array<{
    productId: string
    quantity: number
    price: number
  }>
  notes: string
}

interface Product {
  id: string
  name: string
  sku: string
  category_id?: string
  categoryId?: string
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  purchase_rate: number
  available_stock?: number
  current_stock?: number
}

interface ExchangeItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  price: number
}

interface SelectedReturnItem {
  productId: string
  productName: string
  sku: string
  /** Max returnable now (remaining on line) */
  originalQuantity: number
  /** Units originally sold on this line */
  soldQuantity: number
  alreadyReturned?: number
  returnQuantity: number
  /** Price per unit actually paid (invoice discount already applied) — the refund rate. */
  unitPrice: number
  /** Whether this product is included in the return (unchecked = excluded) */
  included: boolean
  disposition: InventoryDisposition
}

const normalizeSaleSearchTerm = (value?: string) =>
  (value || "").replace(/\s+/g, " ").trim()

const normalizeReturnDetail = (sale: any): ReturnItem => ({
  id: String(sale?.id || ""),
  sale_number: String(sale?.sale_number || ""),
  original_sale_id: sale?.original_sale_id ? String(sale.original_sale_id) : null,
  original_sale: sale?.original_sale
    ? {
        id: String(sale.original_sale.id),
        sale_number: String(sale.original_sale.sale_number || ""),
      }
    : null,
  customer: sale?.customer
    ? {
        id: sale.customer.id != null ? String(sale.customer.id) : undefined,
        name: String(sale.customer.name || ""),
        email: String(sale.customer.email || ""),
        phone_number: sale.customer.phone_number ? String(sale.customer.phone_number) : undefined,
        whatsapp_number: sale.customer.whatsapp_number
          ? String(sale.customer.whatsapp_number)
          : undefined,
      }
    : undefined,
  sale_date:
    typeof sale?.sale_date === "string"
      ? sale.sale_date
      : new Date(sale?.sale_date || Date.now()).toISOString(),
  total_amount: Number(sale?.total_amount || 0),
  status: sale?.status || "REFUNDED",
  payment_method: String(sale?.payment_method || ""),
  notes: sale?.notes ? String(sale.notes) : undefined,
  sale_items: Array.isArray(sale?.sale_items)
    ? sale.sale_items.map((item: any) => ({
        id: String(item?.id || ""),
        product: {
          id: String(item?.product?.id || item?.product_id || ""),
          name: String(item?.product?.name || "Unnamed Product"),
          sku: String(item?.product?.sku || ""),
        },
        quantity: Number(item?.quantity || 0),
        unit_price: Number(item?.unit_price || 0),
        line_total: Number(item?.line_total || 0),
        item_type: item?.item_type || "RETURN",
      }))
    : [],
})

const normalizeSaleRecord = (sale: any): Sale => ({
  id: String(sale?.id || ""),
  sale_number: String(sale?.sale_number || ""),
  customer: sale?.customer
    ? {
        id: sale.customer.id != null ? String(sale.customer.id) : undefined,
        name: String(sale.customer.name || ""),
        email: String(sale.customer.email || ""),
        phone_number: sale.customer.phone_number ? String(sale.customer.phone_number) : undefined,
        whatsapp_number: sale.customer.whatsapp_number ? String(sale.customer.whatsapp_number) : undefined,
        outstanding_balance: Number(sale.customer.outstanding_balance || 0),
      }
    : undefined,
  sale_date:
    typeof sale?.sale_date === "string"
      ? sale.sale_date
      : new Date(sale?.sale_date || Date.now()).toISOString(),
  total_amount: Number(sale?.total_amount || 0),
  sale_items: Array.isArray(sale?.sale_items)
    ? sale.sale_items.map((item: any) => {
        const soldQty = Number(item?.quantity || 0)
        const returnableRaw = item?.quantity_returnable
        const returnable =
          returnableRaw !== undefined && returnableRaw !== null ? Number(returnableRaw) : soldQty
        const alreadyRaw = item?.quantity_already_returned
        const alreadyReturned =
          alreadyRaw !== undefined && alreadyRaw !== null ? Number(alreadyRaw) : undefined
        return {
          id: String(item?.id || ""),
          product: {
            id: String(item?.product?.id || item?.product_id || ""),
            name: String(item?.product?.name || "Unnamed Product"),
            sku: String(item?.product?.sku || ""),
          },
          quantity: soldQty,
          quantity_returnable: returnable,
          quantity_already_returned: alreadyReturned,
          unit_price: Number(item?.unit_price || 0),
          // Every sale endpoint returns net_unit_price; the coalesce only covers
          // payloads cached offline before this field existed.
          net_unit_price: Number(item?.net_unit_price ?? item?.unit_price ?? 0),
          line_total: Number(item?.line_total || 0),
        }
      })
    : [],
  return_eligibility: sale?.return_eligibility
    ? {
        fully_returned: !!sale.return_eligibility.fully_returned,
        has_prior_returns: !!sale.return_eligibility.has_prior_returns,
      }
    : undefined,
})

/** Money rounding, so discounted per-unit prices never surface float noise. */
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const matchesSaleSearch = (sale: any, term: string) => {
  if (!term) return true

  const saleNumber = String(sale?.sale_number || "").toLowerCase()
  const customerName = String(sale?.customer?.name || "").toLowerCase()
  const customerEmail = String(sale?.customer?.email || "").toLowerCase()

  return (
    saleNumber.includes(term) ||
    customerName.includes(term) ||
    customerEmail.includes(term)
  )
}

const getIneligibleSaleReason = (status?: string) => {
  switch (status) {
    case "REFUNDED":
      return "This sale already has a return and cannot be processed again."
    case "EXCHANGED":
      return "This sale already has an exchange and cannot be processed again."
    case "CANCELLED":
      return "Cancelled sales cannot be returned."
    case "PENDING":
      return "This sale is not completed yet, so it cannot be returned."
    default:
      return "This sale is not eligible for return."
  }
}

const findIneligibleSaleMatch = (sales: any[], searchTerm: string) => {
  const term = normalizeSaleSearchTerm(searchTerm).toLowerCase()
  if (!term) {
    return null
  }

  const exactMatch =
    sales.find(
      (sale: any) =>
        String(sale?.sale_number || "").toLowerCase() === term ||
        String(sale?.customer?.email || "").toLowerCase() === term ||
        String(sale?.customer?.name || "").toLowerCase() === term
    ) ||
    sales.find((sale: any) => matchesSaleSearch(sale, term))

  if (!exactMatch || exactMatch.status === "COMPLETED") {
    return null
  }

  return {
    saleNumber: String(exactMatch.sale_number || ""),
    status: String(exactMatch.status || ""),
    reason: getIneligibleSaleReason(exactMatch.status),
  }
}

export type ReturnsModule = "returns" | "exchanges"

export function Returns({ module = "returns" }: { module?: ReturnsModule }) {
  const { toast } = useToast()

  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [allSalesForMetrics, setAllSalesForMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true) // Start with true to show loader on initial load
  const [salesLoading, setSalesLoading] = useState(false)
  const [processingReturn, setProcessingReturn] = useState(false) // Separate loading state for process return button
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailsLoading, setSaleDetailsLoading] = useState(false)
  const [selectedReturnItems, setSelectedReturnItems] = useState<SelectedReturnItem[]>([])
  // Track return quantity input values as strings to allow decimal point typing
  const [returnQuantityInputs, setReturnQuantityInputs] = useState<Record<string, string>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([])
  const [returnSuccessData, setReturnSuccessData] = useState<null | ReturnNoteData>(null)
  const [isAskingWhatsApp, setIsAskingWhatsApp] = useState(false)
  const [isAskingEmail, setIsAskingEmail] = useState(false)
  const [manualWhatsAppNumber, setManualWhatsAppNumber] = useState("")
  const [manualEmail, setManualEmail] = useState("")
  const [isProcessOpen, setIsProcessOpen] = useState(false)
  const [saleDropdownOpen, setSaleDropdownOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null)
  const [viewDetailLoading, setViewDetailLoading] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [saleSearch, setSaleSearch] = useState("")
  const [saleSearchPending, setSaleSearchPending] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const saleSearchInputRef = useRef<HTMLInputElement | null>(null)
  const saleDropdownRef = useRef<HTMLDivElement | null>(null)
  const latestSalesRequestRef = useRef(0)
  const saleSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [processMode, setProcessMode] = useState<ReturnsModule>(module)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lineItemSearch, setLineItemSearch] = useState("")
  const [newReturn, setNewReturn] = useState<NewReturn>({
    saleId: "",
    customerId: "",
    returnType: "REFUND",
    refundMethod: "",
    exchangePaymentMethod: "CASH",
    returnReason: "",
    orderScope: "PARTIAL",
    returnedItems: [],
    exchangedItems: [],
    notes: "",
  })

  // Fetch products for exchange
  const fetchProducts = async () => {
    setProductsLoading(true)
    try {
      const userRole = localStorage.getItem("role")
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"
      
      const params: any = {
        fetch_all: true,
        is_active: true,
      }
      
      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch")
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr)
            params.branch_id = branchObj.id || branchStr
          } catch (e) {
            params.branch_id = branchStr
          }
        }
      }
      
      const response = await apiClient.get("/products", { params })
      const list = response.data?.data || []
      setProducts(
        list.map((p: Product & { category_id?: string }) => ({
          ...p,
          category_id: p.category_id || p.categoryId,
        }))
      )
    } catch (error: any) {
      console.error("Error fetching products:", error)
    } finally {
      setProductsLoading(false)
    }
  }

  // Fetch sales and returns data
  const fetchSales = async (search = "", options?: { keepPending?: boolean }) => {
    const normalizedSearch = normalizeSaleSearchTerm(search)
    const requestId = ++latestSalesRequestRef.current

    setSalesLoading(true)
    try {
      const response = await apiClient.get("/sale/for-returns", {
        params: { search: normalizedSearch }
      })

      if (requestId !== latestSalesRequestRef.current) {
        return
      }

      setSales(response.data.data || [])
    } catch (error) {
      if (requestId === latestSalesRequestRef.current) {
        toast({
          variant: "destructive",
          title: "Failed to fetch sales",
          description: "Could not load sales data",
        })
      }
    } finally {
      if (requestId === latestSalesRequestRef.current) {
        setSalesLoading(false)
        if (!options?.keepPending) {
          setSaleSearchPending(false)
        }
      }
    }
  }

  const triggerSaleSearch = (value: string, options?: { immediate?: boolean }) => {
    const normalizedValue = normalizeSaleSearchTerm(value)

    setSaleSearch(normalizedValue)
    setSaleDropdownOpen(true)
    setSaleSearchPending(true)

    if (saleSearchDebounceRef.current) {
      clearTimeout(saleSearchDebounceRef.current)
      saleSearchDebounceRef.current = null
    }

    if (!isProcessOpen) {
      setSaleSearchPending(false)
      return
    }

    if (options?.immediate) {
      fetchSales(normalizedValue)
      return
    }

    saleSearchDebounceRef.current = setTimeout(() => {
      fetchSales(normalizedValue)
      saleSearchDebounceRef.current = null
    }, normalizedValue ? 250 : 0)
  }

  const fetchReturns = async () => {
    setLoading(true)
    try {
      // Fetch sales that have returns/exchanges (status REFUNDED or EXCHANGED)
      const response = await apiClient.get("/sale")
      const allSales = response.data.data || []
      setAllSalesForMetrics(allSales)
      const returnSales = allSales.filter((sale: any) => 
        sale.status === "REFUNDED" || sale.status === "EXCHANGED"
      )
      setReturns(returnSales)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to fetch returns",
        description: "Could not load returns data",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isProcessOpen) {
      if (saleSearchDebounceRef.current) {
        clearTimeout(saleSearchDebounceRef.current)
        saleSearchDebounceRef.current = null
      }
      return
    }

    fetchSales(saleSearch)

    return () => {
      if (saleSearchDebounceRef.current) {
        clearTimeout(saleSearchDebounceRef.current)
        saleSearchDebounceRef.current = null
      }
    }
  }, [isProcessOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        saleDropdownRef.current &&
        !saleDropdownRef.current.contains(event.target as Node)
      ) {
        setSaleDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    fetchReturns()
    fetchSales()
    fetchProducts()
  }, [])

  useEffect(() => {
    if (!isProcessOpen) {
      setSaleSearch("")
      setSaleSearchPending(false)
      setSaleDropdownOpen(false)
      setExchangeItems([])
      setSelectedReturnItems([])
      setReturnQuantityInputs({})
      setNewReturn({
        saleId: "",
        customerId: "",
        returnType: "REFUND",
        refundMethod: "",
        exchangePaymentMethod: "CASH",
        returnReason: "",
        orderScope: "PARTIAL",
        returnedItems: [],
        exchangedItems: [],
        notes: "",
      })
      setSelectedSale(null)
      setConfirmOpen(false)
      setLineItemSearch("")
      setSaleDetailsLoading(false)
    }
  }, [isProcessOpen])

  const applyOrderScope = (scope: "FULL" | "PARTIAL", items: SelectedReturnItem[]) => {
    if (scope === "FULL") {
      return items.map((i) => ({
        ...i,
        included: i.originalQuantity > 0,
        returnQuantity: i.originalQuantity,
      }))
    }
    return items.map((i) => ({ ...i, included: false, returnQuantity: 0 }))
  }

  const filteredReturnLineItems = useMemo(() => {
    const term = lineItemSearch.trim().toLowerCase()
    if (!term) return selectedReturnItems
    return selectedReturnItems.filter(
      (item) =>
        item.productName.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term)
    )
  }, [selectedReturnItems, lineItemSearch])

  const returnSubtotal = useMemo(
    () =>
      round2(
        selectedReturnItems
          .filter((i) => i.included && i.returnQuantity > 0)
          .reduce((sum, i) => sum + round2(i.returnQuantity * i.unitPrice), 0)
      ),
    [selectedReturnItems]
  )

  const exchangeSubtotal = useMemo(
    () => round2(exchangeItems.reduce((sum, i) => sum + round2(i.quantity * i.price), 0)),
    [exchangeItems]
  )

  const balanceSummary = useMemo(() => {
    const diff = round2(exchangeSubtotal - returnSubtotal)
    return {
      returnSubtotal,
      exchangeSubtotal,
      additionalDue: diff > 0 ? diff : 0,
      refundDue: diff < 0 ? Math.abs(diff) : 0,
      net: diff,
    }
  }, [returnSubtotal, exchangeSubtotal])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      case "COMPLETED":
        return "bg-green-100 text-green-800"
      case "CANCELLED":
        return "bg-red-100 text-red-800"
      case "REFUNDED":
        return "bg-blue-100 text-blue-800"
      case "EXCHANGED":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredReturns = useMemo(() => {
    const normalizedTerm = normalizeSaleSearchTerm(searchTerm).toLowerCase()

    return returns.filter((returnItem) => {
      const matchesSearch =
        returnItem.id.toLowerCase().includes(normalizedTerm) ||
        returnItem.sale_number.toLowerCase().includes(normalizedTerm) ||
        (returnItem.customer?.name && returnItem.customer.name.toLowerCase().includes(normalizedTerm)) ||
        (returnItem.customer?.email && returnItem.customer.email.toLowerCase().includes(normalizedTerm))

      return matchesSearch
    })
  }, [returns, searchTerm])

  const refundHistory = useMemo(
    () => filteredReturns.filter((r) => r.status === "REFUNDED"),
    [filteredReturns]
  )

  const exchangeHistory = useMemo(
    () => filteredReturns.filter((r) => r.status === "EXCHANGED"),
    [filteredReturns]
  )

  const reportingStats = useMemo(() => {
    const damagedNotes = returns.filter((r) =>
      (r.notes || "").toLowerCase().includes("damaged")
    ).length
    const totalRefund = returns
      .filter((r) => r.status === "REFUNDED")
      .reduce((sum, r) => sum + Math.abs(Number(r.total_amount)), 0)
    const totalExchange = returns
      .filter((r) => r.status === "EXCHANGED")
      .reduce((sum, r) => sum + Math.abs(Number(r.total_amount)), 0)
    return {
      totalReturns: refundHistory.length,
      totalExchanges: exchangeHistory.length,
      totalRefund,
      totalExchange,
      damagedNotes,
    }
  }, [returns, refundHistory.length, exchangeHistory.length])

  const searchableSales = useMemo(() => {
    const eligibleSalesFromCache = allSalesForMetrics
      .filter((sale: any) => sale?.status === "COMPLETED")
      .map(normalizeSaleRecord)

    const eligibleSalesFromSearch = sales.map(normalizeSaleRecord)
    const dedupedSales = new Map<string, Sale>()

    // Cache (no items) goes first; search results (with sale_items) overwrite on conflict
    ;[...eligibleSalesFromCache, ...eligibleSalesFromSearch].forEach((sale) => {
      if (!sale.id) return
      dedupedSales.set(sale.id, sale)
    })

    return Array.from(dedupedSales.values())
  }, [allSalesForMetrics, sales])

  const pageSearchMatchingSales = useMemo(() => {
    const term = normalizeSaleSearchTerm(searchTerm).toLowerCase()
    if (!term || filteredReturns.length > 0) {
      return []
    }

    return searchableSales.filter((sale) => matchesSaleSearch(sale, term)).slice(0, 5)
  }, [filteredReturns.length, searchableSales, searchTerm])

  /** Sales from /sale/for-returns (includes return_eligibility for dropdown) */
  const processReturnSales = useMemo(() => sales.map(normalizeSaleRecord), [sales])

  const filteredSales = useMemo(() => {
    const term = normalizeSaleSearchTerm(saleSearch).toLowerCase()
    if (!term) return processReturnSales

    return processReturnSales.filter((sale) => matchesSaleSearch(sale, term))
  }, [saleSearch, processReturnSales])

  const ineligibleSaleMatch = useMemo(() => {
    if (!normalizeSaleSearchTerm(saleSearch) || filteredSales.length > 0) {
      return null
    }

    return findIneligibleSaleMatch(allSalesForMetrics, saleSearch)
  }, [allSalesForMetrics, filteredSales.length, saleSearch])

  const pageSearchIneligibleSaleMatch = useMemo(() => {
    if (!normalizeSaleSearchTerm(searchTerm) || filteredReturns.length > 0 || pageSearchMatchingSales.length > 0) {
      return null
    }

    return findIneligibleSaleMatch(allSalesForMetrics, searchTerm)
  }, [allSalesForMetrics, filteredReturns.length, pageSearchMatchingSales.length, searchTerm])

  const getFilteredReturnsByStatus = (status: string) => {
    if (status === "all") return filteredReturns
    return filteredReturns.filter((returnItem) => returnItem.status === status)
  }

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // Calculate stats
  const currentPeriod = getCurrentReportingPeriod()
  const previousPeriod = getPreviousReportingPeriod()
  const inPeriod = (dateValue: string, period: { start: Date; end: Date }) => {
    const ts = new Date(dateValue).getTime()
    return ts >= period.start.getTime() && ts < period.end.getTime()
  }
  const todayReturns = returns.filter((r) => inPeriod(r.sale_date, currentPeriod)).length
  const yesterdayReturns = returns.filter((r) => inPeriod(r.sale_date, previousPeriod)).length
  // Use Math.abs to ensure return value is always positive (returns are stored as negative in some systems)
  const todayValue = returns
    .filter((r) => inPeriod(r.sale_date, currentPeriod))
    .reduce((sum, r) => sum + Math.abs(Number(r.total_amount)), 0)
  const pendingReturns = returns.filter((r) => r.status === "PENDING").length
  const returnRate = allSalesForMetrics.length > 0 
    ? ((returns.length / allSalesForMetrics.length) * 100).toFixed(1) 
    : "0.0"
  const returnsDelta = todayReturns - yesterdayReturns
  const returnsDeltaText =
    returnsDelta === 0
      ? "Same as yesterday"
      : `${returnsDelta > 0 ? "+" : ""}${returnsDelta} from yesterday`

  // Handle exchange product selection
  const handleExchangeProductSelect = (productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    const price = product.sales_rate_inc_dis_and_tax || product.sales_rate_exc_dis_and_tax || product.purchase_rate || 0
    
    // Check if product already in exchange items
    const existingItem = exchangeItems.find((item) => item.productId === productId)
    if (existingItem) {
      // Increment quantity
      setExchangeItems((prev) =>
        prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
    } else {
      // Add new exchange item
      setExchangeItems((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          price: price,
        },
      ])
    }

    // Update newReturn.exchangedItems
    const updatedExchangeItems = existingItem
      ? exchangeItems.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      : [
          ...exchangeItems,
          {
            productId: product.id,
            quantity: 1,
            price: price,
          },
        ]

    setNewReturn((prev) => ({
      ...prev,
      exchangedItems: updatedExchangeItems,
    }))

  }

  // Handle exchange item quantity change
  const handleExchangeQuantityChange = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      // Remove item
      setExchangeItems((prev) => prev.filter((item) => item.productId !== productId))
      setNewReturn((prev) => ({
        ...prev,
        exchangedItems: prev.exchangedItems.filter((item) => item.productId !== productId),
      }))
    } else {
      // Update quantity
      setExchangeItems((prev) =>
        prev.map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        )
      )
      setNewReturn((prev) => ({
        ...prev,
        exchangedItems: prev.exchangedItems.map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        ),
      }))
    }
  }

  const validateBeforeSubmit = (): boolean => {
    const validReturnedItems = newReturn.returnedItems.filter((item) => item.quantity > 0)
    const isExchangeFlow = processMode === "exchanges"

    if (!newReturn.saleId || (validReturnedItems.length === 0 && newReturn.exchangedItems.length === 0)) {
      toast({
        title: "Missing Information",
        description: "Please select a sale and add items to return or exchange.",
        variant: "destructive",
      })
      return false
    }

    if (!isExchangeFlow && !newReturn.refundMethod) {
      toast({
        title: "Missing Information",
        description: "Please select a refund method.",
        variant: "destructive",
      })
      return false
    }

    if (isExchangeFlow && newReturn.exchangedItems.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please add replacement products for the exchange.",
        variant: "destructive",
      })
      return false
    }

    if (isExchangeFlow && (newReturn.exchangePaymentMethod || "CASH") === "CREDIT" && !newReturn.customerId) {
      toast({
        title: "Customer required",
        description: "Select a customer before choosing credit for exchange balance.",
        variant: "destructive",
      })
      return false
    }

    // Validate return quantities (only items included in the return)
    const hasInvalidQuantity = selectedReturnItems.some(item =>
      item.included && item.returnQuantity > item.originalQuantity
    )
    
    if (hasInvalidQuantity) {
      toast({
        title: "Invalid Return Quantity",
        description: "Return quantity cannot exceed original sale quantity.",
        variant: "destructive",
      })
      return false
    }

    if (validReturnedItems.length === 0 && newReturn.exchangedItems.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select at least one item to return or add items for exchange.",
        variant: "destructive",
      })
      return false
    }

    return true
  }

  const handleProcessReturn = async () => {
    if (!validateBeforeSubmit()) return

    const validReturnedItems = newReturn.returnedItems.filter((item) => item.quantity > 0)

    setProcessingReturn(true)
    try {
      // Prepare the request payload - ensure all quantities are numbers
      const dispositionByProduct = Object.fromEntries(
        selectedReturnItems
          .filter((i) => i.included && i.returnQuantity > 0)
          .map((i) => [i.productId, i.disposition])
      )

      const payload: any = {
        returnedItems: validReturnedItems.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          disposition: dispositionByProduct[item.productId] || "RESTOCK",
        })),
        notes: newReturn.notes || "",
        returnReason: newReturn.returnReason,
        orderScope: newReturn.orderScope,
        exchangePaymentMethod: newReturn.exchangePaymentMethod || "CASH",
      }

      if (processMode === "exchanges" && newReturn.exchangedItems.length > 0) {
        payload.exchangedItems = newReturn.exchangedItems.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          price: Number(item.price),
        }))
      }

      if (processMode === "returns" && newReturn.refundMethod) {
        payload.refundMethod = newReturn.refundMethod
      }

      // Add customer ID if available
      if (newReturn.customerId) {
        payload.customerId = newReturn.customerId
      }

      console.log("Processing return with payload:", payload)

      if (!navigator.onLine) {
        await offlineDB.enqueue({
          operationId: crypto.randomUUID(),
          type: 'refund',
          url: `/sale/${newReturn.saleId}/refund`,
          method: 'PATCH',
          payload,
          maxRetries: 5,
          priority: 9,
          headers: {},
        })
        toast({ title: "Queued Offline", description: "Return will be processed when connection is restored." })
        setLoading(false)
        return
      }

      const response = await apiClient.patch(`/sale/${newReturn.saleId}/refund`, payload)

      // Build success data for the return note PDF — use correct field names from SelectedReturnItem
      const retItems = selectedReturnItems
        .filter(ri => ri.included && Number(ri.returnQuantity) > 0)
        .map(ri => ({
          name: ri.productName || ri.productId,
          qty: Number(ri.returnQuantity),
          price: Number(ri.unitPrice) || 0,
        }))
      const exchItems = exchangeItems.map(ei => ({
        name: ei.productName,
        qty: Number(ei.quantity) || 0,
        price: Number(ei.price) || 0,
      }))
      const refundTotal = round2(retItems.reduce((s, i) => s + round2(i.qty * i.price), 0))
      const exchangeTotal = round2(exchItems.reduce((s, i) => s + round2(i.qty * i.price), 0))

      setReturnSuccessData({
        saleNumber: response.data?.data?.sale_number || `SALE-${Date.now()}`,
        originalSaleNumber: selectedSale?.sale_number || newReturn.saleId,
        customerName: selectedSale?.customer?.name,
        customerPhone: selectedSale?.customer?.phone_number || "",
        customerWhatsApp: selectedSale?.customer?.whatsapp_number || selectedSale?.customer?.phone_number || "",
        customerEmail: selectedSale?.customer?.email || "",
        date: new Date(),
        returnedItems: retItems,
        exchangedItems: exchItems,
        refundTotal,
        exchangeTotal,
        netAmount: round2(exchangeTotal - refundTotal),
        previousBalance: Number(selectedSale?.customer?.outstanding_balance || 0),
      })

      // Close process modal
      setIsProcessOpen(false)

      // Reset form after closing modal
      setNewReturn({
        saleId: "",
        customerId: "",
        returnType: "REFUND",
        refundMethod: "",
        exchangePaymentMethod: "CASH",
        returnReason: "",
        orderScope: "PARTIAL",
        returnedItems: [],
        exchangedItems: [],
        notes: "",
      })
      setConfirmOpen(false)
      setSelectedReturnItems([])
      setExchangeItems([])
      setSelectedSale(null)
      
      // Refresh data after closing modal (don't await to avoid blocking)
      fetchReturns()
      fetchSales()
    } catch (error: any) {
      console.error("❌ Error processing return:", error)
      console.error("Error response:", error.response?.data)
      
      // Extract detailed error message
      let errorMessage = "An error occurred while processing the return."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.response?.data?.errors) {
        // Handle validation errors array
        const errors = error.response.data.errors
        if (Array.isArray(errors)) {
          errorMessage = errors.map((e: any) => e.message || e).join(", ")
        } else if (typeof errors === 'object') {
          errorMessage = Object.entries(errors)
            .map(([field, messages]: [string, any]) => {
              const msg = Array.isArray(messages) ? messages.join(", ") : messages
              return `${field}: ${msg}`
            })
            .join("; ")
        }
      }
      
      toast({
        variant: "destructive",
        title: "Failed to process return",
        description: errorMessage,
      })
      // Don't close modal on error - let user see the error and try again
    } finally {
      setProcessingReturn(false) // Reset processing state
    }
  }

  const handleSaleSelect = async (saleId: string) => {
    if (saleSearchDebounceRef.current) {
      clearTimeout(saleSearchDebounceRef.current)
      saleSearchDebounceRef.current = null
    }

    setSaleSearchPending(false)
    setSaleDropdownOpen(false)

    // Use cached sale_number for immediate display, then fetch fresh data with items
    const cached =
      processReturnSales.find((s) => s.id === saleId) || searchableSales.find((s) => s.id === saleId)
    setSaleSearch(cached?.sale_number || "")
    setSaleDetailsLoading(true)
    setSelectedSale(null)
    setSelectedReturnItems([])
    setNewReturn((prev) => ({
      ...prev,
      saleId,
      customerId: cached?.customer?.id ? String(cached.customer.id) : prev.customerId,
      returnedItems: [],
    }))

    try {
      // Always fetch by ID to guarantee sale_items are included
      const response = await apiClient.get(`/sale/${saleId}`)
      const fresh = normalizeSaleRecord(response.data?.data || response.data)
      setSelectedSale(fresh)
      setSaleSearch(fresh.sale_number)

      const items: SelectedReturnItem[] = fresh.sale_items.map((item) => {
        const sold = item.quantity
        const maxReturnable = item.quantity_returnable ?? item.quantity
        return {
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          originalQuantity: maxReturnable,
          soldQuantity: sold,
          alreadyReturned: item.quantity_already_returned,
          returnQuantity: maxReturnable,
          // Refund price = what the customer paid, i.e. after the invoice discount.
          unitPrice: item.net_unit_price ?? item.unit_price,
          included: true,
          disposition: "RESTOCK" as InventoryDisposition,
        }
      })
      const scoped = applyOrderScope(newReturn.orderScope, items)
      setSelectedReturnItems(scoped)
      setNewReturn((prev) => ({
        ...prev,
        customerId: fresh.customer?.id ? String(fresh.customer.id) : "",
        returnedItems: scoped
          .filter((i) => i.included && i.returnQuantity > 0)
          .map((i) => ({ productId: i.productId, quantity: i.returnQuantity, disposition: i.disposition })),
      }))
      if (scoped.length > 0 && scoped.every((i) => i.originalQuantity <= 0)) {
        toast({
          title: "Nothing left to return",
          description: "This sale has already been fully returned.",
        })
      }
    } catch {
      // Fall back to cached version if fetch fails
      setSelectedSale(cached || null)
      if (cached) {
        const items: SelectedReturnItem[] = cached.sale_items.map((item) => {
          const sold = item.quantity
          const maxReturnable = item.quantity_returnable ?? item.quantity
          return {
            productId: item.product.id,
            productName: item.product.name,
            sku: item.product.sku,
            originalQuantity: maxReturnable,
            soldQuantity: sold,
            alreadyReturned: item.quantity_already_returned,
            returnQuantity: maxReturnable,
            // Refund price = what the customer paid, i.e. after the invoice discount.
            unitPrice: item.net_unit_price ?? item.unit_price,
            included: true,
            disposition: "RESTOCK" as InventoryDisposition,
          }
        })
        const scoped = applyOrderScope(newReturn.orderScope, items)
        setSelectedReturnItems(scoped)
        setNewReturn((prev) => ({
          ...prev,
          customerId: cached.customer?.id ? String(cached.customer.id) : prev.customerId,
          returnedItems: scoped
            .filter((i) => i.included && i.returnQuantity > 0)
            .map((i) => ({ productId: i.productId, quantity: i.returnQuantity, disposition: i.disposition })),
        }))
      } else {
        setSelectedReturnItems([])
      }
    } finally {
      setSaleDetailsLoading(false)
    }

    requestAnimationFrame(() => {
      saleSearchInputRef.current?.blur()
    })
  }

  const handleSaleSearchPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData("text")
    if (!pastedValue) {
      return
    }

    event.preventDefault()
    triggerSaleSearch(pastedValue, { immediate: true })
  }

  const handleStartReturnForSale = (saleId: string, mode: ReturnsModule = module) => {
    setProcessMode(mode)
    setNewReturn((prev) => ({
      ...prev,
      returnType: mode === "exchanges" ? "EXCHANGE" : "REFUND",
    }))
    handleSaleSelect(saleId)
    setIsProcessOpen(true)
  }

  const handleDispositionChange = (productId: string, disposition: InventoryDisposition) => {
    setSelectedReturnItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, disposition } : i))
    )
  }

  const handleOrderScopeChange = (scope: "FULL" | "PARTIAL") => {
    setNewReturn((prev) => ({ ...prev, orderScope: scope }))
    setSelectedReturnItems((prev) => {
      const scoped = applyOrderScope(scope, prev)
      setNewReturn((p) => ({
        ...p,
        returnedItems: scoped
          .filter((i) => i.included && i.returnQuantity > 0)
          .map((i) => ({ productId: i.productId, quantity: i.returnQuantity, disposition: i.disposition })),
      }))
      return scoped
    })
  }

  useEffect(() => {
    setProcessMode(module)
  }, [module])

  const openProcessDialog = (mode: ReturnsModule = module) => {
    setProcessMode(mode)
    setNewReturn((prev) => ({
      ...prev,
      returnType: mode === "exchanges" ? "EXCHANGE" : "REFUND",
      refundMethod: mode === "exchanges" ? "" : prev.refundMethod,
      exchangePaymentMethod: mode === "exchanges" ? (prev.exchangePaymentMethod || "CASH") : "CASH",
      exchangedItems: mode === "returns" ? [] : prev.exchangedItems,
    }))
    if (mode === "returns") {
      setExchangeItems([])
    }
    setIsProcessOpen(true)
  }

  const handleReturnQuantityChange = (productId: string, quantity: number) => {
    const item = selectedReturnItems.find((item) => item.productId === productId)
    if (!item) return
    
    // Ensure quantity is valid: >= 0 and <= originalQuantity
    const validQuantity = Math.max(0, Math.min(quantity, item.originalQuantity))
    
    setSelectedReturnItems((prev) => {
      const updatedItems = prev.map((i) =>
        i.productId === productId
          ? { ...i, returnQuantity: validQuantity }
          : i
    )

    // Update newReturn.returnedItems
    const returnedItems = updatedItems
        .filter((i) => i.included && i.returnQuantity > 0)
        .map((i) => ({
          productId: i.productId,
          quantity: i.returnQuantity,
          disposition: i.disposition,
        }))

      setNewReturn((prev) => ({
      ...prev,
      returnedItems
    }))
      
      return updatedItems
    })
    
    // Clear local input state when value is set programmatically (via +/- buttons)
    setReturnQuantityInputs((prev) => {
      const newState = { ...prev }
      delete newState[productId]
      return newState
    })
  }

  // Include / exclude a product from the return (partial refund of specific items only)
  const handleToggleReturnItem = (productId: string, included: boolean) => {
    setSelectedReturnItems((prev) => {
      const updatedItems = prev.map((i) =>
        i.productId === productId ? { ...i, included } : i
      )
      const returnedItems = updatedItems
        .filter((i) => i.included && i.returnQuantity > 0)
        .map((i) => ({ productId: i.productId, quantity: i.returnQuantity }))
      setNewReturn((prevReturn) => ({ ...prevReturn, returnedItems }))
      return updatedItems
    })
  }

  const handleViewReturn = async (returnItem: ReturnItem) => {
    setIsViewOpen(true)
    setSelectedReturn(returnItem)
    setViewDetailLoading(true)
    try {
      const response = await apiClient.get(`/sale/${returnItem.id}`)
      const payload = response.data?.data || response.data
      setSelectedReturn(normalizeReturnDetail(payload))
    } catch {
      toast({
        variant: "destructive",
        title: "Could not load return details",
        description: "Showing summary only. Try again in a moment.",
      })
    } finally {
      setViewDetailLoading(false)
    }
  }

  const renderReturnsTable = (returnsData: ReturnItem[]) => {
    // Paginate the data
    const totalPages = pageSize === 0 ? 1 : Math.ceil(returnsData.length / pageSize)
    const startIndex = pageSize === 0 ? 0 : (currentPage - 1) * pageSize
    const endIndex = pageSize === 0 ? returnsData.length : startIndex + pageSize
    const paginatedData = returnsData.slice(startIndex, endIndex)
    const hasSearchTerm = Boolean(normalizeSaleSearchTerm(searchTerm))
    const emptyStateMessage =
      hasSearchTerm && pageSearchMatchingSales.length > 0
        ? "No return history found for this search. Matching sales are shown above."
        : hasSearchTerm && pageSearchIneligibleSaleMatch
          ? "No return history found for this search. Sale status details are shown above."
          : "No returns found"
    
    return (
      <>
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <div className="inline-block min-w-full align-middle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Sale ID</TableHead>
                  <TableHead className="min-w-[150px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Date</TableHead>
                  <TableHead className="min-w-[100px]">Amount</TableHead>
                  <TableHead className="min-w-[130px]">Payment Method</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="min-w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
          <TableBody>
            {returnsData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  {emptyStateMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((returnItem) => (
            <TableRow key={returnItem.id}>
              <TableCell className="font-medium">{returnItem.sale_number}</TableCell>
              <TableCell>
                {returnItem.customer?.name || returnItem.customer?.email
                  ? <span className="font-medium">{returnItem.customer?.name || returnItem.customer?.email}</span>
                  : <span className="text-gray-400 italic text-sm">Walk-in Customer</span>
                }
              </TableCell>
              <TableCell>{new Date(returnItem.sale_date).toLocaleDateString()}</TableCell>
              <TableCell>Rs {Math.abs(Number(returnItem.total_amount)).toLocaleString()}</TableCell>
              <TableCell className="capitalize">{returnItem.payment_method}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(returnItem.status)}>
                  {formatSaleStatusLabel(returnItem.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewReturn(returnItem)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Pagination */}
      {returnsData.length > 0 && (
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="returns-page-size" className="text-sm font-medium whitespace-nowrap">
            Items per page:
          </Label>
          <Select 
            value={String(pageSize)} 
            onValueChange={value => { 
              setPageSize(Number(value)); 
              setCurrentPage(1); 
            }}
          >
            <SelectTrigger className="w-32" id="returns-page-size">
              <SelectValue placeholder="Page Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="0">All</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, returnsData.length)} of {returnsData.length} returns
          </span>
        </div>

        {pageSize !== 0 && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="min-w-[40px]"
                  >
                    {page}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </Button>
          </div>
        )}
      </div>
    )}
      </>
    )
  }

  if (loading) {
    return (
      <PageLoader
        message={module === "exchanges" ? "Loading exchanges..." : "Loading returns..."}
      />
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {module === "exchanges" ? "Exchanges" : "Returns"}
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            {module === "exchanges"
              ? "Exchange products from an original sale with replacement items and automatic price balancing."
              : "Process full or partial returns with refund options and inventory disposition."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {module === "returns" ? (
            <Button onClick={() => openProcessDialog("returns")}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Process Return
            </Button>
          ) : (
            <Button onClick={() => openProcessDialog("exchanges")}>
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Process Exchange
            </Button>
          )}
        </div>
        <Dialog 
          open={isProcessOpen} 
          onOpenChange={(open) => {
            if (!open && processingReturn) {
              return
            }
            setIsProcessOpen(open)
          }}
        >
          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {processMode === "exchanges" ? "Process Exchange" : "Process Return"}
              </DialogTitle>
              <DialogDescription>
                {processMode === "exchanges"
                  ? "Return selected items and issue replacement products. Price difference is calculated automatically."
                  : "Return items from an original sale and issue a refund."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2" ref={saleDropdownRef}>
                <Label htmlFor="sale-search">Select Sale *</Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    ref={saleSearchInputRef}
                    id="sale-search"
                    placeholder="Search by sale #, customer name, or email"
                    value={saleSearch}
                    onFocus={() => setSaleDropdownOpen(true)}
                    autoComplete="off"
                    onPaste={handleSaleSearchPaste}
                    onChange={(e) => {
                      triggerSaleSearch(e.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        triggerSaleSearch(saleSearch, { immediate: true })
                      }
                    }}
                    className="pl-9"
                  />
                  {saleDropdownOpen && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                      {salesLoading || saleSearchPending ? (
                        <PageLoader message="Searching sales..." size="sm" />
                      ) : filteredSales.length === 0 && ineligibleSaleMatch ? (
                        <div className="px-3 py-6 text-center">
                          <XCircle className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                          <p className="text-sm font-medium text-gray-700">
                            {ineligibleSaleMatch.saleNumber} is{" "}
                            {formatSaleStatusLabel(ineligibleSaleMatch.status)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {ineligibleSaleMatch.reason}
                          </p>
                        </div>
                      ) : filteredSales.length === 0 ? (
                        <div className="px-3 py-10 text-center">
                          <Search className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                          <p className="text-sm text-gray-500 font-medium">No matching sales found</p>
                          <p className="text-xs text-gray-400 mt-1">Try a different sale # or customer info</p>
                        </div>
                      ) : (
                        filteredSales.map((sale) => {
                          const fullyReturned = sale.return_eligibility?.fully_returned === true
                          const partialReturn =
                            !fullyReturned && sale.return_eligibility?.has_prior_returns === true
                          const disabled = fullyReturned
                          return (
                            <button
                              key={sale.id}
                              type="button"
                              disabled={disabled}
                              className={`w-full px-3 py-2 text-left text-sm transition ${
                                disabled
                                  ? "cursor-not-allowed bg-gray-50 text-gray-400 opacity-80"
                                  : newReturn.saleId === sale.id
                                    ? "bg-blue-50 font-semibold text-blue-900 hover:bg-blue-50"
                                    : "text-gray-800 hover:bg-blue-50"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                if (!disabled) handleSaleSelect(sale.id)
                              }}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium">{sale.sale_number}</span>
                                  <div className="flex flex-wrap justify-end gap-1 shrink-0">
                                    {fullyReturned ? (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200">
                                        Fully returned
                                      </span>
                                    ) : partialReturn ? (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-sky-100 text-sky-900 border border-sky-200">
                                        Partial return
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {sale.customer?.name || sale.customer?.email || "Walk-in / no customer"} • Rs{" "}
                                  {Math.abs(Number(sale.total_amount)).toLocaleString()}
                                </span>
                                {fullyReturned ? (
                                  <span className="text-[11px] text-amber-700">
                                    All items on this sale were already returned or exchanged.
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {saleDetailsLoading && newReturn.saleId && (
                <div className="space-y-3" aria-busy="true" aria-label="Loading sale details">
                  <div className="bg-gray-50 p-3 rounded-md border border-dashed">
                    <Skeleton className="h-4 w-40 mb-3" />
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full max-w-sm" />
                      <Skeleton className="h-3 w-full max-w-xs" />
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      Loading sale details and line items…
                    </p>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              )}

              {selectedSale && !saleDetailsLoading && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <h4 className="font-medium mb-2">Selected Sale Details</h4>
                  <div className="text-sm space-y-1">
                    <div><strong>Sale Number:</strong> {selectedSale.sale_number}</div>
                    <div><strong>Customer:</strong> {selectedSale.customer?.name || selectedSale.customer?.email || "N/A"}</div>
                    <div><strong>Total Amount:</strong> Rs {Math.abs(Number(selectedSale.total_amount)).toLocaleString()}</div>
                    <div><strong>Items:</strong> {selectedSale.sale_items.length}</div>
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "space-y-2",
                  saleDetailsLoading && "pointer-events-none opacity-50"
                )}
              >
                <Label>
                  {processMode === "returns" ? "Return type" : "Exchange type"} *
                </Label>
                <Tabs
                  value={newReturn.orderScope}
                  onValueChange={(value) =>
                    handleOrderScopeChange(value as "FULL" | "PARTIAL")
                  }
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 h-10">
                    <TabsTrigger value="FULL" className="text-sm">
                      Full order {processMode === "returns" ? "return" : "exchange"}
                    </TabsTrigger>
                    <TabsTrigger value="PARTIAL" className="text-sm">
                      Partial {processMode === "returns" ? "return" : "exchange"}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  {newReturn.orderScope === "FULL"
                    ? "All returnable units on this sale are included automatically."
                    : "Select products and quantities to return below."}
                </p>
              </div>

              <div
                className={cn(
                  "grid grid-cols-1 md:grid-cols-2 gap-4",
                  saleDetailsLoading && "pointer-events-none opacity-50"
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor="return-reason">Return reason (optional)</Label>
                  <Select
                    value={newReturn.returnReason || ""}
                    onValueChange={(value) =>
                      setNewReturn((prev) => ({ ...prev, returnReason: value as ReturnReason }))
                    }
                  >
                    <SelectTrigger id="return-reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {processMode === "returns" && (
                  <div className="space-y-2">
                    <Label htmlFor="refund-method">Refund option *</Label>
                    <Select
                      value={newReturn.refundMethod || ""}
                      onValueChange={(value) =>
                        setNewReturn((prev) => ({ ...prev, refundMethod: value }))
                      }
                    >
                      <SelectTrigger id="refund-method">
                        <SelectValue placeholder="Select refund method" />
                      </SelectTrigger>
                      <SelectContent>
                        {REFUND_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {processMode === "exchanges" && (
                  <div className="space-y-2">
                    <Label htmlFor="exchange-payment-method">Exchange payment option *</Label>
                    <Select
                      value={newReturn.exchangePaymentMethod || "CASH"}
                      onValueChange={(value) =>
                        setNewReturn((prev) => ({ ...prev, exchangePaymentMethod: value as ExchangePaymentMethod }))
                      }
                    >
                      <SelectTrigger id="exchange-payment-method">
                        <SelectValue placeholder="Select payment option" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCHANGE_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {selectedReturnItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <Label>Products from original order</Label>
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Filter by name or SKU"
                        value={lineItemSearch}
                        onChange={(e) => setLineItemSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Purchased</TableHead>
                          <TableHead className="text-right">Returnable</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Inventory</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                    {filteredReturnLineItems.map((item) => (
                      <TableRow
                        key={item.productId}
                        className={item.included ? "" : "opacity-60 bg-gray-50"}
                      >
                        <TableCell>
                        <Checkbox
                          checked={item.included}
                          onCheckedChange={(checked) =>
                            handleToggleReturnItem(item.productId, checked === true)
                          }
                          aria-label={`Include ${item.productName}`}
                        />
                        </TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-sm text-gray-500">{item.sku}</TableCell>
                        <TableCell className="text-right">{item.soldQuantity}</TableCell>
                        <TableCell className="text-right">{item.originalQuantity}</TableCell>
                        <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReturnQuantityChange(item.productId, item.returnQuantity - 1)}
                            disabled={!item.included || item.returnQuantity <= 0}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="text"
                            inputMode="decimal"
                            disabled={!item.included}
                            value={returnQuantityInputs[item.productId] !== undefined ? returnQuantityInputs[item.productId] : (item.returnQuantity === 0 ? "" : String(item.returnQuantity))}
                            onChange={(e) => {
                              const value = e.target.value
                              
                              // Update local input state
                              setReturnQuantityInputs(prev => ({ ...prev, [item.productId]: value }))
                              
                              // Allow empty string - clear the value
                              if (value === "") {
                                setSelectedReturnItems((prev) =>
                                  prev.map((i) =>
                                    i.productId === item.productId
                                      ? { ...i, returnQuantity: 0 }
                                      : i
                                  )
                                )
                                return
                              }
                              
                              // Allow decimal point and numbers - validate format
                              if (/^(\d*\.?\d*)$/.test(value)) {
                                // If it's just a decimal point, don't update yet
                                if (value === ".") {
                                  return
                                }
                                
                                const numValue = parseFloat(value)
                                if (!isNaN(numValue) && numValue >= 0) {
                                  // Validate: cannot exceed originalQuantity
                                  if (numValue > item.originalQuantity) {
                                    // Show error toast when exceeding original quantity
                                    toast({
                                      title: "Invalid Return Quantity",
                                      description: `Return quantity (${numValue}) cannot exceed what is still returnable (${item.originalQuantity}) for ${item.productName}.`,
                                      variant: "destructive",
                                    })
                                    // Set to max allowed (originalQuantity)
                                    const validQuantity = item.originalQuantity
                                    setSelectedReturnItems((prev) =>
                                      prev.map((i) =>
                                        i.productId === item.productId
                                          ? { ...i, returnQuantity: validQuantity }
                                          : i
                                      )
                                    )
                                    // Update local input to show the corrected value
                                    setReturnQuantityInputs(prev => ({ ...prev, [item.productId]: String(validQuantity) }))
                                  } else {
                                    const validQuantity = numValue
                                    setSelectedReturnItems((prev) =>
                                      prev.map((i) =>
                                        i.productId === item.productId
                                          ? { ...i, returnQuantity: validQuantity }
                                          : i
                                      )
                                    )
                                  }
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim()
                              // Clear local input state
                              setReturnQuantityInputs(prev => {
                                const newState = { ...prev }
                                delete newState[item.productId]
                                return newState
                              })
                              
                              // If empty or just a decimal point, set to 0
                              if (value === "" || value === "." || value === "0") {
                                setSelectedReturnItems((prev) =>
                                  prev.map((i) =>
                                    i.productId === item.productId
                                      ? { ...i, returnQuantity: 0 }
                                      : i
                                  )
                                )
                              } else {
                                // Ensure valid number on blur
                                const numValue = parseFloat(value)
                                if (!isNaN(numValue) && numValue >= 0) {
                                  // Validate: cannot exceed originalQuantity
                                  if (numValue > item.originalQuantity) {
                                    // Show error toast when exceeding original quantity
                                    toast({
                                      title: "Invalid Return Quantity",
                                      description: `Return quantity (${numValue}) cannot exceed what is still returnable (${item.originalQuantity}) for ${item.productName}.`,
                                      variant: "destructive",
                                    })
                                    // Set to max allowed (originalQuantity)
                                    const validQuantity = item.originalQuantity
                                    setSelectedReturnItems((prev) =>
                                      prev.map((i) =>
                                        i.productId === item.productId
                                          ? { ...i, returnQuantity: validQuantity }
                                          : i
                                      )
                                    )
                                  } else {
                                    const validQuantity = numValue
                                    setSelectedReturnItems((prev) =>
                                      prev.map((i) =>
                                        i.productId === item.productId
                                          ? { ...i, returnQuantity: validQuantity }
                                          : i
                                      )
                                    )
                                  }
                                } else {
                                  // Invalid, reset to 0
                                  setSelectedReturnItems((prev) =>
                                    prev.map((i) =>
                                      i.productId === item.productId
                                        ? { ...i, returnQuantity: 0 }
                                        : i
                                    )
                                  )
                                }
                              }
                            }}
                            className="w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReturnQuantityChange(item.productId, item.returnQuantity + 1)}
                            disabled={!item.included || item.returnQuantity >= item.originalQuantity}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.disposition}
                            disabled={!item.included}
                            onValueChange={(v) =>
                              handleDispositionChange(item.productId, v as InventoryDisposition)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INVENTORY_DISPOSITIONS.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Return Summary */}
                  {selectedReturnItems.some(item => item.included && item.returnQuantity > 0) && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Return Summary</h4>
                      <div className="text-sm text-blue-800 space-y-1">
                        <div>
                          <strong>Items to Return:</strong> {selectedReturnItems.filter(item => item.included && item.returnQuantity > 0).length}
                        </div>
                        <div>
                          <strong>Total Return Value:</strong> Rs {returnSubtotal.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Exchange Items Section (only for Exchange) */}
              {processMode === "exchanges" && (
                <div className="space-y-3">
                  <ExchangeProductPicker
                    products={products}
                    productsLoading={productsLoading}
                    selectedLines={exchangeItems.map((item) => ({
                      productId: item.productId,
                      quantity: item.quantity,
                    }))}
                    onAddProduct={handleExchangeProductSelect}
                    onQuantityChange={handleExchangeQuantityChange}
                  />

                  {exchangeItems.length > 0 && (
                    <div className="border rounded-lg p-4 space-y-3 mt-4">
                      <Label>Exchange Items</Label>
                      {exchangeItems.map((item) => (
                        <div key={item.productId} className="flex items-center justify-between p-3 bg-white rounded border">
                          <div className="flex-1">
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-sm text-gray-500">
                              SKU: {item.sku} • Price: Rs {Number(item.price).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExchangeQuantityChange(item.productId, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <div>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                className="w-20 h-9 text-center"
                                value={item.quantity}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  if (raw === "") return
                                  const next = Number.parseInt(raw, 10)
                                  if (Number.isFinite(next) && next >= 1) {
                                    handleExchangeQuantityChange(item.productId, next)
                                  }
                                }}
                                onBlur={(e) => {
                                  const next = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                                  handleExchangeQuantityChange(item.productId, next)
                                }}
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExchangeQuantityChange(item.productId, item.quantity + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExchangeQuantityChange(item.productId, 0)}
                              className="text-red-600 hover:text-red-700"
                              title="Remove item"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Exchange Summary */}
                      <div className="bg-green-50 p-3 rounded-lg mt-4">
                        <h4 className="font-medium text-green-900 mb-2">Exchange Summary</h4>
                        <div className="text-sm text-green-800 space-y-1">
                          <div>
                            <strong>Exchange Items:</strong> {exchangeItems.length}
                          </div>
                          <div>
                            <strong>Total Exchange Value:</strong> Rs {exchangeItems
                              .reduce((total, item) => total + (item.quantity * item.price), 0)
                              .toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the return"
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

              {(returnSubtotal > 0 || exchangeSubtotal > 0) && (
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Balance summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Returned products value</span>
                      <span className="text-red-600 font-medium">Rs {returnSubtotal.toLocaleString()}</span>
                    </div>
                    {processMode === "exchanges" && (
                      <div className="flex justify-between">
                        <span>Replacement products value</span>
                        <span className="font-medium">Rs {exchangeSubtotal.toLocaleString()}</span>
                      </div>
                    )}
                    {balanceSummary.additionalDue > 0 && (
                      <div className="flex justify-between font-semibold text-amber-700">
                        <span>Additional amount due</span>
                        <span>Rs {balanceSummary.additionalDue.toLocaleString()}</span>
                      </div>
                    )}
                    {balanceSummary.refundDue > 0 && (
                      <div className="flex justify-between font-semibold text-emerald-700">
                        <span>Refund / store credit</span>
                        <span>Rs {balanceSummary.refundDue.toLocaleString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsProcessOpen(false)}
                disabled={processingReturn}
              >
                Cancel
              </Button>
              <Button
                onClick={() => validateBeforeSubmit() && setConfirmOpen(true)}
                disabled={processingReturn}
              >
                Review &amp; confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Confirm {processMode === "exchanges" ? "exchange" : "return"}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-left">
                  <p>
                    Sale <strong>{selectedSale?.sale_number}</strong> · Reason:{" "}
                    {RETURN_REASON_LABEL[newReturn.returnReason || ""] || newReturn.returnReason}
                  </p>
                  {processMode === "returns" && newReturn.refundMethod && (
                    <p>
                      Refund: {REFUND_METHOD_LABEL[newReturn.refundMethod] || newReturn.refundMethod}
                    </p>
                  )}
                  {processMode === "exchanges" && (
                    <p>
                      Payment:{" "}
                      {EXCHANGE_PAYMENT_METHOD_LABEL[newReturn.exchangePaymentMethod || "CASH"] ||
                        newReturn.exchangePaymentMethod ||
                        "CASH"}
                    </p>
                  )}
                  <p>Return value: Rs {returnSubtotal.toLocaleString()}</p>
                  {processMode === "exchanges" && (
                    <p>Replacement value: Rs {exchangeSubtotal.toLocaleString()}</p>
                  )}
                  <p className="font-medium">
                    {balanceSummary.additionalDue > 0
                      ? `Customer pays Rs ${balanceSummary.additionalDue.toLocaleString()}`
                      : balanceSummary.refundDue > 0
                        ? `Refund Rs ${balanceSummary.refundDue.toLocaleString()}`
                        : "No balance due"}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processingReturn}>Back</AlertDialogCancel>
              <AlertDialogAction
                disabled={processingReturn}
                onClick={(e) => {
                  e.preventDefault()
                  handleProcessReturn()
                }}
              >
                {processingReturn ? "Processing…" : "Complete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs value={module} className="space-y-4">
        <TabsContent value="returns" className="space-y-4 mt-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Returns</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayReturns}</div>
                <p className="text-xs text-muted-foreground">{returnsDeltaText}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Return Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">Rs {todayValue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Today's total</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{returnRate}%</div>
                <p className="text-xs text-muted-foreground">Of total sales</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingReturns}</div>
                <p className="text-xs text-muted-foreground">Awaiting approval</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search returns or paste a sale #"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {normalizeSaleSearchTerm(searchTerm) && filteredReturns.length === 0 && pageSearchMatchingSales.length > 0 && (
          <Alert className="border-green-200 bg-green-50 text-green-950">
            <CheckCircle className="h-4 w-4 text-green-700" />
            <AlertTitle>Matching sales ready for return</AlertTitle>
            <AlertDescription>
              These sales have not been returned yet. You can start the return flow directly from here.
            </AlertDescription>
            <div className="mt-4 space-y-3">
              {pageSearchMatchingSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex flex-col gap-3 rounded-lg border border-green-200 bg-white/80 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{sale.sale_number}</span>
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">READY FOR RETURN</Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      {sale.customer?.name || sale.customer?.email || "Walk-in customer"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(sale.sale_date).toLocaleDateString()} | Rs {Math.abs(Number(sale.total_amount)).toLocaleString()}
                    </div>
                  </div>
                  <Button onClick={() => handleStartReturnForSale(sale.id, module)}>
                    {module === "exchanges" ? "Process Exchange" : "Process Return"}
                  </Button>
                </div>
              ))}
            </div>
          </Alert>
        )}

        {normalizeSaleSearchTerm(searchTerm) &&
          filteredReturns.length === 0 &&
          pageSearchMatchingSales.length === 0 &&
          pageSearchIneligibleSaleMatch && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <XCircle className="h-4 w-4 text-amber-700" />
              <AlertTitle>
                {pageSearchIneligibleSaleMatch.saleNumber} is{" "}
                {formatSaleStatusLabel(pageSearchIneligibleSaleMatch.status)}
              </AlertTitle>
              <AlertDescription>{pageSearchIneligibleSaleMatch.reason}</AlertDescription>
            </Alert>
          )}

      <Card>
        <CardHeader>
          <CardTitle>Return history</CardTitle>
          <CardDescription>
            Completed return transactions ({refundHistory.length}) — click the eye icon for line-item details
          </CardDescription>
        </CardHeader>
        <CardContent>{renderReturnsTable(refundHistory)}</CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="exchanges" className="space-y-4 mt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Card><CardContent className="pt-4"><div className="text-muted-foreground">Total exchanges</div><div className="text-xl font-bold">{reportingStats.totalExchanges}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-muted-foreground">Exchange value</div><div className="text-xl font-bold">Rs {reportingStats.totalExchange.toLocaleString()}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-muted-foreground">Today&apos;s returns</div><div className="text-xl font-bold">{todayReturns}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Exchange history</CardTitle>
              <CardDescription>Completed exchanges with replacement products</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(exchangeHistory)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Return Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {selectedReturn?.status === "EXCHANGED" ? "Exchange" : "Return"} Details —{" "}
              {selectedReturn?.sale_number || selectedReturn?.id}
            </DialogTitle>
            <DialogDescription>
              Line items, original sale reference, and notes for this{" "}
              {selectedReturn?.status === "EXCHANGED" ? "exchange" : "return"}.
            </DialogDescription>
          </DialogHeader>
          {viewDetailLoading ? (
            <PageLoader message="Loading return details..." size="sm" />
          ) : selectedReturn ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Sale Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <strong>Sale ID:</strong> {selectedReturn.id}
                    </div>
                    <div>
                      <strong>Return #:</strong> {selectedReturn.sale_number}
                    </div>
                    {selectedReturn.original_sale?.sale_number && (
                      <div>
                        <strong>Original sale:</strong> {selectedReturn.original_sale.sale_number}
                      </div>
                    )}
                    <div>
                      <strong>Date:</strong> {new Date(selectedReturn.sale_date).toLocaleDateString()}
                    </div>
                    <div>
                      <strong>Status:</strong>{" "}
                      <Badge className={getStatusColor(selectedReturn.status)}>
                        {formatSaleStatusLabel(selectedReturn.status)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Customer & Payment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <strong>Customer:</strong> {selectedReturn.customer?.name || selectedReturn.customer?.email || "N/A"}
                    </div>
                    <div>
                      <strong>Payment Method:</strong> {selectedReturn.payment_method}
                    </div>
                    <div>
                      <strong>Return value:</strong> Rs{" "}
                      {Math.abs(Number(selectedReturn.total_amount)).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {selectedReturn.sale_items && selectedReturn.sale_items.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      Returned products ({selectedReturn.sale_items.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="border rounded-lg p-4">
                    {selectedReturn.sale_items.map((item, index) => (
                      <div key={item.id || index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                        <div>
                          <div className="font-medium">{item.product?.name || "Product"}</div>
                          <div className="text-sm text-gray-500">
                            Qty: {Math.abs(Number(item.quantity))} • SKU: {item.product?.sku || "—"}
                            {item.item_type ? ` • ${item.item_type}` : ""}
                          </div>
                        </div>
                        <div className="font-semibold text-red-700">
                          Rs {Math.abs(Number(item.line_total)).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Alert>
                  <AlertTitle>No line items on this record</AlertTitle>
                  <AlertDescription>
                    This return has no product lines stored. It may be an older record created before item tracking.
                  </AlertDescription>
                </Alert>
              )}

              {selectedReturn.notes && (
                <div>
                  <h3 className="font-medium mb-2">Notes</h3>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">{selectedReturn.notes}</div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Return Invoice Success Dialog */}
      <Dialog open={!!returnSuccessData} onOpenChange={(open) => { 
        if (!open) {
          setReturnSuccessData(null)
          setIsAskingWhatsApp(false)
          setIsAskingEmail(false)
          setManualWhatsAppNumber("")
          setManualEmail("")
        }
      }}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Return Processed</DialogTitle>
            <DialogDescription className="text-center">
              {returnSuccessData?.saleNumber} · Ref: {returnSuccessData?.originalSaleNumber}
            </DialogDescription>
          </DialogHeader>

          {returnSuccessData && (
            <div className="space-y-3 text-sm">
              {returnSuccessData.returnedItems.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-semibold text-red-600 text-xs uppercase tracking-wide">Returned</p>
                  {returnSuccessData.returnedItems.map((it, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{it.name} × {it.qty}</span>
                      <span className="text-red-600">-Rs {(it.qty * it.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {returnSuccessData.exchangedItems.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-semibold text-blue-600 text-xs uppercase tracking-wide">Exchanged</p>
                  {returnSuccessData.exchangedItems.map((it, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{it.name} × {it.qty}</span>
                      <span>Rs {(it.qty * it.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                {returnSuccessData.refundTotal > 0 && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Refund Amount</span>
                    <span>Rs {returnSuccessData.refundTotal.toLocaleString()}</span>
                  </div>
                )}
                {returnSuccessData.exchangeTotal > 0 && (
                  <div className="flex justify-between font-medium">
                    <span>Exchange Amount</span>
                    <span>Rs {returnSuccessData.exchangeTotal.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-1 mt-1">
                  <span>
                    {returnSuccessData.exchangeTotal > 0
                      ? returnSuccessData.netAmount >= 0
                        ? "Net Payable"
                        : "Net Refund"
                      : "Refund Amount"}
                  </span>
                  <span className={returnSuccessData.netAmount < 0 ? "text-red-600" : ""}>
                    Rs {Math.abs(returnSuccessData.netAmount).toLocaleString()}
                  </span>
                </div>
                {!!returnSuccessData.customerName && (
                  <>
                    <div className="flex justify-between text-gray-600 border-t pt-1 mt-1">
                      <span>Previous Balance</span>
                      <span>Rs {(returnSuccessData.previousBalance || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Updated Balance</span>
                      <span className={((returnSuccessData.previousBalance || 0) + returnSuccessData.netAmount) < 0 ? "text-emerald-600" : "text-red-600"}>
                        Rs {((returnSuccessData.previousBalance || 0) + returnSuccessData.netAmount).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4">
                {isAskingWhatsApp ? (
                  <div className="col-span-2 space-y-2 bg-green-50 p-3 rounded-lg border border-green-100 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-green-700 uppercase tracking-wider">Enter WhatsApp Number</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="0300 1234567"
                        value={manualWhatsAppNumber}
                        onChange={(e) => setManualWhatsAppNumber(e.target.value)}
                        className="bg-white border-green-200 focus-visible:ring-green-500"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#128C7E] text-white px-4 font-bold"
                        onClick={async () => {
                          if (!manualWhatsAppNumber) return;
                          const result = await shareReturnNoteOnWhatsApp({
                            ...returnSuccessData!,
                            customerWhatsApp: manualWhatsAppNumber
                          });
                          if (result.method === 'desktop') {
                            toast({
                              title: "PDF Downloaded",
                              description: "Return Note saved to your Downloads. Attach it in the WhatsApp chat that just opened.",
                              duration: 6000,
                            });
                          }
                          setIsAskingWhatsApp(false);
                        }}
                      >
                        Send
                      </Button>
                      <Button 
                        size="sm"
                        variant="ghost" 
                        onClick={() => setIsAskingWhatsApp(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : isAskingEmail ? (
                  <div className="col-span-2 space-y-2 bg-amber-50 p-3 rounded-lg border border-amber-100 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">Enter Email Address</label>
                    <div className="flex gap-2">
                      <Input 
                        type="email"
                        placeholder="customer@example.com"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="bg-white border-amber-200 focus-visible:ring-amber-500"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 font-bold"
                        onClick={async () => {
                          if (!manualEmail) return;
                          const result = await shareReturnNoteOnEmail({
                            ...returnSuccessData!,
                            customerEmail: manualEmail
                          });
                          if (result.method === 'desktop') {
                            toast({
                              title: "PDF Downloaded",
                              description: "Return Note saved to your Downloads. Attach it in the email draft that just opened.",
                              duration: 6000,
                            });
                          }
                          setIsAskingEmail(false);
                        }}
                      >
                        Send
                      </Button>
                      <Button 
                        size="sm"
                        variant="ghost" 
                        onClick={() => setIsAskingEmail(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 h-11"
                      onClick={() => downloadReturnNote(returnSuccessData!)}
                    >
                      <FileText className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 border-gray-200 text-gray-700 hover:bg-gray-50 h-11"
                      onClick={() => printReturnNote(returnSuccessData!)}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      className="flex items-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white h-11"
                      onClick={async () => {
                        const number = returnSuccessData!.customerWhatsApp || returnSuccessData!.customerPhone;
                        if (!number) {
                          setIsAskingWhatsApp(true);
                          setIsAskingEmail(false);
                          return;
                        }
                        const result = await shareReturnNoteOnWhatsApp(returnSuccessData!);
                        if (result.method === 'desktop') {
                          toast({
                            title: "PDF Downloaded",
                            description: result.whatsappOpened
                              ? "Return Note saved to Downloads. Attach it in the WhatsApp chat that just opened."
                              : "Return Note saved to your Downloads folder.",
                            duration: 6000,
                          });
                        }
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                      WhatsApp
                    </Button>
                    <Button
                      className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white h-11"
                      onClick={async () => {
                        const email = returnSuccessData!.customerEmail;
                        if (!email) {
                          setIsAskingEmail(true);
                          setIsAskingWhatsApp(false);
                          return;
                        }
                        const result = await shareReturnNoteOnEmail(returnSuccessData!);
                        if (result.method === 'desktop') {
                          toast({
                            title: "PDF Downloaded",
                            description: "Return Note saved to your Downloads folder. Attach it in the email draft that just opened.",
                            duration: 6000,
                          });
                        }
                      }}
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                )}
              </div>
              <Button variant="ghost" className="w-full text-gray-500 h-10 mt-2" onClick={() => setReturnSuccessData(null)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildReturnNoteHtml(d: {
  saleNumber: string
  originalSaleNumber: string
  returnedItems: Array<{ name: string; qty: number; price: number }>
  exchangedItems: Array<{ name: string; qty: number; price: number }>
  refundTotal: number
  exchangeTotal: number
  netAmount: number
  date: string
}): string {
  let rowIndex = 0;
  const rows = (items: typeof d.returnedItems, label: string) =>
    items.map(it => {
      rowIndex += 1;
      return `
      <tr>
        <td style="padding: 4px 0; font-size: 12px; text-align: center; width: 40px;">${rowIndex}</td>
        <td style="padding: 4px 0; font-size: 12px;">${label}: ${it.name}</td>
        <td style="padding: 4px 0; font-size: 12px; text-align: center;">${it.qty}</td>
        <td style="padding: 4px 0; font-size: 12px; text-align: right;">${it.price.toFixed(2)}</td>
        <td style="padding: 4px 0; font-size: 12px; text-align: right; font-weight: 600;">${(it.qty * it.price).toFixed(2)}</td>
      </tr>
    `;
    }).join('')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica', Arial, sans-serif; color: #000; line-height: 1.4; padding: 40px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .logo-section { display: flex; flex-direction: column; align-items: flex-start; }
          .logo { height: 40px; width: auto; max-width: 100%; object-fit: contain; margin-bottom: 10px; }
          .store-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
          .store-info { font-size: 10px; color: #555; }
          .invoice-info { text-align: right; }
          .invoice-label { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
          .info-row { font-size: 12px; margin-bottom: 4px; }
          .info-val { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { text-align: left; border-bottom: 2px solid #000; padding: 6px 0; font-size: 11px; text-transform: uppercase; }
          .summary { display: flex; flex-direction: column; align-items: flex-end; }
          .summary-row { display: flex; width: 250px; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
          .grand-total { border-top: 1px solid #000; padding-top: 10px; margin-top: 10px; font-size: 18px; font-weight: bold; }
          .footer { margin-top: 100px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            <img src="/logo.jpeg" class="logo" onerror="this.style.display='none'"/>
            <div class="store-name">ACE ORBITS</div>
            <div class="store-info">
              Return / Exchange Note
            </div>
          </div>
          <div class="invoice-info">
            <div class="invoice-label">RETURN NOTE</div>
            <div class="info-row">Date: <span class="info-val">${d.date}</span></div>
            <div class="info-row">Note No: <span class="info-val">#${d.saleNumber}</span></div>
            <div class="info-row">Original Sale: <span class="info-val">#${d.originalSaleNumber}</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">S.NO</th>
              <th style="width: 45%;">Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows(d.returnedItems, 'Return')}
            ${rows(d.exchangedItems, 'Exchange')}
          </tbody>
        </table>

        <div class="summary">
          ${d.refundTotal > 0 ? `
            <div class="summary-row">
              <span>Total Refund</span>
              <span>- ${d.refundTotal.toFixed(2)}</span>
            </div>
          ` : ''}
          ${d.exchangeTotal > 0 ? `
            <div class="summary-row">
              <span>Total Exchange</span>
              <span>${d.exchangeTotal.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="summary-row grand-total">
            <span>Net ${d.netAmount >= 0 ? 'Payable' : 'Refund'}</span>
            <span>PKR ${Math.abs(d.netAmount).toFixed(2)}</span>
          </div>
        </div>

        <div class="footer">
          Powered by ACE ORBITS | Support: +92 336 2500357 | www.aceorbitsus.com
        </div>
      </body>
    </html>
  `
}

/** Sidebar route: dedicated Exchanges screen (same engine, exchanges-only UI). */
export function Exchanges() {
  return <Returns module="exchanges" />
}
