'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const integrity = require('./integrity.cjs');
const base = path.resolve(os.tmpdir());
const root = fs.mkdtempSync(path.join(base, 'native-integrity-'));
const save = value => fs.writeFileSync(root + '/runtime-source-manifest.json', JSON.stringify(value));

try {
  fs.mkdirSync(root + '/target/debug', {recursive: true});
  for (const name of ['fixture.js', 'target/debug/genos.exe', 'target/debug/genos-mcp.exe']) {
    fs.writeFileSync(path.join(root, name), 'Synthetic integrity fixture: ' + name);
  }
  const sources = {'fixture.js': integrity.fileHash(root + '/fixture.js')};
  const binaries = Object.fromEntries(['target/debug/genos.exe', 'target/debug/genos-mcp.exe']
    .map(name => [name, integrity.fileHash(path.join(root, name))]));
  const manifest = {sources, binaries, sourceHashEncoding: 'sorted-compact-utf8-json/v1',
    sourcesHash: integrity.fingerprint(sources), nodeHash: integrity.fileHash(process.execPath)};
  manifest.runtimeHash = integrity.fingerprint({sourcesHash: manifest.sourcesHash, binaries, nodeHash: manifest.nodeHash});
  save(manifest);
  assert.equal(integrity.verifySources(root).runtimeHash, manifest.runtimeHash);
  fs.appendFileSync(root + '/target/debug/genos.exe', ' changed');
  assert.throws(() => integrity.verifySources(root), /RUNTIME_CHANGED/);
  sources['fixture.js'] = '0'.repeat(64);
  save(manifest);
  assert.throws(() => integrity.verifySources(root), /SOURCE_MANIFEST_HASH_MISMATCH/);
  manifest.sourcesHash = integrity.fingerprint(sources);
  save(manifest);
  assert.throws(() => integrity.verifySources(root), /RUNTIME_SEAL_MISMATCH/);
  console.log('Synthetic integrity fixtures reject binary changes and rewritten source manifests: PASS');
} finally {
  assert.equal(path.dirname(path.resolve(root)), base);
  assert.ok(path.basename(root).startsWith('native-integrity-'));
  fs.rmSync(root, {recursive: true, force: true});
}
