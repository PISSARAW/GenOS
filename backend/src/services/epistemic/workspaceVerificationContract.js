'use strict';

const { normalizeRelativePath } = require('../pathSafety');
const KINDS = new Set(['two_machine_partition', 'observed_statistics', 'literal_logs',
  'paired_means', 'json_field_contract', 'synthetic_data_quality', 'bar_durations',
  'poem_constraints', 'git_numeric_history', 'python_palindrome', 'csv_report_total', 'publication_dossier']);
const EDITABLE = new Set(['python_palindrome', 'csv_report_total']);

function invalid() {
  throw Object.assign(new Error('A bounded, source-bound workspace verification contract is required.'), {
    code: 'WORKSPACE_VERIFICATION_CONTRACT_INVALID'
  });
}

function assertContract(contract) {
  if (contract?.version !== 1 || !KINDS.has(contract.kind)) invalid();
  if (!Array.isArray(contract.sources) || !contract.sources.length || contract.sources.length > 12) invalid();
  const paths = new Set();
  for (const source of contract.sources) validateSource(source, { contract, paths });
  if (EDITABLE.has(contract.kind) && !paths.has(contract.artifactPath)) invalid();
  if (JSON.stringify(contract).length > 16384) invalid();
  return contract;
}

function validateSource(source, context) {
  const relative = normalizeRelativePath(source?.path, 'verification source');
  if (relative !== source.path || context.paths.has(relative) || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) invalid();
  if (source.mutable && (!EDITABLE.has(context.contract.kind) || relative !== context.contract.artifactPath)) invalid();
  context.paths.add(relative);
}

function assertMatches(contract, request) {
  const expected = contract?.assignment?.workspaceVerificationContract || null;
  const actual = request?.workerAssignment?.workspaceVerificationContract || null;
  if (!require('node:util').isDeepStrictEqual(expected, actual)) {
    throw Object.assign(new Error('The workspace verification contract differs from its sealed assignment.'), {
      code: 'WORKSPACE_VERIFICATION_CONTRACT_MISMATCH'
    });
  }
  if (expected) assertContract(expected);
}

module.exports = { assertContract, assertMatches, KINDS };
