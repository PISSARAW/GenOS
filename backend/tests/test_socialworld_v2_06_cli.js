'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildSocialMentalModel } = require('../src/services/socialMentalModelService');
const { applyMemoryIntervention } = require('../src/services/socialMentalModelInterventionService');

const root = path.resolve(__dirname, '../..');
const reportDirectory = path.join(root, 'benchmarks/social-world/campaigns/socialworld-v2/reports');

function memory(id, overrides = {}) {
  return { id, subjectAgentId: 'agent-a', otherAgentId: 'agent-b', relationType: 'friend',
    polarity: 'supports', statement: `Shared experience ${id}.`, receiptId: `receipt-${id}`,
    occurredAt: `2026-10-${String(Number(id.slice(-1)) + 1).padStart(2, '0')}T10:00:00.000Z`, ...overrides };
}

function buildArms() {
  const memories = [memory('social-1'), memory('social-2'), memory('social-3'),
    memory('social-4', { polarity: 'contradicts', statement: 'A disagreement followed their last project.',
      beliefAboutOther: { proposition: 'B thinks the disagreement was resolved.', confidence: 0.65 } })];
  const masked = applyMemoryIntervention({ mode: 'mask-social-memories', interventionId: 'mask-1', memories,
    socialMemoryIds: memories.map((item) => item.id) });
  const counterfactual = applyMemoryIntervention({ mode: 'counterfactual-social-memories', interventionId: 'replace-1', memories,
    socialMemoryIds: memories.map((item) => item.id), replacementMemories: memories.map((item, index) =>
      memory(`cf-${index + 1}`, { polarity: 'contradicts' })) });
  const build = (values) => buildSocialMentalModel({ subjectAgentId: 'agent-a', otherAgentId: 'agent-b', memories: values });
  const arm = (model, action, interventionReceipt) => ({ model, interventionReceipt,
    decision: { action, receiptId: `decision:${action}`, memoryReferences: model.sourceMemoryIds,
      contextHash: 'ctx', budgetHash: 'budget', permissionHash: 'permissions' } });
  return {
    baseline: arm(build(memories), 'propose-collaboration', { mode: 'baseline' }),
    masked: arm(build(masked.memories), 'ask-for-update', masked.receipt),
    counterfactual: arm(build(counterfactual.memories), 'wait-for-reconciliation', counterfactual.receipt),
  };
}

function report() {
  const arms = buildArms();
  const evidenceRefs = Object.values(arms).flatMap((entry) => [entry.decision.receiptId, ...entry.model.sourceMemoryIds]);
  return { campaignId: 'socialworld-v2', scenario: 'V2-06', arm: 'paired', seed: 1, attempt: 1,
    sourceCommit: 'a'.repeat(40), runtimeVersion: 'socialworld-test-runtime', model: 'fixture-model',
    configHash: 'b'.repeat(64), status: 'pass', startedAt: '2026-10-24T00:00:00.000Z', durationMs: 1,
    inputs: {}, observed: {}, oracle: { status: 'pass', caseId: 'v2-06-collaboration-after-disagreement-v1' },
    evidenceRefs, violations: [], limitations: [],
    caseId: 'v2-06-collaboration-after-disagreement-v1', arms };
}

function main() {
  fs.mkdirSync(reportDirectory, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(reportDirectory, 'cli-test-'));
  try {
    const input = path.join(temporary, 'report.json');
    fs.writeFileSync(input, JSON.stringify(report()));
    const relative = path.relative(root, input);
    const result = spawnSync(process.execPath, ['benchmarks/social-world/evaluate-v2-06.cjs', '--input', relative],
      { cwd: root, encoding: 'utf8', env: process.env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'pass');
    const traversal = spawnSync(process.execPath, ['benchmarks/social-world/evaluate-v2-06.cjs', '--input', '..\\..\\outside.json'],
      { cwd: root, encoding: 'utf8', env: process.env });
    assert.equal(traversal.status, 2);
    console.log('SocialWorld V2-06 command-line report evaluation passed.');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

try { main(); }
catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
