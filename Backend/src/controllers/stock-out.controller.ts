import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { StockOutService } from '../services/stock-out.service';

const stockOutService = new StockOutService();

export const logStockOut = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.logStockOut({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Stock out logged successfully').send(res);
});

export const logReturn = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.logReturn({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Return logged successfully').send(res);
});

export const createBulkStockOut = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.createBulkStockOut({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Bulk stock out processed successfully').send(res);
});

export const listStockOutHistory = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.getStockOutHistory(req.query);
  new ApiResponse(result, 'Stock out history retrieved').send(res);
});
