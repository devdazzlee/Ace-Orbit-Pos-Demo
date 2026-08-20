import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SaleService } from "../services/sales.service";
import { ApiResponse } from "../utils/apiResponse";
import { prisma } from "../prisma/client";

const saleService = new SaleService();

const resolveBranchId = (req: Request): string | undefined => {
    const jwtBranchId = req.user?.branch_id as string | undefined;
    const userRole = req.user?.role;
    
    // Admins can override branch ID
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
        const queryBranchId = req.query.branchId as string | undefined;
        const bodyBranchId = req.body?.branchId as string | undefined;

        if (queryBranchId && queryBranchId.trim() && queryBranchId !== "Not Found") {
            return queryBranchId.trim();
        }

        if (bodyBranchId && bodyBranchId.trim() && bodyBranchId !== "Not Found") {
            return bodyBranchId.trim();
        }
    }

    // Force non-admins to use their JWT branch ID
    if (jwtBranchId && jwtBranchId.trim() && jwtBranchId !== "Not Found") {
        return jwtBranchId.trim();
    }

    return undefined;
};

const getSalesController = asyncHandler(async (req: Request, res: Response) => {
    // Priority: query parameter (branchId from localStorage) > JWT token branch_id
    // If branchId is provided in query, use it to filter (even for admins)
    // If no branchId in query and user is admin, return all sales
    // If no branchId in query and user is not admin, use JWT token branch_id
    
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const queryBranchId = req.query.branchId as string;
    const jwtBranchId = req.user?.branch_id as string;
    
    let branchId: string | undefined;
    
    // If branchId is provided in query parameter (from localStorage), use it to filter
    if (queryBranchId && queryBranchId.trim() && queryBranchId.trim() !== "Not Found") {
        branchId = queryBranchId.trim();
        console.log("Filtering by branchId from query parameter (localStorage):", branchId);
    } else if (!isAdmin) {
        // Non-admin users: use JWT token branch_id if no query param
        branchId = jwtBranchId?.trim();
        console.log("Non-admin user - filtering by JWT branch_id:", branchId);
        
        // If still no branchId, return empty array
        if (!branchId || branchId === "Not Found") {
            console.warn("No valid branchId found for non-admin user");
            return new ApiResponse([], "No branch ID found for user").send(res);
        }
    } else {
        // Admin user with no branchId in query - return all sales
        branchId = undefined;
        console.log("Admin user - no branchId in query, returning all sales");
    }
    
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const search = (req.query.search as string | undefined)?.trim();
    const startDateRaw = req.query.startDate as string | undefined;
    const endDateRaw = req.query.endDate as string | undefined;

    const parsedStartDate =
      startDateRaw && !Number.isNaN(new Date(startDateRaw).getTime())
        ? new Date(startDateRaw)
        : undefined;
    const parsedEndDate =
      endDateRaw && !Number.isNaN(new Date(endDateRaw).getTime())
        ? new Date(endDateRaw)
        : undefined;
    const dateFieldRaw = req.query.dateField as string | undefined;
    const dateField =
      dateFieldRaw === 'created_at' ? 'created_at' : 'sale_date';
    const endExclusive = req.query.endExclusive === 'true';
    const productId = (req.query.productId as string | undefined)?.trim() || undefined;
    const customerId = (req.query.customerId as string | undefined)?.trim() || undefined;
    const paymentMethodRaw = (req.query.paymentMethod as string | undefined)?.trim().toUpperCase();
    const allowedPaymentMethods = ['CASH', 'CARD', 'CREDIT'];
    const paymentMethod =
      paymentMethodRaw && allowedPaymentMethods.includes(paymentMethodRaw)
        ? (paymentMethodRaw as 'CASH' | 'CARD' | 'CREDIT')
        : undefined;

    const result = await saleService.getSales({
        branchId,
        page: Number.isFinite(page) && page > 0 ? page : undefined,
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        search,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        dateField,
        endExclusive,
        productId,
        customerId,
        paymentMethod,
    });

    console.log(
      `Returning ${result.data.length} sales for branchId: ${branchId || 'ALL'} (page: ${result.meta?.page}, total: ${result.meta?.total})`
    );
    new ApiResponse(result.data, "Sales fetched successfully", 200, true, result.meta).send(res);
});

