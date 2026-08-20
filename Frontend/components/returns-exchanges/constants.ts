export const RETURN_REASONS = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "DEFECTIVE", label: "Defective" },
  { value: "WRONG_ITEM", label: "Wrong Item" },
  { value: "CUSTOMER_CHANGED_MIND", label: "Customer Changed Mind" },
  { value: "MISSING_PARTS", label: "Missing Parts" },
  { value: "OTHER", label: "Other" },
] as const

export const REFUND_METHODS = [
  { value: "original_payment", label: "Original Payment Method" },
  { value: "cash", label: "Cash Refund" },
  { value: "store_credit", label: "Store Credit" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "no_refund", label: "No Refund" },
] as const

export const EXCHANGE_PAYMENT_METHODS = [
  { value: "CASH", label: "Cash (customer pays now)" },
  { value: "CREDIT", label: "Credit (add to customer ledger)" },
] as const

export const INVENTORY_DISPOSITIONS = [
  { value: "RESTOCK", label: "Restock Item" },
  { value: "DAMAGED", label: "Mark as Damaged" },
  { value: "UNSELLABLE", label: "Mark as Unsellable" },
] as const

export type ReturnReason = (typeof RETURN_REASONS)[number]["value"]
export type RefundMethod = (typeof REFUND_METHODS)[number]["value"]
export type ExchangePaymentMethod = (typeof EXCHANGE_PAYMENT_METHODS)[number]["value"]
export type InventoryDisposition = (typeof INVENTORY_DISPOSITIONS)[number]["value"]

export const RETURN_REASON_LABEL: Record<string, string> = Object.fromEntries(
  RETURN_REASONS.map((r) => [r.value, r.label])
)

export const REFUND_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  REFUND_METHODS.map((r) => [r.value, r.label])
)

export const EXCHANGE_PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  EXCHANGE_PAYMENT_METHODS.map((r) => [r.value, r.label])
)

/** User-facing sale status (DB enum stays REFUNDED / EXCHANGED). */
export const SALE_STATUS_DISPLAY: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Return",
  EXCHANGED: "Exchange",
}

export function formatSaleStatusLabel(status?: string | null): string {
  if (!status) return "—"
  return SALE_STATUS_DISPLAY[status] ?? status
}
