'use strict';

const { scopeKey, identifier } = require('./contract');
const ACTIONS = new Set(['INHIBIT_DISPATCH', 'REQUEST_VERIFICATION', 'NOTIFY_OPERATOR', 'INCREASE_MONITORING']);

function validateAuthorization(auth, proposal, now) {
  if (auth?.verdict !== 'ALLOW' || auth.effectId !== proposal.id) return false;
  if (scopeKey(auth.scope) !== scopeKey(proposal.scope)) return false;
  if (!Number.isSafeInteger(auth.expiresAt) || auth.expiresAt <= now) return false;
  identifier(auth.decisionId, 'authorization decisionId');
  return true;
}

function freezeProposal(proposal) {
  Object.freeze(proposal.scope);
  if (proposal.wave) Object.freeze(proposal.wave);
  return Object.freeze(proposal);
}

async function boundedCall(call, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('EFFECT_TIMEOUT')); }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => call(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}

function deadline(adapters) {
  const ms = adapters.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 30000) throw new TypeError('Invalid effect timeout');
  return ms;
}

async function executeClaimed(store, proposal, adapters) {
  const handler = adapters.handlers[proposal.action];
  try {
    await boundedCall(signal => handler(proposal, { signal, idempotencyKey: proposal.id,
      authorizationId: adapters.authorizationId, authorizationExpiresAt: adapters.authorization.expiresAt }), deadline(adapters));
    const outcome = { status: 'EXECUTED_UNVERIFIED', authorizationId: adapters.authorizationId };
    await store.finish(proposal.id, outcome);
    return outcome;
  } catch (_) {
    // Exceptions/timeouts may follow an external effect: never retry automatically.
    const outcome = { status: 'UNCERTAIN', authorizationId: adapters.authorizationId };
    await store.finish(proposal.id, outcome);
    return outcome;
  }
}

async function dispatch(store, request, adapters = {}) {
  const row = await store.effect(request.id, request.scope);
  if (!row) return { status: 'NOT_FOUND' };
  if (row.status !== 'PROPOSED') return { status: row.status };
  const proposal = freezeProposal(JSON.parse(row.body));
  if (adapters.mode !== 'guarded') return { status: 'OBSERVE_ONLY' };
  if (!ACTIONS.has(proposal.action)) return { status: 'DENIED' };
  try { return await authorizeAndDispatch(store, proposal, adapters); }
  catch (_) { return { status: 'DENIED_OR_UNAVAILABLE' }; }
}

async function authorizeAndDispatch(store, proposal, adapters) {
  const now = adapters.clock || Date.now;
  if (now() >= proposal.expiresAt) return { status: 'EXPIRED' };
  if (typeof adapters.authorize !== 'function') return { status: 'DENIED' };
  if (typeof adapters.handlers?.[proposal.action] !== 'function') return { status: 'DENIED' };
  const auth = await boundedCall(() => adapters.authorize(proposal), deadline(adapters));
  if (!validateAuthorization(auth, proposal, now())) return { status: 'DENIED' };
  if (now() >= proposal.expiresAt) return { status: 'EXPIRED' };
  const claimed = await store.claim(proposal.id, proposal.scope);
  if (!claimed) return { status: 'ALREADY_CLAIMED' };
  return finishClaim(store, proposal, { ...adapters, authorization: auth });
}

async function finishClaim(store, proposal, adapters) {
  const now = (adapters.clock || Date.now)();
  if (now >= Math.min(proposal.expiresAt, adapters.authorization.expiresAt)) {
    const outcome = { status: 'EXPIRED', authorizationId: adapters.authorization.decisionId };
    await store.finish(proposal.id, outcome);
    return outcome;
  }
  return executeClaimed(store, proposal, { ...adapters, authorizationId: adapters.authorization.decisionId });
}

module.exports = { dispatch, validateAuthorization };
