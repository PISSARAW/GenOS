'use strict';

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const workspace = require('../../src/services/globalWorkspaceService');
const adapter = require('../../src/services/agow/candidates/candidateAdapterService');
const pool = require('../../src/services/agow/candidatePoolService');
const bridge = require('../../src/services/agow/missionObservationRuntimeBridge');

async function database(filename = ':memory:') {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS adaptive_state(scope TEXT, key TEXT, payload_json TEXT,
      version INTEGER, updated_at TEXT, PRIMARY KEY(scope,key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events(scope TEXT, key TEXT,
      event_type TEXT, event_payload TEXT, created_at TEXT);`);
  return db;
}

async function mission(db, suffix = 'one') {
  const agentId = `mission-agent-${suffix}`;
  const missionId = `mission-${suffix}`;
  const candidate = adapter.build({ agentId, module: 'perception', observation: {
    candidateId: `candidate-${suffix}`, confidence: 0.99, goalMatched: true, actionable: true,
    evidenceRefs: ['input-fixture'], causalEvidence: true } });
  const admitted = await pool.submit({ candidate, db });
  if (!admitted.accepted) throw new Error(admitted.reason);
  const cycle = await workspace.cycle({ db, agentId, activeGoal: missionId,
    receivers: [], skipTransport: true, ignitionThreshold: 0.1, modeCosts: { ACT: 0 } });
  const ctx = { db, agentId, normalizedMission: { missionId }, executionRun: { id: `run-${suffix}` },
    agow: { accepted: true, activation: 'bounded', candidateId: candidate.candidateId,
      frame: cycle.frame, modeReceipt: cycle.modeReceipt } };
  const record = await bridge.start(ctx);
  const event = { eventId: `terminal-${suffix}`, eventType: 'AGENT_COMPLETED', agentId,
    payload: { executionRunId: ctx.executionRun.id, missionId, success: true } };
  return { ctx, cycle, record, event };
}

function verified(input, overrides = {}) {
  return { verified: true, verifierId: 'test-oracle', bindingHash: input.binding.bindingHash,
    eventDigest: input.eventIdentity.eventDigest, evidenceRefs: ['sha256:fixture-proof'],
    metrics: { realizedLoss: 0.2, goalProgress: 0.8, resourceReserve: null,
      missionStability: null, blockageEvents: null, viabilityViolations: null }, ...overrides };
}

module.exports = { database, mission, verified };
