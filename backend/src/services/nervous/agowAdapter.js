'use strict';

const { build } = require('../agow/candidates/candidateAdapterService');
const { FRESH_MS } = require('./physiology');

async function agentContext(options) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return null;
  if (!options.db || !options.agentId) return null;
  try {
    const row = await options.db.get(`SELECT w.organization_id,w.project_id FROM agents a
      JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, options.agentId);
    if (!row?.organization_id || !row.project_id) return null;
    return require('./consumerContext').readContext({ db: options.db,
      scope: { organizationId: row.organization_id, projectId: row.project_id },
      agentIds: [options.agentId] });
  } catch (_) { return null; }
}

function candidateFor(agent) {
  const source = agent.source;
  const candidate = build({ agentId: agent.agentId, module: 'interoception', now: source.observedAt,
    observation: {
      candidateId: `gns:${source.signalId}`, semanticType: 'resource_state',
      artifactRef: `gns:receipt:${source.signalId}`,
      evidenceRefs: [`gns:signal:${source.signalId}`, `telemetry:${source.sourceEventId}`],
      epistemicOrigin: { origin: 'tool_observed', agency: 'self', realityMode: 'real' },
      confidence: 0, evidenceCoverage: 0, actionable: false, ttlMs: FRESH_MS,
      compactPreview: JSON.stringify({ mode: agent.mode, pressure: agent.pressure,
        coverage: agent.coverage, evidenceStatus: 'UNVERIFIED' })
    } });
  candidate.measures.urgency = agent.mode === 'ALERT' ? 1 : agent.pressure;
  candidate.constraints.viability = 'review';
  return candidate;
}

async function attend(options) {
  const context = await agentContext(options);
  if (context?.status !== 'AVAILABLE') return { candidates: [], status: context?.status || 'UNAVAILABLE' };
  const agents = context.agents.filter(agent => agent.source
    && (agent.mode === 'ALERT' || agent.pressure >= 0.8));
  return { candidates: agents.map(candidateFor), status: context.status, scope: context.scope,
    evidenceStatus: 'UNVERIFIED' };
}

module.exports = { attend, agentContext };
