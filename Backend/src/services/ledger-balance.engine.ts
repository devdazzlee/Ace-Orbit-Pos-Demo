import { LedgerEntryType, Prisma, SaleLedgerRevisionField } from '@prisma/client';
import { prisma } from '../prisma/client';
import {
  isSaleLinkedShadowAdjustment,
  isSaleManagedInSalePayment,
  saleUpfrontPaymentDescription,
} from '../utils/sale-ledger-revision';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type LedgerRow = {
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal;
  balance_after: Prisma.Decimal;
  reference_no: string | null;
  description: string | null;
};

/**
 * Single source of truth for customer running balances.
 * All balance mutations MUST go through this engine.
 * customer.outstanding_balance is derived only via recalculateRunningBalances().
 */
export class LedgerBalanceEngine {
  computeSignedDelta(entry: LedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    switch (entry.entry_type) {
      case LedgerEntryType.CREDIT_SALE:
        return amt;
      case LedgerEntryType.CASH_SALE:
        return 0;
      case LedgerEntryType.PAYMENT_RECEIVED:
      case LedgerEntryType.REFUND:
        return -amt;
      case LedgerEntryType.ADJUSTMENT:
        return this.resolveAdjustmentDelta(entry, prevBalance);
      default:
        return 0;
    }
  }

  private resolveAdjustmentDelta(entry: LedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    const signRef = entry.reference_no?.trim().toUpperCase();
    if (signRef === 'DEBIT') return amt;
    if (signRef === 'CREDIT') return -amt;
    if (signRef === 'AUDIT') return 0;

    const desc = (entry.description ?? '').toLowerCase();
    if (desc.includes('opening balance')) return amt;
    if (desc.includes('credit removed')) return -amt;
    if (desc.includes('credit assigned')) return amt;

    return Number(entry.balance_after) - prevBalance;
  }

  computeRunningBalance(entries: LedgerRow[]): number {
    let running = 0;
    for (const entry of entries) {
      running = Number((running + this.computeSignedDelta(entry, running)).toFixed(3));
    }
    return running;
  }

