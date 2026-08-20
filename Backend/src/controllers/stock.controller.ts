import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { StockService } from "../services/stock.service";
import { AppError } from "../utils/apiError";
import { prisma } from "../prisma/client";
import { addDecimal, asNumber } from "../utils/helpers";

const stockService = new StockService();

const createStockController = asyncHandler(async (req: Request, res: Response) => {
    console.log("User ID:", req.user?.id, req.user?.role);
    
    const stock = await stockService.createStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock added successfully", 201).send(res);
});

const adjustStockController = asyncHandler(async (req: Request, res: Response) => {
    const stock = await stockService.adjustStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock adjusted successfully").send(res);
});

const transferStockController = asyncHandler(async (req: Request, res: Response) => {
    const result = await stockService.transferStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(result, "Stock transferred successfully").send(res);
});

const getStocksController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const userRole = req.user?.role as string | undefined;
    
    const result = await stockService.getStockByBranch(branchId || "", page, limit, search, userRole, categoryId);
    new ApiResponse(result.data, "Stocks retrieved successfully", 200, true, result.meta).send(res);
});

const getStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const productId = req.query.productId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const userRole = req.user?.role as string | undefined;
    const result = await stockService.getStockMovements(
        branchId || "",
        userRole,
        productId,
        page,
        limit,
        search,
        categoryId,
    );
    new ApiResponse(result.data, "Stock movement history retrieved", 200, true, result.meta).send(res);
});

const getTodayStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const userRole = req.user?.role as string | undefined;
    const result = await stockService.getTodayStockMovements(
        branchId || undefined,
        userRole,
        page,
        limit,
        search,
        categoryId,
    );
    new ApiResponse(result.data, "Today's stock movements retrieved", 200, true, result.meta).send(res);
});

const removeStockController = asyncHandler(async (req: Request, res: Response) => {
    const stock = await stockService.removeStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock removed successfully").send(res);
});

// Bulk set stock — used by sheet import to directly add stock without requiring a supplier/purchase.
// Each product is processed independently (no wrapping transaction) so a large batch cannot time out.
const bulkSetStockController = asyncHandler(async (req: Request, res: Response) => {
    const { items, notes } = req.body as {
        items: Array<{ productId: string; quantity: number; costPrice?: number; salePrice?: number }>;
        notes?: string;
    };

    if (!Array.isArray(items) || items.length === 0) {
        throw new AppError(400, 'items array is required');
    }

    const firstBranch = await prisma.branch.findFirst({ where: { is_active: true } });
    if (!firstBranch) throw new AppError(404, 'No active branch found');
    const branchId = firstBranch.id;
    const createdBy = req.user!.id;
    const importNote = notes || 'Bulk sheet import';

    const results: Array<{ productId: string; newQty: number; success: boolean; error?: string }> = [];

    for (const item of items) {
        if (!item.productId || item.quantity <= 0) continue;
        try {
            // upsert stock record
            const existing = await prisma.stock.findUnique({
                where: { product_id_branch_id: { product_id: item.productId, branch_id: branchId } },
            });

            const previousQty = existing ? asNumber(existing.current_quantity) : 0;
            const newQty = existing
                ? asNumber(addDecimal(existing.current_quantity, item.quantity))
                : item.quantity;

            await prisma.stock.upsert({
                where: { product_id_branch_id: { product_id: item.productId, branch_id: branchId } },
                create: { product_id: item.productId, branch_id: branchId, current_quantity: item.quantity },
                update: { current_quantity: newQty },
            });

            await prisma.stockMovement.create({
                data: {
                    product_id: item.productId,
                    branch_id: branchId,
                    movement_type: 'PURCHASE',
                    quantity_change: item.quantity,
                    previous_qty: previousQty,
                    new_qty: newQty,
                    unit_cost: item.costPrice ?? 0,
                    notes: importNote,
                    created_by: createdBy,
                    reference_type: 'bulk_import',
                },
            });

            if (item.costPrice || item.salePrice) {
                await prisma.product.update({
                    where: { id: item.productId },
                    data: {
                        ...(item.costPrice ? { purchase_rate: item.costPrice } : {}),
                        ...(item.salePrice ? {
                            sales_rate_exc_dis_and_tax: item.salePrice,
                            sales_rate_inc_dis_and_tax: item.salePrice,
                        } : {}),
                    },
                });
            }

            results.push({ productId: item.productId, newQty, success: true });
        } catch (err: any) {
            console.error(`bulk-set failed for product ${item.productId}:`, err?.message);
            results.push({ productId: item.productId, newQty: 0, success: false, error: err?.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    new ApiResponse(results, `Stock set for ${successCount} of ${results.length} products`, 200).send(res);
});

export {
    createStockController,
    adjustStockController,
    transferStockController,
    removeStockController,
    getStocksController,
    getStockMovementsController,
    getTodayStockMovementsController,
    bulkSetStockController,
};