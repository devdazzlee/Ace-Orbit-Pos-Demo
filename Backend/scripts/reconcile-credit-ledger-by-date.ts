/**
 * Reconcile credit-sale ledger charges for ONE calendar day (dry-run by default).
 *
 * Invariant (model A — same as the live code, the display layer, and repair-customer-ledger):
 *   For every COMPLETED credit sale, the CREDIT_SALE ledger row amount MUST equal the
 *   sale's total_amount. Upfront / later payments are separate PAYMENT_RECEIVED rows.
 *
 * Older sales (created before the pricing fix) stored the CREDIT_SALE row as the NET owed
 * (total − upfront), so the price shown in Sales History differs from the charge in the
 * customer ledger. This script finds those mismatches for a given day and corrects the
 * stored CREDIT_SALE amount to the sale total, then recomputes running balances.
 *
 * Day window = calendar day in the business timezone (Asia/Karachi), matching the date
 * label shown in Sales History.
 *
 * Usage:
 *   npx ts-node scripts/reconcile-credit-ledger-by-date.ts 2026-06-29
 *   npx ts-node scripts/reconcile-credit-ledger-by-date.ts 2026-06-29 --apply
 */
import { LedgerEntryType, Prisma, PrismaClient } from '@prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';
import { buildSaleLedgerSnapshots } from '../src/utils/sale-ledger-derivation';
import { isSaleManagedInSalePayment } from '../src/utils/sale-ledger-revision';
import { REPORTING_TIMEZONE, wallTimeToUtc } from '../src/utils/reportingPeriod';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
/** Recompute balances for ALL of the day's credit-sale customers, even ones with no
 *  amount change — used to finish a run whose balance recalc was interrupted. */
const forceRecalc = process.argv.includes('--force-recalc');
const dateArg =
  process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2026-06-29';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inTz = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);

type FixAction = {
  saleNumber: string;
  customerId: string;
  kind: 'UPDATE_AMOUNT' | 'CREATE_MISSING';
  run: () => Promise<void>;
};

