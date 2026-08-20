import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import CustomerLedgerService from '../services/customer-ledger.service';

const ledgerService = new CustomerLedgerService();

/**
 * GET /customer-ledger/:customerId
 * Get all ledger entries for a customer
 */
export const getCustomerLedger = asyncHandler(async (req: Request, res: Response) => {
  const { customerId } = req.params;
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const result = await ledgerService.getCustomerLedger({ customerId, startDate, endDate, page, limit });
  new ApiResponse(result, 'Customer ledger fetched').send(res);
});

/**
 * POST /customer-ledger/:customerId/payment
 * Record a payment from a customer (reduces outstanding balance)
 */
export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { amount, description, referenceNo, saleId } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return new ApiResponse(null, 'Valid positive amount is required', 400, false).send(res);
  }

  const result = await ledgerService.recordPayment({
    customerId,
    amount: Number(amount),
    createdBy: req.user!.id,
    description,
    referenceNo,
    saleId,
  });

  new ApiResponse(result, 'Payment recorded successfully', 201).send(res);
});

/**
 * GET /customer-ledger/summary
 * Get dashboard credit summary (total outstanding, top debtors)
 */
export const getCreditSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await ledgerService.getCreditSummary();
  new ApiResponse(summary, 'Credit summary fetched').send(res);
});

/**
 * PATCH /customer-ledger/:customerId/entries/:entryId
 * Update a ledger entry (payment or adjustment)
 */
export const updateLedgerEntry = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, entryId } = req.params;
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
    customerId,
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

/**
 * DELETE /customer-ledger/:customerId/entries/:entryId
 * Delete a ledger entry (creates reversal adjustment for audit)
 */
export const deleteLedgerEntry = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, entryId } = req.params;
  const { reason } = req.body ?? {};

  const result = await ledgerService.deleteLedgerEntry({
    customerId,
    entryId,
    deletedBy: req.user!.id,
    reason,
  });

  new ApiResponse(result, 'Ledger entry deleted successfully').send(res);
});
