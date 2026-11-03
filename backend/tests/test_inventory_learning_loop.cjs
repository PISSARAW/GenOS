'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_ADMIN_PASSWORD = 'inventory-learning-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const { captureTelemetryEvent } = require('../src/services/autobiographicalMemory/captureService');
const { recallForSituation } = require('../src/services/autobiographicalMemory/recallService');
const { applyAdjustments } = require('../src/services/autobiographicalMemory/orchestratorRecall');
const { chooseAction } = require('../src/services/causalDecisionService');

async function capture(db) {
  for (const index of [1, 2, 3]) await captureTelemetryEvent({
    id: `inventory-failure-${index}`, agentId: 'inventory-learner', eventType: 'AGENT_FAILED',
    timestamp: new Date().toISOString(), payload: { missionId: `prior-${index}`,
      goal: 'repair orchestration', selectedStrategy: 'unsafe-retry',
      status: 'failed', reason: 'missing proof', cost: { tokens: 6000 } }
  }, db);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-inventory-learning-'));
  try {
    const db = await getDatabase(path.join(root, 'loop.db'));
    await capture(db);
    const situation = { agentId: 'inventory-learner', goal: 'repair orchestration' };
    const ablated = await recallForSituation(situation, { consolidate: false }, db);
    assert.equal(ablated.lessons.length, 0);
    const recalled = await recallForSituation(situation, {}, db);
    assert.ok(recalled.lessons.length > 0);
    assert.ok(recalled.consolidation.lessonIds.length > 0);
    const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.55, evidenceStrictness: 0.7 } } };
    const baseline = chooseAction({ policy: plan.selfModel.decisionPolicy });
    applyAdjustments(plan, recalled.adjustments);
    assert.equal(baseline.chosenAction, 'proceed');
    assert.equal(chooseAction({ policy: plan.selfModel.decisionPolicy }).chosenAction, 'verify_first');
    const foreign = await recallForSituation({ ...situation, agentId: 'other-agent' }, {}, db);
    assert.equal(foreign.lessons.length, 0);
    console.log('Observation -> consolidation -> recall -> subsequent decision: PASS, bounded policy effect only.');
  } finally { await closeDatabase(); await fs.rm(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
