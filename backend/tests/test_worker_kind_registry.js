const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workerKinds = require('../src/services/agents/workerKindService');
const phenotypes = require('../src/services/agents/phenotypeRegistryService');

const rustSource = fs.readFileSync(path.resolve(__dirname, '../../crates/genos-worker/src/phenotype.rs'), 'utf8');
const enumBody = rustSource.match(/pub enum WorkerKind \{([\s\S]*?)\n\}/)?.[1] || '';
const rustKinds = [...enumBody.matchAll(/^\s{4}([A-Z][A-Za-z]+),?$/gm)].map((match) => workerKinds.normalize(match[1]));
assert.deepEqual(Object.keys(workerKinds.KINDS).sort(), rustKinds.sort());
assert.equal(rustKinds.length, 19);

for (const kind of Object.keys(workerKinds.KINDS)) {
  const profile = phenotypes.getPhenotype(kind);
  const contract = workerKinds.buildWorkerContract(kind, { prompt: 'mission', scope: 'module' });
  assert.equal(profile.workerKind, kind);
  assert.equal(contract.identity.workerKind, kind);
  assert.equal(contract.authority.promote, false);
  assert.equal(contract.evidence.requiredArtifacts.length, 1);
}

assert.equal(workerKinds.buildWorkerContract('bounded_worker').authority.execute, true);
assert.equal(workerKinds.buildWorkerContract('verifier_worker').authority.execute, true);
assert.equal(workerKinds.buildWorkerContract('resident_daemon').authority.execute, true);
assert.equal(workerKinds.buildWorkerContract('scout_cell').authority.execute, false);
assert.equal(workerKinds.buildWorkerContract('creative_worker').authority.execute, false);
assert.equal(workerKinds.buildWorkerContract('specialist').authority.write, false);

assert.equal(workerKinds.resolveWorkerKind(undefined, 'independent_reviewer'), 'verifier_worker');
assert.equal(workerKinds.resolveWorkerKind(undefined, 'red_team'), 'red_worker');
assert.equal(workerKinds.resolveWorkerKind(undefined, 'sub_orchestrator'), 'sub_orchestrator');
assert.throws(() => workerKinds.resolveWorkerKind('unknown_kind'), { code: 'UNKNOWN_WORKER_KIND' });
assert.equal(workerKinds.buildWorkerContract('sub_orchestrator').spawnBudget, 0);
assert.equal(workerKinds.buildWorkerContract('sub_orchestrator').delegationDepth, 0);
console.log('Node worker kind registry matches all 19 Rust worker kinds.');
