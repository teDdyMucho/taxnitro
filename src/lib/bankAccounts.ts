// A client's bank and credit card accounts, and what makes one usable.
//
// Type and rules only, with nothing behind them: the requirement engine, the
// client screens and the monthly questionnaire all need the same definition of
// "filled in", and a rule with no database attached can be checked on its own.

export interface BankAccount {
  id: string;      // stable — the requirement_key depends on it, never reuse
  bank: string;    // e.g. 'BDO'
  last4: string;   // last 4 digits of the account number
}

/** A card is complete when it has a bank name and exactly 4 digits. */
export function isCompleteBankAccount(a: BankAccount): boolean {
  return a.bank.trim().length > 0 && /^\d{4}$/.test(a.last4.trim());
}

/** True if any card is half-filled — the caller should block save until fixed. */
export function hasIncompleteBankAccount(accounts: BankAccount[]): boolean {
  return accounts.some(a => !isCompleteBankAccount(a));
}

/** Drop half-filled cards and trim — what actually gets written to a profile. */
export function cleanBankAccounts(accounts: BankAccount[]): BankAccount[] {
  return accounts
    .filter(isCompleteBankAccount)
    .map(a => ({ id: a.id, bank: a.bank.trim(), last4: a.last4.trim() }));
}
