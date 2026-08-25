// PaymentProcessor_expert.ts - Refactored by "Agent Expert" (giant prompt)
export type Currency = 'EUR' | 'USD';

export class CurrencyMismatchError extends Error {
  public constructor(public readonly expected: Currency, public readonly received: Currency) {
    super(`currency mismatch: account=${expected} amount=${received}`);
  }
}

interface Money { readonly amount: number; readonly currency: Currency; }

interface Account { readonly id: string; readonly currency: Currency; balance: number; }

export class PaymentProcessor {
  private readonly accounts: Map<string, Account> = new Map();
  private readonly ledger: string[] = [];

  constructor() {
    this.accounts.set('acct_eur_1', { id: 'acct_eur_1', currency: 'EUR', balance: 1000.0 });
    this.accounts.set('acct_usd_1', { id: 'acct_usd_1', currency: 'USD', balance: 500.0 });
  }

  public processPayment(accountId: string, money: Money): number {
    const newBalance = this.applyDelta(this.getAccount(accountId), money);
    this.record(accountId, money);
    return newBalance;
  }

  private getAccount(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (account === undefined) { throw new Error(`unknown account: ${accountId}`); }
    return account;
  }

  private applyDelta(account: Account, money: Money): number {
    this.assertCurrency(account, money);
    const candidate = account.balance + money.amount;
    return candidate < 0 ? this.reject() : this.setBalance(account, candidate);
  }

  private reject(): number {
    throw new Error('insufficient funds');
  }

  private setBalance(account: Account, candidate: number): number {
    account.balance = candidate;
    return candidate;
  }

  private assertCurrency(account: Account, money: Money): void {
    if (account.currency !== money.currency) {
      throw new CurrencyMismatchError(account.currency, money.currency);
    }
  }

  private record(accountId: string, money: Money): void {
    // PCI-DSS 3.3 : aucune donnée sensible, devise journalisée pour audit.
    this.ledger.push(`${accountId}:${money.amount.toFixed(2)}:${money.currency}`);
  }

  public refund(accountId: string, money: Money): number {
    const inverted: Money = { amount: -money.amount, currency: money.currency };
    return this.processPayment(accountId, inverted);
  }
}
