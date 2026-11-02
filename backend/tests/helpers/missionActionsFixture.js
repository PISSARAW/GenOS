'use strict';

const crypto = require('node:crypto');
const fixture = require('./missionProtocolFixture');
const { SCHEMA, STATUSES } = require('../../src/services/missionOutcomeContract');
const trust = require('../../src/services/missionActionRuntimeTrust');
const KEY = 'mission-action-test-key-0123456789abcdef';
const CONTRACT = { schema: SCHEMA, goal: 'Verify the answer',
  obligations: [{ id: 'answer', statement: 'The answer is correct' }], statuses: [...STATUSES] };

async function create(options = {}) {
  const ctx = await fixture.create();
  const contract = { ...ctx.contractRecord.contract, mission_outcome: CONTRACT };
  const record = { id: 'actions-contract', version: 2, contract };
  await ctx.db.run('INSERT INTO strategy_contracts VALUES (?,?,?,?,?)', record.id, ctx.agentId,
    record.version, JSON.stringify(contract), `sha256:${require('../../src/services/biologicalIntegrity').digest(contract)}`);
  ctx.executionRun = await require('../../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: ctx.agentId, contractRecord: record, missionId: ctx.normalizedMission.missionId,
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
  ctx.contractRecord = record; ctx.runtimeBudget = ctx.executionRun.budget;
  if (options.sealed !== false) await require('../../src/services/missionEnvelopeAuthority').seal(ctx);
  return ctx;
}

function action() {
  return { id: 'bounded-gate', kind: 'tool', covers: ['answer'], requiredEvidenceRefs: ['proof:holdout-1'],
    cost: { execution: { tokens: 2, usd: 0, latencyMs: 5 }, verification: { tokens: 1, usd: 0, latencyMs: 5 }, maxRetries: 0 },
    execution: { primitive: 'uncertainty_gate', args: { uncertainty: 0.2, threshold: 0.5 } },
    calibrationReceipt: { probabilityVerified: { min: 0.8, max: 0.9 }, evidenceRefs: ['proof:holdout-1'],
      issuer: 'local-test', validUntil: new Date(Date.now() + 60000).toISOString() } };
}

function signed(ctx, candidate) {
  const payload = trust.attestationPayload({ runId: ctx.executionRun.id,
    missionId: ctx.normalizedMission.missionId, contract: CONTRACT, action: candidate });
  candidate.calibrationReceipt.signature = `sha256:${crypto.createHmac('sha256', KEY).update(payload).digest('hex')}`;
  return candidate;
}

function request(ctx, mode, candidate) {
  return { executionRunId: ctx.executionRun.id, agentId: ctx.agentId, missionId: ctx.normalizedMission.missionId,
    decision: { mode, actions: [candidate], policy: { weights: { tokens: 1, usd: 0, latencyMs: 0 } } } };
}

module.exports = { KEY, CONTRACT, create, action, signed, request };
