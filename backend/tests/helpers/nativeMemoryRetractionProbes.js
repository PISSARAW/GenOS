'use strict';

const assert = require('node:assert/strict');
const store = require('../../src/services/aeisAssemblyStore');
const retractions = require('../../src/services/aeisAssemblyRetraction');
const readGate = require('../../src/services/promotionMemoryReadGate');

async function qualify(db, input) {
  const assemblyId = input.subject.binding.assemblyId;
  const saved = await store.readAssembly(db, assemblyId);
  const request = { assemblyId, scope: input.request.scope, expectedAssemblyHash: saved.validity.assemblyHash,
    actorId: 'test-independent-reviewer', rationale: 'Source assurance withdrawn after a counterexample.' };
  await assert.rejects(retractions.retract(db, { ...request, scope: { ...request.scope, projectId: 'foreign' } }),
    { code: 'AEIS_RETRACTION_NOT_FOUND' });
  await assert.rejects(retractions.retract(db, { ...request, expectedAssemblyHash: 'stale' }), { code: 'AEIS_RETRACTION_STALE_SUBJECT' });
  const prior = await concurrent(db, request);
  assert.equal(prior.status, 'retracted');
  assert.deepEqual(await retractions.retract(db, request), prior);
  await assert.rejects(retractions.retract(db, { ...request, actorId: 'another-reviewer' }), { code: 'AEIS_RETRACTION_CONFLICT' });
  await assert.rejects(store.readAssembly(db, assemblyId), { code: 'AEIS_ASSEMBLY_RETRACTED' });
  assert.equal((await store.readAssembly(db, assemblyId, { historical: true })).evaluation.allAccepted, true);
  const memory = await readGate.inspect(db, input.row);
  assert.equal(memory.status, 'inconclusive');
  assert.equal(memory.reason, 'AEIS_ASSEMBLY_RETRACTED');
  const found = await require('../../src/services/vectorMemoryService').searchMemory(input.row.content,
    { ...request.scope, limit: 10 }, db);
  assert.equal(found.allScoredExperiences.some(item => item.id === input.row.id), false);
  const inspection = await require('../../src/services/consumerInspectionService').inspect(db,
    { runId: input.subject.content.source.runId, scope: request.scope });
  assert.equal(inspection.run.status, 'completed');
  assert.equal(inspection.provenance[0].currentAssurance.status, 'retracted');
  assert.equal(inspection.nativeVerification.status, 'accepted_at_decision');
  assert.equal(inspection.nativeVerification.current.reason, 'AEIS_ASSEMBLY_RETRACTED');
  await freshProcess(assemblyId);
  await db.run("UPDATE aeis_assurance_assemblies SET created_at=datetime('now','-100 days') WHERE id=?", assemblyId);
  await store.pruneAssemblies(db);
  assert.equal((await store.readAssembly(db, assemblyId, { historical: true })).validity.status, 'retracted');
  await tamper(db, assemblyId);
  console.log('Memory retraction: actual source withdrawn, retrieval excluded and historical decision retained.');
}

async function tamper(db, assemblyId) {
  const row = await db.get('SELECT * FROM aeis_assembly_retractions WHERE assembly_id=?', assemblyId);
  await db.run('UPDATE aeis_assembly_retractions SET payload_json=? WHERE assembly_id=?', '{}', assemblyId);
  try { await assert.rejects(store.readAssembly(db, assemblyId, { historical: true }), { code: 'AEIS_RETRACTION_INTEGRITY' }); }
  finally { await db.run('UPDATE aeis_assembly_retractions SET payload_json=? WHERE assembly_id=?', row.payload_json, assemblyId); }
}

module.exports = { qualify };

async function concurrent(db, request) {
  const other = require('./biologyDatabase').openDatabase(process.env.GENOS_DB_PATH);
  await other.exec('PRAGMA busy_timeout=5000');
  try {
    const results = await Promise.all([retractions.retract(db, request), retractions.retract(other, request)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM aeis_assembly_retractions WHERE assembly_id=?', request.assemblyId)).count, 1);
    return results[0];
  } finally { await other.close(); }
}

async function freshProcess(assemblyId) {
  const script = `process.env.GENOS_DISABLE_DOTENV='1';
    const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    require('./backend/src/services/aeisAssemblyStore').readAssembly(db,process.argv[2])
    .then(()=>{console.error('Retracted assembly admitted');process.exitCode=1;})
    .catch(error=>console.log(error.code)).finally(()=>db.close());`;
  const child = require('node:child_process').spawnSync(process.execPath,
    ['-e', script, process.env.GENOS_DB_PATH, assemblyId],
    { cwd: require('node:path').resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), 'AEIS_ASSEMBLY_RETRACTED');
}
