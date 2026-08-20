/**
 * One-off repair for customer WORLD SAVING (03092230001).
 *
 * Problem: the 82,500 payment on 2026-07-01 07:29 was recorded with sale_id = null
 * ("Payment toward account balance"), so SALE-1782811696198 still reads as 81,420 due
 * even though the account is settled with 1,080 credit. The later 1,080 payment
 * (07:52) was tagged to that invoice, but by then the invoice was already covered.
 *
 * Fix (chronological / FIFO):
 *   - tag the 82,500 payment to SALE-1782811696198  (it is what actually settled it)
 *   - untag the 1,080 payment -> genuine account overpayment / credit
 *   - sync sale.payment_received = 82,500 and payment_status = PAID
 *
 * The running balance is NOT touched: both rows keep amount + PAYMENT_RECEIVED type,
 * so every signed delta and balance_after stays exactly as it is (-1,080 = 1,080 credit).
 *
 * Usage:  npx ts-node scripts/repair-world-saving-allocation.ts          (dry run)
 *         npx ts-node scripts/repair-world-saving-allocation.ts --apply  (write)
 */
import { LedgerEntryType, PaymentStatus, PrismaClient } from '@prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';

const prisma = new PrismaClient();

const CUSTOMER_PHONE = '03092230001';
const SALE_NUMBER = 'SALE-1782811696198';
const SETTLING_PAYMENT = 82500;
const EXCESS_PAYMENT = 1080;

const apply = process.argv.includes('--apply');

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { phone_number: CUSTOMER_PHONE },
    select: { id: true, name: true, outstanding_balance: true },
  });
  if (!customer) throw new Error(`Customer ${CUSTOMER_PHONE} not found`);

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${customer.name} (${CUSTOMER_PHONE})`);

  const sale = await prisma.sale.findUnique({
    where: { sale_number: SALE_NUMBER },
    select: { id: true, total_amount: true, payment_received: true, payment_status: true },
  });
  if (!sale) throw new Error(`${SALE_NUMBER} not found`);

  const payments = await prisma.customerLedger.findMany({
    where: { customer_id: customer.id, entry_type: LedgerEntryType.PAYMENT_RECEIVED },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

  const settling = payments.find((p) => Number(p.amount) === SETTLING_PAYMENT && !p.sale_id);
  const excess = payments.find((p) => Number(p.amount) === EXCESS_PAYMENT && p.sale_id === SALE_NUMBER);

  if (!settling || !excess) {
    console.log('Ledger no longer matches the expected shape — nothing done.');
    console.log(payments.map((p) => ({ amount: Number(p.amount), sale_id: p.sale_id, at: p.created_at })));
    return;
  }

  const balanceBefore = ledgerBalanceEngine.computeRunningBalance(
    await prisma.customerLedger.findMany({
      where: { customer_id: customer.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
  );

  console.log('\nPlanned changes:');
  console.log(`  ledger ${settling.id}  ${SETTLING_PAYMENT}  sale_id: null -> ${SALE_NUMBER}`);
  console.log(`  ledger ${excess.id}  ${EXCESS_PAYMENT}  sale_id: ${SALE_NUMBER} -> null (account credit)`);
  console.log(
    `  sale   ${SALE_NUMBER}  payment_received: ${Number(sale.payment_received)} -> ${SETTLING_PAYMENT}` +
      `, payment_status: ${sale.payment_status} -> PAID`,
  );
  console.log(`\n  running balance stays: ${balanceBefore}`);

  if (!apply) {
    console.log('\nDry run — pass --apply to write.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.update({
      where: { id: settling.id },
      data: {
        sale_id: SALE_NUMBER,
        reference_no: SALE_NUMBER,
        description: `Payment for ${SALE_NUMBER}`,
      },
    });

    await tx.customerLedger.update({
      where: { id: excess.id },
      data: {
        sale_id: null,
        reference_no: null,
        description: 'Payment toward account balance',
      },
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        payment_received: SETTLING_PAYMENT,
        payment_status: PaymentStatus.PAID,
      },
    });
  });

  const balanceAfter = ledgerBalanceEngine.computeRunningBalance(
    await prisma.customerLedger.findMany({
      where: { customer_id: customer.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
  );

  console.log(`\nDone. Running balance ${balanceBefore} -> ${balanceAfter}`);
  if (Math.abs(balanceAfter - balanceBefore) > 0.009) {
    throw new Error('Balance moved — investigate before trusting this run.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
