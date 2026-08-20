"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, Printer, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import apiClient from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { downloadA4Invoice, printA4Invoice } from "@/lib/pdf-generator";
import { mapSaleToInvoiceData } from "@/lib/sale-invoice-mapper";

interface SaleBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleRef: string | null;
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SaleBillDialog({ open, onOpenChange, saleRef }: SaleBillDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState<any>(null);

  const fetchSale = useCallback(async () => {
    if (!saleRef?.trim()) return;
    setLoading(true);
    setSale(null);
    try {
      const res = await apiClient.get(`/sale/${encodeURIComponent(saleRef.trim())}`, {
        headers: { "X-Skip-Offline-Cache": "true" },
      });
      const payload = (res.data as { data?: unknown })?.data ?? res.data;
      if (!(payload as { id?: string })?.id) {
        throw new Error("Invalid sale response");
      }
      setSale(payload);
    } catch (error: any) {
      toast({
        title: "Could not load bill",
        description:
          error.response?.data?.message ||
          error.message ||
          "Failed to load sale invoice details.",
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [saleRef, toast, onOpenChange]);

  useEffect(() => {
    if (open && saleRef) {
      fetchSale();
    }
    if (!open) {
      setSale(null);
    }
  }, [open, saleRef, fetchSale]);

  const invoiceData = sale ? mapSaleToInvoiceData(sale) : null;
  const items = invoiceData?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-sky-600" />
            Sale Bill
          </DialogTitle>
          <DialogDescription>
            {sale
              ? `${sale.sale_number} · ${format(new Date(sale.sale_date), "dd MMM yyyy, hh:mm a")}`
              : "Loading invoice details..."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : sale && invoiceData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase text-slate-500">Invoice</p>
                <p className="font-mono text-sm font-semibold mt-1">{sale.sale_number}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase text-slate-500">Payment</p>
                <Badge variant="outline" className="mt-1">
                  {sale.payment_method || "CASH"}
                </Badge>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase text-slate-500">Subtotal</p>
                <p className="font-semibold tabular-nums mt-1">{money(invoiceData.subtotal)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase text-slate-500">Total</p>
                <p className="font-bold text-lg tabular-nums mt-1">{money(invoiceData.total)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">#</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Product</th>
                    <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Qty</th>
                    <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Rate</th>
                    <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                        No line items on this bill
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={`${item.name}-${idx}`} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.quantity} {item.unit || "pcs"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(item.price)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {money(item.lineTotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-slate-600">
                      Discount
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(invoiceData.discount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-slate-800">
                      Grand Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                      {money(invoiceData.total)}
                    </td>
                  </tr>
                  {invoiceData.paymentMethod === "CREDIT" && (
                    <>
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right text-slate-600">
                          Paid on this bill
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                          {money(invoiceData.amountPaid ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right text-slate-600">
                          Balance due
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 font-semibold">
                          {money(invoiceData.balanceDue)}
                        </td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {invoiceData && (
            <>
              <Button
                variant="outline"
                onClick={() => downloadA4Invoice(invoiceData)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download PDF
              </Button>
              <Button onClick={() => printA4Invoice(invoiceData)}>
                <Printer className="h-4 w-4 mr-1.5" />
                Print Bill
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
