export const CUSTOMER_LEDGER_REFRESH_EVENT = "customer-ledger-refresh";

export type CustomerLedgerRefreshDetail = {
  customerId?: string;
};

export function notifyCustomerLedgerChanged(customerId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CustomerLedgerRefreshDetail>(CUSTOMER_LEDGER_REFRESH_EVENT, {
      detail: { customerId },
    }),
  );
}
