'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { migrateSignalCognitiveJobs } = require('../src/db/migrations/migrateSignalCognitiveJobs');
const dbIndex = require('../src/db');
const jobs = require('../src/services/signalCognitiveJobsService');
const escalation = require('../src/services/cognitiveEscalationService');
const cognition = require('../src/services/cognitiveSignalService');
const metrics = require('../src/services/signalMetricsService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateSignalCognitiveJobs(db);
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO workspaces VALUES ('ws-test', 'org-test', 'proj-test');
    INSERT INTO agents VALUES ('agent-test', 'ws-test');`);
  dbIndex.getDatabase = async () => db;
  const worker = require('../src/services/signalCognitiveWorkerService');
  escalation.selectCognitiveTarget = async () => 'agent-test';
  escalation.buildMinimalContext = () => ({ signalId: 'signal-test' });
  let calls = 0;
  cognition.handleSignal = async ({ signal }) => {
    calls++;
    return { signalId: signal.signalId, text: 'Proposal only', provider: 'fixture' };
  };
  metrics.resetMetrics();
  try {
    await jobs.enqueueCognitiveJob(db, {
      signalId: 'signal-test', signalType: 'ligand', signalData: {},
      senderAgentId: 'agent-test', llmRequired: true,
      scope: { organizationId: 'org-test', projectId: 'proj-test' }
    });
    assert.equal(await worker.processCognitiveJob('signal-test'), true);
    assert.equal(await worker.processCognitiveJob('signal-test'), false);
    assert.equal(calls, 1);
    const completed = await db.get('SELECT status, result_json FROM signal_cognitive_jobs WHERE signal_id = ?', 'signal-test');
    assert.equal(completed.status, 'completed');
    assert.equal(JSON.parse(completed.result_json).text, 'Proposal only');
    assert.equal(metrics.getMetrics().llmWakeupsWithAction, 0);
    assert.equal(metrics.impactForOutcome('llm_success').impact, 0);

    cognition.handleSignal = async () => { throw new Error('provider unavailable'); };
    await jobs.enqueueCognitiveJob(db, {
      signalId: 'signal-failed', signalType: 'ligand', signalData: {},
      senderAgentId: 'agent-test', llmRequired: true,
      scope: { organizationId: 'org-test', projectId: 'proj-test' }
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      await db.run("UPDATE signal_cognitive_jobs SET next_attempt_at_ms = 0 WHERE signal_id = 'signal-failed'");
      assert.equal(await worker.processCognitiveJob('signal-failed'), false);
    }
    const failed = await db.get('SELECT status, attempts, last_error FROM signal_cognitive_jobs WHERE signal_id = ?', 'signal-failed');
    assert.equal(failed.status, 'dead');
    assert.equal(failed.attempts, 3);
    assert.match(failed.last_error, /provider unavailable/);
    const scope = { organizationId: 'org-test', projectId: 'proj-test' };
    assert.equal((await jobs.listScopedCognitiveJobs(db, scope)).length, 2);
    assert.equal(await jobs.retryDeadCognitiveJob(db, {
      organizationId: 'org-other', projectId: 'proj-other'
    }, 'signal-failed'), false);
    assert.equal(await jobs.retryDeadCognitiveJob(db, scope, 'signal-failed'), true);
    console.log('signal cognitive jobs passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
