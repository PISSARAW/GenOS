'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {assertVersion} = require('./source-version.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dpb-source-version-'));
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
try {
  git(['init', '-q']); git(['config', 'user.name', 'DPB fixture']); git(['config', 'user.email', 'fixture@localhost']);
  fs.writeFileSync(path.join(root, 'source.cjs'), 'module.exports = 1;\n');
  git(['add', 'source.cjs']); git(['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '-qm', '[TEST] Source fixture']);
  const input = {root, revision: git(['rev-parse', 'HEAD'])};
  assert.doesNotThrow(() => assertVersion(input));
  fs.writeFileSync(path.join(root, 'source.cjs'), 'module.exports = 2;\n');
  assert.throws(() => assertVersion(input), /SOURCE_TREE_DIRTY/);
  fs.writeFileSync(path.join(root, 'source.cjs'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'extra.cjs'), 'untracked source');
  assert.throws(() => assertVersion(input), /SOURCE_TREE_DIRTY/);
  fs.unlinkSync(path.join(root, 'extra.cjs'));
  assert.throws(() => assertVersion({...input, revision: '0'.repeat(40)}), /REVISION_CHANGED/);
  console.log('Frozen source: real Git revision, tracked mutation and untracked additions checked: PASS');
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, {recursive: true, force: true});
}
