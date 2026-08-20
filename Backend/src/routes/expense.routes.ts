import express from 'express';
import {
    createExpense,
    deleteExpense,
    getExpenseById,
    listExpenses,
} from '../controllers/expense.controller';
import {
    createExpenseSchema,
    expenseIdParamSchema,
    listExpensesSchema,
} from '../validations/expense.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createExpenseSchema), createExpense);
router.get('/', validate(listExpensesSchema), listExpenses);
router.get('/:id', validate(expenseIdParamSchema), getExpenseById);
router.delete('/:id', validate(expenseIdParamSchema), deleteExpense);

export default router;