async function main() {
  const [y, m, d] = dateArg.split('-').map(Number);
  const start = wallTimeToUtc(y, m, d, 0, 0, 0, REPORTING_TIMEZONE);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  console.log(`=== RECONCILE CREDIT LEDGER ${apply ? '(APPLY)' : '(DRY-RUN)'} ===`);
  console.log(`Date: ${dateArg} (${REPORTING_TIMEZONE})`);
  console.log(`Window (UTC): ${start.toISOString()} → ${end.toISOString()}\n`);

  const sales = await prisma.sale.findMany({
    where: {
      status: 'COMPLETED',
      payment_method: 'CREDIT',
      customer_id: { not: null },
      sale_date: { gte: start, lt: end },
    },
    select: {
      id: true,
      sale_number: true,
      total_amount: true,
      payment_received: true,
      sale_date: true,
      created_by: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { sale_date: 'asc' },
  });

  console.log(`Found ${sales.length} completed credit sale(s) on ${dateArg}.\n`);

  const actions: FixAction[] = [];
  const affectedCustomerIds = new Set<string>();
  const allTodayCustomerIds = new Set<string>();
  let okCount = 0;

  for (const sale of sales) {
    const customerId = sale.customer!.id;
    allTodayCustomerIds.add(customerId);
    const total = Number(sale.total_amount);

    const saleRows = await prisma.customerLedger.findMany({
      where: { customer_id: customerId, sale_id: sale.sale_number },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    const creditRows = saleRows.filter((r) => r.entry_type === LedgerEntryType.CREDIT_SALE);
    const hasUpfront = saleRows.some((r) => isSaleManagedInSalePayment(r));
    const desc = hasUpfront
      ? `Partial credit sale - ${sale.sale_number}`
      : `Credit sale - ${sale.sale_number}`;

    const header =
      `${sale.sale_number}  ${inTz(sale.sale_date)}  ${sale.customer!.name ?? '—'}\n` +
      `   Sales History price : ${money(total)}`;

    if (creditRows.length === 0) {
      console.log(`${header}\n   Ledger charge       : (none)  →  CREATE ${money(total)}  [MISSING]\n`);
      affectedCustomerIds.add(customerId);
      actions.push({
        saleNumber: sale.sale_number,
        customerId,
        kind: 'CREATE_MISSING',
        run: async () => {
          await prisma.customerLedger.create({
            data: {
              customer_id: customerId,
              entry_type: LedgerEntryType.CREDIT_SALE,
              amount: new Prisma.Decimal(total),
              description: desc,
              sale_id: sale.sale_number,
              reference_no: sale.sale_number,
              balance_after: new Prisma.Decimal(0),
              created_at: sale.sale_date,
              created_by: sale.created_by ?? 'reconcile-script',
            },
          });
        },
      });
      continue;
    }

    if (creditRows.length > 1) {
      console.log(`${header}\n   Ledger charge       : ${creditRows.length} CREDIT_SALE rows  →  SKIP (manual review)\n`);
      continue;
    }

    const creditRow = creditRows[0];
    const ledgerAmount = Number(creditRow.amount);

    if (Math.abs(ledgerAmount - total) <= 0.009) {
      okCount += 1;
      continue;
    }

    console.log(`${header}\n   Ledger charge       : ${money(ledgerAmount)}  →  FIX to ${money(total)}  (diff ${money(total - ledgerAmount)})\n`);
    affectedCustomerIds.add(customerId);
    actions.push({
      saleNumber: sale.sale_number,
      customerId,
      kind: 'UPDATE_AMOUNT',
      run: async () => {
        await prisma.customerLedger.update({
          where: { id: creditRow.id },
          data: { amount: new Prisma.Decimal(total), description: desc },
        });
      },
    });
  }

  console.log('--- SUMMARY ---');
  console.log(`Already correct : ${okCount}`);
  console.log(`To fix (amount) : ${actions.filter((a) => a.kind === 'UPDATE_AMOUNT').length}`);
  console.log(`To create       : ${actions.filter((a) => a.kind === 'CREATE_MISSING').length}`);
  console.log(`Customers affected: ${affectedCustomerIds.size}`);

  if (actions.length === 0 && !(apply && forceRecalc)) {
    console.log('\nNothing to reconcile. All credit sales for this day already match.');
    return;
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write these corrections.');
    return;
  }

  console.log('\nApplying corrections...');
  for (const action of actions) {
    await action.run();
  }

  const customersToRecalc = forceRecalc ? allTodayCustomerIds : affectedCustomerIds;
  for (const customerId of customersToRecalc) {
    // Balance recompute runs in its own transaction with a generous timeout
    // (the engine handles maxWait/timeout) — safe against slow remote DBs.
    await ledgerBalanceEngine.syncCustomerBalances(customerId);

    // Resync each sale's payment fields from the corrected ledger snapshot.
    // Done as individual updates (not one long-running transaction) so a slow
    // network can't expire the transaction mid-loop.
    const custSales = await prisma.sale.findMany({
      where: { customer_id: customerId, status: 'COMPLETED', payment_method: 'CREDIT' },
      select: { id: true, sale_number: true, total_amount: true },
    });
    const rows = await prisma.customerLedger.findMany({
      where: { customer_id: customerId },
      select: { sale_id: true, entry_type: true, amount: true, description: true },
    });
    const snapshots = buildSaleLedgerSnapshots(rows, custSales);
    for (const s of custSales) {
      const snap = snapshots.get(s.sale_number);
      if (!snap) continue;
      await prisma.sale.update({
        where: { id: s.id },
        data: {
          payment_received: new Prisma.Decimal(snap.upfrontPaid),
          payment_status: snap.paymentStatus,
        },
      });
    }

    const cust = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, outstanding_balance: true },
    });
    console.log(`  ${cust?.name}: balance now ${money(Number(cust?.outstanding_balance ?? 0))}`);
  }

  console.log('\nReconcile complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
