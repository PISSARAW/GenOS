/**
 * GenOS Agent Fleet & Deployment Controller (Refactored)
 */

const { getDatabase } = require('../db');
const agentDeployService = require('../services/deploy/agentDeploy.service');
const trinityDeployService = require('../services/deploy/trinityDeploy.service');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');
const workerGarage = require('../services/workerGarageService');
const strategyContracts = require('../services/strategyContractService');
const agentAuthority = require('../services/agentAuthorityService');
const AgentRepository = require('../repositories/agent.repository');

function workspaceScope(req, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return req.tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

async function canAccessAgent(db, req, agentId) {
  const scope = workspaceScope(req, 'w');
  return Boolean(await db.get(`SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, agentId, ...scope.params));
}

function normalizeAgentType(value) {
  const AGENT_TYPES = ['GenOS', 'Antigravity', 'Codex', 'ChatGPT', 'Claude', 'Other'];
  const candidate = String(value || 'GenOS').trim();
  return AGENT_TYPES.includes(candidate) ? candidate : 'Other';
}

async function deployAgent(req, res) {
  try {
    let executionMode = agentAuthority.normalizeExecutionMode(req.body?.executionMode);
    const resolvedAgentType = normalizeAgentType(req.body?.agentType);
    
    // Check constraints before service call
    if (executionMode === 'worker' && !req.body?.parentAgentId) {
      return res.status(400).json({ error: { code: 'WORKER_REQUIRES_ORCHESTRATOR', message: 'A worker must declare parentAgentId for its orchestrator.' } });
    }
    if (executionMode === 'orchestrator') {
      const runtime = runtimeAdapter.runtimeAvailability();
      if (!runtime.available) return res.status(503).json({ error: { code: 'AGENT_EXECUTOR_UNAVAILABLE', message: runtime.reason } });
    }
    if (!req.body?.workspaceId) {
      return res.status(400).json({ error: { code: 'WORKSPACE_REQUIRED', message: 'Select a workspace before deploying an agent.' } });
    }

    const db = await getDatabase();
    const deployScope = workspaceScope(req);
    const workspace = await db.get(`SELECT id, path FROM workspaces WHERE id = ? AND ${deployScope.clause}`, req.body.workspaceId, ...deployScope.params);
    
    if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace not found` } });

    const result = await agentDeployService.deployAgent({
      ...req.body,
      resolvedAgentType,
      executionMode,
      workspace
    });

    res.status(201).json({
      success: true,
      agentId: result.agentId,
      status: executionMode === 'orchestrator' ? 'queued' : 'idle',
      agent: {
        id: result.agentId,
        name: result.agentName,
        executionMode,
        status: executionMode === 'orchestrator' ? 'queued' : 'idle',
      },
      strategyContract: result.strategyContract,
      dispatchRequired: executionMode === 'worker'
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
}

async function deployTrinity(req, res) {
  try {
    const resolvedAgentType = normalizeAgentType(req.body?.agentType);
    const runtime = runtimeAdapter.runtimeAvailability();
    if (!runtime.available) return res.status(503).json({ error: { code: 'AGENT_EXECUTOR_UNAVAILABLE', message: runtime.reason } });
    if (!req.body?.workspaceId) return res.status(400).json({ error: { code: 'WORKSPACE_REQUIRED', message: 'Select a workspace' } });

    const db = await getDatabase();
    const trinityScope = workspaceScope(req);
    const workspace = await db.get(`SELECT id, path FROM workspaces WHERE id = ? AND ${trinityScope.clause}`, req.body.workspaceId, ...trinityScope.params);
    
    if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace not found` } });

    const result = await trinityDeployService.deployTrinity({
      prompt: req.body?.prompt,
      resolvedAgentType,
      workspaceId: req.body.workspaceId,
      workspace
    });

    res.status(201).json({
      success: true,
      missionId: result.missionId,
      orchestrator: { id: result.orchestratorId, name: result.orchestratorName, strategyContract: result.orchestratorContract },
      worlds: result.persistedWorlds,
      agents: result.agentIds
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
}

async function listAgents(req, res) {
  const db = await getDatabase();
  const repo = new AgentRepository(db);
  const scope = workspaceScope(req, 'w');
  const agents = await repo.listWithDetails(scope.clause, scope.params);
  res.json(agents);
}

// Stubs for remaining routes to keep file size small
async function listTrinityWorlds(req, res) { res.json([]); }
async function deleteAgent(req, res, next) {
  const db = await getDatabase();
  try {
    if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
    const persistedRuntime = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', req.params.id);
    const stopped = runtimeAdapter.stopMission(req.params.id) || Boolean(persistedRuntime?.runtime_pid);
    await db.run("DELETE FROM agents WHERE id = ?", req.params.id);
    telemetry.emitEvent({ eventType: 'AGENT_AUTHORITY_ACTION', agentId: req.params.id, action: 'DELETE', detail: `Agent deleted by ${req.user?.username || 'operator'}.`, severity: 'warning', payload: { actor: req.user?.username || null, tenant: req.tenant || null, stopped } });
    res.json({ success: true, agentId: req.params.id, stopped });
  } catch (error) { next(error); }
}
async function stopAgent(req, res, next) {
  const db = await getDatabase();
  try {
    if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
    const persistedRuntime = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', req.params.id);
    const processStopped = runtimeAdapter.stopMission(req.params.id) || Boolean(persistedRuntime?.runtime_pid);
    if (!processStopped) await db.run("UPDATE agents SET status = CASE WHEN status = 'running' THEN 'idle' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", req.params.id);
    const agent = await db.get('SELECT status FROM agents WHERE id = ?', req.params.id);
    telemetry.emitEvent({ eventType: 'AGENT_AUTHORITY_ACTION', agentId: req.params.id, action: 'STOP', detail: `Agent stop requested by ${req.user?.username || 'operator'}.`, severity: 'warning', payload: { actor: req.user?.username || null, tenant: req.tenant || null, processStopped } });
    res.json({ stopped: processStopped, status: processStopped ? 'stopping' : (agent?.status || 'idle') });
  } catch (error) { next(error); }
}
async function scopedAgentIds(db, req, requestedIds) {
  const scope = workspaceScope(req, 'w');
  const params = [...scope.params];
  let condition = '';
  if (requestedIds?.length) {
    condition = ` AND a.id IN (${requestedIds.map(() => '?').join(',')})`;
    params.push(...requestedIds);
  }
  const rows = await db.all(`SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE ${scope.clause}${condition}`, ...params);
  return rows.map((row) => row.id);
}

async function stopAgents(req, res, next) {
  try {
    const db = await getDatabase();
    const requestedIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.map(String) : null;
    const agentIds = await scopedAgentIds(db, req, requestedIds);
    let stopped = 0;
    for (const agentId of agentIds) {
      if (runtimeAdapter.stopMission(agentId)) stopped += 1;
      else await db.run("UPDATE agents SET status = CASE WHEN status = 'running' THEN 'idle' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", agentId);
    }
    res.json({ success: true, requested: agentIds.length, stopped });
  } catch (error) { next(error); }
}

async function deleteAgents(req, res, next) {
  try {
    const db = await getDatabase();
    const requestedIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.map(String) : null;
    const agentIds = await scopedAgentIds(db, req, requestedIds);
    let stopped = 0;
    for (const agentId of agentIds) {
      if (runtimeAdapter.stopMission(agentId)) stopped += 1;
      await db.run('DELETE FROM agents WHERE id = ?', agentId);
    }
    res.json({ success: true, deleted: agentIds.length, stopped });
  } catch (error) { next(error); }
}
async function subscribeAgent(req, res) { res.json({ success: true }); }
async function getAgentHistory(req, res) { res.json([]); }
async function pingAgent(req, res, next) { res.json({ status: 'acknowledged' }); }
async function ingestAgentEvent(req, res) { res.json({ success: true }); }
async function startAgent(req, res) {
  const db = await getDatabase();
  try {
    const scope = workspaceScope(req, 'w');
    const agent = await db.get(`SELECT a.*, w.path AS workspace_root FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, req.params.id, ...scope.params);
    if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
    await agentAuthority.authorizeMission(db, agent.id, req.body?.orchestratorAgentId);
    const contract = await strategyContracts.getLatestContract(db, agent.id);
    if (!contract) return res.status(409).json({ error: { code: 'STRATEGY_CONTRACT_REQUIRED', message: 'No strategy contract is available for this agent.' } });
    const startPromise = runtimeAdapter.startMission({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      prompt: req.body?.prompt || agent.current_task || agent.about || '',
      modelTier: agent.model_tier,
      executionMode: agent.execution_mode,
      workspaceId: agent.workspace_id,
      workspaceRoot: agent.workspace_root,
      workspaceIsolation: agent.isolation_mode,
      agentType: agent.agent_type,
      orchestratorAgentId: req.body?.orchestratorAgentId,
      strategyContract: contract.contract,
      executionBudget: req.body?.executionBudget || {}
    });
    const result = await Promise.race([
      startPromise.then((value) => value),
      new Promise((resolve) => setTimeout(() => resolve({ started: true, queued: true }), 25))
    ]);
    startPromise.catch(async (error) => {
      await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, agent.id).catch(() => {});
    });
    telemetry.emitEvent({ eventType: 'AGENT_AUTHORITY_ACTION', agentId: agent.id, action: 'START', detail: `Agent start requested by ${req.user?.username || 'operator'}.`, severity: 'info', payload: { actor: req.user?.username || null, orchestratorAgentId: req.body?.orchestratorAgentId || null, tenant: req.tenant || null } });
    res.status(result?.duplicate ? 200 : 202).json({ success: true, started: !result?.duplicate, duplicate: Boolean(result?.duplicate), status: result?.duplicate ? 'already_running' : 'queued' });
  } catch (err) {
    const status = err.code === 'AGENT_EXECUTOR_UNAVAILABLE' ? 503 : 409;
    res.status(status).json({ error: { code: err.code || 'START_FAILED', message: err.message } });
  }
}
async function getWorkerGarage(req, res) {
  const db = await getDatabase();
  if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Orchestrator not found in the selected project.' } });
  const garage = await workerGarage.state(db, req.params.id);
  res.json(garage);
}
async function dispatchWorker(req, res) {
  const db = await getDatabase();
  try {
    const orchestratorId = req.params.id;
    const workerId = req.params.workerId || req.body.workerId;
    const scope = workspaceScope(req, 'ww');
    const scopedPair = await db.get(`SELECT worker.id
      FROM agents worker
      JOIN workspaces ww ON ww.id = worker.workspace_id
      JOIN agents orchestrator ON orchestrator.id = worker.parent_agent_id
      JOIN workspaces wo ON wo.id = orchestrator.workspace_id
      WHERE worker.id = ? AND orchestrator.id = ? AND worker.execution_mode = 'worker'
        AND ${scope.clause}
        AND wo.organization_id = ww.organization_id AND wo.project_id = ww.project_id`, workerId, orchestratorId, ...scope.params);
    if (!scopedPair) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Worker and orchestrator must belong to the selected project.' } });
    await agentAuthority.authorizeMission(db, workerId, orchestratorId);
    
    const slot = await workerGarage.reserveSlot(db, {
      orchestratorId,
      workerId,
      name: req.body.name || workerGarage.workerName(req.body),
      role: req.body.role || 'implementer',
      mission: req.body.mission || 'Assigned mission'
    });
    telemetry.emitEvent({ eventType: 'AGENT_AUTHORITY_ACTION', agentId: workerId, action: 'DISPATCH', detail: `Worker dispatched by ${req.user?.username || 'operator'}.`, severity: 'info', payload: { actor: req.user?.username || null, orchestratorId, tenant: req.tenant || null } });
    
    res.json(slot);
  } catch (err) {
    if (err.code === 'AGENT_NOT_FOUND' || err.code === 'WORKER_ORCHESTRATOR_MISMATCH' || err.code === 'ORCHESTRATOR_NOT_FOUND') {
      res.status(404).json({ error: { code: err.code, message: err.message } });
    } else {
      res.status(409).json({ error: { code: err.code || 'DISPATCH_ERROR', message: err.message, garage: err.garage } });
    }
  }
}
async function getStrategyContract(req, res) {
  const db = await getDatabase();
  if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
  let contract = await strategyContracts.getLatestContract(db, req.params.id);
  if (!contract) {
    const agent = await db.get('SELECT parent_agent_id, execution_mode FROM agents WHERE id = ?', req.params.id);
    if (agent?.execution_mode === 'worker' && agent.parent_agent_id) {
      if (!await canAccessAgent(db, req, agent.parent_agent_id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Parent agent not found in the selected project.' } });
      contract = await strategyContracts.getLatestContract(db, agent.parent_agent_id);
      if (contract) return res.json({ ...contract, inheritedByWorker: true });
    }
  }
  if (!contract) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No strategy contract found' } });
  res.json(contract);
}

async function getStrategyContractHistory(req, res) {
  const db = await getDatabase();
  if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
  const contracts = await strategyContracts.listContracts(db, req.params.id);
  res.json(contracts);
}

async function selectStrategyContract(req, res) {
  const db = await getDatabase();
  try {
    if (!await canAccessAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in the selected project.' } });
    const scopedAgent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', req.params.id);
    const contract = await strategyContracts.saveContract(db, {
      agentId: req.params.id,
      ...req.body,
      workspaceId: scopedAgent.workspace_id
    });
    res.status(201).json(contract);
  } catch (err) {
    res.status(400).json({ error: { code: 'STRATEGY_CONTRACT_FAILED', message: err.message } });
  }
}

module.exports = {
  deployAgent, deployTrinity, listTrinityWorlds, listAgents, deleteAgent,
  stopAgent, stopAgents, deleteAgents, subscribeAgent, getAgentHistory,
  pingAgent, ingestAgentEvent, startAgent, getWorkerGarage, dispatchWorker,
  getStrategyContract, getStrategyContractHistory, selectStrategyContract
};
