import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    take: 10,
    select: { id: true, name: true, sku: true }
  });
  console.log('Products:', JSON.stringify(products, null, 2));
  
  const branches = await prisma.branch.findMany({
    where: { is_active: true },
    select: { id: true, name: true }
  });
  console.log('Branches:', JSON.stringify(branches, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
