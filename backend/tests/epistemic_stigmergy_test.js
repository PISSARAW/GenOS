'use strict';

const assert = require('node:assert');
const S = require('../src/services/epistemic/epistemicStigmergyService');

// ---- types connus ----

assert.ok(Array.isArray(S.PHEROMONE_TYPES));
assert.ok(S.PHEROMONE_TYPES.includes('CLAIM_CONTRADICTION'));
assert.ok(S.PHEROMONE_TYPES.includes('EVIDENCE_FAILURE'));

// ---- création phéromone ----

const p = S.createPheromone('CLAIM_CONTRADICTION', { claimId: 'C1', weight: 0.8 });
assert.ok(p.id);
assert.strictEqual(p.type, 'CLAIM_CONTRADICTION');
assert.strictEqual(p.payload.claimId, 'C1');
assert.strictEqual(p.payload.weight, 0.8);
assert.ok(p.createdAt);

// ---- environnement ----

const env = S.pheromoneEnv();
assert.ok(Array.isArray(env.pheromones));
assert.ok(env.subscribers instanceof Map);

// ---- deposit / subscribe / broadcast ----

let received = null;
S.subscribe(env, 'CLAIM_CONTRADICTION', (pheromone) => { received = pheromone; });

const p2 = S.createPheromone('CLAIM_CONTRADICTION', { claimId: 'C2' });
S.broadcast(env, p2);

assert.ok(received);
assert.strictEqual(received.id, p2.id);
assert.strictEqual(received.payload.claimId, 'C2');

// ---- detectRelevant ----

const env2 = S.pheromoneEnv();
S.deposit(env2, S.createPheromone('VERIFIER_SUCCESS', { verifier: 'A' }, { locus: 'auth' }));
S.deposit(env2, S.createPheromone('VERIFIER_FAILURE', { verifier: 'B' }, { locus: 'auth' }));
S.deposit(env2, S.createPheromone('DOMAIN_GAP', { domain: 'security' }, { locus: 'security' }));

// Filtrer par type de phéromone.
const successOnly = S.detectRelevant(env2, 'VERIFIER_SUCCESS', null);
assert.strictEqual(successOnly.length, 1);

const authOnly = S.detectRelevant(env2, null, 'auth');
assert.strictEqual(authOnly.length, 2);

const all = S.detectRelevant(env2, null, null);
assert.strictEqual(all.length, 3);

// ---- shared environment ----

const shared = S.sharedEpistemicEnvironment({ niche: 'test', locus: 'auth' });
assert.strictEqual(shared.niche, 'test');
assert.strictEqual(shared.locus, 'auth');

S.depositSignal(shared, { type: 'CLAIM_CONTRADICTION', payload: { claimId: 'C3' } });
assert.strictEqual(shared.deposited.length, 1);

const detected = S.detectSignals(shared, 'auth');
assert.ok(detected.length >= 1);
assert.ok(shared.received.length >= 1);

console.log('OK epistemicStigmergyService');
