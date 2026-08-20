import { LedgerEntryType, Prisma } from '@prisma/client';
import { isSaleManagedInSalePayment } from './sale-ledger-revision';

export type SalePaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export type SaleLedgerSnapshot = {
  saleNumber: string;
  invoiceTotal: number;
  creditCharged: number;
  upfrontPaid: number;
  accountPaymentsCollected: number;
  totalPaid: number;
  amountDue: number;
  paymentStatus: SalePaymentStatus;
  hasCreditSaleRow: boolean;
};

export type LedgerIntegrityIssue = {
  saleNumber: string;
  code: 'MISSING_CREDIT_SALE_ROW' | 'CREDIT_EXCEEDS_INVOICE' | 'OVERPAID_ON_LEDGER';
  message: string;
};

type LedgerRow = {
  sale_id: string | null;
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal | number;
  description: string | null;
};

type SaleRow = {
  sale_number: string;
  total_amount: Prisma.Decimal | number;
};

export type DisplayLedgerEntry = {
  id: string;
  customer_id: string;
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal;
  description: string | null;
  sale_id: string | null;
  reference_no: string | null;
  balance_after: Prisma.Decimal;
  created_at: Date;
  created_by: string | null;
};

type CreditSaleForDisplay = {
  sale_number: string;
  total_amount: Prisma.Decimal | number;
  sale_date: Date | null;
  created_at: Date;
};

function roundMoney(n: number): number {
  return Number(n.toFixed(3));
}

function derivePaymentStatus(amountDue: number, totalPaid: number): SalePaymentStatus {
  if (amountDue <= 0.009) return 'PAID';
  if (totalPaid > 0.009) return 'PARTIAL';
  return 'PENDING';
}

/**
 * Derive per-invoice paid/due purely from ledger rows (single source of truth).
 */
export function buildSaleLedgerSnapshot(
  saleNumber: string,
  invoiceTotal: number,
  ledgerRows: LedgerRow[],
): SaleLedgerSnapshot {
  const rows = ledgerRows.filter((r) => r.sale_id?.trim() === saleNumber);

  let creditCharged = 0;
  let upfrontPaid = 0;
  let accountPaymentsCollected = 0;

  for (const row of rows) {
    const amt = Number(row.amount);
    if (row.entry_type === LedgerEntryType.CREDIT_SALE) {
      creditCharged += amt;
    } else if (row.entry_type === LedgerEntryType.PAYMENT_RECEIVED) {
      if (isSaleManagedInSalePayment(row)) {
        upfrontPaid += amt;
      } else {
        accountPaymentsCollected += amt;
      }
    }
  }

  creditCharged = roundMoney(creditCharged);
  upfrontPaid = roundMoney(upfrontPaid);
  accountPaymentsCollected = roundMoney(accountPaymentsCollected);
  const totalPaid = roundMoney(upfrontPaid + accountPaymentsCollected);

  const chargedBase = creditCharged > 0.009 ? creditCharged : roundMoney(invoiceTotal);
  const amountDue = roundMoney(Math.max(0, chargedBase - totalPaid));

  return {
    saleNumber,
    invoiceTotal: roundMoney(invoiceTotal),
    creditCharged,
    upfrontPaid,
    accountPaymentsCollected,
    totalPaid,
    amountDue,
    paymentStatus: derivePaymentStatus(amountDue, totalPaid),
    hasCreditSaleRow: creditCharged > 0.009,
  };
}

export function buildSaleLedgerSnapshots(
  ledgerRows: LedgerRow[],
  sales: SaleRow[],
): Map<string, SaleLedgerSnapshot> {
  const map = new Map<string, SaleLedgerSnapshot>();
  for (const sale of sales) {
    map.set(
      sale.sale_number,
      buildSaleLedgerSnapshot(sale.sale_number, Number(sale.total_amount), ledgerRows),
    );
  }
  return map;
}

export function detectLedgerIntegrityIssues(
  ledgerRows: LedgerRow[],
  sales: SaleRow[],
): LedgerIntegrityIssue[] {
  const issues: LedgerIntegrityIssue[] = [];
  const snapshots = buildSaleLedgerSnapshots(ledgerRows, sales);

  for (const sale of sales) {
    const snap = snapshots.get(sale.sale_number)!;
    if (!snap.hasCreditSaleRow && snap.accountPaymentsCollected < 0.009 && snap.upfrontPaid < 0.009) {
      issues.push({
        saleNumber: sale.sale_number,
        code: 'MISSING_CREDIT_SALE_ROW',
        message: `Credit sale ${sale.sale_number} has no CREDIT_SALE row in the ledger.`,
      });
    }
    if (snap.creditCharged > snap.invoiceTotal + 0.009) {
      issues.push({
        saleNumber: sale.sale_number,
        code: 'CREDIT_EXCEEDS_INVOICE',
        message: `Ledger credit (${snap.creditCharged}) exceeds invoice total (${snap.invoiceTotal}) for ${sale.sale_number}.`,
      });
    }
    if (snap.totalPaid > snap.invoiceTotal + 0.009) {
      issues.push({
        saleNumber: sale.sale_number,
        code: 'OVERPAID_ON_LEDGER',
        message: `Payments on ledger (${snap.totalPaid}) exceed invoice total (${snap.invoiceTotal}) for ${sale.sale_number}.`,
      });
    }
  }

  return issues;
}

/**
 * READ-ONLY: merge stored ledger rows with reconstructed credit-sale lines so the
 * statement shows every completed credit invoice (never writes to the database).
 */
export function buildDisplayLedgerEntries(
  customerId: string,
  dbEntries: DisplayLedgerEntry[],
  creditSales: CreditSaleForDisplay[],
): DisplayLedgerEntry[] {
  const synthetic: DisplayLedgerEntry[] = [];

  for (const sale of creditSales) {
    const saleRows = dbEntries.filter((e) => e.sale_id?.trim() === sale.sale_number);
    const hasCreditSale = saleRows.some((e) => e.entry_type === LedgerEntryType.CREDIT_SALE);
    const total = Number(sale.total_amount);
    const saleDate = sale.sale_date ?? sale.created_at;

    const snap = buildSaleLedgerSnapshot(sale.sale_number, total, saleRows);

    if (!hasCreditSale && total > 0.009) {
      synthetic.push({
        id: `synthetic-credit-${sale.sale_number}`,
        customer_id: customerId,
        entry_type: LedgerEntryType.CREDIT_SALE,
        amount: new Prisma.Decimal(total),
        description:
          snap.upfrontPaid > 0.009
            ? `Partial credit sale - ${sale.sale_number}`
            : `Credit sale - ${sale.sale_number}`,
        sale_id: sale.sale_number,
        reference_no: sale.sale_number,
        balance_after: new Prisma.Decimal(0),
        created_at: saleDate,
        created_by: 'system',
      });
    }
  }

  return [...dbEntries, ...synthetic].sort((a, b) => {
    const diff = a.created_at.getTime() - b.created_at.getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}
