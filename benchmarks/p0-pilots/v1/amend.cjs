'use strict';

const fs = require('node:fs');
const path = require('node:path');
const environment = require('./environment.cjs');

function copyFiles(source, destination, names) {
  for (const name of names) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, name), target);
  }
}

function main() {
  const source = path.resolve(process.argv[2]);
  const destination = path.resolve(process.argv[3]);
  const previous = JSON.parse(fs.readFileSync(path.join(source, 'frozen-manifest.json')));
  const baseline = require(path.join(source, 'benchmarks/p0-pilots/v1/environment.cjs'));
  if (baseline.drift(previous.sources, baseline.sourceHashes()).length) throw new Error('Original frozen source drift');
  if (baseline.drift(previous.dependencies, baseline.dependencyHashes()).length) throw new Error('Original dependency drift');
  fs.mkdirSync(destination);
  copyFiles(source, destination, Object.keys(previous.sources));
  const overlays = ['reasoning-probe.cjs', 'smoke.cjs', 'amend.cjs'].map(name => 'benchmarks/p0-pilots/v1/' + name);
  copyFiles(environment.root, destination, overlays);
  for (const directory of ['backend/node_modules', 'node_modules']) {
    fs.symlinkSync(fs.realpathSync(path.join(source, directory)), path.join(destination, directory), 'junction');
  }
  const current = require(path.join(destination, 'benchmarks/p0-pilots/v1/environment.cjs'));
  const sources = current.sourceHashes();
  const changes = baseline.drift(previous.sources, sources);
  if (changes.some(name => !overlays.includes(name))) throw new Error('Unexpected instrumentation amendment');
  const manifest = { ...previous, createdAt: new Date().toISOString(), sources,
    amendment: { previousFrozenHash: environment.digest(previous), changedSources: changes,
      reason: 'Preserve multiline Lean proof layout. Failure reproduced on training task before reserved score inspection. No dataset, prompt, model, budget or selection changes. Initial campaign retained as invalid; amended runs are exploratory.' } };
  fs.writeFileSync(path.join(destination, 'frozen-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ root: destination, changes, digest: environment.digest(manifest) }));
}

main();
