-- Add CASH_SALE for paid sales linked to a customer (statement history, zero balance impact)
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'CASH_SALE';
