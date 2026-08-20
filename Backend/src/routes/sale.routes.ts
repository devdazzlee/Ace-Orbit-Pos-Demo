import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { idempotency } from "../middleware/idempotency.middleware";
import {
    getSalesController,
    getSalesForReturnsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice,
    getHoldSalesController,
    createHoldSaleController,
    retrieveHoldSaleController,
    deleteHoldSaleController,
    deleteSaleController,
    updateSaleController,
} from "../controllers/sale.controller";
import { createSaleSchema, refundSaleSchema } from "../validations/sale.validation";

const router = Router();
const holdSaleRoles = [
    "SUPER_ADMIN",
    "ADMIN",
    "BRANCH_MANAGER",
    "WAREHOUSE_MANAGER",
    "PURCHASE_MANAGER",
];
const saleManagementRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER"];
const metadataRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER", "WAREHOUSE_MANAGER", "PURCHASE_MANAGER"];

router.use(authenticate);
router.use("/hold", authorize(holdSaleRoles));

// Hold-sale operations should be available to any authenticated staff role.
router.get("/hold", getHoldSalesController);
router.post("/hold", createHoldSaleController);
router.post("/hold/:holdSaleId/retrieve", retrieveHoldSaleController);
router.delete("/hold/:holdSaleId", deleteHoldSaleController);

router.use(authorize(saleManagementRoles));

router.get("/recent", authorize(metadataRoles), getRecentSaleItemProductNameAndPrice);
router.get("/today", getTodaySalesController);
router.get("/for-returns", getSalesForReturnsController);
router.get("/", getSalesController);
router.get("/:saleId", getSaleByIdController);
router.post("/", idempotency, validate(createSaleSchema), createSaleController);
router.patch("/:saleId", updateSaleController);
router.delete("/:saleId", deleteSaleController);
router.patch("/:saleId/refund", validate(refundSaleSchema), refundSaleController);

export default router;
