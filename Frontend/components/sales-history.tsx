"use client";

import React, { useState, useEffect, useRef } from "react";
import apiClient from "@/lib/apiClient";
import { formatSaleStatusLabel } from "@/components/returns-exchanges/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Search,
  RefreshCw,
  Download,
  Printer,
  CalendarIcon,
  Eye,
  Edit3,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Trash2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { isKioskMode } from "@/utils/kiosk-printing";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { downloadA4Invoice, generateA4InvoicePDF, printA4Invoice, shareOnEmail, shareOnWhatsApp, type InvoiceData } from "@/lib/pdf-generator";
import { creditLedgerFields } from "@/lib/credit-sale-ledger";
import { useStore } from "@/lib/store";
import { SaleEditor } from "./sale-editor";
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

interface SaleItem {
  id: string;
  product_id?: string;
  product: {
    name: string;
    sku?: string;
    unit?: { name?: string };
    unit_name?: string;
  };
  quantity: number;
  unit_price?: string;
  line_total: string;
  unit?: { name?: string };
  unit_name?: string;
}

interface Customer {
  id: string;
  name?: string;
  email: string;
  phone_number?: string;
  whatsapp_number?: string;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

interface Sale {
  id: string;
  sale_number: string;
  sale_date: string;
  total_amount: string;
  subtotal?: string;
  tax_amount?: string;
  discount_amount?: string;
  payment_method: string;
  payment_status?: string;
  payment_received?: string;
  upfrontPaid?: number;
  paidAtSale?: number;
  invoiceTotalPaid?: number;
  invoiceAmountDue?: number;
  ledgerPaymentStatus?: "PENDING" | "PARTIAL" | "PAID";
  status: string;
  customer: Customer | null;
  sale_items: SaleItem[];
  notes?: string;
  created_at?: string;
  branch?: Branch | null;
}

interface BranchInfo {
  name: string;
  address: string;
}

const normalizeReceiptAddress = (address?: string): string => {
  const normalized = typeof address === "string" ? address.trim() : "";

  if (!normalized) {
    return "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.";
  }

  if (/pakistan/i.test(normalized)) {
    return normalized;
  }

  if (/karachi/i.test(normalized)) {
    return `${normalized}, Pakistan`;
  }

  return `Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.`;
};

const buildReceiptBranchLine = (
  storeName?: string,
  _address?: string
): string => {
  const name = typeof storeName === "string" ? storeName.trim() : "";
  
  if (!name || ["ADMIN", "ACE ORBITS"].includes(name.toUpperCase())) {
    return "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.";
  }

  // Strictly follow: [Branch Name], Karachi, Pakistan
  return `Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.`;
};

export function SalesHistory() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [saleEditorOpen, setSaleEditorOpen] = useState(false);
  const [saleEditorData, setSaleEditorData] = useState<Sale | null>(null);
  const [saleEditorLoading, setSaleEditorLoading] = useState(false);
  const [deleteTargetSale, setDeleteTargetSale] = useState<Sale | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [branchInfo, setBranchInfo] = useState<BranchInfo>({
    name: "ACE ORBITS",
    address: "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
  });
  const [receiptHtml, setReceiptHtml] = useState<string>("");
  const [iframeHeight, setIframeHeight] = useState<number>(620);
  const receiptIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();
  const [kioskMode, setKioskMode] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const { customers, fetchCustomers } = useStore();
  const [customerSearch, setCustomerSearch] = useState("");
  const [datePreset, setDatePreset] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");

