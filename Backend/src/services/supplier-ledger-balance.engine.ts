import { SupplierLedgerEntryType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export type SupplierTxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type SupplierLedgerRow = {
  entry_type: SupplierLedgerEntryType;
  amount: Prisma.Decimal;
  balance_after: Prisma.Decimal;
  reference_no: string | null;
  description: string | null;
};

/**
 * Single source of truth for supplier running balances.
 * Append paths update outstanding_balance incrementally; full recalc repairs drift.
 */
export class SupplierLedgerBalanceEngine {
  computeSignedDelta(entry: SupplierLedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    switch (entry.entry_type) {
      case SupplierLedgerEntryType.CREDIT_PURCHASE:
        return amt;
      case SupplierLedgerEntryType.CASH_PURCHASE:
        return 0;
      case SupplierLedgerEntryType.PAYMENT_MADE:
      case SupplierLedgerEntryType.REFUND:
        return -amt;
      case SupplierLedgerEntryType.ADJUSTMENT:
        return this.resolveAdjustmentDelta(entry, prevBalance);
      default:
        return 0;
    }
  }

  private resolveAdjustmentDelta(entry: SupplierLedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    const signRef = entry.reference_no?.trim().toUpperCase();
    if (signRef === 'DEBIT') return amt;
    if (signRef === 'CREDIT') return -amt;
    if (signRef === 'AUDIT') return 0;

    const desc = (entry.description ?? '').toLowerCase();
    if (desc.includes('opening balance')) return amt;

    return Number(entry.balance_after) - prevBalance;
  }

  computeRunningBalance(entries: SupplierLedgerRow[]): number {
    let running = 0;
    for (const entry of entries) {
      running = Number((running + this.computeSignedDelta(entry, running)).toFixed(3));
    }
    return running;
  }

  async getRunningBalance(tx: SupplierTxClient, supplierId: string): Promise<number> {
    const entries = await tx.supplierLedger.findMany({
      where: { supplier_id: supplierId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        entry_type: true,
        amount: true,
        balance_after: true,
        reference_no: true,
        description: true,
      },
    });
    return this.computeRunningBalance(entries);
  }

  async recalculateRunningBalances(tx: SupplierTxClient, supplierId: string): Promise<number> {
    const entries = await tx.supplierLedger.findMany({
      where: { supplier_id: supplierId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    let running = 0;
    for (const entry of entries) {
      const delta = this.computeSignedDelta(entry, running);
      running = Number((running + delta).toFixed(3));
      if (Math.abs(Number(entry.balance_after) - running) > 0.009) {
        await tx.supplierLedger.update({
          where: { id: entry.id },
          data: { balance_after: running },
        });
      }
    }

    await tx.supplier.update({
      where: { id: supplierId },
      data: { outstanding_balance: running },
    });

    return running;
  }

  /** Fast append: one read + create + supplier update (avoids O(n) writes per post). */
  private async commitLedgerEntry(
    tx: SupplierTxClient,
    supplierId: string,
    data: {
      entry_type: SupplierLedgerEntryType;
      amount: Prisma.Decimal;
      description: string;
      purchase_id?: string | null;
      reference_no?: string | null;
      created_by?: string | null;
    },
    signedDelta: number,
  ) {
    const running = await this.getRunningBalance(tx, supplierId);
    const newBalance = Number((running + signedDelta).toFixed(3));

    const entry = await tx.supplierLedger.create({
      data: {
        supplier_id: supplierId,
        entry_type: data.entry_type,
        amount: data.amount,
        description: data.description,
        purchase_id: data.purchase_id,
        reference_no: data.reference_no,
        balance_after: newBalance,
        created_by: data.created_by,
      },
    });

    await tx.supplier.update({
      where: { id: supplierId },
      data: { outstanding_balance: newBalance },
    });

    return entry;
  }

  async syncSupplierBalances(supplierId: string) {
    return prisma.$transaction(
      async (tx) => this.recalculateRunningBalances(tx, supplierId),
      { maxWait: 15_000, timeout: 30_000 },
    );
  }

  private adjustmentReferenceNo(signedDelta: number): 'DEBIT' | 'CREDIT' {
    return signedDelta >= 0 ? 'DEBIT' : 'CREDIT';
  }

  async postCashPurchase(
    tx: SupplierTxClient,
    params: {
      supplierId: string;
      amount: number;
      purchaseId: string;
      createdBy: string;
      description?: string;
    },
  ) {
    if (params.amount <= 0) return null;

    return this.commitLedgerEntry(
      tx,
      params.supplierId,
      {
        entry_type: SupplierLedgerEntryType.CASH_PURCHASE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Cash purchase',
        purchase_id: params.purchaseId,
        created_by: params.createdBy,
      },
      0,
    );
  }

  async postCreditPurchase(
    tx: SupplierTxClient,
    params: {
      supplierId: string;
      amount: number;
      purchaseId: string;
      createdBy: string;
      description?: string;
    },
  ) {
    if (params.amount <= 0) return null;

    return this.commitLedgerEntry(
      tx,
      params.supplierId,
      {
        entry_type: SupplierLedgerEntryType.CREDIT_PURCHASE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Credit purchase',
        purchase_id: params.purchaseId,
        created_by: params.createdBy,
      },
      params.amount,
    );
  }

  async postPayment(
    tx: SupplierTxClient,
    params: {
      supplierId: string;
      amount: number;
      createdBy: string;
      description?: string;
      referenceNo?: string;
      purchaseId?: string;
    },
  ) {
    if (params.amount <= 0) throw new Error('Payment amount must be positive');

    return this.commitLedgerEntry(
      tx,
      params.supplierId,
      {
        entry_type: SupplierLedgerEntryType.PAYMENT_MADE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Payment made to supplier',
        purchase_id: params.purchaseId,
        reference_no: params.referenceNo?.trim() || params.purchaseId || null,
        created_by: params.createdBy,
      },
      -params.amount,
    );
  }

  async postSignedAdjustment(
    tx: SupplierTxClient,
    params: {
      supplierId: string;
      signedDelta: number;
      createdBy?: string;
      description: string;
      purchaseId?: string;
      referenceNo?: string;
    },
  ) {
    if (Math.abs(params.signedDelta) <= 0.009) return null;

    return this.commitLedgerEntry(
      tx,
      params.supplierId,
      {
        entry_type: SupplierLedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(Math.abs(params.signedDelta)),
        description: params.description,
        purchase_id: params.purchaseId,
        reference_no: params.referenceNo ?? this.adjustmentReferenceNo(params.signedDelta),
        created_by: params.createdBy,
      },
      params.signedDelta,
    );
  }
}

export const supplierLedgerBalanceEngine = new SupplierLedgerBalanceEngine();
