'use strict';

const store = require('../biologicalWorkerStore');

async function load(input) {
  const { db, parentId, missionId, method, result } = input;
  const summaries = Array.isArray(result.childSummaries) ? result.childSummaries : [];
  const children = await Promise.all(method.parameters.children.map((expected, index) =>
    loadChild({ db, parentId, missionId, expected, summary: summaries[index] })));
  return { parentId, missionId, children };
}

async function loadChild(input) {
  const { db, parentId, missionId, expected, summary } = input;
  const childId = summary?.childId;
  const [agent, run, events] = await Promise.all([
    readAgent(db, childId), readLatestRun(db, childId), readWorkerEvents(db, childId)
  ]);
  const binding = run?.id ? await store.binding(db, run.id) : null;
  const terminal = eventForRun(events, 'AGENT_COMPLETED', run?.id);
  const evidenceEvent = eventForRun(events, 'EVIDENCE_REPORT', run?.id);
  const report = evidenceEvent ? require('../agentEvidenceService').extractEvidenceReport(evidenceEvent.payload) : null;
  return buildChildSnapshot({ input, agent, binding, run, terminal, evidenceEvent, report });
}

function buildChildSnapshot(input) {
  const { input: source, agent, binding, run, terminal, evidenceEvent, report } = input;
  const { parentId, missionId, expected, summary } = source;
  return { expected, summary, agentParentId: readPath(agent, 'parent_agent_id'),
    workerKind: readPath(binding, 'genome', 'workerContract', 'identity', 'workerKind'),
    parentWorkerId: readPath(binding, 'parentWorkerId'), missionId: readPath(binding, 'missionId'),
    methodContract: readPath(binding, 'genome', 'workerContract', 'mission', 'methodContract'),
    requiredArtifact: readPath(binding, 'genome', 'workerContract', 'evidence', 'requiredArtifacts', '0'),
    runId: readPath(run, 'id'), runStatus: readPath(run, 'status'),
    terminalRunId: readPath(terminal, 'payload', 'executionRunId'),
    evidenceRunId: readPath(evidenceEvent, 'payload', 'executionRunId'),
    outcome: readPath(report, 'outcome'), artifactType: readPath(report, 'workerArtifact', 'type'),
    sourceRefs: readPath(report, 'workerArtifact', 'provenance', 'sourceRefs'),
    content: readPath(report, 'workerArtifact', 'content'), parentId, parentMissionId: missionId };
}

function readPath(value, ...keys) {
  let current = value;
  for (const key of keys) current = current && current[key];
  return current || null;
}

async function readAgent(db, childId) {
  if (!childId) return null;
  return db.get('SELECT id, parent_agent_id, status, metadata_json FROM agents WHERE id = ?', childId);
}

async function readLatestRun(db, childId) {
  if (!childId) return null;
  return db.get(`SELECT id, status FROM strategy_execution_runs
    WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1`, childId);
}

async function readWorkerEvents(db, childId) {
  if (!childId) return [];
  return db.all(`SELECT event_type, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED') ORDER BY rowid DESC LIMIT 20`, childId);
}

function eventForRun(events, type, runId) {
  return events.map(event => ({ ...event, payload: parse(event.payload_json) }))
    .find(event => event.event_type === type && event.payload.executionRunId === runId);
}

function parse(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

module.exports = { load };
