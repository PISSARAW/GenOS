'use strict';

const { digest, scopeOf, identifier } = require('./contract');
const { FRESH_MS } = require('./physiology');
const { readContext } = require('./consumerContext');
const { recordObservation } = require('../shev/observationService');
const bridge = require('./runtimeBridge');

function normalizeConfig(config) {
  identifier(config.organizationId, 'organizationId');
  if (!Array.isArray(config.agentIds) || config.agentIds.length < 1 || config.agentIds.length > 128) {
    throw new TypeError('GNS SHEV sensor requires 1 to 128 agents');
  }
  const agentIds = [...new Set(config.agentIds.map(id => identifier(id, 'agentId')))].sort();
  return { organizationId: config.organizationId, agentIds };
}

async function trustedScope(db, input) {
  const row = await db.get('SELECT id, config_json FROM ontogenesis_projects WHERE id = ?', [input.projectId]);
  if (!row) throw new Error('GNS_PROJECT_NOT_FOUND');
  const config = JSON.parse(row.config_json || '{}');
  const scope = scopeOf({ organizationId: config.gvxScope?.organizationId, projectId: row.id });
  if (scope.organizationId !== input.organizationId) throw new Error('SCOPE_MISMATCH');
  return scope;
}

function classify(context, input) {
  if (context.status !== 'AVAILABLE' || context.agents.length !== input.agentIds.length) return unknown();
  if (context.agents.some(agent => !agent.source)) return unknown();
  const degraded = context.agents.some(agent => agent.mode === 'ALERT');
  if (degraded) return { kind: 'degradation', epistemicStatus: 'observed',
    summary: 'GNS observe une alerte operationnelle; le diagnostic reste a etablir.' };
  if (context.agents.some(agent => agent.mode !== 'REST')) return unknown();
  return { kind: 'state', epistemicStatus: 'observed',
    summary: 'Les agents surveilles sont au repos selon des mesures GNS fraiches.' };
}

function unknown() {
  return { kind: 'blind_spot', epistemicStatus: 'unknown',
    summary: 'La couverture GNS ne permet pas de conclure sur le fonctionnement du projet.' };
}

function observationOf(context, input) {
  const sources = supportingSources(context);
  const result = sources.length === context.agents.length ? classify(context, input) : unknown();
  const evidenceRefs = sources.flatMap(({ signal }) =>
    [`gns:receipt:${signal.id}`, `telemetry-event:${signal.eventId}`]).slice(0, 20);
  const at = result.epistemicStatus === 'observed'
    ? Math.max(...sources.map(source => source.signal.observedAt)) : Date.now();
  return { ...result, id: observationId(input),
    projectId: input.projectId, domain: 'operational-runtime', dimension: input.dimension,
    source: `gns:${digest([input.organizationId, input.projectId, input.agentIds])}`,
    observedAt: new Date(at).toISOString(), validUntil: new Date(expiryOf(sources, at)).toISOString(),
    evidenceRefs: result.epistemicStatus === 'observed' ? evidenceRefs : [] };
}

function expiryOf(sources, observedAt) {
  return sources.length ? Math.min(...sources.map(source => source.signal.observedAt)) + FRESH_MS : observedAt + FRESH_MS;
}

function supportingTime(agent) {
  if (agent.mode === 'REST' && Number.isFinite(agent.pressure)) return agent.pressureAt;
  if (agent.mode === 'ALERT') return agent.lastThreatAt;
  return null;
}

function supportingSources(context) {
  return context.agents.map(agent => context.history.find(({ signal, receipt }) =>
    signal.agentId === agent.agentId && signal.observedAt === supportingTime(agent)
    && receipt.disposition !== 'HISTORICAL')).filter(freshSource);
}

function freshSource(entry) {
  if (!entry) return false;
  const observedAt = entry.signal.observedAt;
  return observedAt <= Date.now() + 1000 && Date.now() - observedAt <= FRESH_MS;
}

function observationId(input) {
  return `gns_shev_${digest([input.projectId, input.sampleRef])}`;
}

async function existingObservation(db, input) {
  const row = await db.get('SELECT * FROM shev_observations WHERE project_id = ? AND id = ?',
    [input.projectId, observationId(input)]);
  if (!row) return null;
  const source = `gns:${digest([input.organizationId, input.projectId, input.agentIds])}`;
  if (row.source !== source || row.dimension !== input.dimension) throw new Error('GNS_SAMPLE_IDENTITY_MISMATCH');
  return { id: row.id, projectId: row.project_id, kind: row.kind, epistemicStatus: row.epistemic_status,
    source: row.source, dimension: row.dimension, domain: row.domain, summary: row.summary,
    observedAt: row.observed_at, validUntil: row.valid_until,
    evidenceRefs: JSON.parse(row.evidence_json), replayed: true };
}

async function inspect(db, input) {
  const config = normalizeConfig(input);
  const scope = await trustedScope(db, input);
  if (!bridge.enabled()) throw new Error('GNS_DISABLED');
  const replayed = await existingObservation(db, { ...input, ...config });
  if (replayed) return replayed;
  const context = await readContext({ db, scope, agentIds: config.agentIds });
  if (context.status === 'DISABLED') throw new Error('GNS_DISABLED');
  const observation = observationOf(context, { ...input, ...config });
  return recordObservation(db, observation);
}

module.exports = { normalizeConfig, inspect };
