'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const checks = require('../src/services/epistemic/oracleWorkspaceChecks');
const native = require('../src/services/epistemic/oracleNativeProcess');
const { REFERENCES, CASES } = require('../src/services/epistemic/javascriptRepairCases');
const contractService = require('../src/services/epistemic/workspaceVerificationContract');

function subject(caseId, code) {
  return { contract: { version: 1, kind: 'javascript_repair_cases', suite: 'genos.pure-js-repair/v1',
    caseId, artifactPath: 'module.js', sources: [{ path: 'module.js', mutable: true,
      sha256: crypto.createHash('sha256').update(code).digest('hex') }] },
  sources: [{ path: 'module.js', content: code }] };
}

async function main() {
  const processes = new Set();
  for (const id of Object.keys(CASES)) {
    const value = subject(id, `module.exports = ${REFERENCES[id]};`);
    contractService.assertContract(value.contract);
    for (const strategy of checks.STRATEGIES) {
      const executed = await native.run(value, { kind: 'workspace', strategy, timeoutMs: 10000 });
      assert.equal(executed.result.status, 'verified', JSON.stringify(executed));
      assert.equal(executed.result.cases.length, 12);
      processes.add(executed.detail.processId);
      const mutant = subject(id, 'module.exports = () => null;');
      assert.equal(checks.checkWorkspace(mutant, strategy).status, 'refuted');
    }
  }
  assert.equal(processes.size, 6, 'Each strategy must execute a real isolated verifier process');
  const mutating = subject('pagination', 'module.exports = (items) => items.splice(0,2);');
  assert.equal(checks.checkWorkspace(mutating, 'cross_check').status, 'refuted');
  const forbidden = subject('discount', 'module.exports = () => process.exit(0);');
  assert.equal(checks.checkWorkspace(forbidden, 'cross_check').status, 'inconclusive');
  const unknown = subject('invented', 'module.exports = () => null;');
  assert.throws(() => contractService.assertContract(unknown.contract), { code: 'JAVASCRIPT_REPAIR_CONTRACT_INVALID' });
  const immutable = subject('discount', 'module.exports = () => null;');
  immutable.contract.sources[0].mutable = false;
  assert.throws(() => contractService.assertContract(immutable.contract), { code: 'JAVASCRIPT_REPAIR_CONTRACT_INVALID' });
  immutable.contract.sources[0].mutable = 'false';
  assert.throws(() => contractService.assertContract(immutable.contract), { code: 'JAVASCRIPT_REPAIR_CONTRACT_INVALID' });
  const looping = subject('port', 'module.exports = () => { while(true) {} };');
  assert.equal(checks.checkWorkspace(looping, 'cross_check').status, 'refuted');
  console.log('Bounded JavaScript oracle: real processes, reference recomputation, mutants and confinement: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
