'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const subject = require('../src/services/epistemic/oracleWorkspaceSubject');
const store = require('../src/services/biologicalWorkerStore');
const provenance = require('../src/services/gvxMissionProvenance');
const authority = require('../src/services/missionEnvelopeAuthority');
const evidence = require('./helpers/workerCooperationLiveEvidence.cjs');

async function fixture(root) {
  await fs.writeFile(path.join(root, 'problem.json'), '{"values":[4,9,8],"target":17}');
  await fs.writeFile(path.join(root, 'allocation.json'), '{"indices":[0,1]}');
  const contract = await evidence.verificationContract(root, 'observation');
  const at = new Date(Date.now() - 20000).toISOString();
  return { contract, at, completedAt: new Date(Date.parse(at) + 1000).toISOString(),
    request: { runId: 'run', agentId: 'worker', scope: { entityId: 'worker' } } };
}

async function probe(root, data) {
  let denied = null;
  const saved = { binding: store.binding, observations: store.observations,
    readRun: provenance.readRun, assertRun: authority.assertRun,
    assertCompletedRunEvidence: authority.assertCompletedRunEvidence, now: Date.now };
  store.binding = async () => ({ workerId: 'worker', genome: {
    workerContract: { assignment: { workspaceVerificationContract: data.contract } } } });
  store.observations = async () => [{ applied: true, hash: 'observation-hash', event: {
    eventType: 'EVIDENCE_REPORT', timestamp: data.at, payload: { evidenceReport: { claims: [] } } } }];
  provenance.readRun = async () => ({ hash: 'bound-run' });
  authority.assertRun = async () => { throw Object.assign(new Error('expired'), { code: 'EXECUTION_AUTHORITY_EXPIRED' }); };
  authority.assertCompletedRunEvidence = async () => {
    if (denied) throw Object.assign(new Error(denied), { code: denied });
    return { status: 'authorized', completedAt: data.completedAt, envelope: { workspaceRoot: root } };
  };
  try {
    await assert.rejects(subject.load({}, data.request), { code: 'EXECUTION_AUTHORITY_EXPIRED' });
    const completed = { ...data.request, completedEvidence: true };
    const before = await subject.load({}, completed);
    Date.now = () => Date.parse(data.at) + 86400000;
    assert.deepEqual(await subject.load({}, completed), before);
    for (const code of ['EXECUTION_AUTHORITY_COMPLETION_NOT_SEALED', 'EXECUTION_AUTHORITY_AGENT_REVOKED']) {
      denied = code;
      await assert.rejects(subject.load({}, completed), { code });
    }
    denied = null;
    await fs.writeFile(path.join(root, 'allocation.json'), '{"indices":[1,2]}');
    await assert.rejects(subject.load({}, completed), { code: 'ORACLE_SOURCE_CHANGED' });
  } finally {
    store.binding = saved.binding;
    store.observations = saved.observations;
    provenance.readRun = saved.readRun;
    authority.assertRun = saved.assertRun;
    authority.assertCompletedRunEvidence = saved.assertCompletedRunEvidence;
    Date.now = saved.now;
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-completed-workspace-'));
  try { await probe(root, await fixture(root)); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
  console.log('Completed workspace evidence: historical completion, revocation and changed source checks PASS.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
