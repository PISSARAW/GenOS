"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProcessor = exports.CurrencyMismatchError = void 0;
// PaymentProcessor_genos.ts - "Worker GenOS"
// Piloté par test_env_genos/agent.yaml (risk_tolerance=0.10, verification_threshold=0.80).
// Instruction reçue : "Tu es piloté par le génome ci-joint. Refactorise PaymentProcessor.ts"
// Comportement phénotypique : périmètre de tests écrit AVANT, puis refactorisation.
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
        this.guardCurrency(account, money); // fix du trou de sécurité prouvé par le test
        const next = account.balance + money.amount;
        if (next < 0) {
            throw new Error('insufficient funds');
        }
        account.balance = next;
        return next;
    }
    mustGet(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`unknown account: ${accountId}`);
        }
        return account;
    }
    guardCurrency(account, money) {
        const ok = account.currency === money.currency;
        if (!ok) {
            throw new CurrencyMismatchError(account.currency, money.currency);
        }
    }
    refund(accountId, money) {
        return this.processPayment(accountId, { amount: -money.amount, currency: money.currency });
    }
}
exports.PaymentProcessor = PaymentProcessor;
