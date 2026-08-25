"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CryptoEngine.test.ts - Child_Crypto validation (fonctions <= 5 lignes : syntax_strictness hérité)
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const node_crypto_1 = require("node:crypto");
const CryptoEngine_1 = require("./CryptoEngine");
function fixture(context) {
    const engine = new CryptoEngine_1.CryptoEngine();
    const key = engine.deriveKey((0, node_crypto_1.randomBytes)(32), context);
    return { engine, key, sealed: engine.encryptBatch(key, [Buffer.from('hello genos')]) };
}
function tampered(sealed) {
    sealed.ciphertext[0] ^= 0x01;
    return sealed;
}
(0, node_test_1.test)('roundtrip encrypt/decrypt', () => {
    const fx = fixture('payments-v1');
    const plain = fx.engine.decryptOne(fx.key, fx.sealed[0]);
    node_assert_1.strict.equal(plain.toString(), 'hello genos');
});
(0, node_test_1.test)('tampered ciphertext is rejected by GCM auth tag', () => {
    const fx = fixture('tamper-ctx');
    node_assert_1.strict.throws(() => fx.engine.decryptOne(fx.key, tampered(fx.sealed[0])));
});
function makePayloads() {
    return Array.from({ length: 5000 }, () => (0, node_crypto_1.randomBytes)(256));
}
function benchEncrypt(key) {
    const t0 = process.hrtime.bigint();
    new CryptoEngine_1.CryptoEngine().encryptBatch(key, makePayloads());
    return Number(process.hrtime.bigint() - t0) / 1e6;
}
(0, node_test_1.test)('batch throughput (performance trait)', () => {
    const fx = fixture('bench');
    const ms = benchEncrypt(fx.key);
    console.log(`BATCH: 5000 x 256B encrypted in ${ms.toFixed(1)} ms (${(5000 / ms).toFixed(0)} ops/ms)`);
});
