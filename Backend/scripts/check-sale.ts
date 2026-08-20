import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { name: 'KARAM TRADER' },
    select: { id: true, name: true, outstanding_balance: true },
  });

  if (!customer) {
    console.log('Customer KARAM TRADER not found');
    return;
  }

  console.log('Customer            :', customer.name);
  console.log('outstanding_balance :', String(customer.outstanding_balance));

  const ret = await prisma.sale.findUnique({
    where: { sale_number: 'SALE-1779475981725' },
    select: { sale_number: true, status: true, total_amount: true, previous_balance: true, created_at: true },
  });
  console.log('\nReturn/Exchange record SALE-1779475981725:');
  console.log(ret ?? '(not found)');

  const ledger = await prisma.customerLedger.findMany({
    where: { customer_id: customer.id },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { entry_type: true, amount: true, balance_after: true, description: true, created_at: true },
  });
  console.log('\nLast 5 ledger entries:');
  ledger.forEach((l) =>
    console.log(`  ${l.created_at.toISOString()}  ${l.entry_type}  amt=${String(l.amount)}  bal_after=${String(l.balance_after)}  ${l.description}`),
  );
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
