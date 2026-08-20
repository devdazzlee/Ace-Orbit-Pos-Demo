/**
 * DESTRUCTIVE: Wipes the entire Neon database and seeds:
 *   1. admin@aceorbits.com / AceOrbits@123  (SUPER_ADMIN)
 *   2. A "Ace Orbits Warehouse" branch (BranchType.WAREHOUSE)
 *   3. warehouse@aceorbits.com / Warehouse@123  (WAREHOUSE_MANAGER, attached to the warehouse)
 *
 * Run from the Backend directory:
 *   npx ts-node scripts/wipe-and-seed.ts
 */

import { PrismaClient, Role, BranchType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function wipe() {
  console.log('Wiping database (FK-safe order)...\n');

  // Children of Sale
  await prisma.saleItem.deleteMany({});
  console.log('  SaleItem cleared');

  // Children of Customer
  await prisma.customerLedger.deleteMany({});
  await prisma.customerSession.deleteMany({});
  console.log('  CustomerLedger / CustomerSession cleared');

  // Children of Order / PurchaseOrder
  await prisma.orderItem.deleteMany({}).catch(() => {});
  await prisma.purchaseOrderItem.deleteMany({});
  console.log('  OrderItem / PurchaseOrderItem cleared');

  // Stock-related
  await prisma.stockMovement.deleteMany({});
  await prisma.stockAdjustment.deleteMany({});
  await prisma.stock.deleteMany({});
  console.log('  StockMovement / StockAdjustment / Stock cleared');

  // Movement / inventory inputs
  await prisma.purchase.deleteMany({});
  await prisma.transfer.deleteMany({});
  console.log('  Purchase / Transfer cleared');

  // Sales / orders / holds
  await prisma.sale.deleteMany({});
  await prisma.holdSale.deleteMany({});
  await prisma.order.deleteMany({}).catch(() => {});
  await prisma.purchaseOrder.deleteMany({});
  console.log('  Sale / HoldSale / Order / PurchaseOrder cleared');

  // Cash / financial
  await prisma.cashFlow.deleteMany({});
  await prisma.expense.deleteMany({}).catch(() => {});
  console.log('  CashFlow / Expense cleared');

  // Catalog images
  await prisma.productImage.deleteMany({});
  await prisma.categoryImages.deleteMany({});
  console.log('  ProductImage / CategoryImages cleared');

  // Catalog
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.subcategory.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.color.deleteMany({});
  await prisma.size.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.tax.deleteMany({});
  await prisma.supplier.deleteMany({});
  console.log('  Catalog (products, categories, brands, colors, sizes, units, taxes, suppliers) cleared');

  // HR
  await prisma.salary.deleteMany({}).catch(() => {});
  await prisma.shiftAssignment.deleteMany({}).catch(() => {});
  await prisma.shift.deleteMany({}).catch(() => {});
  await prisma.employee.deleteMany({}).catch(() => {});
  await prisma.employeeType.deleteMany({}).catch(() => {});
  console.log('  HR (Salary / Shift / Employee / EmployeeType) cleared');

  // Customer / discount / area
  await prisma.discount.deleteMany({}).catch(() => {});
  await prisma.customer.deleteMany({});
  await prisma.area.deleteMany({}).catch(() => {});
  console.log('  Customer / Discount / Area cleared');

  // Devices
  await prisma.deviceIdentity.deleteMany({}).catch(() => {});
  console.log('  DeviceIdentity cleared');

  // Sessions before users
  await prisma.session.deleteMany({});
  console.log('  Session cleared');

  // Users before branches
  await prisma.user.deleteMany({});
  console.log('  User cleared');

  // Branches last
  await prisma.branch.deleteMany({});
  console.log('  Branch cleared');

  console.log('\n✅ Database wiped clean.\n');
}

async function seed() {
  console.log('Seeding fresh accounts...\n');

  // 1. SUPER_ADMIN
  const superAdminPwd = await bcrypt.hash('AceOrbits@123', 10);
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@aceorbits.com',
      password: superAdminPwd,
      role: Role.SUPER_ADMIN,
    },
  });
  console.log(`  ✓ SUPER_ADMIN created — ${superAdmin.email}  (id: ${superAdmin.id})`);

  // 2. Warehouse branch
  const warehouse = await prisma.branch.create({
    data: {
      code: 'WH-001',
      name: 'Ace Orbits Warehouse',
      address: 'Main Warehouse, Karachi',
      branch_type: BranchType.WAREHOUSE,
      is_active: true,
    },
  });
  console.log(`  ✓ Warehouse branch created — ${warehouse.name}  (id: ${warehouse.id})`);

  // 3. Warehouse manager attached to that branch
  const whUserPwd = await bcrypt.hash('Warehouse@123', 10);
  const warehouseUser = await prisma.user.create({
    data: {
      email: 'warehouse@aceorbits.com',
      password: whUserPwd,
      role: Role.WAREHOUSE_MANAGER,
      branch_id: warehouse.id,
    },
  });
  console.log(`  ✓ Warehouse user created — ${warehouseUser.email}  (id: ${warehouseUser.id})`);

  console.log('\n=== Credentials ===');
  console.log('  Super Admin:  admin@aceorbits.com / AceOrbits@123');
  console.log('  Warehouse:    warehouse@aceorbits.com / Warehouse@123');
}

async function main() {
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\n`);
  await wipe();
  await seed();
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
