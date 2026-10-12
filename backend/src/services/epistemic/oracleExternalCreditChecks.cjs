'use strict';

const crypto = require('node:crypto');
const STRATEGIES = new Set(['signed_receipt_chain', 'independent_balance']);

function fail(reason) { return { schema: 'genos.external-credit-oracle/v1', status: 'refuted', reason }; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])]));
  return value;
}
function verify(signed, schema, publicKey) {
  const statement = signed?.statement;
  if (!statement || statement.schema !== schema || typeof signed.signature !== 'string') return false;
  try { return crypto.verify(null, Buffer.from(JSON.stringify(canonical(statement))),
    crypto.createPublicKey(publicKey), Buffer.from(signed.signature, 'base64')); }
  catch (_) { return false; }
}

function checkCredit(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return { schema: 'genos.external-credit-oracle/v1', status: 'inconclusive', reason: 'oracle_strategy_unavailable' };
  if (!validSubject(subject)) return inconclusive();
  if (!receiptSignatureMatches(subject)) return fail('provider_receipt_signature_invalid');
  if (!observationSignaturesMatch(subject)) return fail('provider_observation_signature_invalid');
  const { account, method, lease, receipt, workerObservation, independentObservation } = subject;
  const input = method.parameters;
  const r = receipt.statement;
  const observed = independentObservation.statement;
  const reported = workerObservation.statement;
  if (!scopeMatches(account, [r, observed, reported]) || !receiptMatches(r, input, lease)) return fail(scopeFailure(strategy));
  if (!balanceMatches({ observed, reported, receipt: r, account })) return fail('provider_balance_does_not_match_signed_transfer');
  if (!freshObservations(observed, reported)) return fail('provider_observation_stale');
  if (observed.balance < Math.ceil(observed.capacity * 0.4)) return fail('external_credit_below_functional_bound');
  return { schema: 'genos.external-credit-oracle/v1', status: 'verified', reason: strategy, strategy,
    operationId: input.operationId, balance: observed.balance, accountVersion: observed.accountVersion };
}

function scopeFailure(strategy) {
  return strategy === 'signed_receipt_chain'
    ? 'provider_receipt_scope_or_conservation_invalid' : 'provider_lease_or_receipt_invalid';
}

function inconclusive() { return { schema: 'genos.external-credit-oracle/v1', status: 'inconclusive', reason: 'oracle_subject_invalid' }; }

function validSubject(subject) {
  return !!subject?.account && subject.method?.methodId === 'replenish_external_quota'
    && !!subject.lease && !!subject.method.parameters && !!subject.publicKey;
}

function receiptSignatureMatches(subject) {
  return verify(subject.receipt, 'genos.external-credit-receipt/v1', subject.publicKey);
}

function observationSignaturesMatch(subject) {
  return verify(subject.workerObservation, 'genos.external-credit-observation/v1', subject.publicKey)
    && verify(subject.independentObservation, 'genos.external-credit-observation/v1', subject.publicKey)
}

function scopeMatches(account, statements) {
  return statements.every(item => item.tenantId === account.tenantId && item.missionId === account.missionId
    && item.agentId === account.agentId && item.providerId === 'controlled-credit-provider'
    && item.unit === 'execution_credit');
}

function receiptMatches(receipt, input, lease) {
  return receipt.kind === 'external_refill' && receipt.operationId === input.operationId
    && receipt.operationId === lease.operationId && receipt.amount === input.amount
    && receipt.amount <= lease.maxAmount && receipt.beforeVersion === input.expectedVersion
    && receipt.beforeVersion === lease.expectedVersion && receipt.afterVersion === receipt.beforeVersion + 1
    && receipt.after === receipt.before + receipt.amount && receipt.reserveAfter === receipt.reserveBefore - receipt.amount;
}

function balanceMatches({ observed, reported, receipt, account }) {
  return observed.balance === receipt.after && observed.accountVersion === receipt.afterVersion
    && observed.capacity === account.capacity && reported.balance === receipt.after
    && reported.accountVersion === receipt.afterVersion && reported.capacity === account.capacity;
}

function freshObservations(observed, reported) {
  const times = [Date.parse(observed.observedAt), Date.parse(reported.observedAt)];
  return times.every(value => Number.isFinite(value) && Date.now() - value >= -5000 && Date.now() - value <= 30000);
}

module.exports = { STRATEGIES, checkCredit };
