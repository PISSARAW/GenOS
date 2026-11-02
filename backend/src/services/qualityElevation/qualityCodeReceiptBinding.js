'use strict';
const path = require('node:path');
const { digest, fail } = require('./qualityContract');
const tests = require('../localCodeTestExecutionReceiptService');
const snapshots = require('../workspaceSnapshotStore');
const values = require('../trinityProvenanceValues');

function invalid(message) { return fail('GQEL_CODE_EVIDENCE_MISMATCH', message); }

function sourceFilesOf(input) {
  const sourceFiles = input.codeEvidence?.sourceFiles;
  if (!Array.isArray(sourceFiles) || !sourceFiles.length) throw invalid('Reviewed source files are required.');
  let bundle;
  try { bundle = JSON.parse(input.result.bestVersion.content); }
  catch (_) { throw invalid('Code review must bind the exact source bundle.'); }
  if (bundle.schema !== 'genos.quality-code-bundle/v1' || digest(bundle.files) !== digest(sourceFiles)) throw invalid('Reviewed bundle differs from delivered source files.');
  if (!sourceFiles.every(file => typeof file.path === 'string' && typeof file.content === 'string'
    && digest(file.content) === file.hash)) throw invalid('Reviewed source content does not match its file hash.');
  if (new Set(sourceFiles.map(file => file.path)).size !== sourceFiles.length) throw invalid('Reviewed source paths are duplicated.');
  return sourceFiles;
}

function fileIdentities(files) {
  return files.map(({ path: file, hash }) => ({ path: file, hash })).sort((left, right) => left.path.localeCompare(right.path));
}

async function testReceipt(input) {
  const claimed = input.codeEvidence?.testExecutionReceipt;
  if (!claimed?.receiptId) throw invalid('An executed test receipt is required.');
  const row = await input.db.get('SELECT * FROM local_code_test_execution_receipts WHERE receipt_id = ?', claimed.receiptId);
  if (!row) throw invalid('Executed test receipt is not persisted.');
  const payload = JSON.parse(row.receipt_json);
  if (!tests.validRow(row, payload, input.worker.missionId)) throw invalid('Executed test receipt integrity is invalid.');
  assertTestScope(input, { row, payload }, claimed);
  assertPassedTests(payload);
  return { row, payload };
}

function assertTestScope(input, proof, claimed) {
  const { row, payload } = proof;
  const runId = input.executionRunId || input.worker.executionRunId;
  if (row.agent_id !== input.worker.agentId || row.execution_run_id !== runId) throw invalid('Tests were executed by another worker or run.');
  if (row.receipt_hash !== claimed.receiptHash || payload.batchId !== claimed.batchId) throw invalid('Executed test receipt identity differs.');
  if (path.resolve(payload.workspaceRoot) !== path.resolve(input.worker.workspaceRoot)) throw invalid('Tests belong to another workspace.');
}

function assertPassedTests(payload) {
  if (payload.outcome !== 'passed' || !payload.tests.every(test => test.exitCode === 0 && test.signal === null)) throw invalid('Executed tests did not all pass.');
}

function assertEvidenceRefs(input, proof, sourceFiles) {
  const claims = input.artifact?.content?.claims || [];
  const refs = new Set(claims.flatMap(claim => claim.evidence || []));
  const expected = [`genos://code-test-execution/${proof.row.receipt_hash}`,
    ...fileIdentities(sourceFiles).map(file => `genos://code-file/${values.digest(file)}`)];
  if (!input.artifact?.content || !expected.every(ref => refs.has(ref))) throw invalid('Delivered dossier does not reference the tested exact source.');
}

async function bindCodeDelivery(input) {
  if (input.result.contract.profile !== 'code') throw invalid('Different review and delivery targets require the native code verifier.');
  const sourceFiles = sourceFilesOf(input), proof = await testReceipt(input);
  if (digest(fileIdentities(sourceFiles)) !== digest(fileIdentities(proof.payload.changedFileHashes || []))) throw invalid('Reviewed files differ from executed test subjects.');
  const current = await snapshots.collectFiles(input.worker.workspaceRoot);
  if (tests.workspaceDigest(current) !== proof.payload.workspaceDigest) throw invalid('Workspace changed after the reviewed tests.');
  const byPath = new Map(current.map(file => [file.path, file.hash]));
  if (!sourceFiles.every(file => byPath.get(file.path) === file.hash)) throw invalid('Reviewed files differ from the current workspace.');
  assertEvidenceRefs(input, proof, sourceFiles);
  return { schema: 'genos.gqel-code-delivery-binding/v1', sourceFiles: fileIdentities(sourceFiles),
    testReceiptId: proof.row.receipt_id, testReceiptHash: proof.row.receipt_hash,
    workspaceDigest: proof.payload.workspaceDigest };
}

module.exports = { bindCodeDelivery };
