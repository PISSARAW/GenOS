'use strict';

const assert = require('node:assert');
const { createApoptosisAuthorityBridge } = require('../src/services/epistemic/epistemicApoptosisAuthorityBridge');

/**
 * Mock DB qui simule l'interface sqlite3 (db.get avec params).
 */
function createMockDb(rows = {}) {
  return {
    get: (sql, ...params) => {
      // Simule SELECT * FROM agents WHERE id = ?
      if (sql.includes('WHERE id = ?')) {
        const id = params[0];
        return Promise.resolve(rows[id] || null);
      }
      return Promise.resolve(null);
    },
  };
}

async function run() {
  // Mock DB avec agents pré-chargés.
  const db = createMockDb({
    'agent-1': { id: 'agent-1', name: 'test-agent', status: 'active', role: 'worker', epistemic_dissonance: 0 },
    'agent-2': { id: 'agent-2', name: 'low-dissonance', status: 'active', role: 'worker', epistemic_dissonance: 5 },
    'agent-3': { id: 'agent-3', name: 'to-revoke', status: 'active', role: 'worker', epistemic_dissonance: 20 },
  });

  // Mock de updateAgent.
  let updateAgentCalls = [];
  const mockUpdateAgent = async (id, status, task) => {
    updateAgentCalls.push({ id, status, task });
  };
  const B = createApoptosisAuthorityBridge({ updateAgent: mockUpdateAgent });

  // ---- applyEpistemicApoptosis ----

  updateAgentCalls = [];
  const result = await B.applyEpistemicApoptosis(db, 'agent-1', [10, 20, 30]);
  assert.ok(result.ok);
  assert.strictEqual(result.status, 'apoptotique');
  assert.strictEqual(result.dissonance, 60);
  assert.ok(result.autopsy);
  assert.ok(updateAgentCalls.some((c) => c.id === 'agent-1' && c.status === 'apoptotique'));

  // Agent inexistant.
  const notFound = await B.applyEpistemicApoptosis(db, 'agent-999', [10]);
  assert.strictEqual(notFound.ok, false);
  assert.strictEqual(notFound.reason, 'agent_not_found');

  // Agent sous le seuil.
  const below = await B.applyEpistemicApoptosis(db, 'agent-2', [1, 2]);
  assert.strictEqual(below.ok, false);
  assert.strictEqual(below.reason, 'below_threshold');

  // ---- revokeAuthority ----

  updateAgentCalls = [];
  const revoked = await B.revokeAuthority(db, 'agent-3', { level: 'quarantine', reason: 'dissonance élevée' });
  assert.ok(revoked.ok);
  assert.strictEqual(revoked.newStatus, 'quarantined');
  assert.ok(updateAgentCalls.some((c) => c.id === 'agent-3' && c.status === 'quarantined'));

  updateAgentCalls = [];
  const restricted = await B.revokeAuthority(db, 'agent-3', { level: 'reduced_authority', reason: 'dissonance modérée' });
  assert.ok(restricted.ok);
  assert.strictEqual(restricted.newStatus, 'restricted');
  assert.ok(updateAgentCalls.some((c) => c.id === 'agent-3' && c.status === 'restricted'));

  // ---- revokeIfDissonant ----

  updateAgentCalls = [];
  const shouldRevoke = await B.revokeIfDissonant(db, 'agent-3', 35);
  assert.ok(shouldRevoke.ok);
  assert.strictEqual(shouldRevoke.newStatus, 'quarantined');

  const noRevoke = await B.revokeIfDissonant(db, 'agent-3', 10);
  assert.strictEqual(noRevoke.ok, false);
  assert.strictEqual(noRevoke.reason, 'no_revocation_needed');

  console.log('OK epistemicApoptosisAuthorityBridge');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