  async getRunningBalance(tx: TxClient, customerId: string): Promise<number> {
    const entries = await tx.customerLedger.findMany({
      where: { customer_id: customerId },
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

  async recalculateRunningBalances(tx: TxClient, customerId: string): Promise<number> {
    const entries = await tx.customerLedger.findMany({
      where: { customer_id: customerId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    let running = 0;
    for (const entry of entries) {
      const delta = this.computeSignedDelta(entry, running);
      running = Number((running + delta).toFixed(3));
      if (Math.abs(Number(entry.balance_after) - running) > 0.009) {
        await tx.customerLedger.update({
          where: { id: entry.id },
          data: { balance_after: running },
        });
      }
    }

    await tx.customer.update({
      where: { id: customerId },
      data: { outstanding_balance: running },
    });

    return running;
  }

  /** Sync customer.outstanding_balance + all balance_after from entry amounts. */
  async syncCustomerBalances(customerId: string) {
    return prisma.$transaction(
      async (tx) => this.recalculateRunningBalances(tx, customerId),
      { maxWait: 15_000, timeout: 30_000 },
    );
  }

  private adjustmentReferenceNo(signedDelta: number): 'DEBIT' | 'CREDIT' {
    return signedDelta >= 0 ? 'DEBIT' : 'CREDIT';
  }

  async postCashSale(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      saleId: string;
      createdBy: string;
      description?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.CASH_SALE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Cash sale',
        sale_id: params.saleId,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postCreditSale(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      saleId: string;
      createdBy: string;
      description?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.CREDIT_SALE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Credit sale',
        sale_id: params.saleId,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postPayment(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      createdBy: string;
      description?: string;
      referenceNo?: string;
      saleId?: string;
      skipBalanceRecalc?: boolean;
    }
  ) {
    if (params.amount <= 0) throw new Error('Payment amount must be positive');

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.PAYMENT_RECEIVED,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Payment received',
        sale_id: params.saleId,
        reference_no: params.referenceNo?.trim() || params.saleId || null,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    if (!params.skipBalanceRecalc) {
      await this.recalculateRunningBalances(tx, params.customerId);
    }
    return entry;
  }

  async postRefund(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      createdBy: string;
      description?: string;
      saleId?: string;
      referenceNo?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.REFUND,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Refund',
        sale_id: params.saleId,
        reference_no: params.referenceNo,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postSignedAdjustment(
    tx: TxClient,
    params: {
      customerId: string;
      signedDelta: number;
      createdBy?: string;
      description: string;
      saleId?: string;
      referenceNo?: string;
    }
  ) {
    if (Math.abs(params.signedDelta) <= 0.009) return null;

    // Never create visible sale-edit delta rows — callers must use syncSaleLedgerEntries.
    if (params.saleId?.trim() && isSaleLinkedShadowAdjustment({
      entry_type: LedgerEntryType.ADJUSTMENT,
      sale_id: params.saleId,
      description: params.description,
      reference_no: params.referenceNo ?? this.adjustmentReferenceNo(params.signedDelta),
    })) {
      throw new Error(
        'Sale-linked balance changes must use syncSaleLedgerEntries — not postSignedAdjustment',
      );
    }

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(Math.abs(params.signedDelta)),
        description: params.description,
        sale_id: params.saleId,
        reference_no: params.referenceNo ?? this.adjustmentReferenceNo(params.signedDelta),
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  private async recordSaleLedgerRevision(
    tx: TxClient,
    params: {
      customerId: string;
      saleNumber: string;
      ledgerEntryId?: string;
      field: SaleLedgerRevisionField;
      previousAmount: number;
      newAmount: number;
      reason?: string;
      createdBy?: string;
      createdAt?: Date;
    },
  ) {
    const signedDelta = Number((params.newAmount - params.previousAmount).toFixed(3));
    if (Math.abs(signedDelta) <= 0.009) return null;

    return tx.customerSaleLedgerRevision.create({
      data: {
        customer_id: params.customerId,
        sale_number: params.saleNumber,
        ledger_entry_id: params.ledgerEntryId,
        field: params.field,
        previous_amount: new Prisma.Decimal(params.previousAmount),
        new_amount: new Prisma.Decimal(params.newAmount),
        signed_delta: new Prisma.Decimal(signedDelta),
        reason: params.reason?.trim() || 'Sale amount updated',
        created_by: params.createdBy,
        ...(params.createdAt ? { created_at: params.createdAt } : {}),
      },
    });
  }

  /**
   * Fold legacy sale-edit ADJUSTMENT rows into their parent sale ledger entry.
   * Creates revision history, removes shadow rows, and recalculates balances.
   */
  async consolidateSaleLinkedAdjustments(tx: TxClient, customerId: string) {
    const allEntries = await tx.customerLedger.findMany({
      where: { customer_id: customerId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    const bySale = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const saleId = entry.sale_id?.trim();
      if (!saleId) continue;
      const group = bySale.get(saleId) ?? [];
      group.push(entry);
      bySale.set(saleId, group);
    }

    let changed = false;

    for (const [saleNumber, saleEntries] of bySale.entries()) {
      const shadows = saleEntries.filter((e) => isSaleLinkedShadowAdjustment(e));
      if (shadows.length === 0) continue;

      const creditSale = saleEntries.find((e) => e.entry_type === LedgerEntryType.CREDIT_SALE);
      const upfrontPayment = saleEntries.find((e) => isSaleManagedInSalePayment(e));
      const cashSale = saleEntries.find((e) => e.entry_type === LedgerEntryType.CASH_SALE);

      let running = 0;
      const signedDeltaById = new Map<string, number>();
      for (const entry of allEntries) {
        signedDeltaById.set(entry.id, this.computeSignedDelta(entry, running));
        running = Number((running + signedDeltaById.get(entry.id)!).toFixed(3));
      }

      for (const shadow of shadows) {
        const signedDelta = signedDeltaById.get(shadow.id) ?? 0;
        if (Math.abs(signedDelta) <= 0.009) {
          await tx.customerLedger.delete({ where: { id: shadow.id } });
          changed = true;
          continue;
        }

        const desc = (shadow.description ?? '').toLowerCase();
        const targetCash =
          Boolean(cashSale) &&
          !creditSale &&
          (desc.includes('cash') || desc.includes('card'));

        if (targetCash && cashSale) {
          const prev = Number(cashSale.amount);
          const next = Number((prev + signedDelta).toFixed(3));
          await this.recordSaleLedgerRevision(tx, {
            customerId,
            saleNumber,
            ledgerEntryId: cashSale.id,
            field: SaleLedgerRevisionField.CASH_TOTAL,
            previousAmount: prev,
            newAmount: next,
            reason: shadow.description ?? undefined,
            createdBy: shadow.created_by ?? undefined,
            createdAt: shadow.created_at,
          });
          await tx.customerLedger.update({
            where: { id: cashSale.id },
            data: { amount: new Prisma.Decimal(Math.max(0, next)) },
          });
          cashSale.amount = new Prisma.Decimal(Math.max(0, next));
        } else if (creditSale) {
          const prev = Number(creditSale.amount);
          const next = Number((prev + signedDelta).toFixed(3));
          await this.recordSaleLedgerRevision(tx, {
            customerId,
            saleNumber,
            ledgerEntryId: creditSale.id,
            field: SaleLedgerRevisionField.CREDIT_OWED,
            previousAmount: prev,
            newAmount: next,
            reason: shadow.description ?? undefined,
            createdBy: shadow.created_by ?? undefined,
            createdAt: shadow.created_at,
          });
          await tx.customerLedger.update({
            where: { id: creditSale.id },
            data: { amount: new Prisma.Decimal(Math.max(0, next)) },
          });
          creditSale.amount = new Prisma.Decimal(Math.max(0, next));
        }

        await tx.customerLedger.delete({ where: { id: shadow.id } });
        changed = true;
      }
    }

    if (changed) {
      await this.recalculateRunningBalances(tx, customerId);
    }

    return changed;
  }

  /**
   * Keep one ledger row per sale (CREDIT_SALE / CASH_SALE / upfront PAYMENT_RECEIVED).
   * Sale edits update those rows in place — never append delta ADJUSTMENT rows.
   */
  async syncSaleLedgerEntries(
    tx: TxClient,
    params: {
      customerId: string;
      saleNumber: string;
      paymentMethod: string;
      creditOwedAmount: number;
      upfrontPaymentAmount: number;
      cashSaleAmount: number;
      createdBy?: string;
      reason?: string;
      skipBalanceRecalc?: boolean;
      /** When true, sale-linked payment rows use edit label (not "Upfront payment"). */
      useSaleEditPaymentLabel?: boolean;
    },
  ) {
    const { customerId, saleNumber } = params;
    const method = params.paymentMethod.toUpperCase();
    const isCredit = method === 'CREDIT';

    const existing = await tx.customerLedger.findMany({
      where: { customer_id: customerId, sale_id: saleNumber },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    let creditSale = existing.find((e) => e.entry_type === LedgerEntryType.CREDIT_SALE);
    let upfrontPayment = existing.find((e) => isSaleManagedInSalePayment(e));
    let cashSale = existing.find((e) => e.entry_type === LedgerEntryType.CASH_SALE);
    const staleAdjustments = existing.filter((e) => isSaleLinkedShadowAdjustment(e));

    if (staleAdjustments.length > 0) {
      await this.consolidateSaleLinkedAdjustments(tx, customerId);
      const refreshed = await tx.customerLedger.findMany({
        where: { customer_id: customerId, sale_id: saleNumber },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      creditSale = refreshed.find((e) => e.entry_type === LedgerEntryType.CREDIT_SALE);
      upfrontPayment = refreshed.find((e) => isSaleManagedInSalePayment(e));
      cashSale = refreshed.find((e) => e.entry_type === LedgerEntryType.CASH_SALE);
    }

    const revisionReason = params.reason?.trim() || 'Sale updated';
    const salePaymentDescription = (existingDescription?: string | null) => {
      if (existingDescription?.trim()) {
        const lower = existingDescription.toLowerCase();
        if (lower.startsWith('paid on sale edit -')) {
          return saleUpfrontPaymentDescription(saleNumber);
        }
        return existingDescription;
      }
      return saleUpfrontPaymentDescription(saleNumber);
    };

    if (isCredit) {
      const owed = Math.max(0, params.creditOwedAmount);
      const paid = Math.max(0, params.upfrontPaymentAmount);
      // CREDIT_SALE holds the FULL invoice charged on account (owed + paid-at-counter).
      // The upfront payment is a separate PAYMENT_RECEIVED row; the balance subtracts it
      // exactly once. Storing only `owed` here would double-count the upfront payment.
      const grossCharge = Number((owed + paid).toFixed(3));
      const creditDesc =
        paid > 0.009 ? `Partial credit sale - ${saleNumber}` : `Credit sale - ${saleNumber}`;

      if (grossCharge > 0.009) {
        if (creditSale) {
          const previousAmount = Number(creditSale.amount);
          if (Math.abs(previousAmount - grossCharge) > 0.009) {
            await this.recordSaleLedgerRevision(tx, {
              customerId,
              saleNumber,
              ledgerEntryId: creditSale.id,
              field: SaleLedgerRevisionField.CREDIT_OWED,
              previousAmount,
              newAmount: grossCharge,
              reason: revisionReason,
              createdBy: params.createdBy,
            });
          }
          await tx.customerLedger.update({
            where: { id: creditSale.id },
            data: { amount: new Prisma.Decimal(grossCharge), description: creditDesc },
          });
        } else {
          await this.postCreditSale(tx, {
            customerId,
            amount: grossCharge,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: creditDesc,
          });
        }
      } else if (creditSale) {
        const previousAmount = Number(creditSale.amount);
        if (previousAmount > 0.009) {
          await this.recordSaleLedgerRevision(tx, {
            customerId,
            saleNumber,
            ledgerEntryId: creditSale.id,
            field: SaleLedgerRevisionField.CREDIT_OWED,
            previousAmount,
            newAmount: 0,
            reason: revisionReason,
            createdBy: params.createdBy,
          });
        }
        await tx.customerLedger.delete({ where: { id: creditSale.id } });
      }

      if (paid > 0.009) {
        if (upfrontPayment) {
          const previousAmount = Number(upfrontPayment.amount);
          if (Math.abs(previousAmount - paid) > 0.009) {
            await this.recordSaleLedgerRevision(tx, {
              customerId,
              saleNumber,
              ledgerEntryId: upfrontPayment.id,
              field: SaleLedgerRevisionField.UPFRONT_PAYMENT,
              previousAmount,
              newAmount: paid,
              reason: revisionReason,
              createdBy: params.createdBy,
            });
          }
          await tx.customerLedger.update({
            where: { id: upfrontPayment.id },
            data: {
              amount: new Prisma.Decimal(paid),
              description: salePaymentDescription(upfrontPayment.description),
            },
          });
        } else {
          await this.postPayment(tx, {
            customerId,
            amount: paid,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: salePaymentDescription(),
          });
        }
      } else if (upfrontPayment) {
        const previousAmount = Number(upfrontPayment.amount);
        if (previousAmount > 0.009) {
          await this.recordSaleLedgerRevision(tx, {
            customerId,
            saleNumber,
            ledgerEntryId: upfrontPayment.id,
            field: SaleLedgerRevisionField.UPFRONT_PAYMENT,
            previousAmount,
            newAmount: 0,
            reason: revisionReason,
            createdBy: params.createdBy,
          });
        }
        await tx.customerLedger.delete({ where: { id: upfrontPayment.id } });
      }

      if (cashSale) {
        await tx.customerLedger.delete({ where: { id: cashSale.id } });
      }
    } else {
      const cashTotal = Math.max(0, params.cashSaleAmount);
      const paidLabel = method === 'CARD' ? 'Card' : 'Cash';

      if (cashTotal > 0.009) {
        if (cashSale) {
          const previousAmount = Number(cashSale.amount);
          if (Math.abs(previousAmount - cashTotal) > 0.009) {
            await this.recordSaleLedgerRevision(tx, {
              customerId,
              saleNumber,
              ledgerEntryId: cashSale.id,
              field: SaleLedgerRevisionField.CASH_TOTAL,
              previousAmount,
              newAmount: cashTotal,
              reason: revisionReason,
              createdBy: params.createdBy,
            });
          }
          await tx.customerLedger.update({
            where: { id: cashSale.id },
            data: {
              amount: new Prisma.Decimal(cashTotal),
              description: `${paidLabel} sale - ${saleNumber}`,
            },
          });
        } else {
          await this.postCashSale(tx, {
            customerId,
            amount: cashTotal,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: `${paidLabel} sale - ${saleNumber}`,
          });
        }
      } else if (cashSale) {
        const previousAmount = Number(cashSale.amount);
        if (previousAmount > 0.009) {
          await this.recordSaleLedgerRevision(tx, {
            customerId,
            saleNumber,
            ledgerEntryId: cashSale.id,
            field: SaleLedgerRevisionField.CASH_TOTAL,
            previousAmount,
            newAmount: 0,
            reason: revisionReason,
            createdBy: params.createdBy,
          });
        }
        await tx.customerLedger.delete({ where: { id: cashSale.id } });
      }

      if (creditSale) {
        await tx.customerLedger.delete({ where: { id: creditSale.id } });
      }
      if (upfrontPayment) {
        await tx.customerLedger.delete({ where: { id: upfrontPayment.id } });
      }
    }

    if (!params.skipBalanceRecalc) {
      await this.recalculateRunningBalances(tx, customerId);
    }
  }

  /**
   * Sync credit-sale ledger rows from sale totals.
   * Credit row = invoice amount still charged on account (total minus paid-at-sale on this sale).
   * Account-level Receive Payment (FIFO) does NOT remove or shrink credit-sale rows.
   */
  async syncCreditSaleLedgerFromRecord(
    tx: TxClient,
    params: {
      customerId: string;
      saleNumber: string;
      totalAmount: number;
      paymentReceived: number;
      createdBy?: string;
      reason?: string;
      skipBalanceRecalc?: boolean;
      useSaleEditPaymentLabel?: boolean;
    },
  ) {
    const total = Math.max(0, params.totalAmount);

    const saleLedger = await tx.customerLedger.findMany({
      where: { customer_id: params.customerId, sale_id: params.saleNumber },
      select: { entry_type: true, amount: true, description: true },
    });

    const existingUpfront = saleLedger.find((e) => isSaleManagedInSalePayment(e));
    const upfrontFromLedger = existingUpfront ? Number(existingUpfront.amount) : 0;

    let creditOwed: number;
    let upfrontPaymentAmount: number;

    if (params.useSaleEditPaymentLabel) {
      const paidAtSale = Math.max(0, Math.min(params.paymentReceived, total));
      const isFullSettlement = paidAtSale >= total - 0.009;
      const hadUpfrontRow = !!existingUpfront;

      // Sale edit must not post a full-invoice PAYMENT_RECEIVED when the customer never
      // paid at the counter — that belongs in Receive Payment. FIFO/reconcile can inflate
      // sale.payment_received; only partial upfront or an existing upfront row may sync here.
      if (isFullSettlement && !hadUpfrontRow) {
        creditOwed = total;
        upfrontPaymentAmount = 0;
      } else {
        creditOwed = Math.max(0, Number((total - paidAtSale).toFixed(3)));
        upfrontPaymentAmount = paidAtSale > 0.009 ? paidAtSale : 0;
      }
    } else {
      const paidAtSale = upfrontFromLedger;
      creditOwed = Math.max(0, Number((total - paidAtSale).toFixed(3)));
      upfrontPaymentAmount = paidAtSale > 0.009 ? paidAtSale : 0;
    }

    await this.syncSaleLedgerEntries(tx, {
      customerId: params.customerId,
      saleNumber: params.saleNumber,
      paymentMethod: 'CREDIT',
      creditOwedAmount: creditOwed,
      upfrontPaymentAmount,
      cashSaleAmount: 0,
      createdBy: params.createdBy,
      reason: params.reason,
      skipBalanceRecalc: params.skipBalanceRecalc,
      useSaleEditPaymentLabel: params.useSaleEditPaymentLabel,
    });
  }
}

export const ledgerBalanceEngine = new LedgerBalanceEngine();
