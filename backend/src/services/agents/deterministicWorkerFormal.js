'use strict';

const { createHash } = require('node:crypto');
const { executeLeanCheck } = require('../epistemicScheduler/leanProcessExecutor');

const ARITHMETIC_CLAIM = /^\s*\d+(?:\s*[+*%]\s*\d+)*\s*(?:=|<=|>=|≤|<|≥|>)\s*\d+(?:\s*[+*%]\s*\d+)*\s*$/u;

function formalInputError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_FORMAL_INPUT_INVALID' });
}

function sourceFor(parameters = {}) {
  if (!ARITHMETIC_CLAIM.test(parameters.claim || '')) {
    throw formalInputError('Formal worker currently accepts only a closed natural-number arithmetic comparison.');
  }
  if (typeof parameters.toolchainVersion !== 'string' || !parameters.toolchainVersion.trim()) {
    throw formalInputError('An exact Lean toolchain version is required.');
  }
  return `theorem genos_worker_claim : ${parameters.claim.trim()} := by decide\n`;
}

async function runFormal(methodContract, options = {}) {
  const parameters = methodContract?.parameters || {};
  const source = sourceFor(parameters);
  const execute = options.executor || executeLeanCheck;
  const execution = await execute({
    source, toolchainVersion: parameters.toolchainVersion, strictToolchainVersion: true,
    leanExecutable: options.leanExecutable || 'lean', timeoutMs: options.timeoutMs || 30000
  });
  if (execution.exitCode !== 0 || execution.axioms.length
    || execution.toolchainVersion !== parameters.toolchainVersion) {
    throw Object.assign(new Error(`Lean did not certify the claim: ${String(execution.stderr || execution.stdout || 'execution failed').slice(0, 500)}`), {
      code: 'WORKER_FORMAL_CHECK_FAILED'
    });
  }
  const digest = createHash('sha256').update(source).digest('hex');
  const receipt = {
    id: `solver://sha256:${digest}`, claim: parameters.claim.trim(), solver: 'Lean', result: 'proved',
    evidence: [`solver://sha256:${digest}`], sourceDigest: `sha256:${digest}`,
    toolchainVersion: execution.toolchainVersion, axioms: execution.axioms
  };
  return { claim: receipt.claim, solver: receipt.solver, result: receipt.result, solverReceipt: receipt };
}

module.exports = { sourceFor, runFormal };
