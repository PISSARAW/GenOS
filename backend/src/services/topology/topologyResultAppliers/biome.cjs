'use strict';

const biome = require('../../biomeCoordinationService');
const workers = require('./biomeWorkerEvidence.cjs');
const oracle = require('../../biome/contracts/goalVerificationReceipt');

function blocked(reason) {
  return { applied: false, status: 'BLOCKED', reason, mode: 'biome' };
}

async function apply(input = {}) {
  const { db, context, composition, accepted = [], topology } = input;
  const issue = precondition(input);
  if (issue) return blocked(issue);
  const records = await workers.load(db, { missionId: context.missionId,
    sessionId: topology.sessionId, members: accepted });
  if (!records) return blocked('BIOME_VERIFIED_WORKER_EVIDENCE_REQUIRED');
  const runtime = await biome.BiomeRuntime.restore(topology.sessionId, null, db);
  if (runtime.stopCondition === 'goal_achieved') return { applied: true, status: 'APPLIED', sessionId: runtime.sessionId };
  if (runtime.tick > 0) return blocked('BIOME_DISPATCH_SESSION_ALREADY_ADVANCED');
  const evidenceRefs = records.map(record => record.reference);
  await runtime.step({ individuals: records.map(workers.individual), evidenceRefs,
    environmentPatch: { opportunities: records.map(workers.opportunity) },
    garageCapacity: records.length });
  runtime.options.missionId = context.missionId;
  runtime.options.producerId = context.missionId;
  runtime.options.verifyGoal = verifier({ db, context, topology, accepted, evidenceRefs });
  const measured = workers.measurements(records, runtime.ecology);
  const result = await runtime.step({ ...measured, evidenceRefs, garageCapacity: records.length });
  return result.goalVerification?.verified === true
    ? { applied: true, status: 'APPLIED', sessionId: runtime.sessionId, tick: result.tick, evidenceRefs }
    : blocked('BIOME_GOAL_ORACLE_UNVERIFIED');
}

function precondition(input) {
  if (!input.db || !input.context?.missionId || !input.topology?.sessionId) return 'BIOME_COMPLETION_SCOPE_REQUIRED';
  return rosterIssue(input);
}

function rosterIssue(input) {
  const expected = (input.composition?.members || []).filter(member => member.executionMode !== 'orchestrator');
  const accepted = input.accepted || [];
  if (!expected.length || expected.length !== accepted.length
      || (input.context.dispatchFailures || []).length) return 'BIOME_REQUIRED_WORKERS_INCOMPLETE';
  const roles = new Set(accepted.map(member => member.role));
  return expected.every(member => roles.has(member.role)) ? null : 'BIOME_REQUIRED_WORKERS_INCOMPLETE';
}

function verifier(input) {
  return async request => {
    const current = await workers.load(input.db, { missionId: input.context.missionId,
      sessionId: input.topology.sessionId, members: input.accepted });
    if (!current || current.some((record, index) => record.reference !== input.evidenceRefs[index])) return { verified: false };
    return { sessionId: request.sessionId, tick: request.tick, verified: true,
      evidenceRefs: input.evidenceRefs, oracleReceipt: oracle.issue({ ...request,
        health: request.measurements.health, verified: true,
        stopCondition: 'goal_achieved', status: 'completed' }) };
  };
}

module.exports = { apply };
