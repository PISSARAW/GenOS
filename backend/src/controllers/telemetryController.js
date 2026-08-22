/**
 * GenOS Telemetry Controller
 */

const os = require('os');
const { getDatabase } = require('../db');
const telemetryService = require('../services/telemetryObserver');

function streamSSE(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders();

  // Send initial handshake
  const handshake = {
    id: `evt-init-${Date.now()}`,
    timestamp: new Date().toISOString(),
    eventType: 'TELEMETRY_CONNECTED',
    agentId: 'telemetry_observer',
    action: 'CONNECT',
    detail: 'SSE Telemetry Stream established',
    severity: 'info'
  };
  res.write(`data: ${JSON.stringify(handshake)}\n\n`);

  // Stream existing recent ring buffer events
  const recents = telemetryService.getRecentEvents(10);
  recents.forEach(ev => {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  });

  telemetryService.addSSEClient(res);
}

async function getEvents(req, res) {
  const { limit = 50, event_type, severity, agent_id } = req.query;
  const db = await getDatabase();

  let query = 'SELECT * FROM telemetry_events WHERE 1=1';
  const params = [];

  if (event_type) {
    query += ' AND event_type = ?';
    params.push(event_type);
  }
  if (severity) {
    query += ' AND severity = ?';
    params.push(severity);
  }
  if (agent_id) {
    query += ' AND agent_id = ?';
    params.push(agent_id);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 50);

  const dbEvents = await db.all(query, ...params);
  res.json({
    events: dbEvents,
    count: dbEvents.length
  });
}

function ingestEvent(req, res) {
  const event = telemetryService.emitEvent(req.body);
  res.status(201).json({ success: true, event });
}

async function getStatus(req, res) {
  const db = await getDatabase();
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const count = agentCount ? agentCount.count : 0;

  res.json({
    activeAgentsCount: count,
    clonesHistory: (await db.get('SELECT COUNT(*) as count FROM agents'))?.count || 0,
    status: 'online',
    timestamp: new Date().toISOString()
  });
}

async function getHealth(req, res) {
  res.json({
    status: 'ok',
    version: '2.0.0-PROD',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}

async function getDashboard(req, res) {
  const db = await getDatabase();
  const username = process.env.USERNAME || (os.userInfo ? os.userInfo().username : 'operator');

  const statsRecord = await db.get('SELECT * FROM system_stats WHERE id = 1');
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const wsList = await db.all('SELECT * FROM workspaces LIMIT 2');
  const heatmapRows = await db.all('SELECT actions FROM heatmap_activity ORDER BY day ASC LIMIT 364');

  // The dashboard contract is a full year (364 cells). Older/local databases
  // may contain only a partial seed, so normalize the response instead of
  // leaking a short heatmap to the frontend.
  const heatmap = heatmapRows.length > 0
    ? heatmapRows.map(r => r.actions).concat(Array(Math.max(0, 364 - heatmapRows.length)).fill(0)).slice(0, 364)
    : [];

  const pinned = wsList.map(w => ({
    id: w.id,
    name: w.name,
    status: 'Active Workspace',
    language: w.language || 'TypeScript',
    agents_count: agentCount ? agentCount.count : 0,
    progress: null
  }));

  const achievements = [];

  res.json({
    profile: {
      username,
      org: 'PISSARAW',
      location: 'Local Runtime'
    },
    stats: statsRecord || { total_actions: 0, total_snapshots: 0, total_tasks: 0, total_swarms: 0 },
    heatmap,
    pinned,
    activeAgents: agentCount ? agentCount.count : 0,
    achievements
  });
}

async function getAchievements(req, res) {
  res.json([]);
}

module.exports = {
  streamSSE,
  getEvents,
  ingestEvent,
  getStatus,
  getHealth,
  getDashboard,
  getAchievements
};
