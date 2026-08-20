/**
 * One-time script: wipe all products, categories, and stock from the DB.
 * Run from the Backend directory:
 *   npx ts-node scripts/clear-catalog.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Starting full database wipe (except Users)...\n');

  // Order matters for foreign keys!
  
  // 1. Transactions & History
  await prisma.stockMovement.deleteMany({});
  console.log('✓ StockMovement deleted');
  
  await prisma.stockAdjustment.deleteMany({});
  console.log('✓ StockAdjustment deleted');
  
  await prisma.saleItem.deleteMany({});
  console.log('✓ SaleItem deleted');
  
  await prisma.sale.deleteMany({});
  console.log('✓ Sale deleted');
  
  await prisma.orderItem.deleteMany({});
  console.log('✓ OrderItem deleted');
  
  await prisma.order.deleteMany({});
  console.log('✓ Order deleted');
  
  await prisma.purchaseOrderItem.deleteMany({});
  console.log('✓ PurchaseOrderItem deleted');
  
  await prisma.purchaseOrder.deleteMany({});
  console.log('✓ PurchaseOrder deleted');
  
  await prisma.purchase.deleteMany({});
  console.log('✓ Purchase deleted');
  
  await prisma.transfer.deleteMany({});
  console.log('✓ Transfer deleted');
  
  await prisma.holdSale.deleteMany({});
  console.log('✓ HoldSale deleted');

  // 2. Product Catalog
  await prisma.productImage.deleteMany({});
  console.log('✓ ProductImage deleted');
  
  await prisma.stock.deleteMany({});
  console.log('✓ Stock deleted');
  
  await prisma.product.deleteMany({});
  console.log('✓ Product deleted');
  
  await prisma.categoryImages.deleteMany({});
  console.log('✓ CategoryImages deleted');
  
  await prisma.subcategory.deleteMany({});
  console.log('✓ Subcategory deleted');
  
  await prisma.category.deleteMany({});
  console.log('✓ Category deleted');

  // 3. Metadata / Attributes
  await prisma.brand.deleteMany({});
  console.log('✓ Brand deleted');

  await prisma.supplier.deleteMany({});
  console.log('✓ Supplier deleted');

  await prisma.tax.deleteMany({});
  console.log('✓ Tax deleted');

  await prisma.color.deleteMany({});
  console.log('✓ Color deleted');

  await prisma.size.deleteMany({});
  console.log('✓ Size deleted');

  await prisma.unit.deleteMany({});
  console.log('✓ Unit deleted');

  await prisma.discount.deleteMany({});
  console.log('✓ Discount deleted');

  // 4. Financials & Ledgers
  await prisma.customerLedger.deleteMany({});
  console.log('✓ CustomerLedger deleted');

  await prisma.cashFlow.deleteMany({});
  console.log('✓ CashFlow deleted');

  await prisma.expense.deleteMany({});
  console.log('✓ Expense deleted');

  // 5. Entities
  await prisma.customer.deleteMany({});
  console.log('✓ Customer deleted');

  await prisma.area.deleteMany({});
  console.log('✓ Area deleted');

  console.log('\nDone. Database has been completely wiped (excluding Users).');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
