'use strict';

const { digest } = require('./topologySnapshotContract');

function reportOf(row) {
  let payload;
  try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) { return null; }
  return payload?.evidenceReport || payload?.report || null;
}

function journalEntries(rows) {
  return rows.map((row) => ({ id: Number(row.id), agentId: row.agent_id,
    report: reportOf(row) })).filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && row.report);
}

function finalEvent(entries, world) {
  const expected = digest(world.report);
  return entries.find((entry) => entry.agentId === world.agentId && digest(entry.report) === expected);
}

function firstOutcome(entries, world) {
  return entries.find((entry) => entry.agentId === world.agentId
    && ['success', 'failed', 'error'].includes(entry.report.outcome));
}

function sealFromEntries(input) {
  const { missionId, reports, entries } = input;
  const oracle = reports.find((world) => world.worldNumber === 1);
  const peers = reports.filter((world) => world.worldNumber !== 1);
  if (!oracle?.agentId || peers.length !== 2 || peers.some((world) => !world.agentId)) return null;
  const prediction = oracle.report?.oraclePrediction;
  const event = finalEvent(entries, oracle);
  const outcomes = peers.map((world) => firstOutcome(entries, world));
  if (!event || !prediction || outcomes.some((row) => !row || row.id <= event.id)
    || peers.some((world) => !finalEvent(entries, world))) return null;
  return { status: 'sealed', missionId, worldNumber: 1, agentId: oracle.agentId,
    predictionHash: digest(prediction), reportHash: digest(oracle.report),
    predictionEventId: event.id, firstPeerOutcomeIds: outcomes.map((row) => row.id) };
}

async function capture(db, missionId, reports) {
  if (!db?.all || !missionId || !Array.isArray(reports) || reports.length !== 3) return null;
  const agents = reports.map((world) => world.agentId);
  if (agents.some((id) => typeof id !== 'string' || !id) || new Set(agents).size !== 3) return null;
  const rows = await db.all(`SELECT id, agent_id, payload_json FROM telemetry_events
    WHERE agent_id IN (?, ?, ?) AND event_type IN ('EVIDENCE_REPORT', 'AGENT_COMPLETED') ORDER BY id`, ...agents);
  return sealFromEntries({ missionId, reports, entries: journalEntries(rows) });
}

module.exports = { capture };
