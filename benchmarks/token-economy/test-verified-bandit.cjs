'use strict';

const assert = require('node:assert/strict');
const bandit = require('../../backend/src/services/routingBanditService');
const { attachAssemblyStore, verifiedObservation } = require('./verified-bandit-fixture.cjs');

function memoryDb() {
  const values = new Map();
  const db = {
    get: async (sql, scope, key) => values.has(`${scope}|${key}`)
      ? { payload_json: values.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (sql, ...params) => {
      const [scope, key, payload] = params;
      if (String(sql).startsWith('INSERT OR REPLACE INTO adaptive_state')) {
        values.set(`${scope}|${key}`, payload);
      }
    }
  };
  return { db, assemblies: attachAssemblyStore(db) };
}

async function rejectsForgedAndReplayedEvidence() {
  const { db, assemblies } = memoryDb();
  const base = { routeUri: 'good://model', success: true, costUsd: 0.01,
    latencyMs: 250, promptTokens: 100 };
  assert.equal(await bandit.observe(db, { ...base, verification: {
    status: 'verified', success: true, evidenceRef: 'self:claim' } }), null);
  const valid = await verifiedObservation(db, base);
  assert.equal(await bandit.observe(db, { ...valid, missionId: 'other-mission' }), null);
  assert.equal(await bandit.observe(db, { ...valid, routeAttemptId: 'other-attempt' }), null);
  assert.equal(await bandit.observe(db, { ...valid, routeUri: 'bad://model' }), null);
  assert.equal(await bandit.observe(db, { ...valid, success: false }), null);
  assert.equal(await bandit.observe(db, valid).then((result) => result.pulls), 1);
  assert.equal(await bandit.observe(db, valid), null);
  const duplicate = await verifiedObservation(db, { ...base,
    missionId: valid.missionId, routeAttemptId: valid.routeAttemptId });
  assert.equal(await bandit.observe(db, duplicate), null);
  const tampered = await verifiedObservation(db, base);
  assemblies.get(tampered.verification.assemblyId).signature = '0'.repeat(64);
  assert.equal(await bandit.observe(db, tampered), null);
  assert.equal((await bandit.report(db)).arms[0].pulls, 1);
}

async function qualifiesHeldOutMissions() {
  const { db, assemblies } = memoryDb();
  for (let index = 0; index < 30; index++) {
    const data = await verifiedObservation(db, { missionId: `mission-${index}`,
      routeUri: index % 2 ? 'bad://model' : 'good://model', success: index % 2 === 0,
      costUsd: index % 2 ? 0.2 : 0.01, latencyMs: 500, promptTokens: 500 });
    assert.ok(await bandit.observe(db, data));
  }
  const measured = await bandit.evaluateLoggedHoldout(db);
  assert.equal(measured.status, 'measured');
  assert.equal(measured.trainMissions, 21);
  assert.equal(measured.holdoutMissions, 9);
  const state = await db.get('SELECT payload_json FROM adaptive_state WHERE scope = ? AND key = ?',
    'routing_bandit_verified_v3', 'linucb');
  const latest = JSON.parse(state.payload_json).observations.at(-1);
  assemblies.get(latest.verification.assemblyId).signature = '0'.repeat(64);
  assert.equal((await bandit.evaluateLoggedHoldout(db)).n, 29);
  assert.equal(bandit.parseUsageRow({ metadata_json: JSON.stringify({
    verification: { status: 'verified', evidenceRef: 'self:claim' } }) }), null);
}

async function run() {
  await rejectsForgedAndReplayedEvidence();
  await qualifiesHeldOutMissions();
  console.log('Verified bandit learning and mission holdout: passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
