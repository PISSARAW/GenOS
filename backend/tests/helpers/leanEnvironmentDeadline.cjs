'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const environment = require('../../src/services/epistemicScheduler/leanEnvironment');

async function verify() {
  const boundary = await fs.promises.realpath(os.tmpdir());
  const root = await fs.promises.mkdtemp(path.join(boundary, 'genos-lean-integrity-'));
  try {
    const names = ['bin/lean.exe', 'lib/lean/libleanshared.dll', 'lib/lean/A.olean',
      'lib/lean/A.olean.private', 'lib/lean/A.olean.server', 'lib/lean/B.olean'];
    for (const name of names) {
      await fs.promises.mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await fs.promises.writeFile(path.join(root, name), `synthetic integrity fixture ${name}`);
    }
    const modules = ['B', 'A', 'A'].map(name => ({ name, path: path.join(root, `lib/lean/${name}.olean`) }));
    const before = await environment.measureEnvironment(root, { modules });
    const reordered = await environment.measureEnvironment(root, { modules: [...modules].reverse() });
    assert.deepEqual(reordered, before);
    assert.equal(before.environmentManifest.length, 7);
    assert.ok(before.environmentManifest.some(entry => entry.file.endsWith('.olean.server')));
    await fs.promises.writeFile(path.join(root, 'lib/lean/A.olean.private'), 'changed private module');
    assert.notEqual((await environment.measureEnvironment(root, { modules })).environmentDigest, before.environmentDigest);
    await assert.rejects(environment.measureEnvironment(root, { modules: [
      { name: 'missing', path: path.join(root, 'missing.olean') }] }), /ENOENT/);
    const original = fs.createReadStream;
    let opened = 0;
    fs.createReadStream = (...args) => { opened++; return original(...args); };
    try {
      await assert.rejects(environment.measureEnvironment(root, { modules }, { deadlineAt: Date.now() - 1 }), /deadline exceeded/);
      assert.equal(opened, 0, 'An expired measurement must not start reading file contents.');
    } finally { fs.createReadStream = original; }
    console.log('Lean environment integrity: all files, canonical ordering, private mutation and expired-budget refusal PASS (synthetic files).');
  } finally {
    const resolved = await fs.promises.realpath(root);
    assert.equal(path.dirname(resolved), boundary);
    assert.ok(path.basename(resolved).startsWith('genos-lean-integrity-'));
    await fs.promises.rm(resolved, { recursive: true, force: true });
  }
}

module.exports = { verify };
