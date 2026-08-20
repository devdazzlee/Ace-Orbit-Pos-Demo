import { parseISO } from "date-fns";
import type { InvoiceData } from "@/lib/pdf-generator";
import { creditLedgerFields } from "@/lib/credit-sale-ledger";

export function mapSaleToInvoiceData(sale: Record<string, unknown>): InvoiceData {
  const subtotal = parseFloat(String(sale.subtotal ?? "0"));
  const discount = parseFloat(String(sale.discount_amount ?? sale.discount ?? "0"));
  const total = parseFloat(String(sale.total_amount ?? sale.total_payable ?? "0"));

  const items = ((sale.sale_items as unknown[]) || []).map((raw) => {
    const item = raw as Record<string, unknown>;
    const product = item.product as Record<string, unknown> | undefined;
    const unit = item.unit as Record<string, unknown> | undefined;
    const productUnit = product?.unit as Record<string, unknown> | undefined;
    const lineTotal = parseFloat(String(item.line_total ?? "0"));
    const qty = Number(item.quantity ?? 0);
    const unitPrice =
      item.unit_price !== undefined
        ? parseFloat(String(item.unit_price))
        : lineTotal / Math.max(1, qty);

    const unitLabel =
      (productUnit?.name as string) ||
      (unit?.name as string) ||
      (item.unit_name as string) ||
      "pcs";

    return {
      name: (product?.name as string) || "Unnamed Item",
      quantity: qty,
      price: unitPrice,
      lineTotal,
      unit: unitLabel,
    };
  });

  const isCredit = String(sale.payment_method ?? "CASH").toUpperCase() === "CREDIT";
  const ledger = creditLedgerFields(sale);
  const cashPaid = parseFloat(String(sale.payment_received ?? "0"));
  const openingBalance = parseFloat(String(sale.previous_balance ?? "0"));

  // Non-credit sales keep only the cash leg in payment_received — the shortfall against
  // the invoice was settled from advance credit. Guarded on the customer actually having
  // held credit so legacy rows with a zeroed payment_received aren't misread.
  const advanceApplied =
    !isCredit && openingBalance < 0
      ? Math.min(Math.max(0, Number((total - cashPaid).toFixed(2))), -openingBalance)
      : 0;

  return {
    storeName: (sale.branch as { name?: string } | undefined)?.name || "ACE ORBITS",
    storeAddress:
      (sale.branch as { address?: string } | undefined)?.address ||
      "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
    storePhone: "02132727444",
    customerName: (sale.customer as { name?: string } | undefined)?.name || "Walk-in Customer",
    customerPhone: (sale.customer as { phone_number?: string } | undefined)?.phone_number || "",
    customerWhatsApp:
      (sale.customer as { whatsapp_number?: string } | undefined)?.whatsapp_number ||
      (sale.customer as { phone_number?: string } | undefined)?.phone_number ||
      "",
    customerEmail: (sale.customer as { email?: string } | undefined)?.email || "",
    saleNumber: String(sale.sale_number ?? ""),
    date: parseISO(String(sale.sale_date)),
    items,
    subtotal,
    discount,
    total,
    paymentMethod: String(sale.payment_method ?? "CASH"),
    balanceDue: isCredit && ledger ? ledger.invoiceAmountDue : 0,
    amountPaid: isCredit && ledger ? ledger.invoiceTotalPaid : advanceApplied > 0 ? cashPaid : cashPaid || total,
    previousBalance: openingBalance,
    advanceApplied,
    closingBalance: Number((openingBalance + advanceApplied).toFixed(2)),
  };
}
