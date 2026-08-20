import { LedgerEntryType } from '@prisma/client';

type LedgerAdjustmentRow = {
  entry_type: LedgerEntryType;
  sale_id: string | null;
  description: string | null;
  reference_no: string | null;
};

type LedgerPaymentRow = {
  entry_type: LedgerEntryType;
  description: string | null;
};

export function saleUpfrontPaymentDescription(saleNumber: string): string {
  return `Upfront payment on ${saleNumber}`;
}

export function saleEditPaymentDescription(saleNumber: string): string {
  return `Paid on sale edit - ${saleNumber}`;
}

/** System-managed payment row tied to a sale (at creation or via sale edit sync). */
export function isSaleManagedInSalePayment(entry: LedgerPaymentRow): boolean {
  if (entry.entry_type !== LedgerEntryType.PAYMENT_RECEIVED) return false;
  const desc = (entry.description ?? '').toLowerCase();
  return (
    desc.startsWith('upfront payment on') || desc.startsWith('paid on sale edit -')
  );
}

/**
 * Sale-edit delta rows that must never appear on the customer statement.
 * They are consolidated into the parent sale ledger row + revision history.
 */
export function isSaleLinkedShadowAdjustment(entry: LedgerAdjustmentRow): boolean {
  if (entry.entry_type !== LedgerEntryType.ADJUSTMENT) return false;

  const saleId = entry.sale_id?.trim();
  if (!saleId) return false;

  const ref = entry.reference_no?.trim().toUpperCase();
  if (ref === 'AUDIT') return false;

  const desc = (entry.description ?? '').toLowerCase();
  if (desc.includes('opening balance')) return false;

  return (
    desc.includes('sale edit') ||
    desc.includes('sale adjustment') ||
    desc.includes('credit removed') ||
    desc.includes('credit assigned') ||
    desc.includes('adjustment -')
  );
}
