import CustomerLedgerService from '../src/services/customer-ledger.service';

/**
 * WARNING: This script MUTATES the database (runs full ledger reconcile).
 * Do NOT run against production existing data unless explicitly approved.
 * Use audit-all-ledgers.ts for read-only checks instead.
 */

const svc = new CustomerLedgerService();
const id = '03729648-1e52-47da-af57-85add0382a10';

async function main() {
  const result = await svc.getCustomerLedger({ customerId: id, limit: 50 });
  console.log('balance', Number(result.summary.currentBalance));
  console.log('debits', result.summary.totalDebits);
  console.log('credits', result.summary.totalCredits);
  console.log('entries', result.entries.length);
  for (const e of result.entries) {
    console.log(e.type, e.amount, e.description);
  }
}

main().catch(console.error);
