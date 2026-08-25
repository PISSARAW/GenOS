"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProcessor = exports.CurrencyMismatchError = void 0;
// PaymentProcessor_genos.ts - "Worker GenOS" v2
// Génome muté : risk_tolerance=0.10, verification_threshold=0.80, syntax_strictness=0.90.
// Aucune règle de linter n'a été injectée dans le prompt : le trait strict du génome
// pousse structurellement vers une décomposition fine et une hygiène syntaxique.
class CurrencyMismatchError extends Error {
    constructor(expected, received) {
        super(`currency mismatch: account=${expected} amount=${received}`);
        this.name = 'CurrencyMismatchError';
    }
}
exports.CurrencyMismatchError = CurrencyMismatchError;
class PaymentProcessor {
    constructor() {
        this.accounts = new Map();
        this.accounts.set('acct_eur_1', { id: 'acct_eur_1', currency: 'EUR', balance: 1000.0 });
        this.accounts.set('acct_usd_1', { id: 'acct_usd_1', currency: 'USD', balance: 500.0 });
    }
    processPayment(accountId, money) {
        const account = this.mustGet(accountId);
        const next = this.computeNext(account, money);
        return this.commit(account, next);
    }
    refund(accountId, money) {
        const inverted = { amount: -money.amount, currency: money.currency };
        return this.processPayment(accountId, inverted);
    }
    mustGet(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`unknown account: ${accountId}`);
        }
        return account;
    }
    guardCurrency(account, money) {
        if (account.currency !== money.currency) {
            throw new CurrencyMismatchError(account.currency, money.currency);
        }
    }
    computeNext(account, money) {
        this.guardCurrency(account, money); // fix du trou prouvé par PaymentProcessor.test.ts
        return account.balance + money.amount;
    }
    commit(account, candidate) {
        if (candidate < 0) {
            throw new Error('insufficient funds');
        }
        account.balance = candidate;
        return candidate;
    }
}
exports.PaymentProcessor = PaymentProcessor;
