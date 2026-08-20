import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { StockAdjustmentType, StockAdjustmentCategory } from '@prisma/client';

export class StockAdjustmentService {
  async createAdjustment(data: {
    productId: string;
    branchId?: string;
    systemQuantity: number;
    adjustmentType: StockAdjustmentType;
    adjustmentCategory: StockAdjustmentCategory;
    physicalCount?: number;
    changeQuantity?: number;
    reason?: string;
    referenceNo?: string;
    adjustedBy: string;
  }) {
    // RESOLVE BRANCH ID
    let finalBranchId = data.branchId;
    if (!finalBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!firstBranch) throw new AppError(404, 'No active branch found in system');
      finalBranchId = firstBranch.id;
    }

    // DEBUG: LOG IDs
    console.log(`[StockAdjustment] Resolving IDs - Product: ${data.productId}, Branch: ${finalBranchId}`);

    // VERIFY PRODUCT & BRANCH EXISTENCE
    const [productExists, branchExists] = await Promise.all([
      prisma.product.findUnique({ where: { id: data.productId } }),
      prisma.branch.findUnique({ where: { id: finalBranchId } })
    ]);

    if (!productExists) {
      throw new AppError(404, `Product not found with ID: ${data.productId}`);
    }
    if (!branchExists) {
      throw new AppError(404, `Branch not found with ID: ${finalBranchId}`);
    }

    let difference = 0;
    let newQty = data.systemQuantity;

    if (data.adjustmentType === 'RECONCILIATION') {
      if (data.physicalCount === undefined) throw new AppError(400, 'Physical count is required for reconciliation');
      const physicalCount = data.physicalCount;
      newQty = physicalCount;
      difference = physicalCount - data.systemQuantity;
    } else if (data.adjustmentType === 'ADDITION') {
      if (data.changeQuantity === undefined) throw new AppError(400, 'Change quantity is required for addition');
      const changeQuantity = data.changeQuantity;
      difference = changeQuantity;
      newQty = data.systemQuantity + difference;
    } else if (data.adjustmentType === 'SUBTRACTION') {
      if (data.changeQuantity === undefined) throw new AppError(400, 'Change quantity is required for subtraction');
      const changeQuantity = data.changeQuantity;
      difference = -Math.abs(changeQuantity);
      newQty = data.systemQuantity + difference;
    }

    if (difference === 0 && data.adjustmentType === 'RECONCILIATION') {
      throw new AppError(400, 'No difference between system and physical count');
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

      const previousQty = stock ? asNumber(stock.current_quantity) : 0;

      if (stock) {
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
        if (newQty < 0) {
          throw new AppError(400, 'Resulting stock cannot be negative');
        }
        await tx.stock.create({
          data: {
            product_id: data.productId,
            branch_id: finalBranchId,
            current_quantity: newQty,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: finalBranchId,
          movement_type: 'ADJUSTMENT',
          reference_type: 'adjustment',
          quantity_change: difference,
          previous_qty: previousQty,
          new_qty: newQty,
          notes: data.reason || `${data.adjustmentType} - ${data.adjustmentCategory}. Ref: ${data.referenceNo || 'N/A'}`,
          created_by: data.adjustedBy,
        },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          product_id: data.productId,
          branch_id: finalBranchId,
          system_quantity: data.systemQuantity,
          physical_count: data.physicalCount,
          change_quantity: data.changeQuantity,
          difference,
          adjustment_type: data.adjustmentType,
          adjustment_category: data.adjustmentCategory,
          reason: data.reason,
          reference_no: data.referenceNo,
          adjusted_by: data.adjustedBy,
        },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      });

      return adjustment;
    });
  }

  async listAdjustments(params: {
    page?: number;
    limit?: number;
    productId?: string;
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.productId) where.product_id = params.productId;
    if (params.branchId) where.branch_id = params.branchId;
    if (params.startDate || params.endDate) {
      where.adjustment_date = {};
      if (params.startDate) where.adjustment_date.gte = params.startDate;
      if (params.endDate) where.adjustment_date.lte = params.endDate;
    }

    const [total, adjustments] = await Promise.all([
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { adjustment_date: 'desc' },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: adjustments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
