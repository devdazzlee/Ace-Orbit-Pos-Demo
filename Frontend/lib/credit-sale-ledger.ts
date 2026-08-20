/** Ledger-derived fields attached by the sales API for credit invoices. */
export type CreditSaleLedgerFields = {
  /** Collected at the counter when the sale was placed (not later Receive Payment). */
  paidAtSale: number;
  upfrontPaid: number;
  invoiceTotalPaid: number;
  invoiceAmountDue: number;
  ledgerPaymentStatus: "PENDING" | "PARTIAL" | "PAID";
};

export type SaleWithLedgerFields = {
  payment_method?: string | null;
  payment_received?: string | number | null;
  total_amount?: string | number | null;
} & Partial<CreditSaleLedgerFields>;

export function creditLedgerFields(sale: SaleWithLedgerFields): CreditSaleLedgerFields | null {
  if (String(sale.payment_method ?? "").toUpperCase() !== "CREDIT") return null;
  const paidAtSale = Number(sale.paidAtSale ?? sale.upfrontPaid ?? 0);
  return {
    paidAtSale,
    upfrontPaid: paidAtSale,
    invoiceTotalPaid: Number(sale.invoiceTotalPaid ?? 0),
    invoiceAmountDue: Number(sale.invoiceAmountDue ?? 0),
    ledgerPaymentStatus: (sale.ledgerPaymentStatus ?? "PENDING") as CreditSaleLedgerFields["ledgerPaymentStatus"],
  };
}

/** Paid Amount for credit sale editor — counter payment at sale time only. */
export function creditPaidAtSaleForEditor(sale: SaleWithLedgerFields): number {
  if (String(sale.payment_method ?? "").toUpperCase() !== "CREDIT") return 0;

  const paidAtSale = Number(sale.paidAtSale ?? sale.upfrontPaid ?? 0);
  if (paidAtSale > 0.009) return paidAtSale;

  const savedOnSale = Number(sale.payment_received ?? 0);
  const invoiceTotalPaid = Number(sale.invoiceTotalPaid ?? 0);
  // Use sale record when it reflects counter payment only (not mixed with Receive Payment).
  if (savedOnSale > 0.009 && invoiceTotalPaid <= savedOnSale + 0.009) {
    return savedOnSale;
  }

  return paidAtSale;
}
