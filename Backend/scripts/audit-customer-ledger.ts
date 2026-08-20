import { LedgerEntryType, PrismaClient } from '@prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';
import { isSaleLinkedShadowAdjustment } from '../src/utils/sale-ledger-revision';
const prisma = new PrismaClient();

async function main() {
  const search = process.argv[2] || 'ALL IN ONE';
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone_number: { contains: search } },
        { mobile_number: { contains: search } },
      ],
    },
  });

  if (!customer) {
    console.log('Customer not found for:', search);
    return;
  }

  console.log('=== CUSTOMER ===');
  console.log({
    id: customer.id,
    name: customer.name,
    phone: customer.phone_number,
    mobile: customer.mobile_number,
    outstanding_balance: Number(customer.outstanding_balance),
    credit_limit: Number(customer.credit_limit),
  });

  const ledger = await prisma.customerLedger.findMany({
    where: { customer_id: customer.id },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

  const revisions = await prisma.customerSaleLedgerRevision.findMany({
    where: { customer_id: customer.id },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

  const sales = await prisma.sale.findMany({
    where: { customer_id: customer.id },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      sale_number: true,
      created_at: true,
      total_amount: true,
      payment_received: true,
      payment_method: true,
      payment_status: true,
      status: true,
    },
  });

  console.log('\n=== SALES ===');
  for (const s of sales) {
    console.log({
      sale_number: s.sale_number,
      date: s.created_at.toISOString(),
      total: Number(s.total_amount),
      paid_on_sale: Number(s.payment_received),
      credit_owed: Number(s.total_amount) - Number(s.payment_received),
      method: s.payment_method,
      status: s.payment_status,
      sale_status: s.status,
    });
  }

  console.log('\n=== LEDGER (chronological) ===');
  let running = 0;
  let totalDebits = 0;
  let totalCredits = 0;
  let totalCreditSales = 0;
  let totalPaymentsAll = 0;
  let totalUpfrontPayments = 0;
  let totalAccountPayments = 0;

  for (const e of ledger) {
    const amt = Number(e.amount);
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
    const isShadow = isSaleLinkedShadowAdjustment(e);
    const isUpfront =
      e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
      (e.description?.toLowerCase().startsWith('upfront payment on') ?? false);

    if (delta > 0.009) totalDebits += delta;
    if (delta < -0.009) totalCredits += Math.abs(delta);
    if (e.entry_type === LedgerEntryType.CREDIT_SALE) totalCreditSales += amt;
    if (e.entry_type === LedgerEntryType.PAYMENT_RECEIVED) {
      totalPaymentsAll += amt;
      if (isUpfront) totalUpfrontPayments += amt;
      else totalAccountPayments += amt;
    }

    console.log({
      date: e.created_at.toISOString(),
      type: e.entry_type,
      amount: amt,
      signed_delta: delta,
      balance_after_stored: Number(e.balance_after),
      balance_after_calc: Number((running + delta).toFixed(3)),
      sale_id: e.sale_id,
      reference_no: e.reference_no,
      description: e.description,
      shadow_adjustment: isShadow,
      is_upfront_on_sale: isUpfront,
    });
    running = Number((running + delta).toFixed(3));
  }

  console.log('\n=== SUMMARY (computed) ===');
  console.log({
    ledger_entry_count: ledger.length,
    computed_running_balance: running,
    customer_outstanding_balance: Number(customer.outstanding_balance),
    balance_match: Math.abs(running - Number(customer.outstanding_balance)) < 0.01,
    total_debits_added: totalDebits,
    total_credits_paid: totalCredits,
    net_due: running,
    credit_sale_ledger_total: totalCreditSales,
    payment_received_ledger_total: totalPaymentsAll,
    upfront_payments_on_sales: totalUpfrontPayments,
    account_payments_collected: totalAccountPayments,
    opening_balance: ledger
      .filter((e) => (e.description ?? '').toLowerCase().includes('opening balance'))
      .reduce((s, e) => s + Number(e.amount), 0),
  });

  console.log('\n=== SALE vs LEDGER CROSS-CHECK ===');
  for (const s of sales.filter((x) => x.payment_method === 'CREDIT')) {
    const creditRow = ledger.find(
      (e) => e.sale_id === s.sale_number && e.entry_type === LedgerEntryType.CREDIT_SALE,
    );
    const upfrontRow = ledger.find(
      (e) =>
        e.sale_id === s.sale_number &&
        e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
        e.description?.toLowerCase().startsWith('upfront payment on'),
    );
    const paymentsOnSale = ledger.filter(
      (e) =>
        e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
        e.sale_id === s.sale_number &&
        !e.description?.toLowerCase().startsWith('upfront payment on'),
    );

    const saleCreditOwed = Number(s.total_amount) - Number(s.payment_received);
    console.log({
      sale_number: s.sale_number,
      sale_total: Number(s.total_amount),
      sale_payment_received_field: Number(s.payment_received),
      sale_credit_owed_expected: saleCreditOwed,
      ledger_credit_sale_amount: creditRow ? Number(creditRow.amount) : null,
      ledger_upfront_payment: upfrontRow ? Number(upfrontRow.amount) : null,
      later_payments_on_sale: paymentsOnSale.map((p) => ({
        amount: Number(p.amount),
        desc: p.description,
        date: p.created_at.toISOString(),
      })),
      credit_row_matches_sale: creditRow
        ? Math.abs(Number(creditRow.amount) - saleCreditOwed) < 0.01
        : saleCreditOwed <= 0.009,
    });
  }

  if (revisions.length > 0) {
    console.log('\n=== SALE LEDGER REVISIONS ===');
    for (const r of revisions) {
      console.log({
        sale: r.sale_number,
        field: r.field,
        previous: Number(r.previous_amount),
        new: Number(r.new_amount),
        delta: Number(r.signed_delta),
        reason: r.reason,
        at: r.created_at.toISOString(),
      });
    }
  }

  const shadows = ledger.filter((e) => isSaleLinkedShadowAdjustment(e));
  if (shadows.length > 0) {
    console.log('\n=== WARNING: SHADOW ADJUSTMENTS STILL IN DB ===');
    console.log(shadows);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
