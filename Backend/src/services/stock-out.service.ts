import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';

const STOCK_OUT_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED'] as const;
type StockOutReason = (typeof STOCK_OUT_TYPES)[number];

export class StockOutService {
  async logStockOut(data: {
    productId: string;
    branchId?: string;
    quantity: number;
    reason: StockOutReason;
    notes?: string;
    createdBy: string;
  }) {
    // RESOLVE BRANCH ID
    let finalBranchId = data.branchId;
    if (!finalBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!firstBranch) throw new AppError(404, 'No active branch found in system');
      finalBranchId = firstBranch.id;
    }

    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }
    if (!STOCK_OUT_TYPES.includes(data.reason)) {
      throw new AppError(400, 'Invalid stock out reason');
    }

    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: finalBranchId,
          },
        },
      });

      if (!stock) throw new AppError(404, 'Stock not found');

      const currentQty = asNumber(stock.current_quantity);
      if (currentQty < data.quantity) {
        throw new AppError(400, 'Insufficient stock to remove');
      }

      const newQty = addDecimal(stock.current_quantity, -data.quantity);

      await tx.stock.update({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: finalBranchId,
          },
        },
        data: { current_quantity: newQty },
      });

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: finalBranchId,
          movement_type: data.reason,
          quantity_change: -data.quantity,
          previous_qty: stock.current_quantity,
          new_qty: newQty,
          notes: data.notes || `${data.reason} - Stock out`,
          created_by: data.createdBy,
        },
      });

      return { newQty, success: true };
    });
  }

  async logReturn(data: {
    productId: string;
    branchId?: string;
    quantity: number;
    notes?: string;
    createdBy: string;
  }) {
    // RESOLVE BRANCH ID
    let finalBranchId = data.branchId;
    if (!finalBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!firstBranch) throw new AppError(404, 'No active branch found in system');
      finalBranchId = firstBranch.id;
    }

    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }

    return prisma.$transaction(async (tx) => {
      let stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: finalBranchId,
          },
        },
      });

      let previousQty = 0;
      let newQty: number | Prisma.Decimal = data.quantity;

      if (stock) {
        previousQty = asNumber(stock.current_quantity);
        newQty = addDecimal(stock.current_quantity, data.quantity);
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: data.productId,
              branch_id: finalBranchId,
            },
          },
          data: { current_quantity: newQty },
        });
      } else {
        await tx.stock.create({
          data: {
            product_id: data.productId,
            branch_id: finalBranchId,
            current_quantity: data.quantity,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: finalBranchId,
          movement_type: 'RETURN',
          quantity_change: data.quantity,
          previous_qty: previousQty,
          new_qty: typeof newQty === 'number' ? newQty : asNumber(newQty),
          notes: data.notes || 'Return - Stock re-added',
          created_by: data.createdBy,
        },
      });

      return { newQty, success: true };
    });
  }
  async createBulkStockOut(data: {
    branchId?: string;
    reason: StockOutReason;
    notes?: string;
    createdBy: string;
    customerId?: string;
    items: Array<{
      productId: string;
      quantity: number;
      notes?: string;
    }>;
  }) {
    // RESOLVE BRANCH ID
    let finalBranchId = data.branchId;
    if (!finalBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!firstBranch) throw new AppError(404, 'No active branch found in system');
      finalBranchId = firstBranch.id;
    }

    if (data.items.length === 0) {
      throw new AppError(400, 'At least one item is required');
    }

    // Many rows × (upsert + update + movement) can exceed Prisma's default ~5s
    // interactive transaction timeout → P2028 "Transaction not found".
    const txTimeoutMs = Math.min(180_000, Math.max(30_000, 10_000 + data.items.length * 2_500));

    return prisma.$transaction(
      async (tx) => {
      const results = [];

      for (const item of data.items) {
        if (item.quantity <= 0) {
          throw new AppError(400, `Invalid quantity for product ${item.productId}`);
        }

        // 1. Get or create stock record
        const stock = await tx.stock.upsert({
          where: {
            product_id_branch_id: {
              product_id: item.productId,
              branch_id: finalBranchId!,
            },
          },
          create: {
            product_id: item.productId,
            branch_id: finalBranchId!,
            current_quantity: 0,
          },
          update: {},
        });

        const currentQty = asNumber(stock.current_quantity);
        if (data.reason === 'SALE' && currentQty < item.quantity) {
          throw new AppError(400, `Insufficient stock for product ${item.productId}. Available: ${currentQty}`);
        }

        const newQty = addDecimal(stock.current_quantity, -item.quantity);

        // 2. Update stock
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: item.productId,
              branch_id: finalBranchId!,
            },
          },
          data: { current_quantity: newQty },
        });

        // 3. Log movement
        await tx.stockMovement.create({
          data: {
            product_id: item.productId,
            branch_id: finalBranchId,
            movement_type: data.reason,
            quantity_change: -item.quantity,
            previous_qty: stock.current_quantity,
            new_qty: newQty,
            notes: item.notes || data.notes || `${data.reason} Stock Out`,
            created_by: data.createdBy,
            reference_type: 'stock_out',
          },
        });

        results.push({ productId: item.productId, newQty });
      }

      return { success: true, results };
    },
      { maxWait: 15_000, timeout: txTimeoutMs },
    );
  }

  async getStockOutHistory(params: {
    branchId?: string;
    productId?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {
      quantity_change: { lt: 0 }, 
    };

    if (params.branchId) where.branch_id = params.branchId;
    if (params.productId) where.product_id = params.productId;
    if (params.reason) where.movement_type = params.reason;
    if (params.startDate || params.endDate) {
      where.created_at = {};
      if (params.startDate) where.created_at.gte = new Date(params.startDate);
      if (params.endDate) where.created_at.lte = new Date(params.endDate);
    }

    return prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { name: true, sku: true } },
        branch: { select: { name: true } },
        user: { select: { email: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
  }
}
