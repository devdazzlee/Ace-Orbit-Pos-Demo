import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/apiClient";

interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  actualUnitPrice?: number;
  quantity: number;
  category: string;
  discount?: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
  productId?: string;
}

interface HoldSaleRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  createdAt: string;
}

export function useHoldSales() {
  const [holdSales, setHoldSales] = useState<HoldSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const normalizeItem = (item: any): CartItem => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    price: Number(item.price || 0),
    originalPrice: Number(item.originalPrice ?? item.price ?? 0),
    actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
    quantity: Number(item.quantity || 0),
    category: item.category || "",
    discount: Number(item.discount || 0),
    unitId: item.unitId,
    unitName: item.unitName,
    unit: item.unit,
  });

  const mapHoldSale = (holdSale: any): HoldSaleRecord => ({
    id: holdSale.id,
    items: Array.isArray(holdSale.items) ? holdSale.items.map(normalizeItem) : [],
    subtotal: Number(holdSale.subtotal || 0),
    totalItems: Number(holdSale.total_items || 0),
    customerName: holdSale.customer?.name || "Walk-in",
    customerPhone: holdSale.customer?.phone_number || holdSale.customer?.mobile_number || "",
    customerId: holdSale.customer?.id || holdSale.customerId || null,
    createdAt: holdSale.created_at || new Date().toISOString(),
  });

  const refreshHoldSales = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/sale/hold");
      const holds = Array.isArray(response?.data?.data)
        ? response.data.data.map(mapHoldSale)
        : [];
      setHoldSales(holds);
    } catch (error) {
      console.error("Failed to load hold sales from API:", error);
      setHoldSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHoldSales();
  }, [refreshHoldSales]);

  const holdSale = useCallback(async (cart: CartItem[], customerId?: string) => {
    if (!cart.length) return false;

    try {
      const response = await apiClient.post("/sale/hold", {
        customerId,
        items: cart,
      });
      const created = response?.data?.data ? mapHoldSale(response.data.data) : null;
      if (created) {
        setHoldSales((prev) => [created, ...prev]);
        return true;
      }
      await refreshHoldSales();
      return true;
    } catch (error) {
      console.error("Failed to hold sale in DB:", error);
      return false;
    }
  }, [refreshHoldSales]);

  const retrieveHoldSale = useCallback(async (index: number): Promise<HoldSaleRecord | null> => {
    if (index < 0 || index >= holdSales.length) return null;
    const holdSaleRecord = holdSales[index];

    try {
      const response = await apiClient.post(`/sale/hold/${holdSaleRecord.id}/retrieve`, {});
      const retrieved = response?.data?.data ? mapHoldSale(response.data.data) : null;
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
      return retrieved;
    } catch (error) {
      console.error("Failed to retrieve hold sale from DB:", error);
      return null;
    }
  }, [holdSales]);

  const deleteHoldSale = useCallback(async (index: number) => {
    if (index < 0 || index >= holdSales.length) return;
    const holdSaleRecord = holdSales[index];

    try {
      await apiClient.delete(`/sale/hold/${holdSaleRecord.id}`);
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
    } catch (error) {
      console.error("Failed to delete hold sale from DB:", error);
    }
  }, [holdSales]);

  const clearAllHoldSales = useCallback(async () => {
    const holdIds = holdSales.map((sale) => sale.id);
    for (const holdId of holdIds) {
      try {
        await apiClient.delete(`/sale/hold/${holdId}`);
      } catch (error) {
        console.error("Failed to delete hold sale from DB:", error);
      }
    }
    setHoldSales([]);
  }, [holdSales]);

  return {
    holdSales,
    holdSale,
    retrieveHoldSale,
    deleteHoldSale,
    clearAllHoldSales,
    refreshHoldSales,
    holdSalesLoading: loading,
  };
}
