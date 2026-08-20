"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Package, Minus, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageLoader } from "@/components/ui/page-loader"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export type ExchangePickerProduct = {
  id: string
  name: string
  sku: string
  sales_rate_exc_dis_and_tax?: number
  sales_rate_inc_dis_and_tax?: number
  purchase_rate?: number
  category_id?: string
  categoryId?: string
}

export type ExchangePickerLine = {
  productId: string
  quantity: number
}

function getProductPrice(product: ExchangePickerProduct): number {
  return (
    product.sales_rate_inc_dis_and_tax ||
    product.sales_rate_exc_dis_and_tax ||
    product.purchase_rate ||
    0
  )
}

function getCategoryId(product: ExchangePickerProduct): string {
  return product.category_id || product.categoryId || ""
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
}

interface ExchangeProductPickerProps {
  products: ExchangePickerProduct[]
  productsLoading: boolean
  selectedLines: ExchangePickerLine[]
  onAddProduct: (productId: string) => void
  onQuantityChange: (productId: string, quantity: number) => void
}

export function ExchangeProductPicker({
  products,
  productsLoading,
  selectedLines,
  onAddProduct,
  onQuantityChange,
}: ExchangeProductPickerProps) {
  const { categories, categoriesLoading, fetchCategories } = useStore()
  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState("all")

  useEffect(() => {
    void fetchCategories()
  }, [fetchCategories])

  const qtyByProductId = useMemo(() => {
    const map = new Map<string, number>()
    selectedLines.forEach((line) => map.set(line.productId, line.quantity))
    return map
  }, [selectedLines])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const cat = getCategoryId(product)
      if (categoryId !== "all" && cat !== categoryId) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku || "").toLowerCase().includes(term)
      )
    })
  }, [products, search, categoryId])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filteredProducts.length === 0) return
    e.preventDefault()
    const term = search.trim().toLowerCase()
    const exact =
      filteredProducts.find((p) => (p.sku || "").toLowerCase() === term) ||
      (filteredProducts.length === 1 ? filteredProducts[0] : null)
    onAddProduct((exact || filteredProducts[0]).id)
  }

  const selectedCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="space-y-3 rounded-lg border bg-slate-50/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Replacement products
        </Label>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>{products.length} in catalog</span>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCount} in exchange
            </Badge>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search name or SKU — Enter to add match"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="pl-9 h-9 bg-white"
          autoComplete="off"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(categoriesLoading && categories.length === 0 ? [{ id: "all", name: "All" }] : categories).map(
          (cat) => (
            <Button
              key={cat.id}
              type="button"
              size="sm"
              variant={categoryId === cat.id ? "default" : "outline"}
              className="shrink-0 h-8 text-xs whitespace-nowrap"
              onClick={() => setCategoryId(cat.id)}
            >
              {cat.name}
            </Button>
          )
        )}
      </div>

      {productsLoading ? (
        <PageLoader message="Loading products..." size="sm" />
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-md bg-white">
          {search || categoryId !== "all"
            ? "No products match your filters."
            : "No products available for exchange."}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Tap a card to add · {filteredProducts.length} shown
          </p>
          <ScrollArea className="h-[min(320px,45vh)] rounded-md border bg-white">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2">
              {filteredProducts.map((product) => {
                const qty = qtyByProductId.get(product.id) || 0
                const price = getProductPrice(product)
                return (
                  <Card
                    key={product.id}
                    className={cn(
                      "cursor-pointer hover:shadow-sm transition-shadow overflow-hidden",
                      qty > 0 && "ring-1 ring-blue-500/40 border-blue-200 bg-blue-50/30"
                    )}
                    onClick={() => onAddProduct(product.id)}
                  >
                    <CardContent className="p-2 space-y-1">
                      <h3 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 min-h-[2rem]">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-blue-600">
                          Rs {Number(price).toLocaleString()}
                        </span>
                        {qty > 0 && (
                          <Badge className="bg-blue-600 text-[10px] px-1.5 py-0 h-5 shrink-0">
                            {formatQty(qty)}
                          </Badge>
                        )}
                      </div>
                      {qty > 0 ? (
                        <div
                          className="pt-1 border-t border-blue-100 flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => onQuantityChange(product.id, Math.max(1, qty - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="h-7 w-full text-center text-xs px-1"
                            value={qty}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (raw === "") return
                              const next = Number.parseInt(raw, 10)
                              if (Number.isFinite(next) && next >= 1) {
                                onQuantityChange(product.id, next)
                              }
                            }}
                            onBlur={(e) => {
                              const next = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                              onQuantityChange(product.id, next)
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => onQuantityChange(product.id, qty + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground truncate leading-none pt-0.5">
                          {product.sku || "—"}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  )
}
