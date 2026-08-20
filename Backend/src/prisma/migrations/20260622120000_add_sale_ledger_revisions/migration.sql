-- CreateEnum
CREATE TYPE "SaleLedgerRevisionField" AS ENUM ('CREDIT_OWED', 'UPFRONT_PAYMENT', 'CASH_TOTAL');

-- CreateTable
CREATE TABLE "CustomerSaleLedgerRevision" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_number" TEXT NOT NULL,
    "ledger_entry_id" TEXT,
    "field" "SaleLedgerRevisionField" NOT NULL,
    "previous_amount" DECIMAL(65,30) NOT NULL,
    "new_amount" DECIMAL(65,30) NOT NULL,
    "signed_delta" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSaleLedgerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerSaleLedgerRevision_customer_id_sale_number_idx" ON "CustomerSaleLedgerRevision"("customer_id", "sale_number");

-- CreateIndex
CREATE INDEX "CustomerSaleLedgerRevision_ledger_entry_id_idx" ON "CustomerSaleLedgerRevision"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "CustomerSaleLedgerRevision_created_at_idx" ON "CustomerSaleLedgerRevision"("created_at");

-- AddForeignKey
ALTER TABLE "CustomerSaleLedgerRevision" ADD CONSTRAINT "CustomerSaleLedgerRevision_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
