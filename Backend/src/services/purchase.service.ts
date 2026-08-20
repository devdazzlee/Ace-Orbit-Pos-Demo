import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';
import { supplierLedgerBalanceEngine } from './supplier-ledger-balance.engine';

export class PurchaseService {
  async createBulkPurchase(data: {
    supplierId?: string;
    warehouseBranchId?: string;
    purchaseDate: Date;
    invoiceRef?: string;
    notes?: string;
    deliveryStatus: "PARTIAL" | "COMPLETE";
    paymentMethod?: "CREDIT" | "CASH" | "CARD";
    items: Array<{
      productId: string;
      quantity: number;
      costPrice: number;
      salePrice: number;
      batchNo?: string;
      expiryDate?: string;
      ctns?: number;
      piecePerCtn?: number;
      cbmPerCtn?: number;
      tCbm?: number;
      gwPerCtn?: number;
      tGw?: number;
    }>;
    createdBy: string;
  }) {
    // RESOLVE BRANCH ID
    let finalBranchId = data.warehouseBranchId;
    if (!finalBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!firstBranch) throw new AppError(404, 'No active branch found in system');
      finalBranchId = firstBranch.id;
    }

    if (!data.supplierId?.trim()) {
      throw new AppError(400, 'Supplier is required for stock-in');
    }

    return prisma.$transaction(async (tx) => {
      const purchaseNumber = `PUR-${Date.now()}`;
      const paymentMethod = (data.paymentMethod ?? 'CREDIT').toUpperCase();
      const paymentStatus =
        paymentMethod === 'CREDIT' ? ('PENDING' as const) : ('PAID' as const);
      let batchTotal = 0;
      const results = [];
      for (const item of data.items) {
        batchTotal += item.quantity * item.costPrice;
        const purchase = await (tx.purchase.create as any)({
          data: {
            purchase_number: purchaseNumber,
            product_id: item.productId,
            supplier_id: data.supplierId,
            warehouse_branch_id: finalBranchId,
            quantity: item.quantity,
            cost_price: item.costPrice,
            sale_price: item.salePrice,
            purchase_date: data.purchaseDate,
            invoice_ref: data.invoiceRef,
            payment_method: paymentMethod,
            payment_made: 0,
            payment_status: paymentStatus,
            batch_no: item.batchNo,
            expiry_date: item.expiryDate ? new Date(item.expiryDate) : null,
            notes: data.notes,
            delivery_status: data.deliveryStatus,
            ctns: item.ctns ?? null,
            pieces_per_ctn: item.piecePerCtn ?? null,
            cbm_per_ctn: item.cbmPerCtn ?? null,
            t_cbm: item.tCbm ?? null,
            gw_per_ctn: item.gwPerCtn ?? null,
            t_gw: item.tGw ?? null,
            created_by: data.createdBy,
          },
        });

        // Update Stock
        let stock = await tx.stock.findUnique({
          where: { product_id_branch_id: { product_id: item.productId, branch_id: finalBranchId } },
        });

        const qty = item.quantity;
        const previousQty = stock ? asNumber(stock.current_quantity) : 0;
        const newQty = stock ? addDecimal(stock.current_quantity, qty) : qty;

        if (stock) {
          await tx.stock.update({
            where: { product_id_branch_id: { product_id: item.productId, branch_id: finalBranchId } },
            data: { current_quantity: newQty },
          });
        } else {
          await tx.stock.create({
            data: {
              product_id: item.productId,
              branch_id: finalBranchId,
              current_quantity: qty,
            },
          });
        }

        // Create Stock Movement
        await tx.stockMovement.create({
          data: {
            product_id: item.productId,
            branch_id: finalBranchId,
            movement_type: "PURCHASE",
            reference_id: purchase.id,
            reference_type: "purchase",
            quantity_change: qty,
            previous_qty: previousQty,
            new_qty: typeof newQty === "number" ? newQty : asNumber(newQty as Prisma.Decimal),
            unit_cost: item.costPrice,
            notes: data.notes,
            created_by: data.createdBy,
          },
        });

        // Update Product Cost Rate
        await tx.product.update({
          where: { id: item.productId },
          data: {
            purchase_rate: item.costPrice,
            sales_rate_exc_dis_and_tax: item.salePrice,
            supplier_id: data.supplierId,
          },
        });

        results.push(purchase);
      }

      if (data.supplierId && batchTotal > 0.009) {
        const desc =
          paymentMethod === 'CREDIT'
            ? `Credit purchase${data.invoiceRef ? ` - ${data.invoiceRef}` : ''} - ${purchaseNumber}`
            : `Cash purchase${data.invoiceRef ? ` - ${data.invoiceRef}` : ''} - ${purchaseNumber}`;

        if (paymentMethod === 'CREDIT') {
          await supplierLedgerBalanceEngine.postCreditPurchase(tx, {
            supplierId: data.supplierId,
            amount: batchTotal,
            purchaseId: purchaseNumber,
            createdBy: data.createdBy,
            description: desc,
          });
        } else {
          await supplierLedgerBalanceEngine.postCashPurchase(tx, {
            supplierId: data.supplierId,
            amount: batchTotal,
            purchaseId: purchaseNumber,
            createdBy: data.createdBy,
            description: desc,
          });
        }
      }

      return results;
    }, { timeout: 60_000, maxWait: 20_000 });
  }

  async listPurchases(params: {
    page?: number;
    limit?: number;
    productId?: string;
    supplierId?: string;
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};
    if (params.productId) where.product_id = params.productId;
    if (params.supplierId) where.supplier_id = params.supplierId;
    if (params.branchId) where.warehouse_branch_id = params.branchId;
    if (params.userId) where.created_by = params.userId;
    if (params.startDate || params.endDate) {
      where.purchase_date = {};
      if (params.startDate) where.purchase_date.gte = params.startDate;
      if (params.endDate) where.purchase_date.lte = params.endDate;
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchase_date: 'desc' },
        include: {
          product: true,
          supplier: true,
          warehouse_branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: purchases,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPurchaseById(id: string) {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        product: true,
        supplier: true,
        warehouse_branch: true,
        user: { select: { email: true } },
      },
    });
    if (!purchase) throw new AppError(404, 'Purchase not found');
    return purchase;
  }

  async getMonthlyStats(warehouseBranchId?: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const where: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: startOfMonth },
    };
    if (warehouseBranchId) where.warehouse_branch_id = warehouseBranchId;

    const purchases = await prisma.purchase.findMany({
      where,
      include: { product: true },
    });

    const totalQuantity = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity),
      0
    );
    const totalValue = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity) * asNumber(p.cost_price),
      0
    );

    return {
      totalPurchases: purchases.length,
      totalQuantity,
      totalValue,
    };
  }
}
