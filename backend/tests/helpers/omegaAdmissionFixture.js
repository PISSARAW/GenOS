'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { OmegaAdmission } = require('../../src/services/omegaProtocol/admission');
const fixture = require('./omegaProtocolContractFixture');

let sequence = 0;

function message(type, overrides = {}) {
  sequence += 1;
  return fixture.message(type, { messageId: `admission-${sequence}`, idempotencyKey: `admission-key-${sequence}`, ...overrides });
}

function receipt(request) {
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(['plan-verification', request]) };
}

function admission(overrides = {}) {
  return new OmegaAdmission({ authorize: async () => true, describeRuntime: async () => fixture.capabilities(),
    verifyPlan: async (request) => receipt(request), clock: () => fixture.NOW, ...overrides });
}

async function prepare(runtime, submission = fixture.submission(), overrides = {}) {
  const description = message('DESCRIBE_RUNTIME', overrides);
  await runtime.apply(description);
  const submit = message('SUBMIT_PROGRAM', { ...overrides, payload: { submission }, causalRefs: [description.messageId] });
  const proposal = await runtime.apply(submit);
  const accept = message('ACCEPT_PLAN', { ...overrides, payload: { planId: proposal.planId, planDigest: proposal.planDigest },
    causalRefs: [submit.messageId] });
  return { description, submit, proposal, accept, query: { scope: submit.scope, missionId: submit.missionId,
    conversationId: submit.conversationId, planId: proposal.planId, planDigest: proposal.planDigest } };
}

async function admit(runtime, submission = fixture.submission(), overrides = {}) {
  const flow = await prepare(runtime, submission, overrides);
  await runtime.apply(flow.accept);
  return { ...flow, accepted: runtime.acceptedPlan(flow.query) };
}

module.exports = { ...fixture, message, receipt, admission, prepare, admit };