const getSalesForReturnsController = asyncHandler(async (req: Request, res: Response) => {
    const search = (req.query.search as string | undefined)?.replace(/\s+/g, ' ').trim();
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const jwtBranchId = req.user?.branch_id as string | undefined;
    // Admins have no branch_id → pass undefined so all branches are searched
    const branchId = isAdmin ? undefined : (jwtBranchId || undefined);
    const sales = await saleService.getSalesForReturns({ branchId, search });
    new ApiResponse(sales, "Sales eligible for returns fetched successfully").send(res);
});

const getSaleByIdController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new ApiResponse(sale, "Sale details fetched").send(res);
});

const createSaleController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);

    const sale = await saleService.createSale({
        ...req.body,
        branchId,
        createdBy: req.user!.id
    });
    new ApiResponse(sale, "Sale created successfully", 201).send(res);
});

const refundSaleController = asyncHandler(async (req: Request, res: Response) => {
    const {
        customerId,
        returnedItems = [],
        exchangedItems = [],
        notes,
        returnReason,
        refundMethod,
        orderScope,
    } = req.body;
    const originalSaleId = req.params.saleId;
    const createdBy = req.user!.id;

    // Admins have no branch_id in JWT — fall back to the first active branch
    let branchId = req.user?.branch_id as string | null;
    if (!branchId) {
        const activeBranch = await prisma.branch.findFirst({ where: { is_active: true } });
        if (!activeBranch) throw new Error('No active branch found');
        branchId = activeBranch.id;
    }

    const sale = await saleService.createExchangeOrReturnSale({
        originalSaleId,
        branchId,
        customerId,
        returnedItems,
        exchangedItems,
        notes,
        createdBy,
        returnReason,
        refundMethod,
        orderScope,
    });

    new ApiResponse(sale, "Sale refunded/exchanged successfully").send(res);
});

const updateSaleController = asyncHandler(async (req: Request, res: Response) => {
    const saleId = req.params.saleId;
    const createdBy = req.user!.id;
    const sale = await saleService.updateSale(saleId, {
        ...req.body,
        createdBy
    });
    new ApiResponse(sale, "Sale updated successfully").send(res);
});

const getTodaySalesController = asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user?.role === "SUPER_ADMIN" || req.user?.role === "ADMIN";
    const branchId = isAdmin ? undefined : resolveBranchId(req);
    const sales = await saleService.getTodaySales({ branchId });
    new ApiResponse(sales, "Today's sales fetched successfully").send(res);
});

const getRecentSaleItemProductNameAndPrice = asyncHandler(async (req: Request, res: Response) => {
    let branchId = resolveBranchId(req);
    if (branchId === "Not Found") branchId = undefined;
    const recentSaleItem = await saleService.getRecentSaleItemsProductNameAndPrice(branchId);
    new ApiResponse(recentSaleItem, "Recent sale item product name and price fetched successfully").send(res);
});

const getHoldSalesController = asyncHandler(async (req: Request, res: Response) => {
    const holdSales = await saleService.getHoldSales();
    new ApiResponse(holdSales, "Held sales fetched successfully").send(res);
});

const createHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    const holdSale = await saleService.createHoldSale({
        customerId: req.body?.customerId,
        createdBy: req.user?.id,
        items: req.body?.items || [],
    });

    new ApiResponse(holdSale, "Sale held successfully", 201).send(res);
});

const retrieveHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    const holdSale = await saleService.retrieveHoldSale({
        holdSaleId: req.params.holdSaleId,
    });

    new ApiResponse(holdSale, "Held sale retrieved successfully").send(res);
});

const deleteHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    await saleService.deleteHoldSale({
        holdSaleId: req.params.holdSaleId,
    });

    new ApiResponse(null, "Held sale deleted successfully").send(res);
});

const deleteSaleController = asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user?.role === "SUPER_ADMIN" || req.user?.role === "ADMIN";
    const restrictToBranchId = isAdmin ? undefined : resolveBranchId(req);

    const result = await saleService.deleteSale(req.params.saleId, {
        deletedBy: req.user!.id,
        restrictToBranchId,
    });

    new ApiResponse(result, "Sale deleted successfully").send(res);
});

export {
    getSalesController,
    getSalesForReturnsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    updateSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice,
    getHoldSalesController,
    createHoldSaleController,
    retrieveHoldSaleController,
    deleteHoldSaleController,
    deleteSaleController,
};
