-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "outstanding_balance" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "purchase_number" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CREDIT';
ALTER TABLE "Purchase" ADD COLUMN "payment_made" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateEnum
CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('CREDIT_PURCHASE', 'CASH_PURCHASE', 'PAYMENT_MADE', 'ADJUSTMENT', 'REFUND');

-- CreateTable
CREATE TABLE "SupplierLedger" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "entry_type" "SupplierLedgerEntryType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "purchase_id" TEXT,
    "reference_no" TEXT,
    "balance_after" DECIMAL(65,30) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_purchase_number_idx" ON "Purchase"("purchase_number");

-- CreateIndex
CREATE INDEX "SupplierLedger_supplier_id_idx" ON "SupplierLedger"("supplier_id");

-- CreateIndex
CREATE INDEX "SupplierLedger_created_at_idx" ON "SupplierLedger"("created_at");

-- CreateIndex
CREATE INDEX "SupplierLedger_entry_type_idx" ON "SupplierLedger"("entry_type");

-- AddForeignKey
ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
