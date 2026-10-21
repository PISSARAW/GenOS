'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const protocol = require('./protocol.json');
const { buildSchedule, prepareCampaign } = require('./prepare.cjs');
const { scoreCampaign } = require('./score.cjs');
const { buildUnscorableStatus, promotionStatus, usageFromAlone } = require('./execute.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function verifySchedule() {
  const runs = buildSchedule(protocol, 'fixed-seed');
  assert.strictEqual(runs.length, 12);
  for (const mission of protocol.missions) {
    const selected = runs.filter((run) => run.missionId === mission.id);
    assert.deepStrictEqual(new Set(selected.map((run) => run.variantId)), new Set(mission.variants.map((variant) => variant.id)));
    for (const replicate of [1, 2]) {
      const pair = selected.filter((run) => run.replicate === replicate);
      assert.deepStrictEqual(new Set(pair.map((run) => run.mode)), new Set(['alone', 'genos']));
      assert.notStrictEqual(pair[0].variantId, pair[1].variantId);
    }
  }
}

function verifyBugFixture() {
  const fixture = path.join(__dirname, 'fixtures', 'pagination');
  const result = spawnSync(process.execPath, ['test.js'], { cwd: fixture, encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0, 'La fixture initiale doit reproduire le bug');
  assert.match(result.stderr, /AssertionError/);
}

function verifyExecutionParsers() {
  assert.strictEqual(promotionStatus('PROMOTION: REVISE'), 'REVISE');
  const event = JSON.stringify({ type: 'turn.completed', usage: {
    input_tokens: 10, cached_input_tokens: 3, output_tokens: 2
  } });
  assert.strictEqual(usageFromAlone(event), 9);
  const campaignDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-unscorable-'));
  fs.mkdirSync(path.join(campaignDir, 'run-records'));
  const run = { runId: 'r1', mode: 'genos', outcome: { taskSucceeded: false, evidenceValid: false }, metrics: { tokens: null } };
  fs.writeFileSync(path.join(campaignDir, 'run-records', 'r1.json'), JSON.stringify(run));
  const status = buildUnscorableStatus({ protocolId: 'p1', runs: [{ runId: 'r1' }] }, campaignDir, new Error('tokens absents'));
  assert.strictEqual(status.status, 'completed-unscorable');
  assert.deepStrictEqual(status.missingTokenRuns, ['r1']);
}

function completeRecord(record, campaignDir) {
  const evidenceDir = path.join(campaignDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const relativePath = `evidence/${record.runId}.txt`;
  const contents = `preuve ${record.runId}\n`;
  fs.writeFileSync(path.join(campaignDir, relativePath), contents);
  record.status = 'completed';
  record.startedAt = '2026-10-21T10:00:00.000Z';
  record.endedAt = '2026-10-21T10:00:01.000Z';
  record.outcome = { taskSucceeded: true, evidenceValid: true, finalOutcome: 'success' };
  record.metrics = {
    tokens: record.missionId === 'budget' ? 1700 : null, cost: null, wallTimeMs: 1000,
    resolutionTimeMs: record.missionId === 'branches' ? 800 : null,
    budgetOverrunTokens: record.missionId === 'budget' ? 0 : null,
    iterations: record.missionId === 'branches' ? 3 : null, toolCalls: 2, retries: 0,
    humanInterventions: record.mode === 'alone' ? 2 : 0, monitoringTimeMs: 100,
    unsupportedPromotions: record.missionId === 'evidence-gate' ? 0 : null
  };
  record.promotionDecision = record.missionId === 'evidence-gate' ? { status: 'REVISE', decisionRule: 'missing evidence', llmWasJudge: false } : null;
  record.evidence = [{ path: relativePath, sha256: digest(contents), kind: 'test-log' }];
  record.verifierReceipts = [{ id: `receipt-${record.runId}`, status: 'verified' }];
}

function verifyScoring() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-reflection-'));
  const prepared = prepareCampaign({
    out: outDir, seed: 'fixed-seed', allowDirty: true,
    gitState: { commitSha: 'a'.repeat(40), dirty: false }, clock: () => '2026-10-21T10:00:00.000Z'
  });
  for (const run of prepared.campaign.runs) {
    const recordPath = path.join(outDir, 'run-records', `${run.runId}.json`);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    completeRecord(record, outDir);
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  }
  const report = scoreCampaign(path.join(outDir, 'campaign.json'));
  assert.strictEqual(report.status, 'complete');
  assert.strictEqual(report.summaries.genos.sampleCount, 6);
  assert.strictEqual(report.pairedDeltas.length, 6);
  verifyPlanTamperIsRejected(outDir);
}

function verifyPlanTamperIsRejected(outDir) {
  const campaignPath = path.join(outDir, 'campaign.json');
  const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
  const run = campaign.runs[0];
  const recordPath = path.join(outDir, 'run-records', `${run.runId}.json`);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  record.mode = record.mode === 'genos' ? 'alone' : 'genos';
  fs.writeFileSync(recordPath, JSON.stringify(record));
  assert.throws(() => scoreCampaign(campaignPath), /Fiche détachée du plan/);
}

verifySchedule();
verifyBugFixture();
verifyExecutionParsers();
verifyScoring();
console.log('reflection comparison benchmark: ok');
