"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProcessor = void 0;
// PaymentProcessor.ts - Legacy payment code. DO NOT TOUCH without tests.
class PaymentProcessor {
    constructor() {
        this.balances = new Map();
        this.transactions = [];
        this.balances.set("acct_eur_1", 1000.0);
        this.balances.set("acct_usd_1", 500.0);
    }
    processPayment(accountId, amount, currency) {
        let bal = this.balances.get(accountId);
        if (bal == null) {
            throw new Error("unknown account");
        }
        // BUG SUBTIL: additionne sans vérifier la devise du montant
        // vs la devise du compte. EUR + USD = corruption silencieuse.
        let newBal = bal + amount;
        if (newBal < 0) {
            throw new Error("insufficient funds");
        }
        this.balances.set(accountId, newBal);
        this.transactions.push(`${accountId}:${amount}:${currency}`);
        return newBal;
    }
    refund(accountId, amount) {
        return this.processPayment(accountId, -amount, null);
    }
}
exports.PaymentProcessor = PaymentProcessor;
