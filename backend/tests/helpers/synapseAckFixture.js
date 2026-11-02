'use strict';

const { spawnSync } = require('node:child_process');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/synapseProtocol/contract');
const { AcknowledgementLedger } = require('../../src/services/synapseProtocol/acknowledgements');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = agentId => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'test-local' });
const PUBLISHER = actor('publisher');
const RECEIVER = actor('receiver');
const SCOPE = { organizationId: 'ack-org', projectId: 'ack-project' };
const BASE = { status: 'offered' };
const TARGET = { status: 'applied' };
const CONTEXT = { contextId: 'context-1', domain: 'test', publisher: PUBLISHER, audience: [RECEIVER],
  base: { stateDigest: digest(BASE), generation: 0 }, schema: { schemaId: 'test-state', version: '1', digest: digest('test-schema') },
  dictionary: { snapshot: null, digest: null }, grounding: [], dependencies: [] };
const DELTA = { deltaId: 'delta-1', contextDigest: digest(CONTEXT), baseDigest: digest(BASE),
  targetDigest: digest(TARGET), operationsDigest: digest([{ kind: 'put', key: 'status', value: 'applied' }]) };
const SUBJECT = { context: CONTEXT, delta: DELTA, receiver: RECEIVER };
const QUERY = { scope: SCOPE, missionId: 'mission-1', conversationId: 'conversation-1', deltaId: DELTA.deltaId, deltaDigest: digest(DELTA) };
const QUALIFICATION = { environmentDigest: digest({ node: process.version, verifier: 'isolated-json-check' }),
  policy: { policyId: 'test-json-predicate', version: '1' }, predicateDigest: digest('candidate.status equals applied') };
let sequence = 0;

function message(dimension, overrides = {}) {
  sequence += 1;
  return createMessage({ protocol: 'genos.synapse/v1', messageId: `ack-message:${sequence}`, operationId: 'ack-operation',
    idempotencyKey: `ack-key:${sequence}`, scope: SCOPE, missionId: QUERY.missionId, conversationId: QUERY.conversationId,
    type: 'ACK_FACT', sender: RECEIVER, audience: PUBLISHER, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: { authorityId: 'receiver-grant', generation: 1 },
    createdAt: NOW, expiresAt: '2026-11-03T10:00:00.000Z', payload: { ackId: `ack:${sequence}`,
      deltaId: DELTA.deltaId, deltaDigest: digest(DELTA), dimension, subjectDigest: digest(SUBJECT), evidenceRef: 'fixture:evidence' }, ...overrides }, { now: NOW });
}

function bound(status, request, values = {}) {
  return { status, requestDigest: digest(request), receiptDigest: digest({ status, requestDigest: digest(request), values }), ...values };
}

function received(request) {
  return bound('received', request, { sourceReceiptDigest: digest({ deliveredSubject: request.subjectDigest, receiver: request.subject.receiver }) });
}

function decoded(request) {
  return bound('decoded', request, { contextDigest: request.subject.delta.contextDigest,
    operationsDigest: request.subject.delta.operationsDigest, sourceReceiptDigest: digest('decoder-fixture-record') });
}

function humanApproval(request) {
  return bound('authorized', request, { approvalId: 'fixture-approval-only', humanId: 'fixture-human-only',
    subjectDigest: request.subjectDigest, policy: { policyId: 'fixture-approval-policy', version: '1' }, expiresAt: '2026-11-03T10:00:00Z' });
}

function independentVerification(request, candidate = TARGET) {
  if (digest(candidate) !== request.subject.delta.targetDigest) throw new Error('Independent candidate differs from delta result.');
  const script = "const x=JSON.parse(require('node:fs').readFileSync(0,'utf8'));process.exit(x.status==='applied'?0:1)";
  const result = spawnSync(process.execPath, ['-e', script], { input: JSON.stringify(candidate), encoding: 'utf8', timeout: 5000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Independent JSON predicate failed.');
  return bound('verified', request, { subjectDigest: request.subjectDigest, ...request.verificationContext,
    verifier: { ...actor('independent-checker'), incarnationId: `pid:${result.pid}` },
    independence: { execution: true, provenance: false, method: false, statisticalIndependence: 'not_established' } });
}

function setup(options = {}) {
  const calls = { transport: 0, decoded: 0, action: 0, verified: 0, human: 0 };
  let observed = false;
  const ledger = new AcknowledgementLedger({ authorize: async () => true, resolveSubject: async () => SUBJECT,
    observeTransport: async request => { calls.transport += 1; return received(request); },
    verifyDecoded: async request => { calls.decoded += 1; return decoded(request); },
    observeAction: async request => {
      calls.action += 1;
      return bound(observed ? 'observed' : 'outcome_unknown', request, { actionId: 'fixture-action', subjectDigest: request.subjectDigest,
        outcomeDigest: digest('observed-fixture-outcome') });
    },
    verificationContext: async () => QUALIFICATION,
    verifyEvidence: async request => { calls.verified += 1; return independentVerification(request); },
    verifyHumanApproval: async request => { calls.human += 1; return humanApproval(request); },
    clock: () => NOW, ...options });
  return { ledger, calls, observeActionNow: () => { observed = true; } };
}

module.exports = { NOW, actor, PUBLISHER, RECEIVER, SCOPE, BASE, TARGET, CONTEXT, DELTA, SUBJECT, QUERY,
  QUALIFICATION, message, bound, received, decoded, humanApproval, independentVerification, setup };
