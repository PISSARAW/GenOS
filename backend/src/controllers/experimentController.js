/**
 * GenOS Experiments Lab Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

let waveStep = 0;

async function listExperiments(req, res) {
  const db = await getDatabase();
  const list = await db.all('SELECT * FROM experiments ORDER BY created_at DESC');

  const formatted = list.map(e => ({
    id: e.id,
    title: e.title,
    type: e.experiment_type,
    status: e.status,
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
  const expId = `exp-${Date.now()}`;
  const color = type === 'security_coevolution' ? '#cf222e' : (type === 'incident_experiment' ? '#8250df' : '#0969da');

  const db = await getDatabase();
  await db.run(
    `INSERT INTO experiments (id, workspace_id, title, experiment_type, status, chaos_level, color, results_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    expId, workspaceId, title, type, 'Running', chaosLevel, color, 'Experiment protocol active and simulating.'
  );

  telemetry.emitEvent({
    eventType: 'EXPERIMENT_LAUNCHED',
    agentId: 'experiment_controller',
    action: 'LAUNCH',
    detail: `Launched experiment '${title}' [${type}] with chaos level ${chaosLevel}`,
    severity: 'info'
  });

  res.status(201).json({
    success: true,
    experimentId: expId,
    status: 'Running'
  });
}

async function getAnalysis(req, res) {
  const db = await getDatabase();
  const exp = await db.get("SELECT * FROM experiments WHERE experiment_type = 'incident_experiment' LIMIT 1");

  let mindMapNodes = [];
  if (exp && exp.mind_map_nodes) {
    try {
      mindMapNodes = JSON.parse(exp.mind_map_nodes);
    } catch (e) {}
  }

  res.json({
    title: exp ? exp.title : 'Incident Faux-Positif & Auto-Rollback',
    subtitle: exp ? `Statut: ${exp.status}` : 'Terminée avec succès.',
    mindMapNodes,
    summary: exp ? exp.results_summary : 'L\'analyse a démontré qu\'un délai de grâce de 2 secondes évite les faux-positifs lors des rollbacks automatiques.'
  });
}

async function getThoughts(req, res) {
  const db = await getDatabase();
  const thoughts = await db.all('SELECT * FROM experiment_thoughts ORDER BY id ASC');
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
  const arena = await db.get('SELECT * FROM coevolution_arenas LIMIT 1');

  if (!arena) {
    return res.json({ redTeam: [], blueTeam: [], vulnStats: { file: 'src/api/auth.ts', vulns: 0, patches: 0 }, code: '' });
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

function getWavePoint(req, res) {
  waveStep += 1;
  const successRate = 60 + Math.sin(waveStep / 2) * 25 + Math.random() * 8;
  const stressLevel = 30 + Math.cos(waveStep / 3) * 20 + Math.random() * 10;

  res.json({
    time: waveStep,
    successRate: Math.min(100, Math.max(0, +successRate.toFixed(2))),
    stressLevel: Math.min(100, Math.max(0, +stressLevel.toFixed(2)))
  });
}

module.exports = {
  listExperiments,
  getRecentExperiments,
  launchExperiment,
  getAnalysis,
  getThoughts,
  getCoevolution,
  getWavePoint
};
