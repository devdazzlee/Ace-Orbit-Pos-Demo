import { Prisma, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { ledgerBalanceEngine, TxClient } from './ledger-balance.engine';
import { isSaleLinkedShadowAdjustment, saleUpfrontPaymentDescription } from '../utils/sale-ledger-revision';
import {
  buildDisplayLedgerEntries,
  buildSaleLedgerSnapshot,
  buildSaleLedgerSnapshots,
} from '../utils/sale-ledger-derivation';

/** Ledger writes can sync many sale rows — default Prisma 5s timeout is too short. */
const LEDGER_WRITE_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

class CustomerLedgerService {
  /** Reconcile balances only — never mutates ledger rows from sale.payment_received. */
  private async reconcileCustomerLedger(tx: TxClient, customerId: string) {
    await ledgerBalanceEngine.consolidateSaleLinkedAdjustments(tx, customerId);
    await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  private async reconcileCustomerLedgerAfterPayment(tx: TxClient, customerId: string) {
    await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  /**
   * Read-only: derive display balances from existing rows — never mutates stored ledger data.
   */
  private computeLedgerTotals(
    entries: Array<{
      id: string;
      entry_type: LedgerEntryType;
      amount: Prisma.Decimal;
      balance_after: Prisma.Decimal;
      reference_no: string | null;
      description: string | null;
    }>,
  ) {
    const debitCreditById = new Map<string, { debit: number; credit: number }>();
    const runningBalances = new Map<string, number>();
    let running = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    let totalSales = 0;
    let totalPayments = 0;

    for (const e of entries) {
      const delta = this.computeSignedDelta(e, running);
      let debit = 0;
      let credit = 0;
      if (delta > 0.009) {
        debit = delta;
        totalDebits += delta;
      } else if (delta < -0.009) {
        credit = Math.abs(delta);
        totalCredits += Math.abs(delta);
      }
      running = Number((running + delta).toFixed(3));
      debitCreditById.set(e.id, { debit, credit });
      runningBalances.set(e.id, running);

      const amt = Number(e.amount);
      if (e.entry_type === 'CREDIT_SALE') totalSales += amt;
      else if (e.entry_type === 'PAYMENT_RECEIVED') totalPayments += amt;
    }

    return {
      debitCreditById,
      runningBalances,
      currentBalance: running,
      totalDebits,
      totalCredits,
      totalSales,
      totalPayments,
    };
  }

  /**
   * Record a credit sale — increases outstanding balance
   */
  async recordCreditSale({
    customerId,
    amount,
    saleId,
    createdBy,
    description,
  }: {
    customerId: string;
    amount: number;
    saleId: string;
    createdBy: string;
    description?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, credit_limit: true },
      });
      if (!customer) throw new AppError(404, 'Customer not found');

      const runningBefore = await ledgerBalanceEngine.getRunningBalance(tx, customerId);
      const entry = await ledgerBalanceEngine.postCreditSale(tx, {
        customerId,
        amount,
        saleId,
        createdBy,
        description,
      });
      const newBalance = await ledgerBalanceEngine.getRunningBalance(tx, customerId);

      const creditLimit = new Prisma.Decimal(customer.credit_limit);
      const overLimit = creditLimit.gt(0) && new Prisma.Decimal(newBalance).gt(creditLimit);

      return { entry, newBalance, overLimit, runningBefore };
    });
  }

  /**
   * Record a payment received — decreases outstanding balance (ledger is source of truth).
   */
  async recordPayment({
    customerId,
    amount,
    createdBy,
    description,
    referenceNo,
    saleId,
  }: {
    customerId: string;
    amount: number;
    createdBy: string;
    description?: string;
    referenceNo?: string;
    saleId?: string;
  }) {
    if (amount <= 0) throw new AppError(400, 'Payment amount must be positive');

    return prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) throw new AppError(404, 'Customer not found');

        let resolvedSaleNumber: string | undefined;

        if (saleId?.trim()) {
          const sale = await tx.sale.findFirst({
            where: {
              customer_id: customerId,
              OR: [{ id: saleId.trim() }, { sale_number: saleId.trim() }],
            },
            select: {
              id: true,
              sale_number: true,
              total_amount: true,
            },
          });

          if (!sale) {
            throw new AppError(404, 'Invoice not found for this customer');
          }

          const ledgerRows = await tx.customerLedger.findMany({
            where: { customer_id: customerId, sale_id: sale.sale_number },
            select: { sale_id: true, entry_type: true, amount: true, description: true },
          });
          const snap = buildSaleLedgerSnapshot(
            sale.sale_number,
            Number(sale.total_amount),
            ledgerRows,
          );

          if (snap.amountDue <= 0.009) {
            throw new AppError(409, `Invoice ${sale.sale_number} is already fully settled on the ledger`);
          }

          if (amount > snap.amountDue + 0.009) {
            throw new AppError(
              400,
              `Payment (${amount}) exceeds amount due (${snap.amountDue}) on ${sale.sale_number}`,
            );
          }

          resolvedSaleNumber = sale.sale_number;
        }

        const entry = await ledgerBalanceEngine.postPayment(tx, {
          customerId,
          amount,
          createdBy,
          description:
            description ??
            (resolvedSaleNumber
              ? `Payment received against ${resolvedSaleNumber}`
              : 'Payment toward account balance'),
          referenceNo: referenceNo?.trim() || resolvedSaleNumber,
          saleId: resolvedSaleNumber,
          skipBalanceRecalc: true,
        });

        await this.reconcileCustomerLedgerAfterPayment(tx, customerId);

        const newBalance = await ledgerBalanceEngine.getRunningBalance(tx, customerId);
        return { entry, newBalance };
      },
      LEDGER_WRITE_TX_OPTIONS,
    );
  }

  /** Rebuild running balances from entry amounts and sync customer outstanding_balance. */
  async syncCustomerBalances(customerId: string) {
    const balance = await ledgerBalanceEngine.syncCustomerBalances(customerId);
    return { balance };
  }

  private computeSignedDelta = ledgerBalanceEngine.computeSignedDelta.bind(ledgerBalanceEngine);

  private recalculateRunningBalances(tx: TxClient, customerId: string) {
    return ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  private assertEntryEditable(entry: {
    entry_type: LedgerEntryType;
    sale_id: string | null;
  }) {
    if (
      entry.entry_type === LedgerEntryType.CREDIT_SALE ||
      entry.entry_type === LedgerEntryType.CASH_SALE
    ) {
      throw new AppError(
        409,
        'Sale entries cannot be edited here. Update or delete the sale from Sales History instead.'
      );
    }
    if (entry.entry_type === LedgerEntryType.REFUND) {
      throw new AppError(
        409,
        'Refund entries cannot be edited here. Manage the related return or exchange record instead.'
      );
    }
  }

  private assertEntryDeletable(entry: {
    entry_type: LedgerEntryType;
    sale_id: string | null;
  }) {
    this.assertEntryEditable(entry);
  }

  /**
   * Update an existing ledger entry (payments and adjustments)
   */
  async updateLedgerEntry({
    customerId,
    entryId,
    amount,
    description,
    referenceNo,
    date,
    direction,
    updatedBy,
  }: {
    customerId: string;
    entryId: string;
    amount?: number;
    description?: string;
    referenceNo?: string;
    date?: Date;
    direction?: 'debit' | 'credit';
    updatedBy: string;
  }) {
    return prisma.$transaction(
      async (tx) => {
      const entry = await tx.customerLedger.findFirst({
        where: { id: entryId, customer_id: customerId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryEditable(entry);

      const updateData: Prisma.CustomerLedgerUpdateInput = {};

      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }

      if (referenceNo !== undefined) {
        updateData.reference_no = referenceNo.trim() || null;
      }

      if (date !== undefined) {
        if (Number.isNaN(date.getTime())) {
          throw new AppError(400, 'Invalid date');
        }
        updateData.created_at = date;
      }

      if (amount !== undefined) {
        if (amount <= 0) throw new AppError(400, 'Amount must be positive');
        updateData.amount = new Prisma.Decimal(amount);

        if (entry.entry_type === LedgerEntryType.ADJUSTMENT) {
          const sign =
            direction === 'debit'
              ? 'DEBIT'
              : direction === 'credit'
                ? 'CREDIT'
                : entry.reference_no?.trim().toUpperCase() === 'CREDIT'
                  ? 'CREDIT'
                  : 'DEBIT';
          updateData.reference_no = sign;
        }
      } else if (
        entry.entry_type === LedgerEntryType.ADJUSTMENT &&
        (direction === 'debit' || direction === 'credit')
      ) {
        updateData.reference_no = direction === 'debit' ? 'DEBIT' : 'CREDIT';
      }

      const updated = await tx.customerLedger.update({
        where: { id: entryId },
        data: updateData,
      });

      await this.recalculateRunningBalances(tx, customerId);

      return { entry: updated };
    },
      LEDGER_WRITE_TX_OPTIONS,
    );
  }

  /**
   * Delete a ledger entry and recalculate balances.
   * Creates a reversal adjustment entry for audit trail before removal.
   */
  async deleteLedgerEntry({
    customerId,
    entryId,
    deletedBy,
    reason,
  }: {
    customerId: string;
    entryId: string;
    deletedBy: string;
    reason?: string;
  }) {
    return prisma.$transaction(
      async (tx) => {
      const entry = await tx.customerLedger.findFirst({
        where: { id: entryId, customer_id: customerId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryDeletable(entry);

      const allEntries = await tx.customerLedger.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      const entryIndex = allEntries.findIndex((e) => e.id === entryId);
      const prevBalance = entryIndex > 0 ? Number(allEntries[entryIndex - 1].balance_after) : 0;
      const signedDelta = this.computeSignedDelta(entry, prevBalance);
      const deletedAmount = Number(entry.amount);
      const deletedDescription = entry.description;
      const deletedType = entry.entry_type;

      await tx.customerLedger.delete({ where: { id: entryId } });

      const runningBalance = await this.recalculateRunningBalances(tx, customerId);

      if (Math.abs(signedDelta) > 0.009) {
        await tx.customerLedger.create({
          data: {
            customer_id: customerId,
            entry_type: LedgerEntryType.ADJUSTMENT,
            amount: new Prisma.Decimal(Math.abs(signedDelta)),
            description:
              reason?.trim() ||
              `Deleted ${deletedType.toLowerCase().replace(/_/g, ' ')}${
                deletedDescription ? `: ${deletedDescription}` : ''
              } (${deletedAmount.toLocaleString()} reversed)`,
            sale_id: entry.sale_id,
            reference_no: 'AUDIT',
            balance_after: runningBalance,
            created_by: deletedBy,
          },
        });
      }

      return { deletedEntryId: entryId };
    },
      LEDGER_WRITE_TX_OPTIONS,
    );
  }

  private entryInDateRange(createdAt: Date, startDate?: Date, endDate?: Date) {
    if (startDate && createdAt < startDate) return false;
    if (endDate && createdAt > endDate) return false;
    return true;
  }

  /**
   * READ-ONLY: balance math including reconstructed credit-sale display rows.
   */
  async computeDisplayBalance(customerId: string): Promise<number> {
    const map = await this.computeDisplayBalances([customerId]);
    return map.get(customerId) ?? 0;
  }

  async computeDisplayBalances(customerIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (customerIds.length === 0) return result;

    const uniqueIds = [...new Set(customerIds)];
    const [ledgerByCustomer, salesByCustomer] = await Promise.all([
      prisma.customerLedger
        .findMany({
          where: { customer_id: { in: uniqueIds } },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        })
        .then((rows) => {
          const grouped = new Map<string, typeof rows>();
          for (const row of rows) {
            const group = grouped.get(row.customer_id) ?? [];
            group.push(row);
            grouped.set(row.customer_id, group);
          }
          return grouped;
        }),
      prisma.sale
        .findMany({
          where: {
            customer_id: { in: uniqueIds },
            status: 'COMPLETED',
            payment_method: 'CREDIT',
          },
          select: {
            customer_id: true,
            sale_number: true,
            total_amount: true,
            sale_date: true,
            created_at: true,
          },
        })
        .then((rows) => {
          const grouped = new Map<string, typeof rows>();
          for (const row of rows) {
            if (!row.customer_id) continue;
            const group = grouped.get(row.customer_id) ?? [];
            group.push(row);
            grouped.set(row.customer_id, group);
          }
          return grouped;
        }),
    ]);

    for (const customerId of uniqueIds) {
      const dbEntries = ledgerByCustomer.get(customerId) ?? [];
      const creditSales = salesByCustomer.get(customerId) ?? [];
      const displayAsc = buildDisplayLedgerEntries(customerId, dbEntries, creditSales);
      const visibleAsc = displayAsc
        .filter((e) => !isSaleLinkedShadowAdjustment(e))
        .sort((a, b) => {
          const diff = a.created_at.getTime() - b.created_at.getTime();
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
        });
      const { currentBalance } = this.computeLedgerTotals(visibleAsc);
      result.set(customerId, currentBalance);
    }

    return result;
  }

  /**
   * Get ledger entries for a customer with optional date filtering
   */
  async getCustomerLedger({
    customerId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  }: {
    customerId: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        whatsapp_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    // READ-ONLY: never auto-reconcile or rewrite existing ledger rows on view.
    const skip = (page - 1) * limit;
    const [dbEntries, creditSales, revisions] = await Promise.all([
      prisma.customerLedger.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
      prisma.sale.findMany({
        where: {
          customer_id: customerId,
          status: 'COMPLETED',
          payment_method: 'CREDIT',
        },
        select: {
          id: true,
          sale_number: true,
          total_amount: true,
          payment_method: true,
          sale_date: true,
          created_at: true,
        },
        orderBy: [{ sale_date: 'asc' }, { created_at: 'asc' }],
      }),
      prisma.customerSaleLedgerRevision.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const displayAsc = buildDisplayLedgerEntries(customerId, dbEntries, creditSales);
    const saleSnapshots = buildSaleLedgerSnapshots(displayAsc, creditSales);

    const filteredAsc = displayAsc.filter((e) =>
      this.entryInDateRange(e.created_at, startDate, endDate),
    );
    const visibleAllAsc = filteredAsc.filter((e) => !isSaleLinkedShadowAdjustment(e));
    const visibleDesc = [...visibleAllAsc].sort((a, b) => {
      const diff = b.created_at.getTime() - a.created_at.getTime();
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
    const total = visibleDesc.length;
    const visibleRawEntries = visibleDesc.slice(skip, skip + limit);

    const revisionsBySale = new Map<string, typeof revisions>();
    for (const revision of revisions) {
      const group = revisionsBySale.get(revision.sale_number) ?? [];
      group.push(revision);
      revisionsBySale.set(revision.sale_number, group);
    }

    const {
      debitCreditById,
      runningBalances,
      currentBalance,
      totalDebits,
      totalCredits,
      totalSales,
      totalPayments,
    } = this.computeLedgerTotals(visibleAllAsc);

    type SaleRow = {
      id: string;
      sale_number: string;
      payment_method: string;
      total_amount: Prisma.Decimal;
    };

    const salesByRef: Record<string, SaleRow> = {};
    for (const s of creditSales) {
      salesByRef[s.id] = s;
      salesByRef[s.sale_number] = s;
    }

    const entries = visibleRawEntries.map((e) => {
      const saleInfo = e.sale_id ? salesByRef[e.sale_id] : null;
      const isCreditSale = e.entry_type === 'CREDIT_SALE';
      const isCashSale = e.entry_type === 'CASH_SALE';
      const isSaleEntry = isCreditSale || isCashSale;
      const saleRevisions = e.sale_id ? revisionsBySale.get(e.sale_id) ?? [] : [];
      const saleLinkedRevisions = isSaleEntry
        ? saleRevisions.filter(
            (r) =>
              !r.ledger_entry_id ||
              r.ledger_entry_id === e.id ||
              (isCreditSale && r.field === 'CREDIT_OWED') ||
              (isCashSale && r.field === 'CASH_TOTAL'),
          )
        : [];
      const originalLedgerAmount =
        saleLinkedRevisions.length > 0
          ? Number(saleLinkedRevisions[0].previous_amount)
          : Number(e.amount);
      const adjustmentHistory = saleLinkedRevisions.map((r) => ({
        id: r.id,
        field: r.field,
        previousAmount: Number(r.previous_amount),
        newAmount: Number(r.new_amount),
        signedDelta: Number(r.signed_delta),
        reason: r.reason,
        createdAt: r.created_at.toISOString(),
      }));

      const invoiceTotal =
        isSaleEntry && saleInfo ? Number(saleInfo.total_amount) : 0;
      const snap = isCreditSale && e.sale_id ? saleSnapshots.get(e.sale_id) : undefined;
      const isSynthetic = e.id.startsWith('synthetic-');
      const invoicePaid = isCreditSale && snap ? snap.totalPaid : isCashSale ? invoiceTotal : 0;
      const invoiceDue = isCreditSale && snap ? snap.amountDue : 0;

      const amounts = debitCreditById.get(e.id) ?? { debit: 0, credit: 0 };

      const isRefund = e.entry_type === 'REFUND';

      const displayDescription = (() => {
        const raw = e.description ?? '';
        if (
          e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
          raw.toLowerCase().startsWith('paid on sale edit -') &&
          e.sale_id?.trim()
        ) {
          return saleUpfrontPaymentDescription(e.sale_id.trim());
        }
        return raw;
      })();

      return {
        id: e.id,
        date: e.created_at.toISOString(),
        type: e.entry_type,
        description: displayDescription,
        reference_no: e.reference_no ?? saleInfo?.sale_number ?? null,
        debit: amounts.debit,
        credit: amounts.credit,
        balance: runningBalances.get(e.id) ?? Number(e.balance_after),
        amount: Number(e.amount),
        invoiceTotal,
        invoicePaid,
        invoiceDue,
        saleId: saleInfo?.id ?? null,
        paymentStatus: isCreditSale && snap ? snap.paymentStatus : null,
        isCollectable: isCreditSale && invoiceDue > 0.009,
        isEditable: !isSaleEntry && !isRefund && !isSynthetic,
        isDeletable: !isSaleEntry && !isRefund && !isSynthetic,
        editRestrictedReason: isSaleEntry
          ? 'Edit or delete this from Sales History'
          : isRefund
            ? 'Manage from Returns & Exchanges'
            : null,
        payment_method: isSaleEntry ? saleInfo?.payment_method ?? (isCashSale ? 'CASH' : 'CREDIT') : null,
        originalLedgerAmount,
        adjustmentHistory,
      };
    });

    const currentBalanceStored = Number(customer.outstanding_balance);

    return {
      customer: {
        ...customer,
        // Expose computed balance for UI; stored column left unchanged in DB.
        outstanding_balance: currentBalance,
      },
      entries,
      summary: {
        totalSales,
        totalPayments,
        totalDebits,
        totalCredits,
        currentBalance,
        storedBalance: currentBalanceStored,
        balanceDue: Math.max(0, currentBalance),
        advanceBalance: Math.max(0, -currentBalance),
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all customers with outstanding balances (for the dashboard summary)
   */
  async getCreditSummary() {
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
    });
    const balances = await this.computeDisplayBalances(customers.map((c) => c.id));

    const debtors = customers
      .map((c) => ({
        ...c,
        outstanding_balance: new Prisma.Decimal(
          balances.get(c.id) ?? Number(c.outstanding_balance),
        ),
      }))
      .filter((c) => Number(c.outstanding_balance) > 0.009)
      .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance));

    const totalOutstanding = debtors.reduce((sum, c) => sum + Number(c.outstanding_balance), 0);

    return {
      totalOutstanding: new Prisma.Decimal(totalOutstanding),
      topDebtors: debtors.slice(0, 10),
    };
  }
}

export default CustomerLedgerService;
