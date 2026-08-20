import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = {
    Products: await prisma.product.count(),
    Categories: await prisma.category.count(),
    Sales: await prisma.sale.count(),
    SaleItems: await prisma.saleItem.count(),
    Customers: await prisma.customer.count(),
    Suppliers: await prisma.supplier.count(),
    Brands: await prisma.brand.count(),
    Units: await prisma.unit.count(),
    Colors: await prisma.color.count(),
    Sizes: await prisma.size.count(),
    Taxes: await prisma.tax.count(),
    Stock: await prisma.stock.count(),
    StockMovements: await prisma.stockMovement.count(),
    StockAdjustments: await prisma.stockAdjustment.count(),
    HoldSales: await prisma.holdSale.count(),
    Orders: await prisma.order.count(),
    OrderItems: await prisma.orderItem.count(),
    PurchaseOrders: await prisma.purchaseOrder.count(),
    PurchaseOrderItems: await prisma.purchaseOrderItem.count(),
    Purchases: await prisma.purchase.count(),
    Transfers: await prisma.transfer.count(),
    Branches: await prisma.branch.count(),
    Users: await prisma.user.count(),
    Sessions: await prisma.session.count(),
    Employees: await prisma.employee.count(),
    Shifts: await prisma.shift.count(),
    Salaries: await prisma.salary.count(),
  };

  console.log('Database Counts:');
  console.table(counts);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
