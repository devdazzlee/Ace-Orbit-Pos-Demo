import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency.middleware';
import {
  getSupplierLedger,
  recordPayment,
  getPayablesSummary,
  listSupplierSummaries,
  updateLedgerEntry,
  deleteLedgerEntry,
} from '../controllers/supplier-ledger.controller';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER']));

router.get('/summary', getPayablesSummary);
router.get('/list-summaries', listSupplierSummaries);
router.patch('/:supplierId/entries/:entryId', updateLedgerEntry);
router.delete('/:supplierId/entries/:entryId', deleteLedgerEntry);
router.get('/:supplierId', getSupplierLedger);
router.post('/:supplierId/payment', idempotency, recordPayment);

export default router;
