'use strict';

const communityStore = require('../communityStore');
const controller = require('./communityController');
const protocolHandlers = require('./protocolHandlers');
const ecologicalController = require('./ecologicalController');
const { createHash } = require('crypto');
const variantPolicies = require('../variants/variantPolicyRouter');

async function runRound(input) {
  let session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  const constitution = await communityStore.latestConstitution(input.db, input.communityId);
  if (!constitution) throw Object.assign(new Error('Biocenose constitution is missing.'), { code: 'BIOCENOSE_CONSTITUTION_UNKNOWN' });
  const variantPolicy = variantPolicies.select(constitution.constitution.variant);
  if (input.variant && variantPolicies.select(input.variant).name !== variantPolicy.name) {
    throw Object.assign(new Error('The selected Biocenose variant differs from the committed constitution.'), {
      code: 'BIOCENOSE_VARIANT_CONSTITUTION_MISMATCH'
    });
  }
  variantPolicies.assertCompatible(variantPolicy, constitution.constitution.questionType);
  const handlers = { ...protocolHandlers.createHandlers({ ...input, variantPolicy }), ...(input.handlers || {}) };
  let result;
  do {
    try {
      result = await controller.runRound({
      session, constitution: constitution.constitution,
      handlers,
      context: { db: input.db, communityId: input.communityId, session, constitution: constitution.constitution, variantPolicy },
      onStepComplete: (step) => recordStep(input, step)
      });
    } catch (error) {
      await recordBlockedStep(input, error);
      throw error;
    }
    if (result.status !== 'IN_PROGRESS') return await completeRound({ input, session, result, variantPolicy });
    session = await communityStore.loadSession(input.db, input.communityId);
    if (session.round + 1 >= constitution.constitution.roundLimit) {
      return completeRound({ input, session, result, variantPolicy, roundLimitReached: true });
    }
    session = await communityStore.appendEvent(input.db, {
      communityId: input.communityId, actorId: input.actorId,
      type: 'PHASE_CHANGED', payload: { from: session.phase, to: 'SEALED_JUDGMENT', reason: 'CONTINUE_DELIBERATION' },
      patch: { phase: 'SEALED_JUDGMENT', round: session.round + 1 }
    });
  } while (true);
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
  return { ...result, ecologicalDecision: decision };
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

module.exports = { runRound };
