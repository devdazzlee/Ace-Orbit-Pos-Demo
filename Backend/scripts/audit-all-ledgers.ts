import { LedgerEntryType, PrismaClient } from '@prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';
import { isSaleLinkedShadowAdjustment } from '../src/utils/sale-ledger-revision';

/** READ-ONLY audit — does not modify any database rows. */

const prisma = new PrismaClient();

type Issue = {
  customerId: string;
  customerName: string | null;
  code: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
};

async function main() {
  const issues: Issue[] = [];
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, outstanding_balance: true },
  });

  for (const customer of customers) {
    const ledger = await prisma.customerLedger.findMany({
      where: { customer_id: customer.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    if (ledger.length === 0) continue;

    let running = 0;
    for (const e of ledger) {
      const delta = ledgerBalanceEngine.computeSignedDelta(
        {
          entry_type: e.entry_type,
          amount: e.amount,
          balance_after: e.balance_after,
          reference_no: e.reference_no,
          description: e.description,
        },
        running,
      );
      running = Number((running + delta).toFixed(3));
      const stored = Number(e.balance_after);
      if (Math.abs(stored - running) > 0.009) {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          code: 'BALANCE_AFTER_STALE',
          detail: `Entry ${e.id} (${e.entry_type}): stored=${stored}, computed=${running}`,
          severity: 'high',
        });
      }
    }

    const computed = running;
    const storedCustomer = Number(customer.outstanding_balance);
    if (Math.abs(computed - storedCustomer) > 0.009) {
      issues.push({
        customerId: customer.id,
        customerName: customer.name,
        code: 'CUSTOMER_BALANCE_MISMATCH',
        detail: `customer.outstanding_balance=${storedCustomer}, ledger=${computed}`,
        severity: 'critical',
      });
    }

    const shadows = ledger.filter((e) => isSaleLinkedShadowAdjustment(e));
    if (shadows.length > 0) {
      issues.push({
        customerId: customer.id,
        customerName: customer.name,
        code: 'SHADOW_ADJUSTMENTS',
        detail: `${shadows.length} sale-linked adjustment row(s) still visible`,
        severity: 'medium',
      });
    }

    const sales = await prisma.sale.findMany({
      where: { customer_id: customer.id, status: 'COMPLETED', payment_method: 'CREDIT' },
      select: { sale_number: true, total_amount: true, payment_received: true, payment_status: true },
    });

    for (const sale of sales) {
      const expectedCredit = Math.max(
        0,
        Number((Number(sale.total_amount) - Number(sale.payment_received)).toFixed(3)),
      );
      const creditRow = ledger.find(
        (e) => e.sale_id === sale.sale_number && e.entry_type === LedgerEntryType.CREDIT_SALE,
      );
      const ledgerCredit = creditRow ? Number(creditRow.amount) : 0;
      const upfrontRow = ledger.find(
        (e) =>
          e.sale_id === sale.sale_number &&
          e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
          e.description?.toLowerCase().startsWith('upfront payment on'),
      );

      if (Math.abs(expectedCredit - ledgerCredit) > 0.009) {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          code: 'SALE_CREDIT_DRIFT',
          detail: `${sale.sale_number}: sale owes ${expectedCredit}, ledger credit ${ledgerCredit}`,
          severity: 'critical',
        });
      }

      if (expectedCredit <= 0.009 && creditRow) {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          code: 'PAID_SALE_STILL_ON_LEDGER',
          detail: `${sale.sale_number} is PAID but CREDIT_SALE row=${ledgerCredit}`,
          severity: 'critical',
        });
      }

      const paid = Number(sale.payment_received);
      const upfrontAmt = upfrontRow ? Number(upfrontRow.amount) : 0;
      const nonUpfrontPayments = ledger
        .filter(
          (e) =>
            e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
            e.sale_id === sale.sale_number &&
            !e.description?.toLowerCase().startsWith('upfront payment on'),
        )
        .reduce((s, e) => s + Number(e.amount), 0);

      if (paid > 0.009 && Math.abs(paid - upfrontAmt - nonUpfrontPayments) > 0.009) {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          code: 'PAYMENT_ALLOCATION_DRIFT',
          detail: `${sale.sale_number}: sale.paid=${paid}, upfront=${upfrontAmt}, other payments=${nonUpfrontPayments}`,
          severity: 'high',
        });
      }
    }

    const totalPaymentsLedger = ledger
      .filter((e) => e.entry_type === LedgerEntryType.PAYMENT_RECEIVED)
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalOnSales = sales.reduce((s, sale) => s + Number(sale.payment_received), 0);
    if (totalPaymentsLedger + 0.009 < totalOnSales) {
      issues.push({
        customerId: customer.id,
        customerName: customer.name,
        code: 'SALE_PAID_EXCEEDS_LEDGER_PAYMENTS',
        detail: `sales.payment_received sum=${totalOnSales}, ledger payments=${totalPaymentsLedger}`,
        severity: 'high',
      });
    }
  }

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) bySeverity[i.severity]++;

  console.log('=== LEDGER AUDIT SUMMARY ===');
  console.log({
    customersChecked: customers.length,
    issuesFound: issues.length,
    ...bySeverity,
  });

  if (issues.length > 0) {
    console.log('\n=== ISSUES ===');
    for (const i of issues) {
      console.log(`[${i.severity.toUpperCase()}] ${i.customerName} (${i.code}): ${i.detail}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
