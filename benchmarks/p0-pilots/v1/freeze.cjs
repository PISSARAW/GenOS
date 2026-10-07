'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const environment = require('./environment.cjs');

async function main() {
  const destination = path.resolve(process.argv[2]);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.mkdirSync(destination);
  environment.validateAssets();
  const before = environment.sourceHashes();
  for (const name of Object.keys(before)) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(environment.root, name), target);
  }
  const after = environment.sourceHashes();
  if (environment.drift(before, after).length) throw new Error('Source changed during freeze; preserve failed capsule and retry in new directory');
  fs.symlinkSync(path.join(environment.root, 'backend/node_modules'), path.join(destination, 'backend/node_modules'), 'junction');
  fs.symlinkSync(path.join(environment.root, 'node_modules'), path.join(destination, 'node_modules'), 'junction');
  const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, 'protocol.json')));
  const manifest = { id: protocol.id, createdAt: new Date().toISOString(),
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: environment.root, encoding: 'utf8' }).trim(),
    sources: before, dependencies: environment.dependencyHashes(), model: await environment.modelIdentity(protocol),
    lean: environment.leanIdentity(), host: environment.hostIdentity(),
    policy: 'Source capsule immutable after freeze. Dependencies linked read-only by convention and hash-checked before and after each run. No env or database copied.' };
  fs.writeFileSync(path.join(destination, 'frozen-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ root: destination, sourceCount: Object.keys(before).length,
    dependencyCount: Object.keys(manifest.dependencies).length, digest: environment.digest(manifest) }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
