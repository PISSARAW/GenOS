'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const v = require('./ackValidation');

const CALLBACKS = Object.freeze({ transport_received: 'observeTransport', decoded: 'verifyDecoded',
  state_applied: 'verifyApplied', action_observed: 'observeAction', independently_verified: 'verifyEvidence', human_authorized: 'verifyHumanApproval' });

function applied(proof, request) {
  const { subject, query } = request;
  const body = { status: 'applied', ...query, contextId: subject.context.contextId, contextDigest: digest(subject.context),
    baseDigest: subject.delta.baseDigest, resultDigest: subject.delta.targetDigest,
    previousGeneration: subject.context.base.generation, generation: subject.context.base.generation + 1,
    appliedMessageId: proof?.appliedMessageId, receiver: subject.receiver };
  if (!Number.isSafeInteger(body.generation)) throw new Error('SYNAPSE ACK applied generation is not representable.');
  v.id(body.appliedMessageId);
  const expected = { ...body, receiptDigest: digest({ profile: 'genos.synapse.state-receipt/v1', ...body }) };
  if (!v.same(proof, expected)) throw new Error('SYNAPSE ACK applied fact requires the exact durable runtime receipt.');
  return 'established';
}

function received(proof, request) {
  v.commonProof(proof, request);
  if (proof.status !== 'received' || !v.HASH.test(proof.sourceReceiptDigest || '')) throw new Error('SYNAPSE ACK transport receipt unavailable.');
  return 'established';
}

function decoded(proof, request) {
  v.commonProof(proof, request);
  if (proof.status !== 'decoded' || proof.contextDigest !== request.subject.delta.contextDigest ||
      proof.operationsDigest !== request.subject.delta.operationsDigest || !v.HASH.test(proof.sourceReceiptDigest || '')) {
    throw new Error('SYNAPSE ACK decoder receipt does not cover this exact context and operation set.');
  }
  return 'established';
}

function observed(proof, request) {
  v.commonProof(proof, request);
  if (proof.status === 'outcome_unknown') return 'outcome_unknown';
  if (proof.status !== 'observed' || proof.subjectDigest !== request.subjectDigest || !v.HASH.test(proof.outcomeDigest || '')) {
    throw new Error('SYNAPSE ACK action observation is not bound to the exact subject.');
  }
  v.id(proof.actionId);
  return 'established';
}

function verified(proof, request) {
  v.commonProof(proof, request);
  const qualifier = request.verificationContext;
  const expected = [request.subjectDigest, qualifier.environmentDigest, qualifier.policy, qualifier.predicateDigest];
  const actual = [proof.subjectDigest, proof.environmentDigest, proof.policy, proof.predicateDigest];
  if (proof.status !== 'verified' || !v.same(expected, actual)) throw new Error('SYNAPSE ACK independent proof qualification mismatch.');
  v.actor(proof.verifier);
  if (v.same(proof.verifier, request.subject.context.publisher)) throw new Error('SYNAPSE ACK producer cannot independently verify its own assertion.');
  const independence = proof.independence;
  v.exact(independence, ['execution', 'provenance', 'method', 'statisticalIndependence']);
  if ([independence.execution, independence.provenance, independence.method].some(value => typeof value !== 'boolean')) {
    throw new Error('SYNAPSE ACK observable independence qualification required.');
  }
  if (independence.statisticalIndependence !== 'not_established' ||
      ![independence.execution, independence.provenance, independence.method].some(Boolean)) {
    throw new Error('SYNAPSE ACK cannot claim unestablished independence.');
  }
  return 'established';
}

function human(proof, request, now) {
  v.commonProof(proof, request);
  if (proof.status !== 'authorized' || proof.subjectDigest !== request.subjectDigest) throw new Error('SYNAPSE ACK human authorization subject mismatch.');
  v.id(proof.approvalId); v.id(proof.humanId);
  v.exact(proof.policy, ['policyId', 'version']); Object.values(proof.policy).forEach(v.id);
  const expires = Date.parse(proof.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) throw new Error('SYNAPSE ACK human authorization expired or invalid.');
  return 'established';
}

function validate(dimension, proof, context) {
  const { request, now } = context;
  const validators = { transport_received: received, decoded, state_applied: applied,
    action_observed: observed, independently_verified: verified, human_authorized: value => human(value, request, now) };
  return validators[dimension](proof, request);
}

function qualification(dimension, proof) {
  const projections = {
    independently_verified: () => ({ verifier: proof.verifier, independence: proof.independence }),
    human_authorized: () => ({ approvalId: proof.approvalId, humanId: proof.humanId, policy: proof.policy, expiresAt: proof.expiresAt }),
    action_observed: () => ({ outcome: proof.status, actionId: proof.actionId || null, outcomeDigest: proof.outcomeDigest || null }),
    state_applied: () => ({ appliedMessageId: proof.appliedMessageId, previousGeneration: proof.previousGeneration,
      generation: proof.generation, resultDigest: proof.resultDigest }),
    decoded: () => ({ contextDigest: proof.contextDigest, operationsDigest: proof.operationsDigest }),
    transport_received: () => ({ sourceReceiptDigest: proof.sourceReceiptDigest }),
  };
  return v.copy(projections[dimension]());
}

module.exports = { CALLBACKS, validate, qualification };
