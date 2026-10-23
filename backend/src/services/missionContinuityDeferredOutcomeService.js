'use strict';

function runningOrchestrators(agents) {
  return agents.filter(agent => agent.execution_mode === 'orchestrator' && agent.status === 'running')
    .map(agent => agent.id);
}

async function latestLocalWorkerEvents(db, ids) {
  return db.all(`SELECT event.agent_id, event.event_type, event.payload_json
    FROM telemetry_events event
    WHERE event.id IN (
      SELECT MAX(id) FROM telemetry_events
      WHERE agent_id IN (SELECT value FROM json_each(?))
        AND event_type IN ('LOCAL_WORKER_COMPLETED', 'LOCAL_WORKER_FAILED')
      GROUP BY agent_id
    )`, JSON.stringify(ids));
}

function deferredCompletions(events) {
  return new Set(events.filter(event => {
    if (event.event_type !== 'LOCAL_WORKER_COMPLETED') return false;
    try { return JSON.parse(event.payload_json || '{}').deferredTerminalEventType === 'AGENT_COMPLETED'; }
    catch (_) { return false; }
  }).map(event => event.agent_id));
}

async function forOutcome(db, agents) {
  const ids = runningOrchestrators(agents);
  if (!ids.length) return agents;
  const completed = deferredCompletions(await latestLocalWorkerEvents(db, ids));
  return agents.map(agent => completed.has(agent.id) ? { ...agent, status: 'completed' } : agent);
}

module.exports = { forOutcome };
