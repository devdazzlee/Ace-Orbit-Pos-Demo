/**
 * READ-ONLY per-sale audit for ONE calendar day (writes nothing).
 *
 * For every COMPLETED sale on the given day it prints, individually:
 *   - the sale price (total_amount, as shown in Sales History)
 *   - the customer
 *   - the matching ledger charge (CREDIT_SALE for credit, CASH_SALE for cash)
 *   - MATCH / MISMATCH
 *
 * Day window = calendar day in the business timezone (Asia/Karachi).
 *
 * Usage:
 *   npx ts-node scripts/audit-day-sales-vs-ledger.ts 2026-06-29
 */
import { LedgerEntryType, PrismaClient } from '@prisma/client';
import { buildSaleLedgerSnapshot } from '../src/utils/sale-ledger-derivation';
import { REPORTING_TIMEZONE, wallTimeToUtc } from '../src/utils/reportingPeriod';

const prisma = new PrismaClient();
const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2026-06-29';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const timeIn = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: REPORTING_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

async function main() {
  const [y, m, d] = dateArg.split('-').map(Number);
  const start = wallTimeToUtc(y, m, d, 0, 0, 0, REPORTING_TIMEZONE);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  console.log(`=== PER-SALE AUDIT: ${dateArg} (${REPORTING_TIMEZONE}) ===`);
  console.log(`Window (UTC): ${start.toISOString()} → ${end.toISOString()}\n`);

  const sales = await prisma.sale.findMany({
    where: { status: 'COMPLETED', sale_date: { gte: start, lt: end } },
    select: {
      sale_number: true,
      total_amount: true,
      payment_method: true,
      sale_date: true,
      customer_id: true,
      customer: { select: { name: true } },
    },
    orderBy: { sale_date: 'asc' },
  });

  console.log(`Found ${sales.length} completed sale(s).\n`);

  let credit = 0;
  let cash = 0;
  let walkIn = 0;
  let mismatches = 0;

  for (const [i, sale] of sales.entries()) {
    const total = Number(sale.total_amount);
    const method = sale.payment_method;
    const who = sale.customer?.name ?? (sale.customer_id ? '(customer)' : 'Walk-in');

    let chargeLabel = '';
    let status = '';
    let extra = '';

    if (!sale.customer_id) {
      // Walk-in cash sale — by design there is no customer ledger row.
      walkIn += 1;
      chargeLabel = 'n/a (walk-in)';
      status = 'OK';
    } else {
      const rows = await prisma.customerLedger.findMany({
        where: { customer_id: sale.customer_id, sale_id: sale.sale_number },
        select: { entry_type: true, amount: true, description: true, sale_id: true },
      });

      if (method === 'CREDIT') {
        credit += 1;
        const creditRows = rows.filter((r) => r.entry_type === LedgerEntryType.CREDIT_SALE);
        const charge = creditRows.reduce((s, r) => s + Number(r.amount), 0);
        const snap = buildSaleLedgerSnapshot(sale.sale_number, total, rows);
        chargeLabel = creditRows.length === 0 ? 'MISSING' : money(charge);
        const match = creditRows.length === 1 && Math.abs(charge - total) <= 0.009;
        status = match ? 'MATCH' : 'MISMATCH';
        if (!match) mismatches += 1;
        extra = `paid ${money(snap.totalPaid)} · due ${money(snap.amountDue)}`;
      } else {
        cash += 1;
        const cashRows = rows.filter((r) => r.entry_type === LedgerEntryType.CASH_SALE);
        const charge = cashRows.reduce((s, r) => s + Number(r.amount), 0);
        chargeLabel = cashRows.length === 0 ? 'n/a (no ledger)' : money(charge);
        // CASH_SALE does not affect balance; match only meaningful when a row exists.
        const match = cashRows.length === 0 || Math.abs(charge - total) <= 0.009;
        status = match ? 'OK' : 'MISMATCH';
        if (!match) mismatches += 1;
      }
    }

    console.log(
      `${pad(String(i + 1), 3)} ${timeIn(sale.sale_date)}  ${pad(sale.sale_number, 22)} ${pad(method, 6)} ` +
      `price ${pad(money(total), 12)} ledger ${pad(chargeLabel, 14)} ${pad(status, 9)} ${pad(who, 34)} ${extra}`,
    );
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Total sales : ${sales.length}  (credit ${credit}, cash ${cash}, walk-in ${walkIn})`);
  console.log(`Mismatches  : ${mismatches}`);
  console.log(mismatches === 0 ? '\nAll sales match their customer-ledger charge. ✓' : '\nMismatches found — see rows above.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
