// PaymentProcessor_genos.ts - "Worker GenOS" v2
// Génome muté : risk_tolerance=0.10, verification_threshold=0.80, syntax_strictness=0.90.
// Aucune règle de linter n'a été injectée dans le prompt : le trait strict du génome
// pousse structurellement vers une décomposition fine et une hygiène syntaxique.
export class CurrencyMismatchError extends Error {
  public constructor(expected: string, received: string) {
    super(`currency mismatch: account=${expected} amount=${received}`);
    this.name = 'CurrencyMismatchError';
  }
}

type Currency = 'EUR' | 'USD';

export interface Money {
  amount: number;
  currency: Currency;
}

interface Account {
  id: string;
  currency: Currency;
  balance: number;
}

export class PaymentProcessor {
  private readonly accounts = new Map<string, Account>();

  constructor() {
    this.accounts.set('acct_eur_1', { id: 'acct_eur_1', currency: 'EUR', balance: 1000.0 });
    this.accounts.set('acct_usd_1', { id: 'acct_usd_1', currency: 'USD', balance: 500.0 });
  }

  public processPayment(accountId: string, money: Money): number {
    const account = this.mustGet(accountId);
    const next = this.computeNext(account, money);
    return this.commit(account, next);
  }

  public refund(accountId: string, money: Money): number {
    const inverted: Money = { amount: -money.amount, currency: money.currency };
    return this.processPayment(accountId, inverted);
  }

  private mustGet(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account) { throw new Error(`unknown account: ${accountId}`); }
    return account;
  }

  private guardCurrency(account: Account, money: Money): void {
    if (account.currency !== money.currency) {
      throw new CurrencyMismatchError(account.currency, money.currency);
    }
  }

  private computeNext(account: Account, money: Money): number {
    this.guardCurrency(account, money); // fix du trou prouvé par PaymentProcessor.test.ts
    return account.balance + money.amount;
  }

  private commit(account: Account, candidate: number): number {
    if (candidate < 0) { throw new Error('insufficient funds'); }
    account.balance = candidate;
    return candidate;
  }
}
