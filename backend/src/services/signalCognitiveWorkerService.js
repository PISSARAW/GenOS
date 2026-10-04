'use strict';

const { randomUUID } = require('node:crypto');
const { getDatabase } = require('../db');
const jobs = require('./signalCognitiveJobsService');
const escalation = require('./cognitiveEscalationService');
const cognition = require('./cognitiveSignalService');
const metrics = require('./signalMetricsService');

const OWNER = `${process.pid}:${randomUUID()}`;
let polling = false;

async function processCognitiveJob(signalId) {
  const db = await getDatabase();
  const owner = `${OWNER}:${randomUUID()}`;
  const claimed = await jobs.claimCognitiveJob(db, { signalId, owner });
  if (!claimed) return false;
  const { signal, attempts } = claimed;
  metrics.recordLlmEscalation();
  try {
    const target = await escalation.selectCognitiveTarget(signal);
    if (!target) throw new Error('No scoped cognitive target is available.');
    await assertScopedTarget(db, signal.scope, target);
    const context = escalation.buildMinimalContext(signal);
    const result = await cognition.handleSignal({ db, agentId: target, signal, context });
    if (!result.text.trim()) throw new Error('Cognitive provider returned an empty response.');
    const completed = await jobs.completeCognitiveJob(db, {
      signalId, owner, targetAgentId: target, result
    });
    if (completed) {
      metrics.recordOutcome('llm_success');
      escalation.recordEscalationOutcome(signalId, 'generated', 1);
    }
    return completed;
  } catch (error) {
    await jobs.failCognitiveJob(db, { signalId, owner, attempts, error: error.message });
    metrics.recordOutcome('llm_failed');
    escalation.recordEscalationOutcome(signalId, 'failed', 1);
    console.warn(`[SignalPlaneSubscriber] Cognitive job ${signalId} failed: ${error.message}`);
    return false;
  }
}

async function assertScopedTarget(db, scope, target) {
  const row = await db.get(
    `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
    target, scope.organizationId, scope.projectId
  );
  if (!row) throw new Error('Cognitive target is outside the signal scope.');
}

async function pollCognitiveJobs() {
  if (polling) return;
  polling = true;
  try {
    const db = await getDatabase();
    for (const row of await jobs.listReadyCognitiveJobs(db)) {
      await processCognitiveJob(row.signal_id);
    }
  } finally {
    polling = false;
  }
}

module.exports = { processCognitiveJob, pollCognitiveJobs };
