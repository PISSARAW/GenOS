'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function qualify(db, checked) {
  const attestation = await journal.read(db, { ...checked.request, kind: 'attestation' });
  await require('../../src/services/epistemic/nativeOracleProof').read(db, {
    ...checked.request, reference: { eventId: attestation.eventId, hash: attestation.hash } });
  const scope = { ...checked.request.scope, organizationId: 'different-tenant' };
  await assert.rejects(require('../../src/services/epistemic/oracleCodeSubject').load(db, { ...checked.request, scope }),
    { code: 'ORACLE_RUNTIME_SUBJECT_MISMATCH' });
  await require('../../src/services/garageRuntimeService').stop(db);
  await freshProcess(checked.request, attestation);
  const root = checked.authority.envelope.workspaceRoot;
  await require('node:fs/promises').writeFile(path.join(root, 'src/answer.gexpr'), 'a % b');
  const view = await require('../../src/services/consumerInspectionService').inspect(db,
    { runId: checked.row.id, scope: checked.request.scope });
  assert.equal(view.nativeVerification.status, 'accepted_at_decision');
  assert.equal(view.nativeVerification.current.satisfied, false);
  assert.equal(view.nativeVerification.current.reason, 'CODE_ORACLE_CONTENT_HASH_MISMATCH');
  assert.deepEqual(view.nativeVerification.costs, attestation.value.costs);
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', checked.row.id)).status, 'completed');
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 2);
  console.log('Changed code invalidates current assurance without rewriting historical acceptance or costs.');
}

async function freshProcess(request, expected) {
  const script = `process.env.GENOS_DISABLE_DOTENV='1';
    const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    const request=JSON.parse(process.argv[2]);
    require('./backend/src/services/epistemic/nativeOracleCoordinator').prepare(db,request)
    .then(async reference=>{const view=await require('./backend/src/services/epistemic/nativeOracleInspection').inspect(db,request);
      console.log(JSON.stringify({reference,view}));}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());`;
  const child = require('node:child_process').spawnSync(process.execPath,
    ['-e', script, process.env.GENOS_DB_PATH, JSON.stringify(request)],
    { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.reference, { eventId: expected.eventId, hash: expected.hash });
  assert.equal(result.view.current.satisfied, true);
  assert.deepEqual(result.view.costs, expected.value.costs);
  console.log('Code fresh replay retains the same attestation and costs; wrong scope refused.');
}

module.exports = { qualify };
