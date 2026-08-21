/**
 * GenOS Agent Fleet & Deployment Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

async function deployAgent(req, res) {
  const { prompt, modelTier = 'Flash', workspaceIsolation = 'Branch', role = 'Autonomous Node', name } = req.body || {};
  const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const agentName = name || `Swarm Worker ${agentId.slice(-4)}`;

  const db = await getDatabase();
  await db.run(
    `INSERT INTO agents (id, name, role, status, agent_type, model_tier, isolation_mode, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    agentId, agentName, role, 'running', 'Antigravity', modelTier, workspaceIsolation, prompt || 'Autonomous task execution'
  );

  telemetry.emitEvent({
    eventType: 'AGENT_SPAWNED',
    agentId,
    action: 'DEPLOY',
    detail: `Spawned agent '${agentName}' with tier ${modelTier}`,
    severity: 'info',
    payload: { prompt, modelTier, workspaceIsolation }
  });

  res.status(201).json({
    success: true,
    agentId,
    status: 'running',
    agent: {
      id: agentId,
      name: agentName,
      role,
      status: 'running',
      modelTier,
      isolationMode: workspaceIsolation,
      currentTask: prompt
    }
  });
}

async function deployTrinity(req, res) {
  const { prompt } = req.body || {};
  const db = await getDatabase();
  
  // Create the 3 parallel agents
  const worlds = [
    { name: 'Trinity Worker (World 1: Basic)', role: 'Basic Implementation', task: 'Implement raw need' },
    { name: 'Trinity Worker (World 2: Planned)', role: 'Planned Implementation', task: 'Implement according to interview plan' },
    { name: 'Trinity Worker (World 3: AI-Corrected)', role: 'AI-Corrected Implementation', task: 'Implement with AI self-correction' }
  ];

  const agentIds = [];
  for (const w of worlds) {
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    agentIds.push(id);
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, model_tier, isolation_mode, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, w.name, w.role, 'running', 'Antigravity', 'Pro', 'Branch', w.task
    );
    telemetry.emitEvent({
      eventType: 'TRINITY_WORLD_SPAWNED',
      agentId: id,
      action: 'FORK',
      detail: `Spawned ${w.name}`,
      severity: 'info'
    });
  }

  res.status(201).json({
    success: true,
    message: 'Trinity worlds spawned',
    agents: agentIds
  });
}

async function listAgents(req, res) {
  const db = await getDatabase();
  const agents = await db.all("SELECT id, name, role, status, agent_type as agentType, model_tier as modelTier, isolation_mode as isolationMode, current_task as currentTask, workspace_id as workspaceId FROM agents WHERE status != 'terminated'");
  res.json(agents);
}

async function getAgentHistory(req, res) {
  const db = await getDatabase();
  const history = await db.all("SELECT id, name, role, status, current_task as task, updated_at as timestamp FROM agents ORDER BY updated_at DESC");
  const formatted = history.map(h => ({
    id: h.id,
    name: h.name || h.role,
    status: (h.status === 'apoptosis' || h.status === 'Apoptosis' || h.status === 'terminated') ? 'Apoptosis' : 'Active',
    duration: '1h',
    task: h.task
  }));
  res.json(formatted);
}

function pingAgent(req, res) {
  const agentId = req.params.id || 'agent_core';
  res.json({
    status: 'pong',
    agentId,
    latencyMs: +(Math.random() * 1.5 + 0.8).toFixed(2),
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  deployAgent,
  deployTrinity,
  listAgents,
  getAgentHistory,
  pingAgent
};
