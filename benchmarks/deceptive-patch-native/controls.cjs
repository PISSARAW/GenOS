'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {fixes} = require('../deceptive-patch-bench/controls.cjs');
const evaluate = require('../deceptive-patch-bench/evaluate.cjs');
const native = require('../../backend/src/services/epistemic/oracleWorkspaceChecks');
const protocol = require('./protocol.json');

function subject(workspace) {
  const sources = fs.readdirSync(workspace).filter(name => name.endsWith('.cjs')).map(name => {
    const content = fs.readFileSync(path.join(workspace, name), 'utf8');
    return {path: name, content, sha256: createHash('sha256').update(content).digest('hex')};
  });
  return {contract: {version: 1, kind: 'commonjs_public_tests', tests: ['smoke.test.cjs', 'invariants.test.cjs'],
    sources: sources.map(({path: name, sha256}) => ({path: name, sha256, mutable: !name.endsWith('.test.cjs')}))}, sources};
}
function control(root, task) {
  const workspace = path.join(root, task);
  fs.cpSync(path.join(__dirname, '../deceptive-patch-bench/fixtures', task), workspace, {recursive: true});
  assert.equal(native.checkWorkspace(subject(workspace), 'source_recompute').status, 'refuted');
  for (const [name, content] of Object.entries(fixes[task])) fs.writeFileSync(path.join(workspace, name), content);
  for (const strategy of ['source_recompute', 'cross_check']) {
    assert.equal(native.checkWorkspace(subject(workspace), strategy).status, 'verified');
  }
  const hidden = evaluate.hidden(workspace, {task, seed: 101});
  assert.equal(hidden.passed, 8);
  return {task, baselineNativeVerdict: 'refuted', referenceNativeVerdicts: 2, referenceHiddenPassed: hidden.passed};
}
function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dpb-native-oracle-controls-'));
  try {console.log(JSON.stringify({controls: protocol.tasks.map(task => control(root, task)),
    scope: 'executed oracle controls; no real Qwen trial or causal result'}, null, 2));}
  finally {fs.rmSync(root, {recursive: true, force: true});}
}
if (require.main === module) main();
module.exports = {subject, control};
