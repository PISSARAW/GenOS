"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// auth_test.ts - test de sécurité sur verifyApiKey
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const vulnerable_auth_b_1 = require("./vulnerable_auth_b");
(0, node_test_1.test)('clé valide acceptée', () => {
    node_assert_1.strict.equal((0, vulnerable_auth_b_1.verifyApiKey)('sk_test_4eC39HqLyjWDarjtT1zdp7dc'), true);
});
(0, node_test_1.test)('clé invalide rejetée', () => {
    node_assert_1.strict.equal((0, vulnerable_auth_b_1.verifyApiKey)('sk_live_wrong'), false);
});
(0, node_test_1.test)('CONTRAT TIMING: longueur différente doit être rejetée sans exception', () => {
    let rejected = false;
    try {
        rejected = !(0, vulnerable_auth_b_1.verifyApiKey)('court');
    }
    catch {
        rejected = false;
    }
    node_assert_1.strict.ok(rejected, 'échec: longueur différente non rejetée proprement');
});
