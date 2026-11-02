'use strict';

const { digest, scopeOf } = require('./contract');
const { readContext } = require('./consumerContext');

async function projectScope(db, projectId) {
  const project = await db.get('SELECT id, config_json, state FROM ontogenesis_projects WHERE id = ?', [projectId]);
  if (!project) throw new Error('GNS_PROJECT_NOT_FOUND');
  const config = JSON.parse(project.config_json || '{}');
  const scope = scopeOf({ organizationId: config.gvxScope?.organizationId, projectId: project.id });
  return { project, scope };
}

async function ensureHistory(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ontogenesis_nervous_history (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    execution_id TEXT, phase TEXT NOT NULL, captured_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS ontogenesis_nervous_history_scope
    ON ontogenesis_nervous_history(organization_id, project_id, captured_at);`);
}

function measurement(agent) {
  return { agentId: agent.agentId, mode: agent.mode, pressure: agent.pressure,
    coverage: agent.coverage, pressureAt: agent.pressureAt, coverageAt: agent.coverageAt,
    lastThreatAt: agent.lastThreatAt, source: agent.source || null };
}

function snapshotOf(context, input) {
  return { schema: 'genos.ontogenesis-nervous-observation/v1', scope: context.scope,
    phase: input.phase, executionId: input.executionId || null,
    outcome: input.outcome || null, agents: context.agents.map(measurement),
    signalRefs: context.history.map(item => item.signal.id),
    evidenceStatus: 'UNVERIFIED', causalAttribution: 'not_claimed' };
}

function changes(before, after) {
  return after.agents.map(agent => {
    const previous = before?.agents.find(item => item.agentId === agent.agentId);
    const comparable = Number.isFinite(previous?.pressure) && Number.isFinite(agent.pressure);
    return { agentId: agent.agentId, pressureDelta: comparable ? agent.pressure - previous.pressure : null,
      previousMode: previous?.mode || 'UNKNOWN', mode: agent.mode };
  });
}

async function historyRows(db, scope) {
  return db.all(`SELECT * FROM ontogenesis_nervous_history
    WHERE organization_id = ? AND project_id = ? ORDER BY rowid DESC LIMIT 20`,
  [scope.organizationId, scope.projectId]);
}

async function capture(db, input) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return { status: 'DISABLED', available: false };
  try { return await captureAvailable(db, input); }
  catch (error) { return { status: 'UNAVAILABLE', available: false, reason: error.message }; }
}

async function captureAvailable(db, input) {
  if (!['context', 'before', 'after'].includes(input.phase)) throw new TypeError('Invalid GNS capture phase');
  const { project, scope } = await projectScope(db, input.projectId);
  const context = await readContext({ db, scope });
  if (context.status !== 'AVAILABLE') return { ...context, available: false };
  await ensureHistory(db);
  const snapshot = { ...snapshotOf(context, input), projectState: project.state };
  const id = digest([scope, input.phase, input.executionId || snapshot]);
  await db.run(`INSERT OR IGNORE INTO ontogenesis_nervous_history
    (id, organization_id, project_id, execution_id, phase, captured_at, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, scope.organizationId, scope.projectId,
    input.executionId || null, input.phase, new Date().toISOString(), JSON.stringify(snapshot)]);
  const history = await historyRows(db, scope);
  const stored = await db.get('SELECT snapshot_json FROM ontogenesis_nervous_history WHERE id = ?', [id]);
  const recorded = JSON.parse(stored.snapshot_json);
  const previous = await baselineFor(db, { ...input, scope, id });
  return { status: 'AVAILABLE', available: true, snapshot: recorded, history,
    comparison: { changes: changes(previous, recorded), causalAttribution: 'not_claimed',
      evidenceStatus: 'UNVERIFIED' }, mayAuthorize: false, mayPromote: false };
}

async function baselineFor(db, input) {
  const row = await db.get(`SELECT snapshot_json FROM ontogenesis_nervous_history
    WHERE organization_id = ? AND project_id = ? AND execution_id IS ? AND phase = 'before'
    AND id != ? ORDER BY rowid LIMIT 1`, [input.scope.organizationId, input.scope.projectId,
    input.executionId || null, input.id]);
  return row ? JSON.parse(row.snapshot_json) : null;
}

module.exports = { capture, projectScope };
