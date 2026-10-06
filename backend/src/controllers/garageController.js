'use strict';

const { getDatabase } = require('../db');
const { fetchScopedWorker } = require('./deployHelpers');

function workspaceScope(req, alias) {
  return req.tenant ? { clause: `${alias}.organization_id = ? AND ${alias}.project_id = ?`,
    params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${alias}.organization_id IS NULL AND ${alias}.project_id IS NULL`, params: [] };
}

async function scoped(db, req) {
  const scope = workspaceScope(req, 'w');
  return db.get(`SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND a.execution_mode = 'orchestrator' AND ${scope.clause}`, req.params.id, ...scope.params);
}

function fail(res, error) {
  res.status(error.code === 'AGENT_NOT_FOUND' ? 404 : 409).json({ error: { code: error.code || 'GARAGE_ERROR', message: error.message } });
}

async function submit(req, res) {
  const db = await getDatabase();
  try {
    const workerId = req.params.workerId;
    const pair = await fetchScopedWorker({ db, scope: workspaceScope(req, 'ww'), workerId, orchestratorId: req.params.id });
    if (!pair) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND' } });
    const circuit = require('../services/circuitBreaker').canExecute('worker_deployment', 'operator');
    if (!circuit.allowed) return res.status(503).json({ error: { code: circuit.reason, message: circuit.message } });
    const request = {
      ...scheduling(req.body), orchestratorId: req.params.id, workerId, role: pair.role,
      prompt: req.body.prompt || req.body.mission || 'Assigned mission', name: req.body.name || pair.name,
      workspaceId: pair.workspace_id, workspaceRoot: pair.workspace_root,
      workspaceIsolation: pair.isolation_mode, modelTier: pair.model_tier,
      agentType: pair.agent_type, executionMode: 'worker', executionBudget: req.body.executionBudget || {}
    };
    res.status(202).json(await require('../services/garageAdmissionService').submit(db, request));
  } catch (error) { fail(res, error); }
}

function scheduling(body) {
  const keys = ['requestId', 'mode', 'priority', 'urgency', 'preemptible', 'lane', 'dependsOn',
    'deadlineAt', 'queueIfFull', 'estimatedCost'];
  return Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
}

async function list(req, res) {
  const db = await getDatabase();
  if (!await scoped(db, req)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND' } });
  const rows = await db.all(`SELECT request_id, worker_id, mode, priority, status, phase, attempts,
    deadline_at, created_at, updated_at, error_text, snapshot_id FROM garage_queue
    WHERE orchestrator_id = ? ORDER BY created_at DESC LIMIT 200`, req.params.id);
  const metrics = await db.all(`SELECT status, phase, COUNT(*) AS count FROM garage_queue
    WHERE orchestrator_id = ? GROUP BY status, phase`, req.params.id);
  res.json({ requests: rows, metrics, policies: require('../services/garagePolicies').POLICIES });
}

async function events(req, res) {
  const db = await getDatabase();
  if (!await scoped(db, req)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND' } });
  const after = Math.max(0, Number(req.query.after) || 0);
  res.json(await db.all(`SELECT sequence, request_id, event_type, payload_json, created_at FROM garage_events
    WHERE orchestrator_id = ? AND sequence > ? ORDER BY sequence LIMIT 200`, req.params.id, after));
}

async function control(req, res) {
  const db = await getDatabase();
  if (!await scoped(db, req)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND' } });
  try {
    const result = await require('../services/garageQueueControl').control({ db,
      orchestratorId: req.params.id, requestId: req.params.requestId, action: req.params.action });
    res.json(result);
  } catch (error) { fail(res, error); }
}

module.exports = { submit, list, events, control };
