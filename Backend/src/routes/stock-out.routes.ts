import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { logStockOut, logReturn, createBulkStockOut, listStockOutHistory } from '../controllers/stock-out.controller';
import { logStockOutSchema, logReturnSchema, bulkStockOutSchema } from '../validations/stock-out.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'])
);

router.post('/out', validate(logStockOutSchema), logStockOut);
router.post('/bulk', validate(bulkStockOutSchema), createBulkStockOut);
router.get('/history', listStockOutHistory);
router.post('/return', validate(logReturnSchema), logReturn);

export default router;
