const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workerKinds = require('../src/services/agents/workerKindService');
const phenotypes = require('../src/services/agents/phenotypeRegistryService');
const enforcement = require('../src/services/agents/workerContractEnforcement');

const rustRoot = path.resolve(__dirname, '../../crates/genos-worker/src');
const rustSource = fs.readFileSync(path.join(rustRoot, 'phenotype.rs'), 'utf8');
const presetSource = fs.readFileSync(path.join(rustRoot, 'presets.rs'), 'utf8');
const enumBody = rustSource.match(/pub enum WorkerKind \{([\s\S]*?)\n\}/)?.[1] || '';
const rustKinds = [...enumBody.matchAll(/^\s{4}([A-Z][A-Za-z]+),?$/gm)].map((match) => workerKinds.normalize(match[1]));
assert.deepEqual(Object.keys(workerKinds.KINDS).sort(), rustKinds.sort());
assert.equal(rustKinds.length, 19);

function rustFunctionBody(source, functionName) {
  const declaration = source.indexOf(`fn ${functionName}(`);
  assert.notEqual(declaration, -1, `Rust function ${functionName} exists`);
  const opening = source.indexOf('{', declaration);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  throw new Error(`Rust function ${functionName} has unbalanced braces.`);
}

function rustFamilies() {
  const body = rustFunctionBody(rustSource, 'family_of');
  const families = new Map();
  for (const [, variants, family] of body.matchAll(/^\s*([A-Z][A-Za-z]*(?:\s*\|\s*[A-Z][A-Za-z]*)*)\s*=>\s*([A-Z][A-Za-z]*),?$/gm)) {
    for (const variant of variants.split('|')) families.set(workerKinds.normalize(variant), family);
  }
  return families;
}

function rustPresetNames() {
  const body = rustFunctionBody(presetSource, 'preset_for');
  return new Map([...body.matchAll(/^\s*([A-Z][A-Za-z]*)\s*=>\s*([a-z_]+)\(input\),?$/gm)]
    .map(([, variant, preset]) => [workerKinds.normalize(variant), preset]));
}

function rustPresetArtifact(presetName, visited = new Set()) {
  assert.ok(!visited.has(presetName), `Rust preset inheritance has no cycle at ${presetName}`);
  const nextVisited = new Set(visited).add(presetName);
  const body = rustFunctionBody(presetSource, presetName);
  const assignments = [...body.matchAll(/required_artifacts\s*=\s*vec!\[\s*"([^"]+)"/g)];
  if (assignments.length) return assignments.at(-1)[1];
  const inherited = [...body.matchAll(/([a-z_]+_preset)\(input\)/g)].at(-1)?.[1];
  return inherited ? rustPresetArtifact(inherited, nextVisited) : 'dossier';
}

const familyByKind = rustFamilies();
const presetByKind = rustPresetNames();
for (const [kind, [family, artifact]] of Object.entries(workerKinds.KINDS)) {
  assert.equal(familyByKind.get(kind), family, `${kind} family matches Rust`);
  assert.equal(rustPresetArtifact(presetByKind.get(kind)), artifact, `${kind} required artifact matches Rust preset`);
}

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
assert.equal(Object.keys(workerKinds.ROLE_ALIASES).length, 19);
assert.equal(workerKinds.resolveWorkerKind(undefined, 'security_engineer'), 'specialist');
assert.throws(() => workerKinds.resolveWorkerKind('unknown_kind'), { code: 'UNKNOWN_WORKER_KIND' });
assert.equal(workerKinds.buildWorkerContract('sub_orchestrator').spawnBudget, 0);
assert.equal(workerKinds.buildWorkerContract('sub_orchestrator').delegationDepth, 0);
const rustSubOrchestratorPreset = rustFunctionBody(presetSource, 'suborchestrator_preset');
assert.match(rustSubOrchestratorPreset, /authority\.delegate\s*=\s*true/);
assert.match(rustSubOrchestratorPreset, /authority\.spawn\s*=\s*true/);
const delegatedNodeContract = workerKinds.grantBoundedDelegation(workerKinds.buildWorkerContract('sub_orchestrator'));
assert.equal(delegatedNodeContract.authority.spawn, true);
assert.equal(delegatedNodeContract.authority.delegate, true);
assert.equal(delegatedNodeContract.delegationDepth, 1);
assert.equal(delegatedNodeContract.spawnBudget, 5);
assert.equal(enforcement.assertRuntimeContract(delegatedNodeContract, 'sub_orchestrator'), true);
assert.equal('resources' in workerKinds.buildWorkerContract('formal_worker'), false);
assert.match(rustFunctionBody(presetSource, 'procedural_preset'), /resources\.tokens\s*=\s*0/);
console.log('Rust and Node worker kind identifiers, families, and artifacts match; runtime projections remain distinct.');
