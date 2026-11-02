'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const interop = require('../src/services/cognitiveOmegaInteropService');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../src/services/omegaProtocol/contract');
const { OmegaAdmission } = require('../src/services/omegaProtocol/admission');
const fixture = require('./helpers/omegaAdmissionFixture');

const alter = (message, overrides) => createMessage({ ...message, ...overrides }, { now: fixture.NOW });

async function durableAdmission() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-omega-admission-'));
  const dbPath = path.join(directory, 'admission.db');
  let runtime = fixture.admission({ dbPath });
  try {
    const flow = await fixture.admit(runtime);
    const accepted = flow.accepted;
    assert.equal(accepted.plan.programDigest, interop.digest(accepted.program));
    assert.deepEqual(accepted.plan.obligations, accepted.program.operations.map((operation) => ({ operationId: operation.id,
      kind: operation.kind, reference: operation.reference, dependsOn: operation.dependsOn, state: 'open' })));
    assert.equal(accepted.plan.obligations.length, 4);
    assert.deepEqual(accepted.plan.budget, accepted.submission.budget);
    runtime.close(); runtime = fixture.admission({ dbPath });
    assert.equal(runtime.acceptedPlan(flow.query).status, 'accepted');
    await runtime.apply(flow.accept);
    assert.equal(runtime.history().length, 3);
    assert.equal(runtime.acceptedPlan({ ...flow.query, planDigest: digest('other') }), null);
    assert.equal(runtime.acceptedPlan({ ...flow.query, scope: { ...flow.query.scope, projectId: 'foreign' } }), null);
    await assert.rejects(runtime.apply(alter(flow.accept, { operationId: 'conflicting-operation' })), /idempotency conflict/);
    accepted.plan.obligations.pop();
    assert.equal(runtime.acceptedPlan(flow.query).plan.obligations.length, 4);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function rejectsSubmission(change, pattern) {
  const submission = fixture.submission();
  const capabilities = fixture.capabilities();
  change(submission, capabilities);
  const runtime = fixture.admission({ describeRuntime: async () => capabilities });
  try {
    await assert.rejects(fixture.prepare(runtime, submission), pattern);
    assert.equal(runtime.history().length, 1);
  } finally { runtime.close(); }
}

async function capabilityAndPolicyRefusals() {
  await rejectsSubmission((_, caps) => { caps.domains = ['other']; }, /domain unavailable/);
  await rejectsSubmission((_, caps) => { caps.operations = caps.operations.filter((item) => item.kind !== 'READ'); }, /READ reference unavailable/);
  await rejectsSubmission((_, caps) => { caps.verifierRefs = []; }, /verifier unavailable/);
  await rejectsSubmission((_, caps) => { caps.effectGuarantees = []; }, /effect guarantee unavailable/);
  await rejectsSubmission((value, caps) => { value.requirements.effectGuarantees = []; caps.effectGuarantees = ['idempotency']; }, /mandatory effect guarantee/);
  await rejectsSubmission((value) => { value.program.policy.read = []; }, /native policy permission/);
  await rejectsSubmission((_, caps) => { caps.maxOperations = 3; }, /capacity/);
  await rejectsSubmission((value) => { value.program.payload.requests.emit.cost = 71; }, /budget/);
}

async function obligationGraphRefusals() {
  await rejectsSubmission((value) => { value.program.operations[0].dependsOn = ['missing']; }, /dependency_missing/);
  await rejectsSubmission((value) => { value.program.operations[0].dependsOn = ['emit']; }, /dependency_cycle/);
  const runtime = fixture.admission();
  try {
    const flow = await fixture.prepare(runtime);
    await assert.rejects(runtime.apply(alter(flow.accept, { payload: { ...flow.accept.payload, planDigest: digest('omitted-obligation') } })), /binding/);
    assert.equal(runtime.state(flow.query).status, 'submitted');
  } finally { runtime.close(); }
}

async function capabilityChanges() {
  let capabilities = fixture.capabilities();
  const runtime = fixture.admission({ describeRuntime: async () => capabilities });
  try {
    const flow = await fixture.prepare(runtime);
    capabilities = fixture.capabilities({ generation: 2 });
    await assert.rejects(runtime.apply(flow.accept), /capabilities changed/);
    assert.equal(runtime.state(flow.query).status, 'submitted');
    assert.equal(runtime.acceptedPlan(flow.query), null);
  } finally { runtime.close(); }
}

async function callbackBindings() {
  const cases = [
    async (request) => ({ ...fixture.receipt(request), requestDigest: digest('foreign-request') }),
    async (request) => ({ ...fixture.receipt(request), receiptDigest: 'not-a-receipt' }),
  ];
  for (const verifier of cases) {
    const runtime = fixture.admission({ verifyPlan: verifier });
    try { await assert.rejects(fixture.prepare(runtime), /receipt mismatch/); assert.equal(runtime.history().length, 1); }
    finally { runtime.close(); }
  }
}

async function revokedDuringCallback() {
  let authorized = true;
  const runtime = fixture.admission({ authorize: async () => authorized, verifyPlan: async (request) => {
    authorized = false; return fixture.receipt(request);
  } });
  try { await assert.rejects(fixture.prepare(runtime), /authority revoked/); assert.equal(runtime.history().length, 1); }
  finally { runtime.close(); }
}

async function expiryDuringCallback() {
  let now = fixture.NOW;
  const runtime = fixture.admission({ clock: () => now, verifyPlan: async (request) => {
    now = request.message.expiresAt; return fixture.receipt(request);
  } });
  try { await assert.rejects(fixture.prepare(runtime), /expired/); assert.equal(runtime.history().length, 1); }
  finally { runtime.close(); }
}

async function concurrentState() {
  let runtime;
  runtime = fixture.admission({ verifyPlan: async (request) => {
    await runtime.apply(fixture.message('DESCRIBE_RUNTIME', { conversationId: 'concurrent-conversation' }));
    return fixture.receipt(request);
  } });
  try { await assert.rejects(fixture.prepare(runtime), /state changed/); assert.equal(runtime.history().length, 2); }
  finally { runtime.close(); }
}

async function main() {
  assert.throws(() => new OmegaAdmission({}), /authorize callback/);
  assert.throws(() => new OmegaAdmission({ authorize() {}, describeRuntime() {} }), /verifyPlan callback/);
  await durableAdmission();
  await capabilityAndPolicyRefusals();
  await obligationGraphRefusals();
  await capabilityChanges();
  await callbackBindings();
  await revokedDuringCallback();
  await expiryDuringCallback();
  await concurrentState();
  console.log('OMEGA durable admission, complete obligations, capabilities, policy and exact plan binding: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
