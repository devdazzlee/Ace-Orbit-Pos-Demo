import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import SupplierLedgerService from '../services/supplier-ledger.service';

const ledgerService = new SupplierLedgerService();

export const getSupplierLedger = asyncHandler(async (req: Request, res: Response) => {
  const { supplierId } = req.params;
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const result = await ledgerService.getSupplierLedger({
    supplierId,
    startDate,
    endDate,
    page,
    limit,
  });
  new ApiResponse(result, 'Supplier ledger fetched').send(res);
});

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const { supplierId } = req.params;
  const { amount, description, referenceNo, purchaseId } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return new ApiResponse(null, 'Valid positive amount is required', 400, false).send(res);
  }

  const result = await ledgerService.recordPayment({
    supplierId,
    amount: Number(amount),
    createdBy: req.user!.id,
    description,
    referenceNo,
    purchaseId,
  });

  new ApiResponse(result, 'Payment recorded successfully', 201).send(res);
});

export const getPayablesSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await ledgerService.getPayablesSummary();
  new ApiResponse(summary, 'Payables summary fetched').send(res);
});

export const listSupplierSummaries = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const result = await ledgerService.listSupplierSummaries({ search });
  new ApiResponse(result, 'Supplier summaries fetched').send(res);
});

export const updateLedgerEntry = asyncHandler(async (req: Request, res: Response) => {
  const { supplierId, entryId } = req.params;
  const { amount, description, referenceNo, date, direction } = req.body;

  if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0)) {
    return new ApiResponse(null, 'Amount must be a positive number', 400, false).send(res);
  }

  if (direction !== undefined && direction !== 'debit' && direction !== 'credit') {
    return new ApiResponse(null, 'Direction must be debit or credit', 400, false).send(res);
  }

  const parsedDate = date ? new Date(date) : undefined;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    return new ApiResponse(null, 'Invalid date', 400, false).send(res);
  }

  const result = await ledgerService.updateLedgerEntry({
    supplierId,
    entryId,
    amount: amount !== undefined ? Number(amount) : undefined,
    description,
    referenceNo,
    date: parsedDate,
    direction,
    updatedBy: req.user!.id,
  });

  new ApiResponse(result, 'Ledger entry updated successfully').send(res);
});

export const deleteLedgerEntry = asyncHandler(async (req: Request, res: Response) => {
  const { supplierId, entryId } = req.params;
  const { reason } = req.body ?? {};

  const result = await ledgerService.deleteLedgerEntry({
    supplierId,
    entryId,
    deletedBy: req.user!.id,
    reason,
  });

  new ApiResponse(result, 'Ledger entry deleted successfully').send(res);
});
