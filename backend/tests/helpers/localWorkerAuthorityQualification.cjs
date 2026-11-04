'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { digest } = require('../../src/services/trinityProvenanceValues');
const authority = require('../../src/services/missionEnvelopeAuthority');
const state = require('../../src/services/missionEnvelopeAuthorityState');

const LATENCY_MS = 180000;
const RESPONSE_DELAY_MS = 65000;
const PROTECTED_RESERVE_MS = Math.floor(LATENCY_MS / 20);

function budget() {
  return { tokens: 10000, costUsd: 1, latencyMs: LATENCY_MS, events: 100 };
}

function captureAuthorities() {
  const db = new Database(process.env.GENOS_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return ['delegation-root', 'delegation-sub', 'protocol-local-worker'].map(agentId => {
      const run = db.prepare('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1').get(agentId);
      const row = db.prepare('SELECT payload_json FROM gvx_development_events WHERE id=?').get(`gvx-run:${run.id}:authority`);
      const envelope = JSON.parse(row.payload_json).envelope;
      return { agentId, runId: run.id, hash: digest(envelope),
        issuedAt: envelope.issuedAt, expiresAt: envelope.expiresAt };
    });
  } finally { db.close(); }
}

function respond(response, input) {
  const observed = { authorities: captureAuthorities(), delayMs: RESPONSE_DELAY_MS };
  input.observations.push(observed);
  const started = process.hrtime.bigint();
  const timer = setTimeout(() => {
    observed.elapsedMs = Number(process.hrtime.bigint() - started) / 1000000;
    observed.respondedAt = new Date().toISOString();
    response.end(input.body);
  }, RESPONSE_DELAY_MS);
  response.once('close', () => clearTimeout(timer));
}

async function assertUnchangedAndLive(db, observed) {
  const sealed = await authority.read(db, observed.runId);
  assert.equal(sealed.hash, observed.hash, 'Execution authority must not be renewed while awaiting inference');
  await state.assertCurrent(db, sealed.envelope);
  await assert.rejects(state.assertCurrent(db, sealed.envelope, Date.parse(observed.expiresAt)),
    { code: 'EXECUTION_AUTHORITY_EXPIRED' });
  return sealed;
}

async function qualify(db, input) {
  assert.equal(input.observations.length, 1, 'Exactly one controlled model response is expected');
  const observed = input.observations[0];
  assert.ok(observed.elapsedMs >= RESPONSE_DELAY_MS, 'The controlled provider must really wait beyond the former minute budget');
  for (const native of observed.authorities) await assertUnchangedAndLive(db, native);
  const native = observed.authorities.find(item => item.agentId === 'protocol-local-worker');
  assert.equal(native.runId, input.run.id);
  const sealed = await authority.read(db, native.runId);
  assert.equal(sealed.envelope.limits.latencyMs, LATENCY_MS);
  assert.equal(sealed.envelope.limits.tokens, 10000);
  assert.equal(sealed.envelope.limits.events, 100);
  const span = Date.parse(native.expiresAt) - Date.parse(native.issuedAt);
  assert.ok(span >= LATENCY_MS - PROTECTED_RESERVE_MS && span < LATENCY_MS,
    'The sealed window must preserve the protected reserve within the declared total');
  const finished = Date.parse(input.run.completed_at);
  assert.ok(Number.isFinite(finished), 'The terminal observation must be persisted');
  assert.ok(finished < Date.parse(native.expiresAt), 'The worker must publish before its original sealed deadline');
  console.log(JSON.stringify({ qualification: 'local-worker-authority',
    budgetMs: LATENCY_MS, reserveMs: PROTECTED_RESERVE_MS,
    providerDelayMs: observed.elapsedMs, respondedAt: observed.respondedAt,
    completedAt: input.run.completed_at, authorities: observed.authorities,
    authorityRenewed: false, expiryStillRefused: true, promotionAllowed: false }));
}

module.exports = { budget, respond, qualify, LATENCY_MS, PROTECTED_RESERVE_MS };
