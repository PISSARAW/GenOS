/**
 * GenOS Experiments Lab Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

async function listExperiments(req, res) {
  const db = await getDatabase();
  const workspaceId = String(req.query.workspaceId || '').trim();
  const workspace = workspaceId ? await db.get('SELECT id FROM workspaces WHERE id = ? OR name = ?', workspaceId, workspaceId) : null;
  const list = workspaceId
    ? await db.all('SELECT * FROM experiments WHERE workspace_id = ? ORDER BY created_at DESC', workspace?.id || workspaceId)
    : await db.all('SELECT * FROM experiments ORDER BY created_at DESC');

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
  const expId = `exp-${Date.now()}`;
  const color = experimentType === 'security_coevolution' ? '#cf222e' : (experimentType === 'incident_experiment' ? '#8250df' : '#0969da');

  const db = await getDatabase();
  await db.run(
    `INSERT INTO experiments (id, workspace_id, title, experiment_type, status, chaos_level, color, results_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    expId, workspaceId, title, experimentType, 'Setup', chaosLevel, color, 'Protocol registered; awaiting recorded observations.'
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
  const exp = req.query.experimentId
    ? await db.get('SELECT * FROM experiments WHERE id = ?', req.query.experimentId)
    : await db.get('SELECT * FROM experiments ORDER BY updated_at DESC, created_at DESC LIMIT 1');

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
  const thoughts = req.query.experimentId
    ? await db.all('SELECT * FROM experiment_thoughts WHERE experiment_id = ? ORDER BY id ASC', req.query.experimentId)
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
  const arena = req.query.experimentId
    ? await db.get('SELECT * FROM coevolution_arenas WHERE experiment_id = ?', req.query.experimentId)
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
  const waves = await db.all(
    'SELECT time_step AS time, success_rate AS successRate, stress_level AS stressLevel, created_at AS createdAt FROM experiment_waves WHERE experiment_id = ? ORDER BY time_step ASC',
    req.params.experimentId
  );
  res.json(waves);
}

module.exports = {
  listExperiments,
  getRecentExperiments,
  launchExperiment,
  getAnalysis,
  getThoughts,
  getCoevolution,
  getWaves
};
