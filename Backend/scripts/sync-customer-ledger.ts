import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';

const customerId = process.argv[2] ?? '3ffb17f1-9350-4849-9198-6cff2cd41207';

async function main() {
  const { prisma } = await import('../src/prisma/client');
  const result = await prisma.$transaction(async (tx) => {
    const balance = await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
    return { balance };
  });
  console.log(`Synced customer ${customerId}. Correct balance: ${result.balance}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
