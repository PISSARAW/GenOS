'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { mergeClaims, calibrate, replaceClaims } = require('../src/services/agentGitService/epistemicClaimMerge.cjs');

function row(id, statement, evidence) {
  return { id, subject: 'release', producer_agent_id: 'agent-a', organization_id: 'org',
    project_id: 'project', status: 'active', revision: 1,
    claim_json: JSON.stringify({ id, type: 'factual', subject: 'release', statement,
      confidence: 0.99, evidence }) };
}

async function main() {
  const observed = { kind: 'observation', what: 'observed' };
  const tested = { kind: 'test_result', result: 'passed' };
  const base = row('claim-1', 'safe', [observed]);
  const left = row('claim-1', 'safe', [observed, tested]);
  const right = row('claim-1', 'safe', [tested]);
  const merged = mergeClaims({ base: [base], left: [left], right: [right],
    leftObjectId: 'left', rightObjectId: 'right' });
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.contradictions.length, 0);
  assert.equal(JSON.parse(merged.claims[0].claim_json).evidence.length, 2);
  assert.equal(JSON.parse(merged.claims[0].claim_json).confidence, undefined);
  assert.equal(merged.claims[0].quality, calibrate(left).quality);
  const divergent = mergeClaims({ base: [base], left: [left],
    right: [row('claim-1', 'unsafe', [tested])] });
  assert.equal(divergent.claims.length, 0);
  assert.equal(divergent.contradictions[0].status, 'unresolved');
  const differentIds = mergeClaims({ base: [], left: [base],
    right: [row('claim-2', 'unsafe', [tested])] });
  assert.equal(differentIds.claims.every((claim) => claim.status === 'contested'), true);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE epistemic_claims (id TEXT PRIMARY KEY, subject TEXT, claim_json TEXT,
      quality REAL, status TEXT, revision INTEGER, organization_id TEXT, project_id TEXT,
      producer_agent_id TEXT, producer_run_id TEXT, producer_authority_hash TEXT);
      CREATE TABLE epistemic_events (id TEXT PRIMARY KEY, event_type TEXT, payload_json TEXT,
      emitted_at TEXT, fingerprint TEXT UNIQUE, organization_id TEXT, project_id TEXT);`);
    const ctx = { db, req: { tenant: { organizationId: 'org', projectId: 'project' } },
      targetAgentId: 'agent-a', state: { epistemicClaims: differentIds.claims,
        epistemicContradictions: differentIds.contradictions } };
    await replaceClaims(ctx);
    assert.equal((await db.get("SELECT status FROM epistemic_claims WHERE id = 'claim-1'")).status, 'contested');
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM epistemic_events')).count, 1);
    await assert.rejects(replaceClaims({ ...ctx, state: { epistemicClaims: [
      { ...base, producer_agent_id: 'other-agent' }] } }), /producer/);
  } finally { await db.close(); }
  console.log('AgentGit epistemic claim merge passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
