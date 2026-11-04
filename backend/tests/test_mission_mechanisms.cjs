'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const service = require('../src/services/missionMechanismsService');
const contract = require('../src/services/missionIntegration/contract');

async function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mission-mechanisms-'));
  Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'), GENOS_AGENT_DNA: '1', GENOS_AGOW_MODE: 'bounded',
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_DB_PATH: path.join(directory, 'state.sqlite'), GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_WORKSPACES_ROOT: directory, GENOS_STUDIO_ROOT: path.join(directory, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(directory, 'capsules') });
  const database = require('../src/db'), db = await database.getDatabase();
  const workspace = path.join(directory, 'workspace'); fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'BASELINE.md'), 'Le Dernier Sas : un titre seul.');
  const id = 'mechanisms-test', keys = crypto.generateKeyPairSync('ed25519');
  process.env.GENOS_MISSION_RESEARCH_AUTHORITY_PRIVATE_KEY_PEM = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await db.run('INSERT INTO organizations(id,name) VALUES(?,?)', id, id);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', id, id, id);
  await db.run('INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES(?,?,?,?,?)', id, id, workspace, id, id);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES(?,?,'orchestrator','idle','orchestrator',?)", id, id, id);
  await require('../src/services/missionIdentityService').create(db, { missionId: id, orchestratorAgentId: id, objective: 'Inspect a baseline then produce a screenplay.' });
  await require('../src/services/ontogenesis/projectStore').createProject(db, { id, rootPath: workspace, branch: 'v3', objective: 'Native integration test' });
  await require('../src/services/shev/responsibilityService').registerResponsibility(db, { projectId: id,
    authorityRef: 'operator:integration-test', authorityPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    mandate: { purpose: 'Mesurer la structure du texte exact', autoDiagnose: false, autoInstrument: false,
      dimensions: [{ name: 'artifact_structure', expected: 'Structure mesurée', acceptance: ['Mesures natives vérifiables.'] }] } });
  const parent = { workspace_id: id, workspace_root: workspace, organization_id: id, project_id: id };
  const request = { mission: 'Écrire Le Dernier Sas.', timeoutMs: 600000, morphogenesis: true,
    adaptiveMorphogenesis: { requireTransition: true }, gqwf_v2: true, qualityRuntime: { planScenes: true },
    relationalPolicy: { version: 1, required: true },
    qualityElevation: { minBodyWords: 1200, minSceneCount: 5, maxSceneCount: 7, requireDialogue: true },
    missionMechanisms: { version: 1, required: true, baselinePath: 'BASELINE.md', exerciseContextRecovery: true } };
  return { db, database, directory, workspace, parent, context: { missionId: id, orchestratorId: id, task: request.mission, request } };
}

async function verify(test) {
  const original = structuredClone(test.context), input = { parent: test.parent, context: test.context };
  const result = await service.prepare(test.db, input);
  assert.equal(result.record.research.usage.tokens, 0);
  assert.equal(result.record.channel.exerciseDeclared, true);
  assert.ok(result.record.channel.recoveryEvidenceRef);
  assert.ok(test.context.task.includes(result.record.research.context.contextText));
  assert.ok(test.context.task.includes(result.record.receiptId));
  assert.ok(test.context.request.timeoutMs < original.request.timeoutMs);
  const read = await require('../src/services/missionIntegration/qualification').verifyPreparation(test.db, { receipt: result.record });
  assert.equal(read.research.terminalState, 'STOPPED');
  assert.equal(read.contextText, result.record.channel.contextText);
  const canonical = service.canonicalFields(test.context.request);
  assert.deepEqual(canonical.missionMechanisms, test.context.request.missionMechanisms);
  assert.throws(() => service.assertUnchanged(canonical, {}), { code: 'MISSION_MECHANISMS_CONTRACT_CHANGED' });
  const replay = await service.prepare(test.db, { parent: test.parent, context: structuredClone(original) });
  assert.equal(replay.record.receiptId, result.record.receiptId);
  const refusal = await service.qualify(test.db, { missionId: original.orchestratorId,
    execution: { runtimeMissionId: original.missionId }, members: [], ...canonical });
  assert.equal(refusal.passed, false);
  assert.deepEqual(refusal.reasons, ['MISSION_MECHANISMS_WORKERS_REQUIRED']);
  const tampered = structuredClone(result.record); tampered.contextDigest = '0'.repeat(64);
  await assert.rejects(require('../src/services/missionIntegration/qualification').verifyPreparation(test.db,
    { receipt: tampered }), { code: 'MISSION_MECHANISMS_RECEIPT_INVALID' });
  const bad = structuredClone(original); bad.request.missionMechanisms.baselinePath = '../outside.md';
  fs.writeFileSync(path.join(test.directory, 'outside.md'), 'outside');
  assert.throws(() => contract.normalize({ parent: test.parent, context: bad }), { code: 'MISSION_MECHANISMS_BASELINE_OUTSIDE_WORKSPACE' });
  const missing = structuredClone(original); missing.request.relationalPolicy = null;
  assert.throws(() => contract.normalize({ parent: test.parent, context: missing }), { code: 'MISSION_MECHANISMS_REQUIRED_POLICY_MISSING' });
  fs.appendFileSync(path.join(test.workspace, 'BASELINE.md'), '\nChanged');
  await assert.rejects(require('../src/services/missionIntegration/qualification').verifyPreparation(test.db,
    { receipt: result.record }), { code: 'ETT_MISSION_ARTIFACT_CHANGED' });
}

async function main() {
  const test = await setup();
  try { await verify(test); console.log('Mission integration: real ETT learning, NCE, Axolotl context recovery and AGOW; missing workers, tampering and policy/path refusals PASS.'); }
  finally {
    await require('../src/services/garageRuntimeService').stop(test.db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await test.database.closeDatabase();
    assert.equal(path.dirname(path.resolve(test.directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(test.directory).startsWith('genos-mission-mechanisms-'));
    fs.rmSync(test.directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
