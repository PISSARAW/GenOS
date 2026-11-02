'use strict';

const path = require('node:path');
const { digest } = require('../evidenceProtocol/canonical');
const proofBinding = require('../cognitiveOmegaProofBinding');
const { runKey } = require('../omegaProtocol/executionStore');
const { EffectGate } = require('../omegaProtocol/effects');
const { OmegaEffectResource } = require('../omegaProtocol/resource');
const p = require('./omegaProgram');
const messages = require('./omegaMessages');

async function verify(session, request) {
  await session.assertFresh();
  if (request.kind !== 'EMIT' || request.reference !== p.EMITTER || request.resourceId !== p.EMITTER || request.action !== 'set' || request.cost !== 1) {
    throw new Error('MISSION_OMEGA_EFFECT_NOT_INSTALLED');
  }
  const plan = session.accepted.plan;
  const fields = ['planId', 'programDigest', 'capabilitiesDigest', 'policyDigest', 'baseDigest', 'environmentDigest',
    'runtimeId', 'runtimeGeneration', 'budget'];
  if (request.planDigest !== digest(plan) || fields.some(field => digest(request[field]) !== digest(plan[field]))) {
    throw new Error('MISSION_OMEGA_EFFECT_PLAN_CHANGED');
  }
  const operation = session.program.operations.find(value => value.id === request.stepId);
  if (!operation?.dependsOn.length) throw new Error('MISSION_OMEGA_CHECK_REQUIRED');
  for (const id of operation.dependsOn) await check(session, { id, request, primary: id === operation.dependsOn[0] });
  await session.assertFresh();
  return { status: 'validated', requestDigest: digest(request),
    receiptDigest: digest({ profile: 'mission.omega.evidence/v1', request, checkpoint: session.accepted.plan.baseDigest }) };
}

async function check(session, input) {
  const { id, request } = input;
  const operation = session.program.operations.find(value => value.id === id);
  if (operation?.kind !== 'CHECK') throw new Error('MISSION_OMEGA_DIRECT_CHECK_DEPENDENCY_REQUIRED');
  const row = session.execution.store.db.prepare(`SELECT result_json FROM cognitive_omega_operations
    WHERE run_id=? AND operation_id=? AND status='completed'`).get(runKey(session.executionQuery), id);
  const saved = row && JSON.parse(row.result_json);
  if (!saved || saved.proofDigest !== proofBinding.digest(request.candidate)) throw new Error('MISSION_OMEGA_CANDIDATE_NOT_CHECKED');
  if (!proofBinding.verified(saved.receipt)) throw new Error('MISSION_OMEGA_CHECK_RECEIPT_MISMATCH');
  if (input.primary && digest(saved.receipt) !== digest(request.proofReceipt)) throw new Error('MISSION_OMEGA_CHECK_RECEIPT_MISMATCH');
  const checker = session.handlers.find(value => value.kind === 'CHECK' && value.reference === operation.reference);
  const receipt = await checker.handle({ request: session.program.payload.requests[id], candidate: p.copy(request.candidate),
    input: null, context: { scope: session.binding.scope, missionId: session.binding.missionId, runId: session.runId,
      plan: session.accepted.plan } });
  if (!proofBinding.verified(receipt)) throw new Error('MISSION_OMEGA_CANDIDATE_RECHECK_FAILED');
}

async function create(session) {
  const resource = new OmegaEffectResource({ dbPath: path.join(session.binding.directory, 'omega-resource.sqlite'),
    authorize: input => messages.authorize(session, input), verifyEvidence: request => verify(session, request) });
  session.closers.push(resource);
  if (!resource.authority(session.binding.scope)) await resource.bootstrap({ scope: session.binding.scope,
    actor: session.binding.actor, authority: session.binding.authority,
    budget: { unit: 'operations', limit: 1, spent: 0, reserved: 0 },
    permissions: [{ resourceId: p.EMITTER, reference: p.EMITTER, action: 'set', cost: 1 }] });
  const authority = resource.authority(session.binding.scope);
  if (digest(authority.actor) !== digest(session.binding.actor) || digest(authority.authority) !== digest(session.binding.authority)
    || authority.budget.unit !== 'operations' || authority.budget.limit !== 1 || authority.budget.reserved !== 0) {
    throw new Error('MISSION_OMEGA_RESOURCE_AUTHORITY_CHANGED');
  }
  const gate = new EffectGate({ dbPath: path.join(session.binding.directory, `oe-${session.key.slice(0, 24)}.db`),
    authorize: input => messages.authorize(session, input), verifyEvidence: request => verify(session, request),
    dispatch: request => resource.execute(request), reconcile: request => resource.reconcile(request) });
  session.closers.push(gate);
  session.resource = resource; session.effectGate = gate;
  return resource.authority(session.binding.scope).budget;
}

async function reconcile(session) {
  if (!session.effectGate) return;
  const states = session.effectGate.store.db.prepare('SELECT state FROM omega_effect_intents').all();
  for (const row of states) {
    const state = JSON.parse(row.state);
    if (['dispatching', 'effect_outcome_unknown'].includes(state.status)) {
      await session.effectGate.reconcileEffect({ effectKey: state.request.effectKey });
    }
  }
}

module.exports = { create, verify, reconcile };
