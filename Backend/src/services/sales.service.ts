import { LedgerEntryType, Prisma, SaleItemType, SaleStatus, StockMovementType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { getReportingPeriodCreatedAtFilter } from '../utils/reportingPeriod';
import { ledgerBalanceEngine } from './ledger-balance.engine';
import { saleUpfrontPaymentDescription } from '../utils/sale-ledger-revision';
import { buildSaleLedgerSnapshot } from '../utils/sale-ledger-derivation';

const round2 = (n: number) => Number(n.toFixed(2));

/** Ledger description for advance credit consumed by a cash/card sale. */
export const advanceAppliedDescription = (saleNumber: string) =>
  `Advance credit used - ${saleNumber}`;

/** Ledger description for overpayment kept on account as new advance credit. */
export const advanceReceivedDescription = (saleNumber: string) =>
  `Advance credit kept from ${saleNumber}`;

export type CreditSaleLedgerFields = {
  /** Amount collected at the counter when the sale was made (not Receive Payment). */
  paidAtSale: number;
  upfrontPaid: number;
  invoiceTotalPaid: number;
  invoiceAmountDue: number;
  ledgerPaymentStatus: 'PENDING' | 'PARTIAL' | 'PAID';
};

interface ReturnItem {
  productId: string;
  quantity: number;
  disposition?: 'RESTOCK' | 'DAMAGED' | 'UNSELLABLE';
}

interface ExchangeItem {
  productId: string;
  quantity: number;
  price: number;
}

interface HoldSaleCartItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  originalPrice?: number;
  actualUnitPrice?: number;
  quantity: number;
  category?: string;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

class SaleService {
  /**
   * Sum of RETURN line quantities already posted against each original sale_item id
   * (from follow-up sales with original_sale_id pointing at the original sale).
   */
  private async getReturnedQtyByOriginalSaleLineIds(originalSaleId: string) {
    const prior = await prisma.sale.findMany({
      where: {
        original_sale_id: originalSaleId,
        status: { in: [SaleStatus.REFUNDED, SaleStatus.EXCHANGED] },
      },
      select: { sale_items: true },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const s of prior) {
      for (const si of s.sale_items) {
        if (si.item_type === SaleItemType.RETURN && si.ref_sale_item_id) {
          const q = si.quantity.abs();
          const k = si.ref_sale_item_id;
          map.set(k, (map.get(k) ?? new Prisma.Decimal(0)).plus(q));
        }
      }
    }
    return map;
  }

  /** For return/exchange rows with no customer, show the original sale's customer in lists. */
  private async hydrateReturnSaleCustomers<
    T extends {
      id: string;
      customer_id: string | null;
      customer: unknown;
      original_sale_id: string | null;
      status: SaleStatus;
    },
  >(sales: T[]): Promise<T[]> {
    const originalIds = [
      ...new Set(
        sales
          .filter(
            (s) =>
              (s.status === SaleStatus.REFUNDED || s.status === SaleStatus.EXCHANGED) &&
              !s.customer_id &&
              s.original_sale_id,
          )
          .map((s) => s.original_sale_id!),
      ),
    ];
    if (originalIds.length === 0) return sales;

    const originals = await prisma.sale.findMany({
      where: { id: { in: originalIds } },
      select: { id: true, customer: true },
    });
    const customerByOriginalId = new Map(originals.map((o) => [o.id, o.customer]));

    return sales.map((s) => {
      if (
        (s.status === SaleStatus.REFUNDED || s.status === SaleStatus.EXCHANGED) &&
        !s.customer_id &&
        s.original_sale_id
      ) {
        const c = customerByOriginalId.get(s.original_sale_id);
        if (c) return { ...s, customer: c } as T;
      }
      return s;
    });
  }

  /** Ledger-derived invoice fields for credit sales (read at API time — never cached). */
  private async hydrateCreditSaleInvoiceTotals<
    T extends {
      sale_number: string;
      payment_method: string;
      customer_id: string | null;
      total_amount: Prisma.Decimal;
    },
  >(sales: T[]): Promise<Array<T & Partial<CreditSaleLedgerFields>>> {
    const creditSales = sales.filter(
      (s) => s.payment_method === 'CREDIT' && s.customer_id,
    );
    if (creditSales.length === 0) return sales;

    const saleNumbers = creditSales.map((s) => s.sale_number);
    const customerIds = [...new Set(creditSales.map((s) => s.customer_id!))];

    const ledgerRows = await prisma.customerLedger.findMany({
      where: {
        customer_id: { in: customerIds },
        sale_id: { in: saleNumbers },
      },
      select: {
        sale_id: true,
        entry_type: true,
        amount: true,
        description: true,
      },
    });

    return sales.map((sale) => {
      if (sale.payment_method !== 'CREDIT' || !sale.customer_id) return sale;
      const rows = ledgerRows.filter((r) => r.sale_id === sale.sale_number);
      const snap = buildSaleLedgerSnapshot(
        sale.sale_number,
        Number(sale.total_amount),
        rows,
      );
      return {
        ...sale,
        paidAtSale: snap.upfrontPaid,
        upfrontPaid: snap.upfrontPaid,
        invoiceTotalPaid: snap.totalPaid,
        invoiceAmountDue: snap.amountDue,
        ledgerPaymentStatus: snap.paymentStatus,
      };
    });
  }

  async getSales({
    branchId,
    page,
    limit,
    search,
    startDate,
    endDate,
    dateField = 'sale_date',
    endExclusive = false,
    productId,
    customerId,
    paymentMethod,
  }: {
    branchId?: string;
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    dateField?: 'sale_date' | 'created_at';
    endExclusive?: boolean;
    productId?: string;
    customerId?: string;
    paymentMethod?: Prisma.SaleWhereInput['payment_method'];
  }) {
    const dateFilter =
      startDate || endDate
        ? {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate
              ? endExclusive
                ? { lt: endDate }
                : { lte: endDate }
              : {}),
          }
        : undefined;

    const where: Prisma.SaleWhereInput = {
      ...(branchId ? { branch_id: branchId } : {}),
      ...(search
        ? {
            OR: [
              { sale_number: { contains: search, mode: 'insensitive' } },
              { customer: { email: { contains: search, mode: 'insensitive' } } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(dateFilter
        ? dateField === 'created_at'
          ? { created_at: dateFilter }
          : { sale_date: dateFilter }
        : {}),
      ...(productId
        ? { sale_items: { some: { product_id: productId } } }
        : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    };

    const include = {
      sale_items: {
        include: { product: true },
      },
      customer: true,
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    };

    // Backward-compatible behavior: when pagination is not requested, return all rows.
    if (!page || !limit) {
      const data = await prisma.sale.findMany({
        where,
        include,
        orderBy: { sale_date: 'desc' },
      });
      const hydrated = await this.hydrateCreditSaleInvoiceTotals(
        await this.hydrateReturnSaleCustomers(data),
      );
      return {
        data: hydrated,
        meta: {
          total: hydrated.length,
          page: 1,
          limit: hydrated.length,
          totalPages: 1,
        },
      };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const skip = (safePage - 1) * safeLimit;

    const [total, data] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include,
        orderBy: { sale_date: 'desc' },
        skip,
        take: safeLimit,
      }),
    ]);

    const hydrated = await this.hydrateCreditSaleInvoiceTotals(
      await this.hydrateReturnSaleCustomers(data),
    );
    return {
      data: hydrated,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  /**
   * For original (COMPLETED) sales: compute whether anything is still returnable and if a return/exchange
   * was already posted against this sale (for UI badges in Process Return dropdown).
   */
  private async getReturnProcessingFlagsForSales(
    sales: Array<{
      id: string;
      sale_items: Array<{ id: string; quantity: Prisma.Decimal; item_type: SaleItemType }>;
    }>,
  ): Promise<Map<string, { fully_returned: boolean; has_prior_returns: boolean }>> {
    const out = new Map<string, { fully_returned: boolean; has_prior_returns: boolean }>();
    const originalIds = sales.map((s) => s.id);
    if (originalIds.length === 0) return out;

    const childSales = await prisma.sale.findMany({
      where: {
        original_sale_id: { in: originalIds },
        status: { in: [SaleStatus.REFUNDED, SaleStatus.EXCHANGED] },
      },
      select: {
        original_sale_id: true,
        sale_items: {
          select: { item_type: true, ref_sale_item_id: true, quantity: true },
        },
      },
    });

    const returnedByLineByOriginal = new Map<string, Map<string, Prisma.Decimal>>();
    for (const id of originalIds) {
      returnedByLineByOriginal.set(id, new Map());
    }
    for (const c of childSales) {
      const oid = c.original_sale_id!;
      const m = returnedByLineByOriginal.get(oid)!;
      for (const si of c.sale_items) {
        if (si.item_type === SaleItemType.RETURN && si.ref_sale_item_id) {
          const k = si.ref_sale_item_id;
          const prev = m.get(k) ?? new Prisma.Decimal(0);
          m.set(k, prev.plus(si.quantity.abs()));
        }
      }
    }

    for (const sale of sales) {
      const lineMap = returnedByLineByOriginal.get(sale.id)!;
      const originalLines = sale.sale_items.filter((l) => l.item_type === SaleItemType.ORIGINAL);
      const lines = originalLines.length > 0 ? originalLines : sale.sale_items;

      const has_prior_returns = childSales.some((c) => c.original_sale_id === sale.id);

      if (lines.length === 0) {
        out.set(sale.id, { fully_returned: false, has_prior_returns });
        continue;
      }

      let anyReturnable = false;
      for (const line of lines) {
        if (originalLines.length > 0 && line.item_type !== SaleItemType.ORIGINAL) continue;
        const already = lineMap.get(line.id)?.toNumber() ?? 0;
        if (line.quantity.toNumber() - already > 0) {
          anyReturnable = true;
          break;
        }
      }

      out.set(sale.id, {
        fully_returned: !anyReturnable,
        has_prior_returns,
      });
    }

    return out;
  }

  async getSalesForReturns({ branchId, search }: { branchId?: string; search?: string }) {
    const normalizedSearch = search?.replace(/\s+/g, ' ').trim();

    const sales = await prisma.sale.findMany({
      where: {
        branch_id: branchId,
        status: 'COMPLETED', // Only completed sales can be returned
        ...(normalizedSearch
          ? {
              OR: [
                { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        sale_items: {
          include: { product: true },
        },
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
      take: 100,
    });

    const flags = await this.getReturnProcessingFlagsForSales(
      sales.map((s) => ({
        id: s.id,
        sale_items: s.sale_items.map((it) => ({
          id: it.id,
          quantity: it.quantity,
          item_type: it.item_type,
        })),
      })),
    );

    return sales.map((s) => {
      const f = flags.get(s.id) ?? { fully_returned: false, has_prior_returns: false };
      return {
        ...s,
        return_eligibility: {
          fully_returned: f.fully_returned,
          has_prior_returns: f.has_prior_returns,
        },
      };
    });
  }

  async getSaleById(saleId: string) {
    const include = {
      sale_items: {
        include: {
          product: {
            include: { unit: true },
          },
        },
      },
      customer: true,
      branch: true,
    } as const;

    let sale =
      (await prisma.sale.findUnique({
        where: { id: saleId },
        include,
      })) ??
      (await prisma.sale.findFirst({
        where: { sale_number: saleId },
        include,
      }));

    if (!sale) throw new AppError(404, 'Sale not found');

    let original_sale: { id: string; sale_number: string } | null = null;
    if (sale.original_sale_id) {
      const orig = await prisma.sale.findUnique({
        where: { id: sale.original_sale_id },
        select: { id: true, sale_number: true },
      });
      if (orig) original_sale = orig;
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      return { ...sale, original_sale };
    }

    const returnedMap = await this.getReturnedQtyByOriginalSaleLineIds(sale.id);
    const originalLines = sale.sale_items.filter(
      (item) => !item.item_type || item.item_type === SaleItemType.ORIGINAL,
    );
    const linesForEditor = originalLines.length > 0 ? originalLines : sale.sale_items;

    const saleItems = linesForEditor.map((item) => {
      const already = returnedMap.get(item.id)?.toNumber() ?? 0;
      const origQty = item.quantity.toNumber();
      return {
        ...item,
        quantity_already_returned: already,
        quantity_returnable: Math.max(0, origQty - already),
      };
    });

    const [hydrated] = await this.hydrateCreditSaleInvoiceTotals([
      { ...sale, sale_items: saleItems, original_sale },
    ]);
    return hydrated;
  }

  async getHoldSales() {
    return prisma.holdSale.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone_number: true,
            mobile_number: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createHoldSale({
    customerId,
    createdBy,
    items,
  }: {
    customerId?: string;
    createdBy?: string;
    items: HoldSaleCartItem[];
  }) {
    if (!items?.length) {
      throw new AppError(400, 'No items provided for hold sale');
    }

    const normalizedItems = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      originalPrice: Number(item.originalPrice ?? item.price),
      actualUnitPrice: Number(item.actualUnitPrice ?? item.price),
      quantity: Number(item.quantity),
      category: item.category,
      unitId: item.unitId,
      unitName: item.unitName,
      unit: item.unit,
    }));

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
      0,
    );

    return prisma.holdSale.create({
      data: {
        customer_id: customerId,
        created_by: createdBy,
        items: normalizedItems as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(subtotal),
        total_items: normalizedItems.length,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone_number: true,
            mobile_number: true,
          },
        },
      },
    });
  }

  async retrieveHoldSale({ holdSaleId }: { holdSaleId: string }) {
    return prisma.$transaction(async (tx) => {
      const holdSale = await tx.holdSale.findUnique({
        where: { id: holdSaleId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone_number: true,
              mobile_number: true,
            },
          },
        },
      });

      if (!holdSale) {
        throw new AppError(404, 'Hold sale not found');
      }

      await tx.holdSale.delete({ where: { id: holdSaleId } });

      return holdSale;
    });
  }

  async deleteHoldSale({ holdSaleId }: { holdSaleId: string }) {
    const holdSale = await prisma.holdSale.findUnique({
      where: { id: holdSaleId },
      select: { id: true },
    });

    if (!holdSale) {
      throw new AppError(404, 'Hold sale not found');
    }

    await prisma.holdSale.delete({ where: { id: holdSaleId } });
  }

  async createSale({
    branchId,
    customerId,
    paymentMethod,
    items,
    discountAmount,
    createdBy,
    paidAmount,
    advanceApplied,
    excessToCredit,
  }: {
    branchId: string;
    customerId?: string;
    paymentMethod: string; // supports CASH, CARD, CREDIT
    items: Array<{ productId: string; quantity: number; price: number }>;
    discountAmount?: number;
    createdBy: string;
    paidAmount?: number; // for credit sales: amount actually paid upfront
    /**
     * For non-credit sales: how much of the customer's existing advance credit
     * (negative ledger balance) settles this invoice. Omit to auto-apply the
     * full available advance, capped at the invoice total.
     */
    advanceApplied?: number;
    /**
     * For non-credit sales: cash tendered beyond the net payable that the customer
     * wants left on their account as advance credit rather than taken as change.
     */
    excessToCredit?: number;
  }) {
    const isCreditSale = paymentMethod === 'CREDIT';

    // Credit sales MUST have a customer
    if (isCreditSale && !customerId) {
      throw new AppError(400, 'A customer must be selected for credit sales');
    }

    // 1) Validate OUTSIDE any interactive transaction
    // Resolve effective branchId: use provided value, or fall back to the first available branch
    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const defaultBranch = await prisma.branch.findFirst({ select: { id: true } });
      if (defaultBranch) effectiveBranchId = defaultBranch.id;
    }

    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId } })
      : null;
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');

    // Authoritative balance from ledger entries (never trust customer.outstanding_balance alone)
    let ledgerBalance = 0;
    if (customerId) {
      ledgerBalance = await ledgerBalanceEngine.getRunningBalance(prisma, customerId);
    }

    if (!items.length) throw new AppError(400, 'No items provided');

    // Warn if over credit limit (but allow — per business decision)
    if (isCreditSale && customer) {
      const creditLimit = new Prisma.Decimal(customer.credit_limit);
      const currentBalance = new Prisma.Decimal(ledgerBalance);
      const subtotalCheck = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const finalTotalCheck = Math.max(0, subtotalCheck - (discountAmount ?? 0));
      const newBalance = currentBalance.plus(finalTotalCheck);
      if (creditLimit.gt(0) && newBalance.gt(creditLimit)) {
        // Over limit — allowed with warning (warn is logged server-side, frontend shows the flag)
        console.warn(`⚠️ Customer ${customer.name} exceeds credit limit: ${newBalance} > ${creditLimit}`);
      }
    }
  
    // 2) Validate that all products exist
    const productIds = items.map(i => i.productId);
    const uniqueProductIds = [...new Set(productIds)];
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true, name: true },
    });
    const foundProductIds = new Set(products.map(p => p.id));
    const productNameById = new Map(products.map((p) => [p.id, p.name]));
    const missingProductIds = uniqueProductIds.filter(id => !foundProductIds.has(id));
    if (missingProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingProductIds.join(', ')}`);
    }
  
    // 3) Pre-fetch stock snapshot once
    const stocks = effectiveBranchId
      ? await prisma.stock.findMany({ where: { product_id: { in: uniqueProductIds }, branch_id: effectiveBranchId } })
      : [];
    const stockMap = new Map(stocks.map(s => [s.product_id, s]));

    // 4) Group same product lines and validate available quantity
    const grouped = items.reduce<Record<string, { productId: string; qty: Prisma.Decimal }>>(
      (acc, it) => {
        const key = it.productId;
        if (!acc[key]) acc[key] = { productId: it.productId, qty: new Prisma.Decimal(0) };
        acc[key].qty = acc[key].qty.plus(it.quantity);
        return acc;
      },
      {}
    );

    for (const gp of Object.values(grouped)) {
      const available = new Prisma.Decimal(stockMap.get(gp.productId)?.current_quantity ?? 0);
      if (gp.qty.gt(available)) {
        const label = productNameById.get(gp.productId) ?? gp.productId;
        throw new AppError(
          400,
          `Insufficient stock for ${label}. Available: ${available.toNumber()}, requested: ${gp.qty.toNumber()}`,
        );
      }
    }

    // 5) Compute stock movements in memory

    type MoveRow = {
      product_id: string;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      quantity_change: Prisma.Decimal;
    };

    const movements: MoveRow[] = [];
    for (const gp of Object.values(grouped)) {
      const existing = stockMap.get(gp.productId);
      const prev = new Prisma.Decimal(existing?.current_quantity ?? 0);
      const change = gp.qty.mul(-1);
      const next = prev.plus(change);
      movements.push({ product_id: gp.productId, previous_qty: prev, new_qty: next, quantity_change: change });
      if (effectiveBranchId) {
        stockMap.set(gp.productId, { ...(existing ?? ({} as any)), product_id: gp.productId, branch_id: effectiveBranchId, current_quantity: next });
      }
    }
  
    // 5) Atomic sale + stock + ledger transaction
    const subtotalAmt = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const finalDiscount = discountAmount ?? 0;
    const finalTotal = Math.max(0, subtotalAmt - finalDiscount);

    const dbPaymentMethod = isCreditSale ? 'CREDIT' : paymentMethod as Prisma.SaleCreateInput['payment_method'];
    const saleNumber = `SALE-${Date.now()}`;

    // A negative ledger balance means the customer is in credit (advance paid earlier).
    // On a cash/card sale that advance settles the invoice first, so only the remainder
    // is actually collected at the counter.
    const availableAdvance = !isCreditSale && customerId ? Math.max(0, -ledgerBalance) : 0;
    const applicableAdvance = Math.min(availableAdvance, finalTotal);
    const appliedAdvance = round2(
      Math.min(Math.max(0, advanceApplied ?? applicableAdvance), applicableAdvance),
    );

    // Cash tendered above the net payable can be parked back on the account as fresh
    // advance credit instead of being handed over as change.
    const parkedAsCredit =
      !isCreditSale && customerId ? round2(Math.max(0, excessToCredit ?? 0)) : 0;

    const creditPaidAmount = isCreditSale
      ? Math.min(Math.max(0, paidAmount ?? 0), finalTotal)
      : round2(finalTotal - appliedAdvance);
    const creditOwedAmount = isCreditSale ? finalTotal - creditPaidAmount : 0;
    const dbPaymentStatus = isCreditSale
      ? creditPaidAmount >= finalTotal ? 'PAID' : creditPaidAmount > 0 ? 'PARTIAL' : 'PENDING'
      : 'PAID';

    const previousBalanceSnapshot = new Prisma.Decimal(ledgerBalance);

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    ops.push(
      prisma.sale.create({
        data: {
          sale_number: saleNumber,
          branch_id: effectiveBranchId ?? null,
          customer_id: customerId,
          total_amount: new Prisma.Decimal(finalTotal),
          subtotal: new Prisma.Decimal(subtotalAmt),
          discount_amount: new Prisma.Decimal(finalDiscount),
          payment_method: dbPaymentMethod,
          payment_status: dbPaymentStatus,
          payment_received: new Prisma.Decimal(creditPaidAmount),
          previous_balance: previousBalanceSnapshot,
          status: 'COMPLETED',
          created_by: createdBy,
          sale_items: {
            create: items.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: new Prisma.Decimal(item.quantity),
              unit_price: new Prisma.Decimal(item.price),
              line_total: new Prisma.Decimal(item.price).mul(item.quantity),
            })),
          },
        },
        include: { sale_items: true },
      }),
    );

    if (effectiveBranchId) {
      for (const m of movements) {
        const decAbs = m.quantity_change.abs();
        ops.push(
          prisma.stock.upsert({
            where: { product_id_branch_id: { product_id: m.product_id, branch_id: effectiveBranchId } },
            update: { current_quantity: { decrement: decAbs } },
            create: {
              product_id: m.product_id,
              branch_id: effectiveBranchId,
              current_quantity: m.new_qty,
              minimum_quantity: new Prisma.Decimal(0),
              maximum_quantity: new Prisma.Decimal(1000),
              reserved_quantity: new Prisma.Decimal(0),
            },
          }),
        );
        ops.push(
          prisma.stockMovement.create({
            data: {
              product_id: m.product_id,
              branch_id: effectiveBranchId,
              movement_type: 'SALE',
              quantity_change: m.quantity_change,
              previous_qty: m.previous_qty,
              new_qty: m.new_qty,
              created_by: createdBy,
            },
          }),
        );
      }
    }

    if (isCreditSale && customerId && customer && finalTotal > 0) {
      // CREDIT_SALE records the FULL invoice charged to the account. Any amount paid
      // at the counter is a separate PAYMENT_RECEIVED row below. The running balance
      // is (full charge − payments), so the upfront payment must NOT also be netted
      // out of this charge — otherwise it gets subtracted twice.
      ops.push(
        prisma.customerLedger.create({
          data: {
            customer_id: customerId,
            entry_type: LedgerEntryType.CREDIT_SALE,
            amount: new Prisma.Decimal(finalTotal),
            description:
              creditPaidAmount > 0
                ? `Partial credit sale - ${saleNumber}`
                : `Credit sale - ${saleNumber}`,
            sale_id: saleNumber,
            balance_after: 0,
            created_by: createdBy,
          },
        }),
      );

      if (creditPaidAmount > 0) {
        ops.push(
          prisma.customerLedger.create({
            data: {
              customer_id: customerId,
              entry_type: LedgerEntryType.PAYMENT_RECEIVED,
              amount: new Prisma.Decimal(creditPaidAmount),
              description: saleUpfrontPaymentDescription(saleNumber),
              sale_id: saleNumber,
              balance_after: 0,
              created_by: createdBy,
            },
          }),
        );
      }
    } else if (!isCreditSale && customerId && customer && finalTotal > 0) {
      const paidLabel = paymentMethod === 'CARD' ? 'Card' : 'Cash';
      ops.push(
        prisma.customerLedger.create({
          data: {
            customer_id: customerId,
            entry_type: LedgerEntryType.CASH_SALE,
            amount: new Prisma.Decimal(finalTotal),
            description: `${paidLabel} sale - ${saleNumber}`,
            sale_id: saleNumber,
            balance_after: 0,
            created_by: createdBy,
          },
        }),
      );

      // CASH_SALE itself is balance-neutral, so consuming the advance needs its own
      // DEBIT adjustment — it moves the balance from negative back toward zero.
      if (appliedAdvance > 0.009) {
        ops.push(
          prisma.customerLedger.create({
            data: {
              customer_id: customerId,
              entry_type: LedgerEntryType.ADJUSTMENT,
              amount: new Prisma.Decimal(appliedAdvance),
              description: advanceAppliedDescription(saleNumber),
              sale_id: saleNumber,
              reference_no: 'DEBIT',
              balance_after: 0,
              created_by: createdBy,
            },
          }),
        );
      }

      // Deliberately account-level (no sale_id): this money settles nothing on THIS
      // invoice, so tying it to the sale would make per-invoice snapshots read as overpaid.
      if (parkedAsCredit > 0.009) {
        ops.push(
          prisma.customerLedger.create({
            data: {
              customer_id: customerId,
              entry_type: LedgerEntryType.PAYMENT_RECEIVED,
              amount: new Prisma.Decimal(parkedAsCredit),
              description: advanceReceivedDescription(saleNumber),
              reference_no: saleNumber,
              balance_after: 0,
              created_by: createdBy,
            },
          }),
        );
      }
    }

    const [sale] = await prisma.$transaction(ops);

    let closingBalance = ledgerBalance;
    if (customerId && customer) {
      const needsSync =
        (isCreditSale && finalTotal > 0) || (!isCreditSale && finalTotal > 0);
      if (needsSync) {
        closingBalance = await ledgerBalanceEngine.syncCustomerBalances(customerId);
      }
    }

    const created = await prisma.sale.findUnique({
      where: { id: (sale as { id: string }).id },
      include: { sale_items: true },
    });
    if (!created) throw new AppError(500, 'Sale created but could not be loaded');

    const [hydrated] = await this.hydrateCreditSaleInvoiceTotals([created]);
    return {
      ...hydrated,
      advance_applied: appliedAdvance,
      excess_kept_as_credit: parkedAsCredit,
      // Negative = customer is in credit with us after this sale.
      closing_balance: closingBalance,
    };
  }


  async getTodaySales({ branchId }: { branchId?: string }) {
    const { gte, lt } = getReportingPeriodCreatedAtFilter();

    return prisma.sale.findMany({
      where: {
        status: "COMPLETED",
        ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {}),
        created_at: {
          gte,
          lt,
        },
      },
      include: {
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
    });
  }

  // async createExchangeOrReturnSale({
  //     originalSaleId,
  //     branchId,
  //     customerId,
  //     returnedItems,
  //     exchangedItems,
  //     createdBy
  // }: {
  //     originalSaleId: string,
  //     branchId: string,
  //     customerId?: string,
  //     returnedItems: { productId: string, quantity: number }[],
  //     exchangedItems: { productId: string, quantity: number, price: number }[],
  //     createdBy: string,
  // }) {
  //     return prisma.$transaction(async (tx) => {
  //         const originalSale = await tx.sale.findUnique({
  //             where: { id: originalSaleId },
  //             include: { sale_items: true },
  //         });
  //         if (!originalSale) throw new AppError(404, "Original sale not found");

  //         const productIds = [
  //             ...returnedItems.map(i => i.productId),
  //             ...exchangedItems.map(i => i.productId)
  //         ];

  //         const stocks = await tx.stock.findMany({
  //             where: { product_id: { in: productIds }, branch_id: branchId }
  //         });

  //         const saleItems: any[] = [];
  //         let total = 0;

  //         // Process Returns
  //         for (const ret of returnedItems) {
  //             const stock = stocks.find(s => s.product_id === ret.productId);
  //             if (!stock) throw new AppError(400, `Stock not found for product ${ret.productId}`);

  //             const originalItem = originalSale.sale_items.find(i => i.product_id === ret.productId);
  //             if (!originalItem) throw new AppError(400, `Product ${ret.productId} not in original sale`);

  //             if (ret.quantity > originalItem.quantity) {
  //                 throw new AppError(400, `Return quantity exceeds original`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: ret.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { increment: ret.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: ret.productId,
  //                     branch_id: branchId,
  //                     movement_type: "RETURN",
  //                     quantity_change: ret.quantity,
  //                     previous_qty: 0,
  //                     new_qty: 0,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = -(Number(originalItem.unit_price) * ret.quantity);
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: ret.productId,
  //                 quantity: -ret.quantity,
  //                 unit_price: originalItem.unit_price,
  //                 line_total: lineTotal,
  //                 item_type: "RETURN",
  //                 ref_sale_item_id: originalItem.id
  //             });
  //         }

  //         // Process Exchanges
  //         for (const item of exchangedItems) {
  //             const stock = stocks.find(s => s.product_id === item.productId);
  //             if (!stock || stock.current_quantity < item.quantity) {
  //                 throw new AppError(400, `Insufficient stock for exchange product ${item.productId}`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: item.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { decrement: item.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: item.productId,
  //                     branch_id: branchId,
  //                     movement_type: "SALE",
  //                     quantity_change: -item.quantity,
  //                     previous_qty: stock.current_quantity,
  //                     new_qty: stock.current_quantity - item.quantity,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = item.price * item.quantity;
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: item.productId,
  //                 quantity: item.quantity,
  //                 unit_price: item.price,
  //                 line_total: lineTotal,
  //                 item_type: "EXCHANGE"
  //             });
  //         }

  //         const sale = await tx.sale.create({
  //             data: {
  //                 sale_number: `SALE-${Date.now()}`,
  //                 branch_id: branchId,
  //                 customer_id: customerId,
  //                 original_sale_id: originalSaleId,
  //                 total_amount: total,
  //                 subtotal: total,
  //                 payment_method: "CASH",
  //                 payment_status: "PAID",
  //                 status: "COMPLETED",
  //                 created_by: createdBy,
  //                 sale_items: {
  //                     create: saleItems,
  //                 },
  //             },
  //             include: { sale_items: true },
  //         });

  //         return sale;
  //     });
  // }

  async createExchangeOrReturnSale({
    originalSaleId,
    branchId,
    customerId,
    returnedItems,
    exchangedItems,
    notes,
    createdBy,
    returnReason,
    refundMethod,
    exchangePaymentMethod,
    orderScope,
  }: {
    originalSaleId: string;
    branchId: string;
    customerId?: string;
    returnedItems: ReturnItem[];
    exchangedItems: ExchangeItem[];
    notes?: string;
    createdBy: string;
    returnReason?: string;
    refundMethod?: string;
    exchangePaymentMethod?: 'CASH' | 'CREDIT';
    orderScope?: string;
  }) {
    if (!returnedItems.length && !exchangedItems.length) {
      throw new AppError(400, 'No return or exchange items provided');
    }

    const uniqueProductIds = [...new Set([
      ...returnedItems.map((item) => item.productId),
      ...exchangedItems.map((item) => item.productId),
    ])];
    const uniqueExchangeProductIds = [...new Set(exchangedItems.map((item) => item.productId))];

    const [originalSale, branch, customer, exchangeProducts, stocks] = await Promise.all([
      prisma.sale.findUnique({
        where: { id: originalSaleId },
        include: { sale_items: true },
      }),
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
      customerId
        ? prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
          })
        : Promise.resolve(null),
      uniqueExchangeProductIds.length
        ? prisma.product.findMany({
            where: { id: { in: uniqueExchangeProductIds } },
            select: { id: true },
          })
        : Promise.resolve([] as Array<{ id: string }>),
      uniqueProductIds.length
        ? prisma.stock.findMany({
            where: {
              product_id: { in: uniqueProductIds },
              branch_id: branchId,
            },
          })
        : Promise.resolve([] as Array<{ product_id: string; current_quantity: Prisma.Decimal }>),
    ]);

    if (!originalSale) throw new AppError(400, 'Original sale not found');
    if (!branch) throw new AppError(400, 'Invalid branch');
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');

    const foundExchangeProductIds = new Set(exchangeProducts.map((product) => product.id));
    const missingExchangeProductIds = uniqueExchangeProductIds.filter(
      (productId) => !foundExchangeProductIds.has(productId),
    );
    if (missingExchangeProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingExchangeProductIds.join(', ')}`);
    }

    const returnedQtyByLineId = await this.getReturnedQtyByOriginalSaleLineIds(originalSaleId);

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not found in original sale`);
      }
      const alreadyReturned = returnedQtyByLineId.get(originalItem.id)?.toNumber() ?? 0;
      const maxReturnable = originalItem.quantity.toNumber() - alreadyReturned;
      if (maxReturnable <= 0) {
        throw new AppError(
          400,
          `Nothing left to return for this product (${alreadyReturned} of ${originalItem.quantity.toNumber()} units were already returned).`,
        );
      }
      if (ret.quantity > maxReturnable) {
        throw new AppError(
          400,
          `Return quantity (${ret.quantity}) exceeds what is still returnable (${maxReturnable}) for product ${ret.productId}. ${alreadyReturned} unit(s) were already returned.`,
        );
      }
    }

    type MovementRow = {
      product_id: string;
      movement_type: StockMovementType;
      quantity_change: Prisma.Decimal;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      reference_type: string;
      notes: string;
    };

    const saleItems: Prisma.SaleItemUncheckedCreateWithoutSaleInput[] = [];
    const movementRows: MovementRow[] = [];
    const stockNetChanges = new Map<string, Prisma.Decimal>();
    const stockQuantityMap = new Map<string, Prisma.Decimal>(
      stocks.map((stock) => [stock.product_id, new Prisma.Decimal(stock.current_quantity)]),
    );
    let total = new Prisma.Decimal(0);
    const hasReturn = returnedItems.length > 0;
    const hasExchange = exchangedItems.length > 0;
    const resolvedExchangePaymentMethod = (exchangePaymentMethod ?? 'CASH').toUpperCase() as 'CASH' | 'CREDIT';

    const recordMovement = ({
      productId,
      change,
      movementType,
      referenceType,
      notes: movementNote,
    }: {
      productId: string;
      change: Prisma.Decimal;
      movementType: StockMovementType;
      referenceType: string;
      notes: string;
    }) => {
      const previousQty = stockQuantityMap.get(productId) ?? new Prisma.Decimal(0);
      const newQty = previousQty.plus(change);

      stockQuantityMap.set(productId, newQty);
      stockNetChanges.set(productId, (stockNetChanges.get(productId) ?? new Prisma.Decimal(0)).plus(change));
      movementRows.push({
        product_id: productId,
        movement_type: movementType,
        quantity_change: change,
        previous_qty: previousQty,
        new_qty: newQty,
        reference_type: referenceType,
        notes: movementNote,
      });
    };

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not in original sale`);
      }

      const returnQuantity = new Prisma.Decimal(ret.quantity);
      const lineTotal = new Prisma.Decimal(originalItem.unit_price).mul(returnQuantity).mul(-1);
      total = total.plus(lineTotal);

      const disposition = ret.disposition ?? 'RESTOCK';
      if (disposition !== 'UNSELLABLE') {
        recordMovement({
          productId: ret.productId,
          change: returnQuantity,
          movementType:
            disposition === 'DAMAGED' ? StockMovementType.DAMAGE : StockMovementType.RETURN,
          referenceType: 'return',
          notes:
            disposition === 'DAMAGED'
              ? 'Returned — marked damaged'
              : 'Returned by customer',
        });
      }

      saleItems.push({
        product_id: ret.productId,
        quantity: returnQuantity.mul(-1),
        unit_price: originalItem.unit_price,
        tax_rate: originalItem.tax_rate,
        discount_rate: originalItem.discount_rate,
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.RETURN,
        ref_sale_item_id: originalItem.id,
      });
    }

    for (const item of exchangedItems) {
      const exchangeQuantity = new Prisma.Decimal(item.quantity);
      const available = stockQuantityMap.get(item.productId) ?? new Prisma.Decimal(0);
      if (available.lt(exchangeQuantity)) {
        throw new AppError(
          400,
          `Insufficient stock for exchange. Product ${item.productId}: available ${available.toNumber()}, requested ${exchangeQuantity.toNumber()}`,
        );
      }

      const unitPrice = new Prisma.Decimal(item.price);
      const lineTotal = unitPrice.mul(exchangeQuantity);
      total = total.plus(lineTotal);

      recordMovement({
        productId: item.productId,
        change: exchangeQuantity.mul(-1),
        movementType: StockMovementType.SALE,
        referenceType: 'exchange',
        notes: 'Exchanged to customer',
      });

      saleItems.push({
        product_id: item.productId,
        quantity: exchangeQuantity,
        unit_price: unitPrice,
        tax_rate: new Prisma.Decimal(0),
        discount_rate: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.EXCHANGE,
      });
    }

    const resolvedCustomerId = customerId ?? originalSale.customer_id ?? undefined;
    const returnSaleNumber = `SALE-${Date.now()}`;

    const metaParts: string[] = [];
    if (returnReason) metaParts.push(`Reason: ${returnReason}`);
    if (refundMethod) metaParts.push(`Refund: ${refundMethod}`);
    if (hasExchange) metaParts.push(`ExchangePayment: ${resolvedExchangePaymentMethod}`);
    if (orderScope) metaParts.push(`Scope: ${orderScope}`);
    const dispositionSummary = returnedItems
      .filter((r) => r.disposition && r.disposition !== 'RESTOCK')
      .map((r) => `${r.productId}=${r.disposition}`)
      .join(', ');
    if (dispositionSummary) metaParts.push(`Disposition: ${dispositionSummary}`);
    const composedNotes = [metaParts.join(' | '), notes?.trim()].filter(Boolean).join('\n');

    // Settlement note:
    // total = exchangeTotal - refundTotal
    // total > 0 => customer owes
    // total < 0 => store owes/refund
    let returnPreviousBalance = new Prisma.Decimal(0);
    let returnUpdatedBalance = new Prisma.Decimal(0);
    let returnAdjustsAccount = false;
    const shouldPostToLedger =
      !!resolvedCustomerId &&
      !total.isZero() &&
      (
        total.isNegative() || // net refund still credits customer account
        (total.isPositive() && resolvedExchangePaymentMethod === 'CREDIT') // net payable only on credit mode
      );

    if (shouldPostToLedger && resolvedCustomerId) {
      returnAdjustsAccount = true;
      returnPreviousBalance = new Prisma.Decimal(
        await ledgerBalanceEngine.getRunningBalance(prisma, resolvedCustomerId),
      );
      returnUpdatedBalance = returnPreviousBalance.plus(total);
    }

    if (hasExchange && total.isPositive() && resolvedExchangePaymentMethod === 'CREDIT' && !resolvedCustomerId) {
      throw new AppError(400, 'Customer is required when exchange payment option is CREDIT');
    }

    const salePaymentMethod: 'CASH' | 'CREDIT' =
      hasExchange ? resolvedExchangePaymentMethod : 'CASH';
    const salePaymentStatus: 'PAID' | 'PENDING' =
      salePaymentMethod === 'CREDIT' && total.isPositive() ? 'PENDING' : 'PAID';

    const ops: Prisma.PrismaPromise<any>[] = [];

    ops.push(
      prisma.sale.create({
        data: {
          sale_number: returnSaleNumber,
          branch_id: branchId,
          customer_id: resolvedCustomerId,
          original_sale_id: originalSaleId,
          notes: composedNotes || undefined,
          subtotal: total,
          total_amount: total,
          payment_method: salePaymentMethod,
          payment_status: salePaymentStatus,
          previous_balance: returnPreviousBalance,
          status:
            hasReturn && hasExchange
              ? SaleStatus.EXCHANGED
              : hasReturn
                ? SaleStatus.REFUNDED
                : SaleStatus.EXCHANGED,
          created_by: createdBy,
          sale_items: {
            create: saleItems,
          },
        },
        include: {
          sale_items: true,
        },
      }),
    );

    for (const [productId, quantityChange] of stockNetChanges.entries()) {
      ops.push(
        prisma.stock.upsert({
          where: {
            product_id_branch_id: {
              product_id: productId,
              branch_id: branchId,
            },
          },
          update: {
            current_quantity: {
              increment: quantityChange,
            },
          },
          create: {
            product_id: productId,
            branch_id: branchId,
            current_quantity: quantityChange,
            minimum_quantity: new Prisma.Decimal(0),
            maximum_quantity: new Prisma.Decimal(1000),
            reserved_quantity: new Prisma.Decimal(0),
          },
        }),
      );
    }

    if (movementRows.length > 0) {
      ops.push(
        prisma.stockMovement.createMany({
          data: movementRows.map((movement) => ({
            product_id: movement.product_id,
            branch_id: branchId,
            movement_type: movement.movement_type,
            reference_id: originalSaleId,
            reference_type: movement.reference_type,
            quantity_change: movement.quantity_change,
            previous_qty: movement.previous_qty,
            new_qty: movement.new_qty,
            notes: movement.notes,
            created_by: createdBy,
          })),
        }),
      );
    }

    const [sale] = await prisma.$transaction(ops);

    if (returnAdjustsAccount && resolvedCustomerId && !total.isZero()) {
      await prisma.$transaction(async (tx) => {
        if (total.isNegative()) {
          await ledgerBalanceEngine.postRefund(tx, {
            customerId: resolvedCustomerId,
            amount: Number(total.abs()),
            createdBy,
            description: `Return refund credited to account - ${returnSaleNumber}`,
            saleId: returnSaleNumber,
          });
        } else {
          await ledgerBalanceEngine.postCreditSale(tx, {
            customerId: resolvedCustomerId,
            amount: Number(total),
            createdBy,
            description: `Exchange on credit - ${returnSaleNumber}`,
            saleId: returnSaleNumber,
          });
        }
      });
    }

    return sale as Prisma.SaleGetPayload<{ include: { sale_items: true } }>;
  }

  async getRecentSaleItemsProductNameAndPrice(branchId?: string) {
    const defaultBranchId = branchId?.trim() || undefined;

    const sales = await prisma.sale.findMany({
      where: {
        status: "COMPLETED",
        ...(defaultBranchId && defaultBranchId !== "Not Found"
          ? { branch_id: defaultBranchId }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    if (!sales || sales.length === 0) return [];
    
    return sales.map((sale) => ({
      productName: sale.sale_number, // Mapping sale_number to productName as expected by UI
      price: sale.total_amount,
    }));
  }

  async updateSale(
    saleId: string,
    data: {
      items: Array<{ productId: string; quantity: number; price: number }>;
      discountAmount?: number;
      paymentMethod?: string;
      paidAmount?: number;
      notes?: string;
      customerId?: string | null;
      createdBy: string;
    }
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const oldSale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { sale_items: true, customer: true },
      });

      if (!oldSale) throw new AppError(404, "Sale not found");
      if (oldSale.status !== "COMPLETED") throw new AppError(400, "Only completed sales can be edited");

      const oldTotal = new Prisma.Decimal(oldSale.total_amount);
      const oldPaid = new Prisma.Decimal(oldSale.payment_received);
      const branchId = oldSale.branch_id || undefined;
      const normalizedPaymentMethod = (data.paymentMethod || oldSale.payment_method).toUpperCase();
      const newPaymentMethod = normalizedPaymentMethod as Prisma.SaleUpdateInput["payment_method"];

      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new AppError(400, "A sale must contain at least one product");
      }

      const invalidLine = data.items.find((item) => item.quantity <= 0 || item.price < 0);
      if (invalidLine) {
        throw new AppError(400, "Each line must have quantity >= 1 and price >= 0");
      }

      const originalOldItems = oldSale.sale_items.filter(
        (item) => !item.item_type || item.item_type === SaleItemType.ORIGINAL,
      );

      const resolvedCustomerId =
        data.customerId !== undefined ? data.customerId : oldSale.customer_id;

      if (newPaymentMethod === 'CREDIT' && !resolvedCustomerId) {
        throw new AppError(400, 'Credit sales require a customer');
      }

      if (resolvedCustomerId) {
        const customerExists = await tx.customer.findUnique({
          where: { id: resolvedCustomerId },
          select: { id: true },
        });
        if (!customerExists) throw new AppError(400, 'Invalid customer');
      }

      const groupedOld = originalOldItems.reduce<Map<string, Prisma.Decimal>>((acc, item) => {
        const prev = acc.get(item.product_id) || new Prisma.Decimal(0);
        acc.set(item.product_id, prev.plus(item.quantity));
        return acc;
      }, new Map());

      const groupedNew = data.items.reduce<Map<string, Prisma.Decimal>>((acc, item) => {
        const prev = acc.get(item.productId) || new Prisma.Decimal(0);
        acc.set(item.productId, prev.plus(item.quantity));
        return acc;
      }, new Map());

      const uniqueProductIds = Array.from(new Set(data.items.map((item) => item.productId)));
      const products = await tx.product.findMany({
        where: { id: { in: uniqueProductIds } },
        select: { id: true, name: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const missing = uniqueProductIds.filter((id) => !productMap.has(id));
      if (missing.length > 0) {
        throw new AppError(400, `Products not found: ${missing.join(", ")}`);
      }

      if (branchId) {
        const stockRows = await tx.stock.findMany({
          where: { branch_id: branchId, product_id: { in: Array.from(new Set([...groupedOld.keys(), ...groupedNew.keys()])) } },
          select: { product_id: true, current_quantity: true },
        });
        const stockMap = new Map(stockRows.map((s) => [s.product_id, new Prisma.Decimal(s.current_quantity)]));

        for (const [productId, wanted] of groupedNew.entries()) {
          const current = stockMap.get(productId) || new Prisma.Decimal(0);
          const rollbackQty = groupedOld.get(productId) || new Prisma.Decimal(0);
          const availableAfterRollback = current.plus(rollbackQty);
          if (wanted.gt(availableAfterRollback)) {
            const productName = productMap.get(productId)?.name || "Unknown product";
            throw new AppError(
              400,
              `Insufficient stock for ${productName}. Available: ${availableAfterRollback.toNumber()}, requested: ${wanted.toNumber()}`,
            );
          }
        }
      }

      const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discount = Math.max(0, data.discountAmount ?? Number(oldSale.discount_amount));
      if (discount > subtotal) {
        throw new AppError(400, "Discount cannot be greater than subtotal");
      }

      const taxAmount = 0;
      const newTotalNumber = Math.max(0, subtotal - discount + taxAmount);
      const newTotal = new Prisma.Decimal(newTotalNumber);

      const requestedPaid = Math.max(
        0,
        Number.isFinite(Number(data.paidAmount)) ? Number(data.paidAmount) : Number(oldPaid),
      );

      const paymentReceived =
        newPaymentMethod === "CREDIT"
          ? Math.min(requestedPaid, newTotalNumber)
          : requestedPaid;

      const dueAmount = Math.max(0, newTotalNumber - paymentReceived);
      const changeAmount = newPaymentMethod === "CREDIT" ? 0 : Math.max(0, paymentReceived - newTotalNumber);
      const paymentStatus: Prisma.SaleUpdateInput["payment_status"] =
        dueAmount <= 0 ? "PAID" : paymentReceived > 0 ? "PARTIAL" : "PENDING";

      if (branchId) {
        // Rollback previous stock impact
        for (const [productId, qty] of groupedOld.entries()) {
          await tx.stock.upsert({
            where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            update: { current_quantity: { increment: qty } },
            create: {
              product_id: productId,
              branch_id: branchId,
              current_quantity: qty,
              minimum_quantity: new Prisma.Decimal(0),
              maximum_quantity: new Prisma.Decimal(1000),
              reserved_quantity: new Prisma.Decimal(0),
            },
          });
        }

        // Apply new stock impact
        for (const [productId, qty] of groupedNew.entries()) {
          await tx.stock.upsert({
            where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            update: { current_quantity: { decrement: qty } },
            create: {
              product_id: productId,
              branch_id: branchId,
              current_quantity: new Prisma.Decimal(0).minus(qty),
              minimum_quantity: new Prisma.Decimal(0),
              maximum_quantity: new Prisma.Decimal(1000),
              reserved_quantity: new Prisma.Decimal(0),
            },
          });
        }
      }

      await tx.saleItem.deleteMany({ where: { sale_id: saleId } });

      const saleItemsData = data.items.map((item) => ({
        product_id: item.productId,
        quantity: new Prisma.Decimal(item.quantity),
        unit_price: new Prisma.Decimal(item.price),
        tax_rate: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        discount_rate: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(item.price * item.quantity),
        item_type: SaleItemType.ORIGINAL,
      }));

      const oldCustomerId = oldSale.customer_id;
      const newCustomerId = resolvedCustomerId ?? null;
      const customerChanged = oldCustomerId !== newCustomerId;
      const saleEditReason = data.notes?.trim()
        ? `Sale edited: ${data.notes.trim()}`
        : `Sale edited (${oldSale.sale_number})`;

      if (customerChanged) {
        if (oldCustomerId) {
          await ledgerBalanceEngine.syncSaleLedgerEntries(tx, {
            customerId: oldCustomerId,
            saleNumber: oldSale.sale_number,
            paymentMethod: oldSale.payment_method,
            creditOwedAmount: 0,
            upfrontPaymentAmount: 0,
            cashSaleAmount: 0,
            createdBy: data.createdBy,
            reason: `Customer removed from sale (${oldSale.sale_number})`,
          });
        }
        if (newCustomerId) {
          await ledgerBalanceEngine.syncCreditSaleLedgerFromRecord(tx, {
            customerId: newCustomerId,
            saleNumber: oldSale.sale_number,
            totalAmount: newTotalNumber,
            paymentReceived:
              newPaymentMethod === 'CREDIT' ? paymentReceived : 0,
            createdBy: data.createdBy,
            reason: `Customer assigned to sale (${oldSale.sale_number})`,
            useSaleEditPaymentLabel: true,
          });
          if (newPaymentMethod !== 'CREDIT') {
            await ledgerBalanceEngine.syncSaleLedgerEntries(tx, {
              customerId: newCustomerId,
              saleNumber: oldSale.sale_number,
              paymentMethod: normalizedPaymentMethod,
              creditOwedAmount: 0,
              upfrontPaymentAmount: 0,
              cashSaleAmount: newTotalNumber,
              createdBy: data.createdBy,
              reason: `Customer assigned to sale (${oldSale.sale_number})`,
            });
          }
        }
      } else if (newCustomerId) {
        if (newPaymentMethod === 'CREDIT') {
          await ledgerBalanceEngine.syncCreditSaleLedgerFromRecord(tx, {
            customerId: newCustomerId,
            saleNumber: oldSale.sale_number,
            totalAmount: newTotalNumber,
            paymentReceived,
            createdBy: data.createdBy,
            reason: saleEditReason,
            useSaleEditPaymentLabel: true,
          });
        } else {
          await ledgerBalanceEngine.syncSaleLedgerEntries(tx, {
            customerId: newCustomerId,
            saleNumber: oldSale.sale_number,
            paymentMethod: normalizedPaymentMethod,
            creditOwedAmount: 0,
            upfrontPaymentAmount: 0,
            cashSaleAmount: newTotalNumber,
            createdBy: data.createdBy,
            reason: saleEditReason,
          });
        }
      }

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          subtotal: new Prisma.Decimal(subtotal),
          tax_amount: new Prisma.Decimal(taxAmount),
          total_amount: newTotal,
          discount_amount: new Prisma.Decimal(discount),
          payment_method: newPaymentMethod,
          payment_status: paymentStatus,
          payment_received: new Prisma.Decimal(paymentReceived),
          change_amount: new Prisma.Decimal(changeAmount),
          notes: data.notes ?? oldSale.notes,
          customer_id: newCustomerId,
          sale_items: { create: saleItemsData },
        },
        include: { sale_items: { include: { product: true } }, customer: true },
      });

      return updatedSale;
    }, {
      maxWait: 20000,
      timeout: 15000 
    });

    const [hydrated] = await this.hydrateCreditSaleInvoiceTotals([updated]);
    return hydrated;
  }

  async deleteSale(
    saleId: string,
    options?: { deletedBy?: string; restrictToBranchId?: string },
  ) {
    return prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { sale_items: true },
        });

        if (!sale) throw new AppError(404, 'Sale not found');

        if (
          options?.restrictToBranchId &&
          sale.branch_id &&
          sale.branch_id !== options.restrictToBranchId
        ) {
          throw new AppError(403, 'You cannot delete sales from another branch');
        }

        const deletableStatuses: SaleStatus[] = [
          SaleStatus.COMPLETED,
          SaleStatus.REFUNDED,
          SaleStatus.EXCHANGED,
        ];
        if (!deletableStatuses.includes(sale.status)) {
          throw new AppError(400, 'This sale cannot be deleted');
        }

        const isReturnOrExchangeRecord = Boolean(
          sale.original_sale_id ||
            sale.status === SaleStatus.REFUNDED ||
            sale.status === SaleStatus.EXCHANGED,
        );

        if (!isReturnOrExchangeRecord) {
          const linkedReturnCount = await tx.sale.count({
            where: { original_sale_id: saleId },
          });
          if (linkedReturnCount > 0) {
            throw new AppError(
              400,
              'Cannot delete a sale that has returns or exchanges recorded against it. Delete those records first.',
            );
          }
        }

        const branchId = sale.branch_id;
        if (branchId) {
          for (const item of sale.sale_items) {
            // RETURN lines store negative qty; EXCHANGE/SALE lines positive — increment reverses both.
            await tx.stock.upsert({
              where: {
                product_id_branch_id: {
                  product_id: item.product_id,
                  branch_id: branchId,
                },
              },
              update: { current_quantity: { increment: item.quantity } },
              create: {
                product_id: item.product_id,
                branch_id: branchId,
                current_quantity: item.quantity,
                minimum_quantity: new Prisma.Decimal(0),
                maximum_quantity: new Prisma.Decimal(1000),
                reserved_quantity: new Prisma.Decimal(0),
              },
            });
          }
        }

        if (sale.customer_id) {
          await tx.customerLedger.deleteMany({
            where: {
              customer_id: sale.customer_id,
              sale_id: sale.sale_number,
            },
          });
          await ledgerBalanceEngine.recalculateRunningBalances(tx, sale.customer_id);
        }

        await tx.sale.delete({ where: { id: saleId } });

        return { success: true, saleNumber: sale.sale_number };
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }
}

export { SaleService };
