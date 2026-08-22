/**
 * GenOS Agent Fleet & Deployment Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');
const strategyContracts = require('../services/strategyContractService');
const fs = require('fs');
const path = require('path');

const AGENT_TYPES = ['GenOS', 'Antigravity', 'Codex', 'ChatGPT', 'Claude', 'Other'];

function normalizeAgentType(value) {
  const candidate = String(value || 'GenOS').trim();
  return AGENT_TYPES.includes(candidate) ? candidate : 'Other';
}

function unquote(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function readGenomeIdentity(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    const genome = JSON.parse(source);
    return { id: genome.id, name: genome.identity?.name, role: genome.identity?.role };
  } catch {
    const identity = source.match(/identity:\s*\n\s+name:\s*(.+)\n\s+role:\s*(.+)/);
    if (!identity) return null;
    return { name: unquote(identity[1]), role: unquote(identity[2]) };
  }
}

function discoverGenosGenomes() {
  const repositoryRoot = path.resolve(__dirname, '../../../');
  const candidates = [];
  const genomeDirectory = path.join(repositoryRoot, '.genos', 'agents');
  if (fs.existsSync(genomeDirectory)) {
    for (const file of fs.readdirSync(genomeDirectory)) {
      if (/\.(yaml|yml|json)$/i.test(file)) candidates.push(path.join(genomeDirectory, file));
    }
  }
  for (const file of fs.readdirSync(repositoryRoot)) {
    if (/-agent\.(yaml|yml|json)$/i.test(file)) candidates.push(path.join(repositoryRoot, file));
  }

  return candidates.map((filePath) => {
    try {
      const identity = readGenomeIdentity(filePath);
      if (!identity?.name || !identity?.role) return null;
      const fileId = identity.id || path.basename(filePath).replace(/\.(yaml|yml|json)$/i, '');
      return {
        id: `genos_${fileId}`,
        name: identity.name,
        role: identity.role,
        status: 'idle',
        agentType: 'GenOS',
        modelTier: 'provider-agnostic',
        isolationMode: 'local',
        currentTask: 'GenOS genome available for activation',
        workspaceId: null,
        source: 'cli/mcp',
        genomePath: path.relative(repositoryRoot, filePath)
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function deployAgent(req, res) {
  const { prompt, modelTier = 'Flash', workspaceIsolation = 'Branch', role = 'Autonomous Node', name, about, agentType, language = 'TypeScript', workspaceId = null, fleetId = null, parentAgentId = null, lineageRelation = 'independent', executionBudget } = req.body || {};
  const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const agentName = name || `Swarm Worker ${agentId.slice(-4)}`;
  const resolvedAgentType = normalizeAgentType(agentType);

  const db = await getDatabase();
  await db.run(
    `INSERT INTO agents (id, name, role, status, agent_type, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    agentId, agentName, role, 'idle', resolvedAgentType, workspaceId, fleetId, modelTier, language, workspaceIsolation, parentAgentId, lineageRelation, about || prompt || `Autonomous agent for ${role}.`, prompt || 'Autonomous task execution'
  );
  const strategyContract = await strategyContracts.saveContract(db, {
    agentId,
    workspaceId,
    problem: prompt || `Autonomous task execution for ${role}`,
    createdBy: 'deployment_orchestrator'
  });

  telemetry.emitEvent({
    eventType: 'AGENT_QUEUED',
    agentId,
    action: 'DEPLOY',
    detail: `Spawned agent '${agentName}' with tier ${modelTier}`,
    severity: 'info',
    payload: {
      prompt, agentType: resolvedAgentType, modelTier, workspaceIsolation,
      strategyContractId: strategyContract.id,
      primaryStrategy: strategyContract.primaryStrategy
    }
  });
  runtimeAdapter.startMission({
    agentId, name: agentName, role, prompt: prompt || '', modelTier,
    workspaceIsolation, workspaceId, fleetId, agentType: resolvedAgentType,
    strategyContract: strategyContract.contract,
    executionBudget
  }).catch((error) => telemetry.emitEvent({
    eventType: 'AGENT_RUNTIME_ERROR', agentId, action: 'ERROR', detail: error.message, severity: 'error', status: 'error'
  }));

  res.status(201).json({
    success: true,
    agentId,
    status: 'idle',
    agent: {
      id: agentId,
      name: agentName,
      role,
      status: 'idle',
      agentType: resolvedAgentType,
      workspaceId,
      fleetId,
      language,
      parentAgentId,
      lineageRelation,
      about: about || prompt || `Autonomous agent for ${role}.`,
      modelTier,
      isolationMode: workspaceIsolation,
      currentTask: prompt
    },
    strategyContract
  });
}

async function deployTrinity(req, res) {
  const { prompt, agentType } = req.body || {};
  const resolvedAgentType = normalizeAgentType(agentType);
  const db = await getDatabase();
  
  // Create the 3 parallel agents
  const worlds = [
    { name: 'Trinity Worker (World 1: Basic)', role: 'Basic Implementation', task: 'Implement raw need' },
    { name: 'Trinity Worker (World 2: Planned)', role: 'Planned Implementation', task: 'Implement according to interview plan' },
    { name: 'Trinity Worker (World 3: AI-Corrected)', role: 'AI-Corrected Implementation', task: 'Implement with AI self-correction' }
  ];

  const missionId = `trinity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const agentIds = [];
  const persistedWorlds = [];
  for (let index = 0; index < worlds.length; index += 1) {
    const w = worlds[index];
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    agentIds.push(id);
    const worldId = `${missionId}_world_${index + 1}`;
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, model_tier, isolation_mode, fleet_id, about, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, w.name, w.role, 'running', resolvedAgentType, 'Pro', 'Branch', missionId, `Trinity world ${index + 1} for: ${prompt}`, w.task
    );
    await strategyContracts.saveContract(db, {
      agentId: id,
      problem: `${prompt || 'Trinity mission'} — ${w.task}`,
      createdBy: 'trinity_orchestrator'
    });
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, worldId, prompt || 'Trinity mission', index + 1, w.name, w.role, 'running', id);
    persistedWorlds.push({ id: worldId, mission: prompt, worldNumber: index + 1, name: w.name, strategy: w.role, status: 'running', agentId: id, fleetId: missionId });
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
    missionId,
    worlds: persistedWorlds,
    agents: agentIds
  });
}

async function backfillLegacyTrinityWorlds(db) {
  const legacy = await db.all("SELECT id, name, agent_type, current_task, fleet_id FROM agents WHERE name LIKE 'Trinity Worker (World %' AND id NOT IN (SELECT COALESCE(agent_id, '') FROM trinity_worlds)");
  for (const agent of legacy) {
    const match = agent.name.match(/World (\d+)/);
    const worldNumber = match ? Number(match[1]) : 1;
    await db.run(`INSERT OR IGNORE INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, `${agent.id}_world`, 'Legacy Trinity mission', worldNumber, agent.name, agent.current_task || 'Trinity strategy', agent.status || 'running', agent.id);
  }
}

async function listTrinityWorlds(req, res) {
  const db = await getDatabase();
  await backfillLegacyTrinityWorlds(db);
  const rows = await db.all(`SELECT w.*, a.name as agentName, a.agent_type as agentType, a.status as agentStatus FROM trinity_worlds w LEFT JOIN agents a ON a.id = w.agent_id ORDER BY w.created_at DESC, w.world_number ASC`);
  res.json(rows);
}

async function listAgents(req, res) {
  const db = await getDatabase();
  await backfillLegacyTrinityWorlds(db);
  const agents = await db.all(`SELECT a.id, a.name, a.role, a.status, a.agent_type as agentType,
    a.model_tier as modelTier, a.language, a.isolation_mode as isolationMode,
    a.current_task as currentTask, a.workspace_id as workspaceId, a.fleet_id as fleetId,
    a.parent_agent_id as parentAgentId, p.name as parentAgentName,
    a.lineage_relation as lineageRelation, a.hallucination_monitoring as hallucinationMonitoring,
    COALESCE(a.about, a.current_task, 'Autonomous GenOS agent.') as about,
    tw.id as trinityWorldId, tw.name as trinityWorldName, tw.strategy as trinityStrategy,
    tw.mission as trinityMission, sc.primary_strategy as strategyPrimary,
    sc.version as strategyVersion, sc.status as strategyStatus
    FROM agents a
    LEFT JOIN agents p ON p.id = a.parent_agent_id
    LEFT JOIN trinity_worlds tw ON tw.agent_id = a.id
    LEFT JOIN strategy_contracts sc ON sc.agent_id = a.id
      AND sc.version = (SELECT MAX(latest.version) FROM strategy_contracts latest WHERE latest.agent_id = a.id)
    WHERE a.status != 'terminated'`);
  // Local genome files are definitions available for deployment, not active
  // fleet members. Only persisted agent records belong in the fleet view.
  res.json(agents);
}

async function getStrategyContract(req, res) {
  const db = await getDatabase();
  const agent = await db.get('SELECT id FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
  const contract = await strategyContracts.getLatestContract(db, req.params.id);
  if (!contract) return res.status(404).json({ error: { code: 'NO_STRATEGY_CONTRACT', message: 'No strategy contract has been selected for this agent.' } });
  res.json(contract);
}

async function getStrategyContractHistory(req, res) {
  const db = await getDatabase();
  res.json(await strategyContracts.listContracts(db, req.params.id));
}

async function selectStrategyContract(req, res) {
  const db = await getDatabase();
  const agent = await db.get('SELECT id, workspace_id, current_task FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
  try {
    const selected = await strategyContracts.saveContract(db, {
      agentId: agent.id,
      workspaceId: agent.workspace_id,
      problem: req.body?.problem || agent.current_task,
      contract: req.body?.contract,
      decisionReason: req.body?.decisionReason,
      createdBy: req.user?.username || 'orchestrator'
    });
    telemetry.emitEvent({
      eventType: 'STRATEGY_CONTRACT_SELECTED', agentId: agent.id, action: 'SELECT_STRATEGY',
      detail: `${selected.primaryStrategy} selected as strategy contract v${selected.version}`,
      payload: { contractId: selected.id, contractHash: selected.contractHash, version: selected.version },
      severity: 'info'
    });
    res.status(201).json(selected);
  } catch (error) {
    res.status(400).json({ error: { code: 'INVALID_STRATEGY_CONTRACT', message: error.message } });
  }
}

async function subscribeAgent(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const agent = await db.get('SELECT id, name FROM agents WHERE id = ?', id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${id} not found` } });

  await db.run('UPDATE agents SET hallucination_monitoring = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', id);
  telemetry.emitEvent({
    eventType: 'HALLUCINATION_MONITORING_ENABLED',
    agentId: id,
    action: 'SUBSCRIBE',
    detail: `Hallucination monitoring enabled for ${agent.name}`,
    severity: 'info'
  });
  res.json({ success: true, agentId: id, hallucinationMonitoring: true });
}

async function getAgentHistory(req, res) {
  const db = await getDatabase();
  const history = await db.all("SELECT id, name, role, status, current_task as task, updated_at as timestamp FROM agents ORDER BY updated_at DESC");
  const formatted = history.map(h => ({
    id: h.id,
    name: h.name || h.role,
    status: h.status,
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

async function ingestAgentEvent(req, res) {
  const { id } = req.params;
  const { eventType = 'AGENT_STEP', action = 'EXECUTE', detail = '', status, payload = {}, severity = 'info', currentTask } = req.body || {};
  const db = await getDatabase();
  const agent = await db.get('SELECT id, name FROM agents WHERE id = ?', id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${id} not found` } });

  await db.run(
    'UPDATE agents SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status || null, currentTask || null, id
  );
  const event = telemetry.emitEvent({ eventType, agentId: id, action, detail, payload, severity, status: status || 'SUCCESS' });
  res.status(201).json({ success: true, agentId: id, event });
}

async function startAgent(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const agent = await db.get('SELECT id, name, role, current_task as prompt, model_tier as modelTier, isolation_mode as workspaceIsolation, workspace_id as workspaceId, fleet_id as fleetId, agent_type as agentType FROM agents WHERE id = ?', id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${id} not found` } });
  let strategyContract = await strategyContracts.getLatestContract(db, id);
  if (!strategyContract) {
    strategyContract = await strategyContracts.saveContract(db, {
      agentId: id, workspaceId: agent.workspaceId, problem: agent.prompt,
      createdBy: 'mission_orchestrator'
    });
  }
  const result = await runtimeAdapter.startMission({ ...agent, strategyContract: strategyContract.contract, executionBudget: req.body?.executionBudget });
  res.json({ success: true, agentId: id, strategyContract, ...result });
}

module.exports = {
  deployAgent,
  deployTrinity,
  listTrinityWorlds,
  listAgents,
  subscribeAgent,
  getAgentHistory,
  pingAgent,
  ingestAgentEvent,
  startAgent,
  getStrategyContract,
  getStrategyContractHistory,
  selectStrategyContract
};