  const applyDatePreset = (
    preset: "all" | "today" | "week" | "month" | "year"
  ) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
      case "today":
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        break;
      case "week":
        setStartDate(startOfWeek(now, { weekStartsOn: 1 }));
        setEndDate(endOfWeek(now, { weekStartsOn: 1 }));
        break;
      case "month":
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        break;
      case "year":
        setStartDate(startOfYear(now));
        setEndDate(endOfYear(now));
        break;
      case "all":
      default:
        setStartDate(undefined);
        setEndDate(undefined);
        break;
    }
  };
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalSales, setTotalSales] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Helper function to safely format currency
  const formatCurrency = (
    value: string | number | undefined,
    showNegativeSymbol: boolean = true
  ): string => {
    if (!value && value !== 0) return "0.00";

    const numValue = typeof value === "string" ? parseFloat(value) : value;

    // Check if the number is valid
    if (isNaN(numValue)) return "0.00";

    // Handle negative values
    if (numValue < 0) {
      const absValue = Math.abs(numValue);
      if (showNegativeSymbol) {
        return `- ${absValue.toFixed(2)}`;
      } else {
        // For display purposes, show absolute value
        return `${absValue.toFixed(2)}`;
      }
    }

    return `${numValue.toFixed(2)}`;
  };

  // Helper function to get sale type based on total amount
  const getSaleType = (
    sale: Sale
  ): "sale" | "return" | "exchange" => {
    if (sale.status === "REFUNDED") return "return";
    if (sale.status === "EXCHANGED") return "exchange";
    const amount = parseFloat(sale.total_amount);
    if (!isNaN(amount) && amount < 0) return "return";
    return "sale";
  };

  const canDeleteSale = (sale: Sale) =>
    sale.status === "COMPLETED" ||
    sale.status === "REFUNDED" ||
    sale.status === "EXCHANGED";

  const handleConfirmDeleteSale = async () => {
    if (!deleteTargetSale) return;
    setIsDeletingSale(true);
    try {
      await apiClient.delete(`/sale/${deleteTargetSale.id}`);
      toast({
        title: "Sale deleted",
        description: `${deleteTargetSale.sale_number} was removed. Stock and customer balance were updated.`,
      });
      if (viewSale?.id === deleteTargetSale.id) {
        setViewSale(null);
        setReceiptHtml("");
        setReceiptData(null);
      }
      setDeleteTargetSale(null);
      await fetchSales();
    } catch (err: any) {
      toast({
        title: "Could not delete sale",
        description:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to delete sale. It may have linked returns or exchanges.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSale(false);
    }
  };

  // Fetch sales
  const openSaleEditor = async (saleId: string) => {
    setSaleEditorOpen(true);
    setSaleEditorLoading(true);
    setSaleEditorData(null);
    try {
      const res = await apiClient.get(`/sale/${saleId}`);
      const payload = (res.data as { data?: Sale })?.data ?? res.data;
      const full = payload as Sale;
      if (!full?.id) {
        throw new Error("Invalid sale response");
      }
      setSaleEditorData(full);
    } catch (err: any) {
      console.error("Failed to load sale for edit:", err);
      toast({
        title: "Could not open sale editor",
        description:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load sale details. Try again.",
        variant: "destructive",
      });
      setSaleEditorOpen(false);
    } finally {
      setSaleEditorLoading(false);
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      // Get branch ID from localStorage - ALWAYS use it if available
      // Backend will filter by this branchId regardless of admin status
      const branchId = localStorage.getItem("branch");
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      // Build query parameters
      // ALWAYS send branchId from localStorage if it exists and is valid
      // Backend will filter by this branchId (even for admins)
      // If no branchId in localStorage, backend will show all for admins or use JWT branch_id for non-admins
      const params: Record<string, string> = {};
      if (branchId && branchId !== "Not Found" && branchId.trim()) {
        params.branchId = branchId.trim();
      }
      if (selectedCustomerId && selectedCustomerId !== "all") {
        params.customerId = selectedCustomerId;
      }
      if (selectedPaymentMethod && selectedPaymentMethod !== "all") {
        params.paymentMethod = selectedPaymentMethod;
      }

      if (pageSize > 0) {
        params.page = String(currentPage);
        params.limit = String(pageSize);
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (startDate) {
        params.startDate = startDate.toISOString();
      }
      if (endDate) {
        const inclusiveEnd = new Date(endDate);
        inclusiveEnd.setHours(23, 59, 59, 999);
        params.endDate = inclusiveEnd.toISOString();
      }
      
      // Debug logging
      console.log("Fetching sales with params:", { 
        branchId: params.branchId, 
        isAdmin, 
        userRole,
        localStorageBranchId: branchId 
      });
      
      const res = await apiClient.get<{
        data: Sale[];
        meta?: { total?: number; totalPages?: number; page?: number; limit?: number };
      }>("/sale", { params });

      // Filter out or handle invalid sales data
      const validSales = res.data.data.filter((sale) => {
        // Basic validation
        return (
          sale.id &&
          sale.sale_number &&
          sale.sale_date &&
          sale.total_amount !== undefined
        );
      });

      setSales(validSales);
      setTotalSales(res.data.meta?.total ?? validSales.length);
      setTotalPages(res.data.meta?.totalPages ?? 1);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
      toast({ title: "Failed to load sales", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [currentPage, pageSize, searchTerm, startDate, endDate, selectedCustomerId, selectedPaymentMethod]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const loadBranchInfo = async () => {
      try {
        const branchStr = localStorage.getItem("branch");
        if (!branchStr) return;
        // Skip if branch is "Not Found" or user is admin
        const userRole = localStorage.getItem("role");
        const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
        
        if (branchStr === "Not Found" || isAdmin) {
          setBranchInfo({
            name: "Admin",
            address: "",
          });
          return;
        }
        
        setBranchInfo((prev) => ({
          ...prev,
          name: prev.name, // Keep existing if error
        }));
        const branchRes = await apiClient.get(`/branches/${branchStr}`);
        setBranchInfo({
          name: branchRes.data.data.name || branchStr,
          address: branchRes.data.data.address || "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
        });
      } catch (error) {
        console.warn("Failed to load branch info", error);
      }
    };
    loadBranchInfo();
  }, []);

  useEffect(() => {
    setKioskMode(isKioskMode());
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, selectedCustomerId, selectedPaymentMethod]);

  // Export CSV
  const exportCSV = () => {
    const header = [
      "Sale #",
      "Date",
      "Customer",
      "Payment",
      "Total",
      "Status",
      "Type",
    ];
    const rows = sales.map((s) => [
      s.sale_number,
      format(parseISO(s.sale_date), "yyyy-MM-dd"),
      s.customer?.email || "—",
      s.payment_method,
      formatCurrency(s.total_amount, true), // Include negative symbol in export
      formatSaleStatusLabel(s.status),
      getSaleType(s).toUpperCase(),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print
  const printTable = () => window.print();

  const prepareReceiptDataFromSale = (sale: Sale, branch: BranchInfo): ReceiptData => {
    const subtotalFromApi = sale.subtotal ? parseFloat(sale.subtotal) : NaN;
    const subtotal =
      !isNaN(subtotalFromApi) && subtotalFromApi > 0
        ? subtotalFromApi
        : sale.sale_items.reduce((sum, item) => sum + parseFloat(item.line_total || "0"), 0);
    const discount = sale.discount_amount ? parseFloat(sale.discount_amount) : 0;
    const total = parseFloat(sale.total_amount);

    const items = sale.sale_items.map((item) => {
      const lineTotal = parseFloat(item.line_total || "0");
      const unitPrice =
        item.unit_price !== undefined
          ? parseFloat(item.unit_price)
          : lineTotal / Math.max(1, item.quantity);

      const unitLabel =
        (item.product as any)?.unit?.name ||
        (item.product as any)?.unit_name ||
        (item as any)?.unit?.name ||
        (item as any)?.unit_name ||
        (item as any)?.unitName ||
        undefined;

      return {
        name: item.product?.name || "Unnamed Item",
        quantity: item.quantity,
        price: unitPrice,
        unit: unitLabel,
      };
    });

    return {
      storeName: branch.name || "ACE ORBITS",
      address: branch.address || "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
      transactionId: sale.sale_number,
      items,
      subtotal,
      total,
    } as any;
  };

  const mapSaleToInvoiceData = (sale: any): InvoiceData => {
    const subtotal = parseFloat(sale.subtotal || "0");
    const discount = parseFloat(sale.discount_amount || sale.discount || "0");
    const total = parseFloat(sale.total_amount || sale.total_payable || "0");

    const items = (sale.sale_items || []).map((item: any) => {
      const lineTotal = parseFloat(item.line_total || "0");
      const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : (lineTotal / Math.max(1, item.quantity));
      
      const unitLabel = 
        (item.product as any)?.unit?.name || 
        (item as any)?.unit?.name || 
        (item as any)?.unit_name || 
        "pcs";

      return {
        name: item.product?.name || "Unnamed Item",
        quantity: item.quantity,
        price: unitPrice,
        lineTotal: lineTotal,
        unit: unitLabel,
      };
    });

    return {
      storeName: sale.branch?.name || "ACE ORBITS",
      storeAddress: sale.branch?.address || "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
      storePhone: "02132727444",
      customerName: sale.customer?.name || "Walk-in Customer",
      customerPhone: sale.customer?.phone_number || "",
      customerWhatsApp: sale.customer?.whatsapp_number || sale.customer?.phone_number || "",
      customerEmail: sale.customer?.email || "",
      saleNumber: sale.sale_number,
      date: parseISO(sale.sale_date),
      items,
      subtotal,
      discount,
      total,
      paymentMethod: sale.payment_method || "CASH",
      balanceDue:
        sale.payment_method === "CREDIT"
          ? (creditLedgerFields(sale)?.invoiceAmountDue ?? 0)
          : 0,
      amountPaid:
        sale.payment_method === "CREDIT"
          ? (creditLedgerFields(sale)?.invoiceTotalPaid ?? 0)
          : (parseFloat(sale.payment_received || "0") || total),
      previousBalance: parseFloat(sale.previous_balance || "0"),
    };
  };

  const generatePremiumInvoiceHtml = (data: InvoiceData) => {
    const money = (n: number) => {
      return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    const itemsHtml = (data.items || [])
      .map((item, idx) => `
        <tr>
          <td style="padding: 4px 0; font-size: 12px; text-align: center; width: 40px;">${idx + 1}</td>
          <td style="padding: 4px 0; font-size: 12px;">${item.name}</td>
          <td style="padding: 4px 0; font-size: 12px; text-align: center;">${item.quantity}</td>
          <td style="padding: 4px 0; font-size: 12px; text-align: right;">${item.price.toFixed(2)}</td>
          <td style="padding: 4px 0; font-size: 12px; text-align: right; font-weight: 600;">${item.lineTotal.toFixed(2)}</td>
        </tr>
      `).join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title></title>
          <style>
            @page { size: A4; margin: 10mm; }
            html, body { margin: 0; }
            body { font-family: 'Helvetica', Arial, sans-serif; color: #000; line-height: 1.4; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
            .logo-section { display: flex; flex-direction: column; align-items: flex-start; }
            .brand-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
            .logo { height: 44px; width: auto; max-width: 100%; object-fit: contain; }
            .store-name { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; }
            .store-info { font-size: 11px; color: #555; }
            .invoice-info { text-align: right; }
            .invoice-label { font-size: 22px; font-weight: bold; margin-bottom: 8px; }
            .info-row { font-size: 13px; margin-bottom: 4px; }
            .info-val { font-weight: bold; }
            .bill-to { margin-bottom: 12px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
            .bill-label { font-size: 11px; color: #777; text-transform: uppercase; }
            .customer-name { font-size: 14px; font-weight: bold; }
            .bill-to .info-row { width: 100%; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { text-align: left; border-bottom: 2px solid #000; padding: 6px 0; font-size: 11px; text-transform: uppercase; }
            .summary { display: flex; flex-direction: column; align-items: flex-end; }
            .summary-row { display: flex; width: 250px; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
            .grand-total { border-top: 1px solid #000; padding-top: 10px; margin-top: 10px; font-size: 18px; font-weight: bold; }
            .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              <div class="brand-row">
                <img src="/logo.jpeg" class="logo" onerror="this.style.display='none'"/>
                <div class="store-name">ACE ORBITS</div>
              </div>
              <div class="store-info">
                Shop no 109, 1st floor city shopping mall, Marston road<br>
                Karachi, Pakistan.<br>
                Contact: (021) 3272-7444
              </div>
            </div>
            <div class="invoice-info">
              <div class="invoice-label">INVOICE</div>
              <div class="info-row">Date: <span class="info-val">${new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span></div>
              <div class="info-row">Invoice No: <span class="info-val">#${data.saleNumber}</span></div>
              <div class="info-row">Payment: <span class="info-val">${data.paymentMethod}</span></div>
            </div>
          </div>

          <div class="bill-to">
            <div class="bill-label">Bill To:</div>
            <div class="customer-name">${data.customerName || 'Walk-in Customer'}</div>
            ${data.customerPhone ? `<div class="info-row">${data.customerPhone}</div>` : ''}
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
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Subtotal</span>
              <span>${data.subtotal.toFixed(2)}</span>
            </div>
            ${data.discount > 0 ? `
              <div class="summary-row">
                <span>Discount</span>
                <span>- ${data.discount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="summary-row grand-total">
              <span>${(data.previousBalance && data.previousBalance > 0) ? 'This Sale Total' : 'Grand Total'}</span>
              <span>PKR ${data.total.toFixed(2)}</span>
            </div>
            ${data.paymentMethod === 'CREDIT' ? `
              <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                <span>Amount Paid</span>
                <span>PKR ${money(data.amountPaid ?? 0)}</span>
              </div>
              <div class="summary-row" style="color: #c00; font-weight: bold;">
                <span>Balance Due</span>
                <span>PKR ${money(data.balanceDue ?? 0)}</span>
              </div>
            ` : ''}
            ${(data.previousBalance && data.previousBalance > 0) ? `
              <div class="summary-row" style="color: #c00; margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                <span>Previous Balance</span>
                <span>PKR ${data.previousBalance.toFixed(2)}</span>
              </div>
              <div class="summary-row grand-total">
                <span>Net Payable</span>
                <span>PKR ${(data.previousBalance + data.total).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          <div class="footer">
            Powered by ACE ORBITS | Support: +92 336 2500357 | www.aceorbitsus.com
          </div>
        </body>
      </html>
    `;
  };

  const receiptPageWrapper = (content: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            height: 100%;
            min-height: 100%;
            overflow-x: hidden;
            overflow-y: auto;
            font-family: 'Helvetica', 'Arial', sans-serif;
            width: 100%;
            max-width: 100%;
          }
          body {
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 0;
          }
          .receipt {
            width: 100%;
            max-width: 100%;
            background: #ffffff;
            color: #000000;
            padding: 20px 16px 24px 16px;
            margin: 0;
            overflow: hidden;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-weight: bold;
            box-sizing: border-box;
            display: block;
          }
          .logo {
            text-align: center;
            margin-bottom: 3mm;
          }
          .logo-img {
            max-width: 48mm;
            max-height: 24mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto 3mm auto;
            object-fit: contain;
            filter: grayscale(100%) contrast(200%);
            image-rendering: pixelated;
          }
          .store-name {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            margin-bottom: 2mm;
            color: #000000;
            line-height: 1.2;
          }
          .tagline {
            font-size: 9.4pt;
            text-align: center;
            margin-bottom: 2mm;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
          .divider {
            border-top: 1px dotted #000;
            margin: 3mm 0;
            height: 0;
            width: 100%;
          }
          .divider-thin {
            border-top: 0.5px dotted #000;
            margin: 3mm 0;
            height: 0;
            width: 100%;
          }
          .row-lr {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin: 2mm 0;
            font-size: 9.4pt;
            line-height: 1.3;
            word-break: break-word;
          }
          .row-lr .label {
            flex: 0 0 45%;
            text-align: left;
            font-weight: bold;
            color: #000000;
          }
          .row-lr .value {
            flex: 1;
            text-align: right;
            font-weight: bold;
            color: #000000;
            word-break: break-all;
          }
          .total-row {
            font-size: 11.2pt;
            margin-top: 2mm;
            font-weight: bold;
          }
          .items-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            font-weight: bold;
            font-size: 11.2pt;
            margin-bottom: 1mm;
            color: #000000;
          }
          .items-divider {
            border-top: 1px solid #000;
            margin: 1mm 0 2mm 0;
            height: 0;
            width: 100%;
          }
          .item-col {
            flex: 0 0 48%;
            text-align: left;
          }
          .qty-col {
            flex: 0 0 18%;
            text-align: center;
          }
          .rate-col {
            flex: 1;
            text-align: right;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
            margin: 1.5mm 0;
            font-size: 9.4pt;
            line-height: 1.3;
            word-break: break-word;
          }
          .item-name {
            flex: 0 0 48%;
            text-align: left;
            padding-right: 2mm;
            word-break: break-word;
          }
          .item-qty {
            flex: 0 0 18%;
            text-align: center;
            word-break: break-word;
          }
          .item-rate {
            flex: 1;
            text-align: right;
            word-break: break-all;
          }
          .barcode-section {
            text-align: center;
            margin: 4mm 0;
          }
          .barcode-section svg {
            max-width: 48mm;
            height: 14mm;
            display: block;
            margin: 0 auto;
          }
          .barcode-number {
            font-size: 9.8pt;
            margin-top: 2mm;
            font-weight: bold;
            letter-spacing: 1px;
            color: #000000;
            text-align: center;
          }
          .thank-you {
            font-size: 10.6pt;
            margin-top: 4mm;
            margin-bottom: 2mm;
            font-weight: bold;
            text-align: center;
            color: #000000;
            line-height: 1.2;
          }
          .footer-line {
            font-size: 9.8pt;
            margin: 1mm 0;
            font-weight: bold;
            text-align: center;
            color: #000000;
            line-height: 1.2;
          }
          .promo {
            font-size: 9.4pt;
            text-align: center;
            margin: 2mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.3;
            word-break: break-word;
          }
          .powered-by {
            font-size: 8.5pt;
            text-align: center;
            margin: 3mm 0 1mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
          .ace-line {
            font-size: 8pt;
            text-align: center;
            margin: 1mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            const barcodeElement = document.getElementById('barcode-svg');
            const barcodeNumber = document.getElementById('barcode-number')?.textContent || '';
            if (barcodeElement && barcodeNumber && window.JsBarcode) {
              try {
                JsBarcode(barcodeElement, barcodeNumber, {
                  format: "CODE128",
                  width: 2,
                  height: 50,
                  displayValue: false,
                  margin: 0,
                  background: "#ffffff",
                  lineColor: "#000000"
                });
              } catch (err) {
                console.error('Barcode generation failed:', err);
              }
            }
          };
        </script>
      </body>
    </html>
  `;

  // Fetch single sale (simulate API call, but use local data for now)
  const handleViewSale = async (saleId: string) => {
    setViewLoading(true);
    // Simulate API call delay
    const sale = sales.find((s) => s.id === saleId) || null;
    setTimeout(() => {
      setViewSale(sale);
      setViewLoading(false);
    }, 300); // Simulate network delay
  };

  const closeViewModal = () => {
    setViewSale(null);
    setViewLoading(false);
  };

  useEffect(() => {
    if (viewSale) {
      const invoiceData = mapSaleToInvoiceData(viewSale);
      const htmlContent = generatePremiumInvoiceHtml(invoiceData);
      setReceiptHtml(htmlContent);
    } else {
      setReceiptHtml("");
      setReceiptData(null);
    }
  }, [viewSale, branchInfo]);

  useEffect(() => {
    const iframe = receiptIframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const body = doc.body;
        const html = doc.documentElement;
        
        // Wait a bit for content to render
        setTimeout(() => {
          const height = Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            html?.clientHeight ?? 0,
            html?.scrollHeight ?? 0,
            html?.offsetHeight ?? 0
          );
          // Limit height to prevent overflow, with max of 65vh for better modal fit
          const maxHeight = Math.min(window.innerHeight * 0.65, height + 40);
          setIframeHeight(Math.max(500, maxHeight));
        }, 100);
      } catch (error) {
        console.warn("Failed to measure receipt height", error);
      }
    };

    iframe.addEventListener("load", handleLoad);
    // Also check on window resize
    window.addEventListener("resize", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      window.removeEventListener("resize", handleLoad);
    };
  }, [receiptHtml]);

  const handleBrowserPrintReceipt = () => {
    if (!receiptHtml) return;
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) {
      toast({ title: "Unable to open print window", variant: "destructive" });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        console.error("Print failed", error);
      }
    }, 500);
  };

  const handleServerPrint = async () => {
    if (!receiptData) {
      toast({ title: "No receipt data available", variant: "destructive" });
      return;
    }
    const printerInfo = getReceiptPrinterObj();
    const printerName = printerInfo?.name || (kioskMode ? "Default Printer" : "");
    if (!printerName) {
      toast({
        variant: "destructive",
        title: "No receipt printer configured",
        description: "Go to Printer Settings to select a receipt printer.",
      });
      return;
    }
    const printerObj = {
      name: printerName,
      columns: printerInfo?.receiptProfile?.columns || { fontA: 48, fontB: 64 },
    };
    const job = { copies: 1, cut: true, openDrawer: false };
    try {
      const result = await printReceiptViaServer(printerObj, receiptData, job);
      if (result.success) {
        toast({
          title: "Receipt sent to printer",
          description: `Printer: ${printerName}`,
        });
      } else {
        throw new Error(result.error || "Print server error");
      }
    } catch (error: any) {
      console.error("Server print failed:", error);
      toast({
        variant: "destructive",
        title: "Print failed",
        description: error?.message || "Unable to print via print server.",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
          <p className="text-sm md:text-base text-gray-600">View and export past sales</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={fetchSales} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" onClick={printTable}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 sm:max-w-sm relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-10"
            placeholder="Search sale # or customer"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          value={selectedCustomerId}
          onValueChange={(value) => {
            setSelectedCustomerId(value);
            setCustomerSearch("");
          }}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <Input
                placeholder="Search customer..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8"
              />
            </div>
            <SelectItem value="all">All Customers</SelectItem>
            {customers
              .filter((c) => {
                const term = customerSearch.trim().toLowerCase();
                if (!term) return true;
                return (
                  c.name?.toLowerCase().includes(term) ||
                  (c.phone_number || c.phone || "").toLowerCase().includes(term)
                );
              })
              .slice(0, 100)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.phone_number || c.phone ? ` · ${c.phone_number || c.phone}` : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedPaymentMethod}
          onValueChange={setSelectedPaymentMethod}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All Payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="CREDIT">Credit</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={datePreset === "custom" ? "custom" : datePreset}
          onValueChange={(value) => {
            if (value === "custom") {
              setDatePreset("custom");
              return;
            }
            applyDatePreset(value as "all" | "today" | "week" | "month" | "year");
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            {datePreset === "custom" ? (
              <SelectItem value="custom">Custom Range</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate && endDate
                ? format(startDate, "MM/dd/yyyy") === format(endDate, "MM/dd/yyyy")
                  ? format(startDate, "MM/dd/yyyy")
                  : `${format(startDate, "MM/dd/yyyy")} - ${format(endDate, "MM/dd/yyyy")}`
                : startDate
                  ? format(startDate, "MM/dd/yyyy")
                  : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Click one day to see that date. Click a second day for a range.
            </p>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={startDate ? { from: startDate, to: endDate ?? startDate } : undefined}
              onSelect={(range) => {
                setStartDate(range?.from);
                // One click → single day (to falls back to from), second click → range.
                setEndDate(range?.to ?? range?.from);
                setDatePreset("custom");
              }}
            />
            <Separator className="my-2" />
            <Button
              onClick={() => {
                setStartDate(undefined);
                setEndDate(undefined);
                setDatePreset("all");
              }}
              className="w-full"
            >
              Clear Dates
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales History ({totalSales})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Sale #</TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[100px]">Payment</TableHead>
                    <TableHead className="min-w-[100px]">Total</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      <PageLoader message="Loading sales..." />
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-gray-500"
                    >
                      No sales found
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => {
                    const saleType = getSaleType(s);
                    const isNegative = parseFloat(s.total_amount) < 0;

                    return (
                      <TableRow
                        key={s.id}
                        className={isNegative ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-medium">
                          {s.sale_number}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(s.sale_date), "MM/dd/yyyy")}
                        </TableCell>
                        <TableCell>{s.customer?.name || "—"}</TableCell>
                        <TableCell>{s.payment_method}</TableCell>
                        <TableCell
                          className={
                            isNegative ? "text-red-600 font-medium" : ""
                          }
                        >
                          {formatCurrency(s.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              saleType === "return" || saleType === "exchange"
                                ? "destructive"
                                : "default"
                            }
                          >
                            {saleType.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.status === "COMPLETED" ? "default" : "outline"
                            }
                          >
                            {formatSaleStatusLabel(s.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewSale(s.id)}
                            title="View Receipt"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openSaleEditor(s.id)}
                            title="Edit Sale"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          {canDeleteSale(s) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTargetSale(s)}
                              title="Delete Sale"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
          
          {/* Pagination */}
          {totalSales > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="text-sm font-medium whitespace-nowrap">
                  Items per page:
                </Label>
                <Select 
                  value={String(pageSize)} 
                  onValueChange={value => { 
                    setPageSize(Number(value)); 
                    setCurrentPage(1); 
                  }}
                >
                  <SelectTrigger className="w-32" id="page-size">
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
                  Showing {totalSales === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min((currentPage - 1) * pageSize + sales.length, totalSales)} of {totalSales} sales
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
        </CardContent>
      </Card>

      {/* Sale Receipt Modal */}
      <Dialog open={!!viewSale || viewLoading} onOpenChange={closeViewModal}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl">
          {viewLoading ? (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
              <PageLoader message="Loading sale details..." />
            </div>
          ) : viewSale ? (
            <>
              <DialogHeader className="px-8 pt-8 pb-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-2xl font-bold text-gray-900 mb-2">Sale Receipt</DialogTitle>
                    <DialogDescription className="text-sm text-gray-600">
                      View and print the receipt exactly as it appears at checkout.
                    </DialogDescription>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md font-medium">
                    {viewSale.sale_number}
                  </div>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden bg-gray-50">
                <div className="h-full overflow-auto p-3 sm:p-4 flex justify-center items-start">
                  {receiptHtml ? (
                    <div className="w-full max-w-5xl mx-auto">
                      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-3 sm:p-4 overflow-hidden">
                        <iframe
                          ref={receiptIframeRef}
                          title="Receipt Preview"
                          srcDoc={receiptHtml}
                          className="block w-full bg-white rounded-lg shadow-inner"
                          style={{
                            width: "100%",
                            minHeight: "400px",
                            height: `${Math.min(iframeHeight, window.innerHeight * 0.65)}px`,
                            border: "none",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-20 w-full">
                      <div className="text-lg font-medium mb-2">Receipt preview unavailable</div>
                      <div className="text-sm">Unable to load receipt data</div>
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter className="px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
                <div className="w-full space-y-3">
                  {/* First line: Sale info and Printer */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
                    <div className="text-sm text-gray-700 flex items-center">
                      <span className="font-semibold text-gray-900">Sale #{viewSale.sale_number}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      <span className="text-gray-600">{format(parseISO(viewSale.sale_date), "PPpp")}</span>
                    </div>
                    {receiptPrinter && (
                      <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                        🖨️ <span className="font-medium">{receiptPrinter}</span>
                      </div>
                    )}
                  </div>
                  {/* Second line: Action buttons */}
                  <div className="flex items-center justify-between gap-2.5 w-full">
                    <div className="flex items-center gap-2.5">
                      <Button 
                        onClick={() => downloadA4Invoice(mapSaleToInvoiceData(viewSale))} 
                        className="whitespace-nowrap shadow-sm hover:shadow-md transition-all bg-blue-600 hover:bg-blue-700"
                        size="default"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download A4 Invoice
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => printA4Invoice(mapSaleToInvoiceData(viewSale))}
                        className="whitespace-nowrap shadow-sm hover:shadow-md transition-all"
                        size="default"
                      >
                        Print Invoice
                      </Button>
                      <Button
                        variant="outline"
                        className="bg-[#25D366]/10 text-[#075E54] hover:bg-[#25D366]/20 border-[#25D366]/30 whitespace-nowrap shadow-sm transition-all"
                        size="default"
                        onClick={async () => {
                          try {
                            const invoiceData = mapSaleToInvoiceData(viewSale);
                            await shareOnWhatsApp(invoiceData);
                          } catch (e) {
                            toast({ title: "Failed to share via WhatsApp", variant: "destructive" });
                          }
                        }}
                      >
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                        WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        className="bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 whitespace-nowrap shadow-sm transition-all"
                        size="default"
                        onClick={async () => {
                          try {
                            const invoiceData = mapSaleToInvoiceData(viewSale);
                            await shareOnEmail(invoiceData);
                          } catch (e) {
                            toast({ title: "Failed to share via Email", variant: "destructive" });
                          }
                        }}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </Button>
                    </div>
                    <Button 
                      variant="default" 
                      onClick={closeViewModal}
                      className="whitespace-nowrap bg-black hover:bg-gray-800 text-white h-9"
                      size="default"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <SaleEditor
        sale={saleEditorData}
        open={saleEditorOpen}
        loading={saleEditorLoading}
        onOpenChange={(open) => {
          if (!open) {
            setSaleEditorOpen(false);
            setSaleEditorData(null);
            setSaleEditorLoading(false);
          }
        }}
        onSuccess={fetchSales}
      />

      <AlertDialog
        open={deleteTargetSale !== null}
        onOpenChange={(open) => !open && !isDeletingSale && setDeleteTargetSale(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetSale ? (
                <>
                  This will permanently remove sale{" "}
                  <strong>{deleteTargetSale.sale_number}</strong>, undo its stock
                  changes, and reverse any customer ledger entries. This cannot be
                  undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSale}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingSale}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDeleteSale();
              }}
            >
              {isDeletingSale ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Sale"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
