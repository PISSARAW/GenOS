'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const qualification = require('./boundedCodeWorkerQualification.cjs');
const contract = require('../src/services/epistemic/codePostconditionContract');
const oracle = require('../src/services/epistemic/oracleCodeChecks');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-bounded-code-fixture-'));
try {
  qualification.prepare(root);
  const artifact = path.join(root, 'src', 'answer.gexpr');
  const expression = '(a - b * Math.floor(a/b))';
  fs.writeFileSync(artifact, expression);
  const passed = runFixture(root);
  assert.equal(passed.status, 0, passed.stderr);
  const subject = { contract: contract.descriptor(), contractHash: contract.hash(),
    artifact: { contentHash: 'a'.repeat(64), expression } };
  for (const strategy of oracle.STRATEGIES) {
    const result = oracle.checkCode(subject, strategy);
    assert.equal(result.status, 'verified', strategy);
    assert.deepEqual(result.coverage, { expectedCases: 264, checkedCases: 264, complete: true });
  }

  fs.writeFileSync(artifact, 'process.exit()');
  const rejected = runFixture(root);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /did not match the regular expression/);
  console.log('Bounded code fixture accepts safe Math.floor expressions across both 264-case oracles and rejects executable source outside its language.');
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function runFixture(rootPath) {
  return spawnSync(process.execPath, ['tests/bounded-code.cjs'], { cwd: rootPath,
    encoding: 'utf8', windowsHide: true, timeout: 10000 });
}
