'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('./helpers/ettMissionFixture.cjs');
const service = require('../src/services/endogenousThoughtMissionService');
const sandbox = require('../src/services/endogenousThoughtMissionSandbox');
const thoughtStore = require('../src/services/endogenousThoughtStoreService');
const contract = require('../src/services/endogenousThoughtMissionContract');

function reference(input, receiptId) {
  return { organizationId: input.organizationId, projectId: input.projectId,
    missionId: input.missionId, agentId: input.agentId, receiptId };
}
async function rejected(promise, code) { await assert.rejects(promise, error => error.code === code); }

async function nativeIncomplete() {
  const context = await fixture.create('Le Dernier Sas — un titre uniquement');
  try {
    const { db, input } = context;
    const result = await service.run(db, { ...input, questionGenerator: async () => ({
      text: 'Quels manques sont mesurables ?', hypothesis: 'Une affirmation arbitraire ne doit pas devenir le protocole.' }) });
    assert.equal(result.terminalState, 'STOPPED');
    assert.equal(result.verdict, 'supported');
    assert.ok(result.verifiedFindings.missing.includes('MIN_WORDS'));
    assert.ok(result.verifiedFindings.missing.includes('MIN_SCENES'));
    assert.ok(result.verifiedFindings.missing.includes('DIALOGUE'));
    assert.equal(result.hypothesis, contract.hypothesis(input));
    assert.equal(result.boundaries.artisticQualityVerified, false);
    assert.equal(result.usage.tokens, 0);
    assert.ok(result.usage.seconds > 0);
    assert.notEqual(result.proof.measurement.processId, process.pid);
    assert.notEqual(result.proof.oracle.processId, process.pid);
    assert.notEqual(result.proof.oracle.processId, result.proof.measurement.processId);
    assert.deepEqual(result.proof.measurement.capabilities, { require: 'undefined', process: 'undefined', fetch: 'undefined' });
    assert.equal(fs.readFileSync(context.filename, 'utf8'), 'Le Dernier Sas — un titre uniquement');
    const native = await thoughtStore.listReceipts(db, { ...input, episodeId: result.episodeId });
    assert.deepEqual(native.map(r => r.receipt.payload.toState), ['DETECTED', 'QUESTIONED', 'ADMITTED', 'QUEUED', 'RUNNING', 'VERIFIED', 'LEARNED', 'STOPPED']);
    const runtime = await db.get('SELECT status FROM ontogenesis_runs WHERE id=?', native.find(r => r.receipt.payload.toState === 'RUNNING').receipt.payload.jobRef);
    assert.equal(runtime.status, 'verified');
    const read = await service.read(db, reference(input, result.receiptId));
    assert.equal(read.receiptRefs.memory, result.receiptRefs.memory);
    const integration = await service.buildContext(db, reference(input, result.receiptId));
    assert.ok(integration.contextText.includes(result.receiptId));
    assert.ok(integration.contextText.includes(input.artifact.sha256));
    assert.ok(integration.contextText.includes('MIN_WORDS'));
    assert.ok(integration.sourceRefs.includes(result.receiptRefs.learning));
    await rejected(service.read(db, { ...reference(input, result.receiptId), missionId: 'foreign-mission' }), 'ETT_MISSION_BINDING_NOT_FOUND');
    await rejected(service.read(db, { ...reference(input, result.receiptId), projectId: 'foreign-project' }), 'ETT_MISSION_BINDING_NOT_FOUND');
    await db.run("UPDATE missions SET status='completed' WHERE mission_id=?", input.missionId);
    assert.equal((await service.read(db, reference(input, result.receiptId))).terminalState, 'STOPPED');
    await rejected(service.buildContext(db, reference(input, result.receiptId)), 'ETT_MISSION_NOT_ACTIVE');
    await db.run("UPDATE missions SET status='active' WHERE mission_id=?", input.missionId);
    fs.appendFileSync(context.filename, '\nChanged after review');
    await rejected(service.buildContext(db, reference(input, result.receiptId)), 'ETT_MISSION_ARTIFACT_CHANGED');
  } finally { await fixture.close(context); }
}

