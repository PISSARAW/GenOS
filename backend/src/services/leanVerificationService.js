'use strict';

const { executeLeanCheck } = require('./epistemicScheduler/leanProcessExecutor');
const { PLACEHOLDER_PROOF, forbiddenAxioms, passingExecution } = require('./epistemicScheduler/leanSourceContract');
const { FormalizationArtifact } = require('./mathematical/formalizationArtifact');

function requestError(source, statement) {
  if (typeof source !== 'string' || !source.trim()) return 'lean_source_missing';
  if (typeof statement !== 'string' || !statement.trim()) return 'lean_statement_missing';
  if (PLACEHOLDER_PROOF.test(source)) return 'lean_placeholders_forbidden';
  const binding = new FormalizationArtifact({ formalStatement: statement }).checkSourceBinding(source);
  return binding.matched ? null : 'lean_statement_mismatch';
}

async function verifyLeanCandidate(candidate, descriptor, context = {}) {
  return verifyRequest(candidate, descriptor, context);
}

function candidateStatement(candidate, descriptor, context) {
  return descriptor.canonicalStatement || descriptor.statement || context.canonicalStatement
    || candidate?.canonicalStatement || candidate?.statement;
}

async function verifyRequest(candidate, descriptor, context) {
  const source = descriptor.source || candidate?.source || candidate;
  const statement = candidateStatement(candidate, descriptor, context);
  const error = requestError(source, statement);
  if (error) return { status: 'inconclusive', reason: error, observations: [], formal: true };
  const request = { ...descriptor, source, toolchainVersion: descriptor.toolchainVersion || context.toolchainVersion };
  const execution = await executeLeanCheck(request);
  const passed = passingExecution(execution, request);
  const rejectedAxioms = forbiddenAxioms(execution.axioms, descriptor.allowedAxioms);
  return { status: passed ? 'verified' : 'inconclusive', formal: true, execution,
    reason: passed ? null : execution.reason || (rejectedAxioms.length ? 'lean_forbidden_axioms' : 'lean_execution_failed'),
    observations: [{ step: 'lean:check', result: execution }] };
}

module.exports = { verifyLeanCandidate };
