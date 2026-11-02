'use strict';

function requestsFor(agent) {
  if (!agent.source) return [];
  const base = { agentId: agent.agentId, signalId: agent.source.signalId,
    sourceEventId: agent.source.sourceEventId, observedAt: agent.source.observedAt,
    evidenceStatus: 'UNVERIFIED', executionAuthorized: false };
  const requests = [];
  if (agent.mode === 'ALERT') requests.push({ ...base, kind: 'REEVALUATE_TOPOLOGY' });
  if (agent.pressure >= 0.8) requests.push({ ...base, kind: 'REALLOCATE_WORKERS', pressure: agent.pressure });
  return requests;
}

async function observe(context) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return null;
  if (!context.db || !context.agentId) return null;
  try {
    const row = await context.db.get(`SELECT w.organization_id,w.project_id FROM agents a
      JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, context.agentId);
    if (!row?.organization_id || !row.project_id) return null;
    const scope = { organizationId: row.organization_id, projectId: row.project_id };
    const agentIds = await require('./morphogenesisMembership').memberIds(context, scope);
    if (!agentIds) return null;
    const nervous = await require('./consumerContext').readContext({ db: context.db, scope, agentIds });
    if (nervous.status !== 'AVAILABLE') return null;
    return { scope: nervous.scope, requests: nervous.agents.flatMap(requestsFor).slice(0, 64),
      evidenceStatus: 'UNVERIFIED', executionAuthorized: false };
  } catch (_) { return null; }
}

async function enrichObservation(context, observation) {
  const nervous = await observe(context);
  if (!nervous?.requests.length) return observation;
  return { ...observation, nervous };
}

module.exports = { observe, enrichObservation };
