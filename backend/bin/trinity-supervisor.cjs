#!/usr/bin/env node
'use strict';

const { getDatabase, closeDatabase } = require('../src/db');
const trinityBarrier = require('../src/services/trinityComparativeBarrier');
const trinityService = require('../src/services/trinityService');
const organization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');

const TERMINAL = new Set(['blocked', 'completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined']);

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorkers(db, missionId, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.all(
      `SELECT w.agent_id as agentId, a.status FROM trinity_worlds w
       LEFT JOIN agents a ON a.id = w.agent_id WHERE w.id LIKE ? ORDER BY w.world_number`,
      `${missionId}%`
    );
    if (rows.length >= 3 && rows.every((row) => TERMINAL.has(row.status))) return rows;
    await pause(500);
  }
  throw new Error(`Trinity mission timed out: ${missionId}`);
}

async function publish(db, input) {
  const { orchestratorId, missionId, result, promotion } = input;
  const payload = { missionId, trinityMerge: result, promotion };
  await organization.publish(db, {
    orchestratorId,
    senderAgentId: orchestratorId,
    kind: 'evidence',
    content: JSON.stringify(payload),
    payload,
    signalType: 'plasmid',
    signalData: payload
  });
}

async function supervise(input) {
  const db = await getDatabase();
  try {
    await waitForWorkers(db, input.missionId);
    const reports = await trinityBarrier.buildWorldReportsFromMission(db, input.missionId);
    const result = trinityService.mergeTrinityEvidence(reports, { domain: 'puzzle_design', threshold: 0.70 });
    await trinityService.recordWorldComparison(db, {
      missionId: input.missionId,
      orchestratorId: input.orchestratorId,
      comparison: result.comparativeAnalysis,
      decision: { canMerge: result.canMerge, threshold: 0.70 }
    });
    const promotion = await trinityBarrier.promoteWinner(db, {
      missionId: input.missionId,
      orchestratorId: input.orchestratorId,
      result
    });
    await publish(db, { ...input, result, promotion });
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_COMPLETED', agentId: input.orchestratorId, action: 'COMPLETE_TRINITY', detail: 'Trinity supervision completed.', payload: { missionId: input.missionId, canMerge: result.canMerge }, severity: 'info' });
  } catch (error) {
    await publish(db, { ...input, result: { canMerge: false, error: error.message }, promotion: { promoted: false } }).catch(() => {});
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_FAILED', agentId: input.orchestratorId, action: 'FAIL_TRINITY', detail: error.message, payload: { missionId: input.missionId }, severity: 'error' });
  } finally {
    await closeDatabase(db);
  }
}

let input = {};
try { input = JSON.parse(process.argv[2] || '{}'); } catch (error) { process.exitCode = 1; }
if (input.missionId && input.orchestratorId) supervise(input).catch((error) => {
  console.error(`[trinity-supervisor] ${error.stack || error.message}`);
  process.exitCode = 1;
});
