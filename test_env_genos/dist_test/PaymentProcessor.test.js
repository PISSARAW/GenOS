"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// PaymentProcessor.test.ts - Written by "Worker GenOS" BEFORE any refactoring.
// Genome: risk_tolerance=0.10, verification_threshold=0.80, objectives: [tests_pass]
// => Perimeter secured first: these tests pin down current behavior AND the expected
//    currency-safety contract. They must pass after refactoring.
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const PaymentProcessor_1 = require("./PaymentProcessor");
(0, node_test_1.test)('known account accepts a same-currency payment', () => {
    const proc = new PaymentProcessor_1.PaymentProcessor();
    const bal = proc.processPayment('acct_eur_1', 100.0, 'EUR');
    node_assert_1.strict.equal(bal, 1100.0);
});
(0, node_test_1.test)('unknown account throws', () => {
    const proc = new PaymentProcessor_1.PaymentProcessor();
    node_assert_1.strict.throws(() => proc.processPayment('acct_ghost', 1.0, 'EUR'), /unknown account/);
});
(0, node_test_1.test)('negative resulting balance throws insufficient funds', () => {
    const proc = new PaymentProcessor_1.PaymentProcessor();
    node_assert_1.strict.throws(() => proc.processPayment('acct_eur_1', -9999.0, 'EUR'), /insufficient funds/);
});
// SECURITY CONTRACT TEST: mixing currencies MUST NOT silently corrupt balances.
// On the legacy implementation this test FAILS (EUR balance += USD amount).
(0, node_test_1.test)('currency mismatch is rejected, not silently added', () => {
    const proc = new PaymentProcessor_1.PaymentProcessor();
    let rejected = false;
    try {
        proc.processPayment('acct_eur_1', 50.0, 'USD');
    }
    catch {
        rejected = true;
    }
    node_assert_1.strict.ok(rejected, 'SECURITY HOLE: EUR account accepted USD amount without error');
});
