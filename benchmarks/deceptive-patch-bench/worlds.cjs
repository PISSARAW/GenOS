'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { importWorkspace, scanWorkspace } = require('../../backend/src/services/gqwf/import');
const driver = require('../../backend/src/services/gqwf/materialization/portableCopy');
const { write } = require('./io.cjs');
async function snapshot(source, directory) {
  const store = path.join(directory, 'cas');
  fs.mkdirSync(store, { recursive: true });
  const manifest = await importWorkspace(source, store);
  write(path.join(directory, 'base-manifest.json'), manifest);
  return { store, manifest };
}
async function fork(base, destination) {
  fs.mkdirSync(destination, { recursive: true });
  await driver.materialize({ manifest: base.manifest.manifest, workspacePath: base.store, destination });
  const actual = await scanWorkspace(destination, false);
  if (actual.hash !== base.manifest.hash) throw Error('FORK_HASH_MISMATCH');
  return { path: destination, rootHash: actual.hash, backend: driver.id };
}
async function promote(source, destination) {
  const base = await snapshot(source, path.join(path.dirname(destination), 'promotion'));
  return fork(base, destination);
}
module.exports = { snapshot, fork, promote };
