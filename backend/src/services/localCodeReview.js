'use strict';

const snapshots = require('./workspaceSnapshotStore');
const { normalizeSandboxCommand } = require('./sandboxCommandPolicy');

function responseFormat(allowedCommands = []) {
  return { name: 'genos_test_only_v1', schema: { type: 'object', additionalProperties: false,
    properties: { format: { const: 'genos.test-only/v1' }, patches: { type: 'array', maxItems: 0 },
      tests: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: allowedCommands } },
      evidence: { type: 'string' } }, required: ['format', 'patches', 'tests', 'evidence'] } };
}

function parse(text, allowedTest, commands) {
  const value = JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || '{}');
  const validate = new (require('ajv'))({ strict: false }).compile(responseFormat(commands).schema);
  if (!validate(value) || value.tests.some(command => !allowedTest(command, commands))) {
    throw Object.assign(new Error('Test-only reviewer requires zero patches and allow-listed tests.'), {
      code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
  }
  return value;
}

function assertMission(mission) {
  const kind = mission.workerContract?.identity?.workerKind || mission.workerKind;
  if (kind !== 'verifier_worker' || mission.executionPolicy?.allowFileEdits !== false) {
    throw Object.assign(new Error('Test-only execution requires a read-only verifier contract.'), { code: 'WORKER_CONTRACT_DENIED' });
  }
}

async function execute(input) {
  const { mission, workspaceRoot, db, executionRun } = input;
  assertMission(mission);
  const proposal = parse(input.text, input.allowedTest, input.allowedCommands || []);
  const before = await snapshots.collectFiles(workspaceRoot);
  const reviewSnapshot = require('./localCodeReviewSnapshot').assertSnapshot(mission, before);
  const tests = [];
  for (const command of proposal.tests) tests.push(await input.runTest(normalizeSandboxCommand(command), workspaceRoot));
  const after = await snapshots.collectFiles(workspaceRoot);
  require('./localCodeTestScope').assertScope({ before, after, patches: [] });
  if (!db || !executionRun?.id) throw new Error('Test-only review needs its persisted execution run.');
  const testExecutionReceipt = await require('./localCodeTestExecutionReceiptService').recordExecutedBatch(db, {
    missionId: mission.missionId || mission.mission_id || mission.id,
    agentId: mission.agentId, executionRunId: executionRun.id, workspaceRoot,
    tests, workspaceFiles: after, changedFileHashes: [], reviewSnapshot });
  return { proposal, changedFiles: [], changedFileHashes: [], tests, testExecutionReceipt,
    reviewedFiles: before, reviewOnly: true, merged: false,
    testStatus: tests.every(test => test.exitCode === 0) ? 'passed' : 'failed' };
}

module.exports = { responseFormat, execute, assertMission };
