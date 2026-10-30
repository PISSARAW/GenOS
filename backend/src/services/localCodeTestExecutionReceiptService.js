'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { digest, encode } = require('./biologicalIntegrity');
const { normalizeSandboxCommand, isAllowedSandboxTestCommand } = require('./sandboxCommandPolicy');
const snapshots = require('./workspaceSnapshotStore');

const SCHEMA = 'genos.local-code-test-execution/v1';

function workspaceDigest(files) {
  return digest((files || []).map(({ path: file, hash }) => ({ path: file, hash }))
    .sort((left, right) => left.path.localeCompare(right.path)));
}

function testEvidence(test) {
  const command = normalizeSandboxCommand(test?.command);
  if (!isAllowedSandboxTestCommand(command) || !Number.isInteger(test?.exitCode)) {
    throw Object.assign(new Error('Invalid executed test result for trusted receipt.'), {
      code: 'LOCAL_CODE_TEST_RECEIPT_INVALID'
    });
  }
  return { command, exitCode: test.exitCode, signal: test.signal || null,
    stdoutHash: digest(String(test.stdout || '')), stderrHash: digest(String(test.stderr || '')) };
}

async function recordExecutedBatch(db, input = {}) {
  const missionId = String(input.missionId || '').trim();
  const agentId = String(input.agentId || '').trim();
  const executionRunId = String(input.executionRunId || '').trim();
  const workspaceRoot = path.resolve(String(input.workspaceRoot || '.'));
  if (!db || !missionId || !agentId || !executionRunId || !Array.isArray(input.tests)
      || input.tests.length === 0 || !Array.isArray(input.workspaceFiles)) {
    throw Object.assign(new Error('Local test receipt context is incomplete.'), {
      code: 'LOCAL_CODE_TEST_RECEIPT_CONTEXT_INVALID'
    });
  }
  const tests = input.tests.map(testEvidence);
  const outcome = tests.every(test => test.exitCode === 0 && test.signal === null) ? 'passed' : 'failed';
  const payload = { schema: SCHEMA, receiptId: `test_${crypto.randomUUID()}`,
    batchId: crypto.randomUUID(), missionId, agentId, executionRunId, workspaceRoot,
    startedAt: input.startedAt || null, completedAt: input.completedAt || new Date().toISOString(),
    outcome, tests, workspaceDigest: workspaceDigest(input.workspaceFiles),
    ...reviewSnapshotFields(input.reviewSnapshot),
    changedFileHashes: (input.changedFileHashes || []).map(({ path: file, hash }) => ({ path: file, hash }))
      .sort((left, right) => left.path.localeCompare(right.path)) };
  const receiptHash = digest(payload);
  await db.run(`INSERT INTO local_code_test_execution_receipts
    (receipt_id, mission_id, agent_id, execution_run_id, outcome, receipt_hash, receipt_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, payload.receiptId, missionId, agentId, executionRunId,
  outcome, receiptHash, encode(payload));
  return { receiptId: payload.receiptId, batchId: payload.batchId,
    outcome, receiptHash, workspaceDigest: payload.workspaceDigest };
}

function reviewSnapshotFields(reviewSnapshot) {
  return reviewSnapshot ? { reviewSnapshot } : {};
}

async function collectVerifiedForMission(db, missionId, agents = []) {
  if (!db || !missionId) return [];
  const rows = await db.all(`SELECT * FROM local_code_test_execution_receipts
    WHERE mission_id = ? ORDER BY rowid`, missionId);
  // Windows local-code execution runs its bounded worker under the mission's
  // orchestrator identity, so completion scope is the mission member, not its DB role.
  const completedMembers = new Set((agents || []).filter(agent => agent.status === 'completed')
    .map(agent => agent.id));
  const verified = [];
  for (const row of rows) {
    const payload = parsePayload(row.receipt_json);
    if (!payload || !completedMembers.has(row.agent_id) || !validRow(row, payload, missionId)) continue;
    if (payload.outcome !== 'passed' || !payload.tests.every(test => test.exitCode === 0 && test.signal === null)) continue;
    try {
      const files = await snapshots.collectFiles(payload.workspaceRoot);
      if (workspaceDigest(files) !== payload.workspaceDigest) continue;
    } catch (_) { continue; }
    verified.push({ receiptId: row.receipt_id, batchId: payload.batchId,
      agentId: row.agent_id, executionRunId: row.execution_run_id,
      receiptHash: row.receipt_hash, workspaceDigest: payload.workspaceDigest,
      commands: payload.tests.map(test => test.command) });
  }
  return verified;
}

function parsePayload(serialized) {
  try { return JSON.parse(serialized); } catch (_) { return null; }
}

function validRow(row, payload, missionId) {
  return payload.schema === SCHEMA && payload.receiptId === row.receipt_id
    && payload.missionId === missionId && payload.agentId === row.agent_id
    && payload.executionRunId === row.execution_run_id && payload.outcome === row.outcome
    && Array.isArray(payload.tests) && payload.tests.length > 0
    && payload.tests.every(test => isAllowedSandboxTestCommand(test.command)
      && Number.isInteger(test.exitCode) && /^[a-f0-9]{64}$/.test(test.stdoutHash)
      && /^[a-f0-9]{64}$/.test(test.stderrHash))
    && /^[a-f0-9]{64}$/.test(payload.workspaceDigest)
    && digest(payload) === row.receipt_hash;
}

async function recordFromWorkspace(db, input) {
  const workspaceFiles = await snapshots.collectFiles(input.workspaceRoot);
  return recordExecutedBatch(db, { ...input, workspaceFiles });
}

module.exports = { SCHEMA, workspaceDigest, recordExecutedBatch, recordFromWorkspace,
  collectVerifiedForMission, validRow };
