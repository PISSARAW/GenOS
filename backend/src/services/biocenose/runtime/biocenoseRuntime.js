'use strict';

const communityStore = require('../communityStore');
const controller = require('./communityController');
const protocolHandlers = require('./protocolHandlers');
const ecologicalController = require('./ecologicalController');
const { createHash } = require('crypto');
const variantPolicies = require('../variants/variantPolicyRouter');

async function runRound(input) {
  const prepared = await prepareRound(input);
  const { constitution, variantPolicy, handlers, modelExecutionByMember, recordModelExecution } = prepared;
  let session = prepared.session;
  let result;
  do {
    result = await executeRound({ input, session, constitution, variantPolicy,
      handlers, modelExecutionByMember, recordModelExecution });
    if (result.status !== 'IN_PROGRESS') return completeRound({ input, session, result, variantPolicy });
    session = await communityStore.loadSession(input.db, input.communityId);
    if (session.round + 1 >= constitution.roundLimit) {
      return completeRound({ input, session, result, variantPolicy, roundLimitReached: true });
    }
    session = await advanceRound(input, session);
  } while (true);
}

async function prepareRound(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  const record = await communityStore.latestConstitution(input.db, input.communityId);
  if (!record) throw Object.assign(new Error('Biocenose constitution is missing.'), { code: 'BIOCENOSE_CONSTITUTION_UNKNOWN' });
  const constitution = record.constitution;
  const variantPolicy = variantPolicies.select(constitution.variant);
  if (input.variant && variantPolicies.select(input.variant).name !== variantPolicy.name) {
    throw Object.assign(new Error('The selected Biocenose variant differs from the committed constitution.'), {
      code: 'BIOCENOSE_VARIANT_CONSTITUTION_MISMATCH'
    });
  }
  variantPolicies.assertCompatible(variantPolicy, constitution.questionType);
  const handlers = { ...protocolHandlers.createHandlers({ ...input, variantPolicy }), ...(input.handlers || {}) };
  const modelExecutionByMember = new Map();
  return { session, constitution, variantPolicy, handlers, modelExecutionByMember,
    recordModelExecution: modelObserver(input, modelExecutionByMember) };
}

function modelObserver(input, modelExecutionByMember) {
  return async (observation) => {
    if (!observation.memberId || !observation.provider) return;
    modelExecutionByMember.set(observation.memberId, observation);
    await communityStore.appendEvent(input.db, {
      communityId: input.communityId, actorId: input.actorId,
      type: 'MODEL_PROVIDER_OBSERVED',
      payload: { memberId: observation.memberId, provider: observation.provider, model: observation.model || null }, patch: {}
    });
  };
}

async function executeRound(context) {
  const { input, session, constitution, variantPolicy, handlers, modelExecutionByMember, recordModelExecution } = context;
  try {
    return await controller.runRound({ session, constitution, handlers,
      context: { db: input.db, communityId: input.communityId, session, constitution,
        variantPolicy, modelExecutionByMember, recordModelExecution },
      onStepComplete: (step) => recordStep(input, step) });
  } catch (error) {
    await recordBlockedStep(input, error);
    throw error;
  }
}

function advanceRound(input, session) {
  return communityStore.appendEvent(input.db, {
    communityId: input.communityId, actorId: input.actorId,
    type: 'PHASE_CHANGED', payload: { from: session.phase, to: 'SEALED_JUDGMENT', reason: 'CONTINUE_DELIBERATION' },
    patch: { phase: 'SEALED_JUDGMENT', round: session.round + 1 }
  });
}

async function completeRound(context) {
  const { input, session, result, variantPolicy } = context;
  const decision = ecologicalController.evaluate({
    communityId: input.communityId, round: result.round, session,
    receipts: result.receipts, variantPolicy, executionNeeded: input.executionNeeded,
    roundLimitReached: context.roundLimitReached === true
  });
  await communityStore.appendEvent(input.db, {
    communityId: input.communityId, actorId: input.actorId,
    type: 'ECOLOGICAL_CONTROL_DECISION', payload: decision, patch: {}
  });
  return { ...result, ecologicalDecision: decision, followUpStatus: followUpStatus(decision) };
}

function followUpStatus(decision) {
  if (decision.nextAction === 'HANDOFF_HUMAN_REVIEW') return 'WAITING_FOR_HUMAN';
  if (decision.observation?.judgmentStatus !== 'DECIDED') return 'REVIEW_REQUIRED';
  if (decision.nextAction !== 'NO_FURTHER_ACTION') return 'ACTION_REQUIRED';
  return 'DECISION_RECORDED';
}

async function recordStep(input, step) {
  const resultHash = createHash('sha256').update(JSON.stringify(step.result)).digest('hex');
  return communityStore.appendEvent(input.db, {
    communityId: input.communityId, type: 'DELIBERATION_STEP_COMPLETED',
    payload: { step: step.step, resultHash }, patch: {}
  });
}

async function recordBlockedStep(input, error) {
  if (error.code !== 'BIOCENOSE_RUNTIME_STEP_BLOCKED') return;
  return communityStore.appendEvent(input.db, {
    communityId: input.communityId, type: 'DELIBERATION_STEP_BLOCKED',
    payload: error.details, patch: {}
  });
}

module.exports = { runRound, followUpStatus };
