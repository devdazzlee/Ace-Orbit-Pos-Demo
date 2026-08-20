import { SupplierLedgerEntryType, Prisma } from '@prisma/client';
import { supplierLedgerBalanceEngine } from './supplier-ledger-balance.engine';

type Row = {
  entry_type: SupplierLedgerEntryType;
  amount: Prisma.Decimal;
  balance_after: Prisma.Decimal;
  reference_no: string | null;
  description: string | null;
};

function row(
  entry_type: SupplierLedgerEntryType,
  amount: number,
  balance_after: number,
  description?: string,
): Row {
  return {
    entry_type,
    amount: new Prisma.Decimal(amount),
    balance_after: new Prisma.Decimal(balance_after),
    reference_no: null,
    description: description ?? null,
  };
}

function simulateChain(entries: Row[]) {
  let running = 0;
  const steps: Array<{ before: number; delta: number; after: number }> = [];

  for (const entry of entries) {
    const before = running;
    const delta = supplierLedgerBalanceEngine.computeSignedDelta(entry, before);
    running = Number((running + delta).toFixed(3));
    steps.push({ before, delta, after: running });
  }

  return { steps, finalBalance: running };
}

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.009) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

/** Ahmed Raza scenario: cash purchases, advance payment, then credit purchase */
function testAdvancePaymentBeforeCreditPurchase() {
  const { steps, finalBalance } = simulateChain([
    row(SupplierLedgerEntryType.CASH_PURCHASE, 396, 0),
    row(SupplierLedgerEntryType.CASH_PURCHASE, 12, 0),
    row(SupplierLedgerEntryType.PAYMENT_MADE, 12312, -12312),
    row(SupplierLedgerEntryType.CREDIT_PURCHASE, 1483056, 1470744),
  ]);

  assertClose(steps[0].after, 0, 'cash purchase 396');
  assertClose(steps[1].after, 0, 'cash purchase 12');
  assertClose(steps[2].before, 0, 'payment before');
  assertClose(steps[2].delta, -12312, 'payment delta');
  assertClose(steps[2].after, -12312, 'payment after (advance)');
  assertClose(steps[3].before, -12312, 'credit before');
  assertClose(steps[3].delta, 1483056, 'credit delta');
  assertClose(steps[3].after, 1470744, 'credit after');
  assertClose(finalBalance, 1470744, 'final outstanding');

  const advanceNow = Math.max(0, -finalBalance);
  assertClose(advanceNow, 0, 'remaining advance after credit purchase');
}

function testPartialPaymentAgainstCredit() {
  const { steps, finalBalance } = simulateChain([
    row(SupplierLedgerEntryType.CREDIT_PURCHASE, 1000, 1000),
    row(SupplierLedgerEntryType.PAYMENT_MADE, 400, 600),
  ]);

  assertClose(steps[1].before, 1000, 'partial payment before');
  assertClose(steps[1].after, 600, 'partial payment after');
  assertClose(finalBalance, 600, 'final due');
}

function testMixedCashAndCredit() {
  const { finalBalance } = simulateChain([
    row(SupplierLedgerEntryType.CASH_PURCHASE, 250, 0),
    row(SupplierLedgerEntryType.CREDIT_PURCHASE, 500, 500),
    row(SupplierLedgerEntryType.PAYMENT_MADE, 500, 0),
  ]);

  assertClose(finalBalance, 0, 'settled after full payment');
}

function testEveryStepSatisfiesBeforePlusChangeEqualsAfter() {
  const { steps } = simulateChain([
    row(SupplierLedgerEntryType.CASH_PURCHASE, 396, 0),
    row(SupplierLedgerEntryType.CASH_PURCHASE, 12, 0),
    row(SupplierLedgerEntryType.PAYMENT_MADE, 12312, -12312),
    row(SupplierLedgerEntryType.CREDIT_PURCHASE, 1483056, 1470744),
  ]);

  for (const [i, step] of steps.entries()) {
    assertClose(step.before + step.delta, step.after, `step ${i} chain`);
  }
}

function run() {
  const tests = [
    ['advance payment before credit purchase', testAdvancePaymentBeforeCreditPurchase],
    ['partial payment against credit purchase', testPartialPaymentAgainstCredit],
    ['mixed cash and credit', testMixedCashAndCredit],
    ['before + change = after on every row', testEveryStepSatisfiesBeforePlusChangeEqualsAfter],
  ] as const;

  for (const [name, fn] of tests) {
    fn();
    console.log(`PASS ${name}`);
  }

  console.log(`\nAll ${tests.length} supplier ledger balance tests passed.`);
}

run();
