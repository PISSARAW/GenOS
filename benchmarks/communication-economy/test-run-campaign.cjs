'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCampaign } = require('./run-campaign.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-economy-'));
const arms = ['naive-broadcast', 'genos-zero-text', 'genos-d-full', 'agentsociety'];
const entries = arms.map((armId) => {
  const sourceSystem = armId === 'agentsociety' ? 'agentsociety' : 'genos';
  const tracePath = `${armId}.jsonl`;
  const row = { runId: armId, armId, scenarioId: 'pilot-10x100', seed: 7,
    taskId: 'task-1', model: 'same-model', provider: 'same-provider',
    verification: { status: 'verified', verifierId: 'independent-oracle', independent: true },
    informationLost: false, modelCallsComplete: true, modelCalls: [], usageReceipts: [],
    episodeCostsUsd: { verificationUsd: 0, memoryUsd: 0, planningUsd: 0, retryUsd: 0,
      transportUsd: 0, computeUsd: 0 } };
  fs.writeFileSync(path.join(root, tracePath), JSON.stringify(row));
  return { sourceSystem, tracePath, runId: armId, armId, scenarioId: row.scenarioId,
    seed: 7, model: row.model, provider: row.provider, taskIds: ['task-1'] };
});

try {
  const manifestPath = path.join(root, 'manifest.json');
  const reportPath = path.join(root, 'report.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ campaignId: 'test', entries }));
  assert.equal(runCampaign(manifestPath, reportPath), reportPath);
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).matchedSeedGroups, 1);
  console.log('communication-economy campaign import: ok');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
