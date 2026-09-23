const runtimeAdapter = require('../services/agentRuntimeAdapter');
const telemetry = require('../services/telemetryObserver');

function buildStartMissionParams(params) {
  return {
    agentId: params.agent.id,
    name: params.agent.name,
    role: params.agent.role,
    prompt: params.req.body?.prompt || params.agent.current_task || params.agent.about || '',
    modelTier: params.agent.model_tier,
    executionMode: params.agent.execution_mode,
    workspaceId: params.agent.workspace_id,
    workspaceRoot: params.agent.workspace_root,
    workspaceIsolation: params.agent.isolation_mode,
    agentType: params.agent.agent_type,
    orchestratorAgentId: params.req.body?.orchestratorAgentId,
    strategyContract: params.contract.contract,
    executionBudget: params.req.body?.executionBudget || {}
  };
}

function buildStartAgentResponse(result) {
  return {
    success: true,
    started: !result?.duplicate,
    duplicate: Boolean(result?.duplicate),
    status: result?.duplicate ? 'already_running' : 'queued'
  };
}

function handleStartAgentError(err, res) {
  const status = err.code === 'AGENT_EXECUTOR_UNAVAILABLE' ? 503 : 409;
  res.status(status).json({ error: { code: err.code || 'START_FAILED', message: err.message } });
}

function emitStartAgentTelemetry(params) {
  telemetry.emitEvent({
    eventType: 'AGENT_AUTHORITY_ACTION',
    agentId: params.agent.id,
    action: 'START',
    detail: `Agent start requested by ${params.req.user?.username || 'operator'}.`,
    severity: 'info',
    payload: {
      actor: params.req.user?.username || null,
      orchestratorAgentId: params.req.body?.orchestratorAgentId || null,
      tenant: params.req.tenant || null
    }
  });
}

async function fetchScopedWorker(opts) {
  return opts.db.get(
    `SELECT worker.id, worker.name, worker.role, worker.model_tier, worker.agent_type, worker.isolation_mode, ww.id AS workspace_id, ww.path AS workspace_root
     FROM agents worker
     JOIN workspaces ww ON ww.id = worker.workspace_id
     JOIN agents orchestrator ON orchestrator.id = worker.parent_agent_id
     JOIN workspaces wo ON wo.id = orchestrator.workspace_id
     WHERE worker.id = ? AND orchestrator.id = ? AND worker.execution_mode = 'worker'
       AND ${opts.scope.clause}
       AND wo.organization_id = ww.organization_id AND wo.project_id = ww.project_id`,
    opts.workerId, opts.orchestratorId, ...opts.scope.params
  );
}

async function startWorkerMissionWithFallback(opts) {
  const startPromise = runtimeAdapter.startMission({
    agentId: opts.workerId,
    name: opts.req.body.name || opts.scoped.name,
    role: opts.scoped.role,
    prompt: opts.req.body.mission || 'Assigned mission',
    modelTier: opts.scoped.model_tier,
    executionMode: 'worker',
    agentType: opts.scoped.agent_type,
    workspaceId: opts.scoped.workspace_id,
    workspaceRoot: opts.scoped.workspace_root,
    workspaceIsolation: opts.scoped.isolation_mode,
    orchestratorAgentId: opts.orchestratorId,
    executionBudget: opts.req.body.executionBudget || {}
  });
  startPromise.catch(async (error) => {
    try {
      const garage = require('../services/workerGarageService');
      await garage.enterIdleState(opts.db, opts.workerId, opts.orchestratorId);
      await opts.db.run('UPDATE agents SET current_task=? WHERE id=?', `Dispatch failed: ${error.message}`, opts.workerId).catch(() => {});
    } catch (_) {}
  });
}

function emitDispatchWorkerTelemetry(opts) {
  telemetry.emitEvent({
    eventType: 'AGENT_AUTHORITY_ACTION',
    agentId: opts.workerId,
    action: 'DISPATCH',
    detail: `Worker dispatched by ${opts.req.user?.username || 'operator'}.`,
    severity: 'info',
    payload: { actor: opts.req.user?.username || null, orchestratorId: opts.orchestratorId, tenant: opts.req.tenant || null }
  });
}

function handleDispatchWorkerError(err, res) {
  if (err.code === 'AGENT_NOT_FOUND' || err.code === 'WORKER_ORCHESTRATOR_MISMATCH' || err.code === 'ORCHESTRATOR_NOT_FOUND') {
    res.status(404).json({ error: { code: err.code, message: err.message } });
  } else {
    res.status(409).json({ error: { code: err.code || 'DISPATCH_ERROR', message: err.message, garage: err.garage } });
  }
}

module.exports = {
  buildStartMissionParams,
  buildStartAgentResponse,
  handleStartAgentError,
  emitStartAgentTelemetry,
  fetchScopedWorker,
  startWorkerMissionWithFallback,
  emitDispatchWorkerTelemetry,
  handleDispatchWorkerError
};
