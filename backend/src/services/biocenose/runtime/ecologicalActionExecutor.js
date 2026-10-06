'use strict';

const communityStore = require('../communityStore');
const { digest } = require('./roundJournal');

async function execute(input, decision) {
  const idempotencyKey = digest([input.communityId, decision.round, decision.nextAction]);
  const events = await communityStore.listEvents(input.db, input.communityId);
  const completed = events.findLast((event) => event.type === 'ECOLOGICAL_ACTION_COMPLETED'
    && event.payload.idempotencyKey === idempotencyKey);
  if (completed) return completed.payload;
  if (decision.nextAction === 'NO_FURTHER_ACTION') return { status: 'NOT_REQUIRED', idempotencyKey };
  const executor = input.actionExecutors?.[decision.nextAction];
  if (typeof executor !== 'function') return { status: 'DEPENDENCY_REQUIRED', action: decision.nextAction, idempotencyKey };
  await record(input, 'ECOLOGICAL_ACTION_STARTED', { action: decision.nextAction, idempotencyKey, round: decision.round });
  try {
    const result = await executor({ communityId: input.communityId, round: decision.round,
      action: decision.nextAction, decision, idempotencyKey });
    if (!validReceipt(result, { input, decision, idempotencyKey })) throw Object.assign(
      new Error('Ecological action did not return a trusted receipt bound to this action.'),
      { code: 'BIOCENOSE_ACTION_UNVERIFIED' }
    );
    const outcome = { status: 'COMPLETED', action: decision.nextAction, round: decision.round,
      idempotencyKey, receipt: result.receipt };
    await record(input, 'ECOLOGICAL_ACTION_COMPLETED', outcome);
    return outcome;
  } catch (error) {
    const blocked = { status: 'BLOCKED', action: decision.nextAction, round: decision.round,
      idempotencyKey, reason: error.code || error.message };
    await record(input, 'ECOLOGICAL_ACTION_BLOCKED', blocked);
    return blocked;
  }
}

function validReceipt(result, context) {
  const receipt = result?.receipt;
  const validator = context.input.isTrustedActionReceipt || context.input.isTrustedReceipt;
  if (result?.status !== 'COMPLETED' || receipt?.status !== 'VERIFIED' || typeof validator !== 'function') return false;
  if (receipt.communityId !== context.input.communityId || receipt.idempotencyKey !== context.idempotencyKey
    || receipt.action !== context.decision.nextAction) return false;
  try { return validator(receipt) === true; } catch (_) { return false; }
}

function record(input, type, payload) {
  return communityStore.appendEvent(input.db, { communityId: input.communityId, actorId: input.actorId,
    type, payload, patch: {} });
}

module.exports = { execute };
