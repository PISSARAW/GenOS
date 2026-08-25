// CryptoEngine.test.ts - Child_Crypto validation (fonctions <= 5 lignes : syntax_strictness hérité)
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';

import { CryptoEngine } from './CryptoEngine';
import type { CipherResult } from './CryptoEngine';

interface Fixture { readonly engine: CryptoEngine; readonly key: Buffer; readonly sealed: CipherResult[]; }

function fixture(context: string): Fixture {
  const engine = new CryptoEngine();
  const key = engine.deriveKey(randomBytes(32), context);
  return { engine, key, sealed: engine.encryptBatch(key, [Buffer.from('hello genos')]) };
}

function tampered(sealed: CipherResult): CipherResult {
  sealed.ciphertext[0] ^= 0x01;
  return sealed;
}

test('roundtrip encrypt/decrypt', () => {
  const fx = fixture('payments-v1');
  const plain = fx.engine.decryptOne(fx.key, fx.sealed[0]);
  assert.equal(plain.toString(), 'hello genos');
});

test('tampered ciphertext is rejected by GCM auth tag', () => {
  const fx = fixture('tamper-ctx');
  assert.throws(() => fx.engine.decryptOne(fx.key, tampered(fx.sealed[0])));
});

function makePayloads(): Buffer[] {
  return Array.from({ length: 5000 }, () => randomBytes(256));
}

function benchEncrypt(key: Buffer): number {
  const t0 = process.hrtime.bigint();
  new CryptoEngine().encryptBatch(key, makePayloads());
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

test('batch throughput (performance trait)', () => {
  const fx = fixture('bench');
  const ms = benchEncrypt(fx.key);
  console.log(`BATCH: 5000 x 256B encrypted in ${ms.toFixed(1)} ms (${(5000 / ms).toFixed(0)} ops/ms)`);
});
