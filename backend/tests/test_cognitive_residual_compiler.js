'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const compiler = require('../src/services/cognitiveResidualCompiler');
const cognitiveSignal = require('../src/services/cognitiveSignalService');
const modelRouter = require('../src/services/modelRouter');
const ground = require('../src/services/communication/commonGroundService');

function sample() {
  return {
    agentId: 'worker-1', context: {
      signalId: 's1', signalType: 'ligand', semanticType: 'NOVEL',
      topic: 'review', sender: 'agent-1', payloadRef: 's1',
      dataSize: 24, escalatedAt: '2026-10-04T00:00:00Z',
      constraint: 'Do not write files'
    },
    signal: {
      signalId: 's1', signalType: 'ligand', topic: 'review',
      senderAgentId: 'agent-1', llmRequired: true,
      signalData: { semanticType: 'NOVEL', claim: 'review this signal' }
    }
  };
}

function testProjection() {
  const input = sample();
  const compiled = compiler.compileSignal(input);
  assert.equal(compiled.status, 'ready');
  assert.equal(compiled.contract.operation, 'INFER');
  assert.match(compiled.prompt, /context.constraint: "Do not write files"/);
  assert.match(compiled.prompt, /signal.data:/);
  assert.doesNotMatch(compiled.prompt, /escalatedAt|dataSize|payloadRef/);
  assert.ok(compiled.omissions.some((item) => item.field === 'context.payloadRef'));
  assert.ok(compiled.omissions.some((item) => item.field === 'signalData.semanticType'));
  assert.equal(compiled.visibility.mode, 'materialized_in_this_invocation');
  assert.match(compiled.visibility.promptDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(compiled.visibility.session, null);
  assert.equal(compiler.compileSignal({ ...input, signal: { ...input.signal, llmRequired: false } }).status, 'blocked');
  assert.equal(compiler.compileSignal({ ...input, context: { signalId: 'other' } }).reason, 'context_signal_mismatch');
  assert.equal(compiler.compileSignal({ ...input, context: { sender: 'other' } }).reason, 'context_sender_mismatch');
  assert.equal(compiler.compileSignal({ ...input, signal: { ...input.signal, signalType: 'alien' } }).reason, 'unsupported_signal_type');
  assert.equal(compiler.compileSignal({ ...input, signal: { ...input.signal,
    signalData: { body: 'x'.repeat(20_000) } } }).reason, 'projection_too_large');
}

async function testModelBoundary() {
  const original = modelRouter.generate;
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  let calls = 0;
  modelRouter.generate = async (request) => {
    calls += 1;
    assert.match(request.prompt, /signal.semanticType: "NOVEL"/);
    return { text: 'candidate inspect receptor mapping', provider: 'stub', model: 'stub-1' };
  };
  try {
    const result = await cognitiveSignal.handleSignal({ db, ...sample() });
    assert.equal(result.candidate.kind, 'candidate');
    assert.equal(result.candidate.verification, 'unverified');
    assert.equal(result.visibility.model, 'stub-1');
    assert.equal(calls, 1);
    const reused = await cognitiveSignal.handleSignal({ db, ...sample() });
    assert.equal(reused.reused, true);
    assert.equal(calls, 1);
    const receipt = await db.get(`SELECT status, prompt_bytes, audit_blob
      FROM cognitive_inference_receipts WHERE signal_id = 's1'`);
    assert.equal(receipt.status, 'completed');
    assert.match(receipt.prompt_bytes.toString('utf8'), /signal.semanticType/);
    assert.ok(receipt.audit_blob.length > 0);
    await db.run("UPDATE cognitive_inference_receipts SET prompt_bytes = x'00' WHERE signal_id = 's1'");
    await assert.rejects(cognitiveSignal.handleSignal({ db, ...sample() }), /prompt digest mismatch/);
    await assert.rejects(cognitiveSignal.handleSignal({ db, ...sample(),
      context: { signalId: 'wrong' } }), { code: 'COGNITIVE_SIGNAL_BLOCKED' });
    assert.equal(calls, 1);
  } finally { modelRouter.generate = original; await db.close(); }
  assert.equal(compiler.parseCandidate('verified').kind, 'unknown');
  assert.equal(compiler.parseCandidate('need source artifact').kind, 'need');
  assert.equal(compiler.parseCandidate('unknown').kind, 'unknown');
}

async function testConcurrentAdmission() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const original = modelRouter.generate;
  let release;
  let entered;
  const pending = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  modelRouter.generate = async () => {
    entered();
    await pending;
    return { text: 'unknown' };
  };
  try {
    const first = cognitiveSignal.handleSignal({ db, ...sample() });
    await started;
    await assert.rejects(cognitiveSignal.handleSignal({ db, ...sample() }),
      { code: 'COGNITIVE_SIGNAL_ALREADY_ADMITTED' });
    release();
    await first;
  } finally { release(); modelRouter.generate = original; await db.close(); }
}

async function testExpiry() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await ground.recordGrounding({ db, agentA: 'a', agentB: 'b', domain: 'audit',
      semanticFingerprint: 'old', status: 'grounded', ttlMs: 1000 });
    await ground.recordGrounding({ db, agentA: 'a', agentB: 'b', domain: 'audit',
      semanticFingerprint: 'live', status: 'grounded' });
    await db.run("UPDATE communication_common_ground SET expires_at = '2000-01-01T00:00:00Z' WHERE semantic_fingerprint = 'old'");
    assert.equal(await ground.knows({ db, agentA: 'a', agentB: 'b', semanticFingerprint: 'old' }), false);
    assert.deepEqual((await ground.getSharedGround({ db, agentA: 'a', agentB: 'b', domain: 'audit' }))
      .map((item) => item.semanticFingerprint), ['live']);
    assert.deepEqual(await ground.computeKnowledgeDelta({ db, senderId: 'a', receiverId: 'b', domain: 'audit',
      semanticRefs: ['old', 'live'] }), ['old']);
    assert.deepEqual(await ground.computeGroupGrounding({ db, agentIds: ['a', 'b'], domain: 'audit' }), ['live']);
  } finally { await db.close(); }
}

async function main() {
  testProjection();
  await testModelBoundary();
  await testConcurrentAdmission();
  await testExpiry();
  console.log('Cognitive residual compiler tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
