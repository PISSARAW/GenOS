'use strict';

const incarnations = require('./incarnations');
const decisions = require('./decisions');
const { checkedWorkerSelfBlock } = require('../workerIdentityGuardService');

async function begin(db, input) {
  const session = await incarnations.activate(db, { agentId: input.mission.agentId,
    ownerId: `worker:${input.executionRun.id}:${require('crypto').randomUUID()}`, ttlMs: 900000 });
  try {
    const receipt = await decisions.begin(db, { session, operationId: `worker:${input.executionRun.id}`,
      domain: 'worker', dimensions: ['existence', 'continuity', 'characteristics', 'currentState'] });
    if (receipt.result_json) throw Object.assign(new Error('IDENTITY_DECISION_ALREADY_COMPLETED'), { code: 'IDENTITY_DECISION_ALREADY_COMPLETED' });
    return { session, receipt, prompt: await checkedWorkerSelfBlock(db, input.mission) };
  } catch (error) {
    await incarnations.release(db, session);
    throw error;
  }
}

async function renew(db, identity) {
  if (!identity?.session) return null;
  const session = identity.session;
  identity.session = await incarnations.renew(db, session, 900000);
  return identity.session;
}

async function finish(db, input) {
  await decisions.finish(db, { session: input.identity.session,
    operationId: input.identity.receipt.decision_id, success: input.success,
    attribution: 'self', evidenceRef: input.evidenceRef });
  input.identity.finished = true;
  input.identity.receipt = await db.get('SELECT * FROM agent_identity_decisions WHERE decision_id = ?', input.identity.receipt.decision_id);
}


async function release(db, identity) {
  if (identity?.stale) return;
  if (identity) await incarnations.release(db, identity.session);
}

async function fail(db, input) {
  if (!input.identity || input.identity.finished) return;
  try {
    await finish(db, { identity: input.identity, success: false,
      evidenceRef: { executionRunId: input.executionRun.id, failure: input.error.code || 'EXECUTION_FAILED' } });
  } catch (error) {
    if (error.code !== 'IDENTITY_SESSION_STALE') throw error;
    input.identity.stale = true;
  }
}

module.exports = { begin, finish, renew, release, fail };
