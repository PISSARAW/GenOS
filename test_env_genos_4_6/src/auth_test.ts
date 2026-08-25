// auth_test.ts - test de sécurité sur verifyApiKey
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { verifyApiKey } from './vulnerable_auth';

test('clé valide acceptée', () => {
  assert.equal(verifyApiKey('sk_test_4eC39HqLyjWDarjtT1zdp7dc'), true);
});

test('clé invalide rejetée', () => {
  assert.equal(verifyApiKey('sk_live_wrong'), false);
});

test('CONTRAT TIMING: longueur différente doit être rejetée sans exception', () => {
  let rejected = false;
  try {
    rejected = !verifyApiKey('court');
  } catch {
    rejected = false;
  }
  assert.ok(rejected, 'échec: longueur différente non rejetée proprement');
});
