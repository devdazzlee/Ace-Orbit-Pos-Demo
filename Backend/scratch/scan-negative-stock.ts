import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    include: {
      stock: true
    }
  });
  
  products.forEach(p => {
    const totalStock = p.stock.reduce((sum, s) => sum + Number(s.current_quantity), 0);
    if (totalStock < 0) {
      console.log(`Product: ${p.name}, SKU: ${p.sku}, Total Stock: ${totalStock}`);
      p.stock.forEach(s => console.log(`  Branch: ${s.branch_id}, Qty: ${s.current_quantity}`));
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
