'use strict';

const { getDatabase, closeDatabase } = require('../src/db');

function parsePayload(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return null; }
}

async function explain(db, missionId) {
  const mission = await db.get(`SELECT mission_id AS missionId, objective, status,
    orchestrator_agent_id AS orchestratorAgentId, created_at AS createdAt,
    updated_at AS updatedAt FROM missions WHERE mission_id = ?`, missionId);
  if (!mission) throw new Error(`Mission '${missionId}' was not found.`);
  const agents = await db.all(`WITH RECURSIVE members(id) AS (
    SELECT agent_id FROM mission_agents WHERE mission_id = ?
    UNION SELECT child.id FROM agents child JOIN members parent ON child.parent_agent_id = parent.id
  ) SELECT DISTINCT a.id, a.role, a.status, a.execution_mode FROM members m
    JOIN agents a ON a.id = m.id ORDER BY a.id`, missionId);
  const ids = agents.map((agent) => agent.id);
  const events = ids.length ? await db.all(`SELECT agent_id AS agentId, event_type AS eventType,
    action, detail, payload_json AS payloadJson, created_at AS createdAt FROM telemetry_events
    WHERE agent_id IN (${ids.map(() => '?').join(',')})
    AND event_type IN ('AGENT_PLAN_CREATED','EVIDENCE_REPORT','UNVERIFIED_CLAIM',
      'DOSSIER_INFLUENCE_VERIFIED','MISSION_NO_ANSWER_PROVEN','AGENT_COMPLETED','AGENT_FAILED')
    ORDER BY created_at, id`, ...ids) : [];
  const morphology = await db.all(`SELECT graph_id AS graphId, version, status, parent_version AS parentVersion,
    graph_json AS graphJson, created_at AS createdAt FROM morphology_graph_versions
    WHERE mission_id = ? ORDER BY created_at, graph_id, version`, missionId);
  return {
    mission,
    agents,
    morphology: morphology.map((graph) => ({ ...graph, graph: parseGraph(graph.graphJson), graphJson: undefined })),
    evidence: events.map((event) => ({ ...event, payload: parsePayload(event.payloadJson), payloadJson: undefined })),
    promotion: { status: 'unknown', reason: 'No mission-level promotion receipt was found by this report.' }
  };
}

function parseGraph(serialized) {
  try { return JSON.parse(serialized); } catch (_) { return null; }
}

async function main() {
  const missionId = process.argv[2];
  if (!missionId || !missionId.trim()) throw new Error('Usage: genos explain <mission-id>');
  const db = await getDatabase();
  try { process.stdout.write(`${JSON.stringify(await explain(db, missionId), null, 2)}\n`); }
  finally { await closeDatabase(); }
}

main().catch((error) => { console.error(`genos explain: ${error.message}`); process.exitCode = 1; });
