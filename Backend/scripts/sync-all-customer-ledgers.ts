import { prisma } from '../src/prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';

async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  let fixed = 0;

  for (const customer of customers) {
    await prisma.$transaction(async (tx) => {
      await ledgerBalanceEngine.recalculateRunningBalances(tx, customer.id);
    });
    fixed += 1;
    console.log(`Synced: ${customer.name ?? customer.id}`);
  }

  console.log(`\nDone. Recalculated ${fixed} customer account(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
