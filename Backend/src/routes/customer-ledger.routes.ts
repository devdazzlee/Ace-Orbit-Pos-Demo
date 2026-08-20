import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency.middleware';
import {
  getCustomerLedger,
  recordPayment,
  getCreditSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
} from '../controllers/customer-ledger.controller';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER']));

router.get('/summary', getCreditSummary);
router.patch('/:customerId/entries/:entryId', updateLedgerEntry);
router.delete('/:customerId/entries/:entryId', deleteLedgerEntry);
router.get('/:customerId', getCustomerLedger);
router.post('/:customerId/payment', idempotency, recordPayment);

export default router;