async function nativeRefutation() {
  const text = 'INT. SAS - JOUR\nALAIN\nJe ferme la porte.\nVERA\nAttends.';
  const context = await fixture.create(text);
  try {
    const { db, input } = context;
    input.requirements = { minWords: 3, minScenes: 1, maxScenes: 2, requireDialogue: true };
    const result = await service.run(db, input);
    assert.equal(result.verdict, 'refuted');
    assert.deepEqual(result.verifiedFindings.missing, []);
    const learn = await db.get('SELECT revision_operation,revision_applied FROM endogenous_thought_learnings WHERE episode_id=?', result.episodeId);
    assert.equal(learn.revision_operation, 'correct');
    assert.equal(learn.revision_applied, 1);
    const memory = await db.get('SELECT category FROM genome_decisions WHERE id=?', result.receiptRefs.memory);
    assert.equal(memory.category, 'Failure');
    await assert.rejects(db.run('DELETE FROM endogenous_thought_verifications WHERE receipt_id=?', result.receiptRefs.verification), /durable evidence/);
    const masked = Object.create(db);
    masked.get = (sql, ...parameters) => sql.includes('FROM endogenous_thought_verifications') ? undefined : db.get(sql, ...parameters);
    await rejected(service.read(masked, reference(input, result.receiptId)), 'ETT_MISSION_NATIVE_EVIDENCE_MISSING');
    const row = await db.get('SELECT body_json FROM endogenous_thought_mission_bindings WHERE id=?', result.receiptId);
    await db.run(`INSERT INTO endogenous_thought_mission_bindings
      SELECT ?,organization_id,project_id,mission_id,agent_id,body_json,body_mac
      FROM endogenous_thought_mission_bindings WHERE id=?`, 'transplanted-receipt', result.receiptId);
    await rejected(service.read(db, reference(input, 'transplanted-receipt')), 'ETT_MISSION_BINDING_SCOPE_CHANGED');
    const forged = JSON.parse(row.body_json);
    forged.verifiedFindings.words += 99;
    await db.run('UPDATE endogenous_thought_mission_bindings SET body_json=? WHERE id=?', JSON.stringify(forged), result.receiptId);
    await rejected(service.read(db, reference(input, result.receiptId)), 'ETT_MISSION_BINDING_INVALID');
  } finally { await fixture.close(context); }
}

async function boundaries() {
  const context = await fixture.create('Un titre');
  try {
    const { db, input } = context;
    const other = crypto.generateKeyPairSync('ed25519');
    await rejected(service.run(db, { ...input, authority: { ...input.authority, privateKey: other.privateKey } }), 'ETT_MISSION_AUTHORITY_MISMATCH');
    await rejected(service.run(db, { ...input, verdict: 'supported' }), 'ETT_MISSION_EXECUTOR_FORBIDDEN');
    await rejected(service.run(db, { ...input, worker: async () => ({}) }), 'ETT_MISSION_EXECUTOR_FORBIDDEN');
    await rejected(service.run(db, { ...input, missionId: 'missing' }), 'ETT_MISSION_NOT_ACTIVE');
    await rejected(service.run(db, { ...input, artifact: { ...input.artifact, sha256: '0'.repeat(64) } }), 'ETT_MISSION_ARTIFACT_CHANGED');
    const external = path.join(context.directory, 'outside.md');
    fs.writeFileSync(external, 'Outside');
    await rejected(service.run(db, { ...input, artifact: { path: external, sha256: contract.bytesDigest('Outside') } }), 'ETT_MISSION_ARTIFACT_OUTSIDE_WORKSPACE');
    await db.run('INSERT INTO missions VALUES(?,?,?)', 'unassigned', 'another-owner', 'active');
    await rejected(service.run(db, { ...input, missionId: 'unassigned' }), 'ETT_MISSION_MEMBER_REQUIRED');
    await db.run('INSERT INTO mission_agents VALUES(?,?)', 'unassigned', input.agentId);
    await rejected(service.run(db, { ...input, missionId: 'unassigned' }), 'ETT_MISSION_SCOPE_MISMATCH');
    const snapshot = contract.snapshot(input, { path: context.workspace });
    const measure = sandbox.measure(snapshot);
    const forged = { ...measure, metrics: { ...measure.metrics, words: 999 } };
    assert.equal(sandbox.verify(snapshot, forged).verdict, 'inconclusive');
    assert.deepEqual(fs.readdirSync(context.workspace), ['candidate.md']);
  } finally { await fixture.close(context); }
}

async function main() {
  const original = process.env.GENOS_GVX_LEDGER_HMAC_SECRET;
  process.env.GENOS_GVX_LEDGER_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    await nativeIncomplete(); await nativeRefutation(); await boundaries();
    console.log('Native ETT mission: full chain, readonly subprocesses, independent oracle, durable memory, refutation and scope refusals passed.');
  } finally {
    if (original === undefined) delete process.env.GENOS_GVX_LEDGER_HMAC_SECRET;
    else process.env.GENOS_GVX_LEDGER_HMAC_SECRET = original;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
