/**
 * GenOS Experiments Lab Controller
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

function workspaceScope(req, alias = 'w') {
  const prefix = alias ? `${alias}.` : '';
  return req.tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

async function listExperiments(req, res) {
  const db = await getDatabase();
  const workspaceId = String(req.query.workspaceId || '').trim();
  const scope = workspaceScope(req);
  const workspace = workspaceId ? await db.get(`SELECT id FROM workspaces WHERE (id = ? OR name = ?) AND ${scope.clause}`, workspaceId, workspaceId, ...scope.params) : null;
  const list = workspaceId
    ? await db.all(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.workspace_id = ? AND ${scope.clause} ORDER BY e.created_at DESC`, workspace?.id || workspaceId, ...scope.params)
    : await db.all(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE ${scope.clause} ORDER BY e.created_at DESC`, ...scope.params);

  const formatted = list.map(e => ({
    id: e.id,
    title: e.title,
    type: e.experiment_type,
    status: e.status === 'Setup' ? 'registered' : e.status,
    chaosLevel: e.chaos_level,
    color: e.color || '#0969da',
    summary: e.results_summary
  }));

  res.json(formatted);
}

async function getRecentExperiments(req, res) {
  return listExperiments(req, res);
}

async function launchExperiment(req, res) {
  const { title = 'Autonomous Scientific Experiment', type = 'scientific_experiment', chaosLevel = 50, workspaceId = 'ws-genos-core' } = req.body || {};
  const typeMap = {
    Scientific: 'scientific_experiment',
    Incident: 'incident_experiment',
    'Co-evolution': 'security_coevolution'
  };
  const experimentType = typeMap[type] || type;
  const allowedTypes = ['scientific_experiment', 'incident_experiment', 'security_coevolution', 'chaos_simulation'];
  if (!allowedTypes.includes(experimentType)) {
    return res.status(400).json({ error: { message: `Unsupported experiment type: ${type}` } });
  }
  const expId = `exp-${crypto.randomUUID()}`;
  const color = experimentType === 'security_coevolution' ? '#cf222e' : (experimentType === 'incident_experiment' ? '#8250df' : '#0969da');

  const db = await getDatabase();
  const scope = workspaceScope(req);
  const workspace = await db.get(`SELECT id FROM workspaces WHERE id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
  if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace '${workspaceId}' is not available in this project.` } });
  await db.run(
    `INSERT INTO experiments (id, workspace_id, title, experiment_type, status, chaos_level, color, results_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    expId, workspace.id, title, experimentType, 'Setup', chaosLevel, color, 'Protocol registered; awaiting recorded observations.'
  );

  telemetry.emitEvent({
    eventType: 'EXPERIMENT_LAUNCHED',
    agentId: 'experiment_controller',
    action: 'LAUNCH',
    detail: `Registered experiment '${title}' [${experimentType}] with chaos level ${chaosLevel}`,
    severity: 'info'
  });

  res.status(201).json({
    success: true,
    experimentId: expId,
    status: 'registered'
  });
}

async function getAnalysis(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const exp = req.query.experimentId
    ? await db.get(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? AND ${scope.clause}`, req.query.experimentId, ...scope.params)
    : await db.get(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE ${scope.clause} ORDER BY e.updated_at DESC, e.created_at DESC LIMIT 1`, ...scope.params);

  let mindMapNodes = [];
  if (exp && exp.mind_map_nodes) {
    try {
      mindMapNodes = JSON.parse(exp.mind_map_nodes);
    } catch (e) {}
  }

  res.json({
    title: exp?.title || null,
    subtitle: exp ? `Statut: ${exp.status}` : null,
    mindMapNodes,
    summary: exp?.results_summary || null,
    hasObservations: !!exp
  });
}

async function getThoughts(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const thoughts = req.query.experimentId
    ? await db.all(`SELECT t.* FROM experiment_thoughts t JOIN experiments e ON e.id = t.experiment_id JOIN workspaces w ON w.id = e.workspace_id WHERE t.experiment_id = ? AND ${scope.clause} ORDER BY t.id ASC`, req.query.experimentId, ...scope.params)
    : [];
  const formatted = thoughts.map(t => ({
    id: t.id,
    time: new Date(t.created_at).toLocaleTimeString(),
    text: t.text,
    highlight: !!t.is_highlight
  }));
  res.json(formatted);
}

async function getCoevolution(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const arena = req.query.experimentId
    ? await db.get(`SELECT c.* FROM coevolution_arenas c JOIN experiments e ON e.id = c.experiment_id JOIN workspaces w ON w.id = e.workspace_id WHERE c.experiment_id = ? AND ${scope.clause}`, req.query.experimentId, ...scope.params)
    : null;

  if (!arena) {
    return res.json({ redTeam: [], blueTeam: [], vulnStats: null, code: '' });
  }

  let redTeam = [];
  let blueTeam = [];
  try {
    redTeam = JSON.parse(arena.red_team_payloads || '[]');
    blueTeam = JSON.parse(arena.blue_team_patches || '[]');
  } catch (e) {}

  res.json({
    redTeam,
    blueTeam,
    vulnStats: {
      file: arena.file_path,
      vulns: arena.vuln_count,
      patches: arena.patch_count
    },
    code: arena.arena_code
  });
}

async function getWaves(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const waves = await db.all(
    `SELECT wv.time_step AS time, wv.success_rate AS successRate, wv.stress_level AS stressLevel, wv.created_at AS createdAt FROM experiment_waves wv JOIN experiments e ON e.id = wv.experiment_id JOIN workspaces w ON w.id = e.workspace_id WHERE wv.experiment_id = ? AND ${scope.clause} ORDER BY wv.time_step ASC`,
    req.params.experimentId,
    ...scope.params
  );
  res.json(waves);
}

async function updateStatus(req, res, next) {
  try {
    const nextStatus = String(req.body?.status || '').trim();
    const allowed = new Set(['Setup', 'Running', 'Analyzed', 'Success', 'Failed']);
    if (!allowed.has(nextStatus)) return res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Unsupported experiment status '${nextStatus}'.` } });
    const transitions = {
      Setup: new Set(['Running', 'Failed']),
      Running: new Set(['Analyzed', 'Success', 'Failed']),
      Analyzed: new Set(['Success', 'Failed']),
      Success: new Set(),
      Failed: new Set()
    };
    const db = await getDatabase();
    const scope = workspaceScope(req);
    const experiment = await db.get(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? AND ${scope.clause}`, req.params.experimentId, ...scope.params);
    if (!experiment) return res.status(404).json({ error: { code: 'EXPERIMENT_NOT_FOUND', message: 'Experiment not found.' } });
    if (!transitions[experiment.status].has(nextStatus)) return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot transition experiment from '${experiment.status}' to '${nextStatus}'.` } });
    const summary = req.body?.resultsSummary === undefined ? experiment.results_summary : JSON.stringify(req.body.resultsSummary);
    await db.run('UPDATE experiments SET status = ?, results_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', nextStatus, summary, experiment.id);
    res.json({ success: true, experimentId: experiment.id, previousStatus: experiment.status, status: nextStatus, resultsSummary: summary });
  } catch (error) { next(error); }
}

async function recordWave(req, res, next) {
  try {
    const timeStep = Number(req.body?.timeStep);
    const successRate = Number(req.body?.successRate);
    const stressLevel = Number(req.body?.stressLevel);
    if (!Number.isInteger(timeStep) || timeStep < 0 || ![successRate, stressLevel].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return res.status(400).json({ error: { code: 'INVALID_WAVE', message: 'timeStep must be a non-negative integer and rates must be between 0 and 1.' } });
    const db = await getDatabase(); const scope = workspaceScope(req);
    const experiment = await db.get(`SELECT e.id, e.status FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? AND ${scope.clause}`, req.params.experimentId, ...scope.params);
    if (!experiment) return res.status(404).json({ error: { code: 'EXPERIMENT_NOT_FOUND', message: 'Experiment not found.' } });
    if (experiment.status !== 'Running') return res.status(409).json({ error: { code: 'EXPERIMENT_NOT_RUNNING', message: 'Observations require a running experiment.' } });
    await db.run('INSERT INTO experiment_waves (experiment_id, time_step, success_rate, stress_level) VALUES (?, ?, ?, ?)', experiment.id, timeStep, successRate, stressLevel);
    res.status(201).json({ success: true, experimentId: experiment.id, timeStep, successRate, stressLevel });
  } catch (error) { next(error); }
}

async function recordThought(req, res, next) {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: { code: 'INVALID_THOUGHT', message: 'Thought text is required.' } });
    const db = await getDatabase(); const scope = workspaceScope(req);
    const experiment = await db.get(`SELECT e.id, e.status FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? AND ${scope.clause}`, req.params.experimentId, ...scope.params);
    if (!experiment) return res.status(404).json({ error: { code: 'EXPERIMENT_NOT_FOUND', message: 'Experiment not found.' } });
    if (experiment.status !== 'Running') return res.status(409).json({ error: { code: 'EXPERIMENT_NOT_RUNNING', message: 'Thoughts require a running experiment.' } });
    const result = await db.run('INSERT INTO experiment_thoughts (experiment_id, agent_id, text, is_highlight) VALUES (?, ?, ?, ?)', experiment.id, req.body?.agentId || null, text, req.body?.highlight ? 1 : 0);
    res.status(201).json({ success: true, id: result.lastID, experimentId: experiment.id, text });
  } catch (error) { next(error); }
}

module.exports = {
  listExperiments,
  getRecentExperiments,
  launchExperiment,
  getAnalysis,
  getThoughts,
  getCoevolution,
  getWaves,
  updateStatus,
  recordWave,
  recordThought
};
