import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const stock = await prisma.stock.findMany({
    where: {
      product: {
        name: { contains: 'Oil Filter' }
      }
    },
    include: {
      product: true,
      branch: true
    }
  });
  console.log('Stock Report:', JSON.stringify(stock, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
