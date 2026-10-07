'use strict';

const { boundSource } = require('../../suites/formal_math/v1/oracle/check.cjs');
const { MathematicalDependencyGraph } = require('../../../backend/src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../../../backend/src/services/epistemicScheduler/leanIncrementalGate');
const { executeLeanCheck } = require('../../../backend/src/services/epistemicScheduler/leanProcessExecutor');

function sourceFor(task, candidate) {
  const proof = candidate.proof;
  if (typeof proof !== 'string' || !/^by(?:\s|$)/.test(proof.trim())) throw new Error('Proof must start with by');
  if (/\b(?:IO|System|extern|native_decide|ofReduceBool|implemented_by|namespace|end|attribute|syntax)\b/.test(proof || '')) {
    throw new Error('Forbidden proof capability');
  }
  return boundSource(task, proof.trim()).replace('\n:= by\n', '\n:=\n');
}

function kernelAudit(stdout) {
  const empty = stdout.includes("'benchmark_target' does not depend on any axioms");
  const match = stdout.match(/depends on axioms: \[([^\]]*)\]/);
  const axioms = match ? match[1].split(',').map(name => name.trim()).filter(Boolean) : [];
  return { passed: empty || Boolean(match) && axioms.every(name => ['propext', 'Quot.sound', 'Classical.choice'].includes(name)), axioms };
}

async function check(task, candidate, context) {
  let source;
  try { source = sourceFor(task, candidate); }
  catch (error) { return { passed: false, feedback: error.message, executions: [] }; }
  const request = { source: source + '\n#print axioms benchmark_target\n', leanExecutable: context.lean.executable,
    toolchainVersion: context.lean.raw, strictToolchainVersion: true, timeoutMs: context.timeoutMs };
  let execution;
  let receipt;
  if (context.genos) {
    const graph = new MathematicalDependencyGraph();
    graph.addNode({ nodeId: context.branchId, type: 'theorem', canonicalStatement: task.formalStatement, status: 'formalized' });
    const executor = async () => { execution = await executeLeanCheck(request); return execution; };
    const gate = new LeanIncrementalGate({ graph, executor, toolchainVersion: context.lean.raw,
      environmentDigest: 'sha256:' + context.environmentDigest, allowedAxioms: new Set() });
    receipt = await gate.verifyNode({ nodeId: context.branchId, source });
  } else { execution = await executeLeanCheck(request); }
  const audit = kernelAudit(execution.stdout || '');
  return { passed: execution.exitCode === 0 && audit.passed && (!receipt || receipt.status === 'passed'),
    feedback: (execution.stdout || execution.stderr || '').slice(-1500), executions: [{ ...execution, error: execution.error?.message }],
    receipt, kernelAxioms: audit.axioms, source };
}

module.exports = { check, sourceFor, kernelAudit };
