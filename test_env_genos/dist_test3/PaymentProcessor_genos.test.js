"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// PaymentProcessor_genos.test.ts - Perimeter tests, Worker GenOS (genome v2)
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const PaymentProcessor_genos_1 = require("./PaymentProcessor_genos");
function eur(amount) { return { amount, currency: 'EUR' }; }
(0, node_test_1.test)('known account accepts a same-currency payment', () => {
    const proc = new PaymentProcessor_genos_1.PaymentProcessor();
    node_assert_1.strict.equal(proc.processPayment('acct_eur_1', eur(100.0)), 1100.0);
});
(0, node_test_1.test)('unknown account throws', () => {
    const proc = new PaymentProcessor_genos_1.PaymentProcessor();
    node_assert_1.strict.throws(() => proc.processPayment('acct_ghost', eur(1.0)), /unknown account/);
});
(0, node_test_1.test)('negative resulting balance throws insufficient funds', () => {
    const proc = new PaymentProcessor_genos_1.PaymentProcessor();
    node_assert_1.strict.throws(() => proc.processPayment('acct_eur_1', eur(-9999.0)), /insufficient funds/);
});
(0, node_test_1.test)('currency mismatch is rejected, not silently added', () => {
    const proc = new PaymentProcessor_genos_1.PaymentProcessor();
    const usdOnEur = { amount: 50.0, currency: 'USD' };
    node_assert_1.strict.throws(() => proc.processPayment('acct_eur_1', usdOnEur), PaymentProcessor_genos_1.CurrencyMismatchError);
});
(0, node_test_1.test)('refund inverts a payment', () => {
    const proc = new PaymentProcessor_genos_1.PaymentProcessor();
    proc.processPayment('acct_usd_1', { amount: 100.0, currency: 'USD' });
    node_assert_1.strict.equal(proc.refund('acct_usd_1', { amount: 100.0, currency: 'USD' }), 500.0);
});
