const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');
const { scopeSql } = require('../middleware/tenant');
const { validateWorkflowCondition } = require('../services/workflowConditions');
const { jobMaxAttempts, jobTimeoutMs, jsonByteLength } = require('./argumentBounds');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

const WORKFLOW_TRANSITIONS = {
  draft: new Set(['draft', 'staging', 'archived']),
  staging: new Set(['staging', 'published', 'draft', 'archived']),
  published: new Set(['published', 'archived']),
  archived: new Set(['archived'])
};

function workflowTransitionAllowed(current, next) {
  return Boolean(WORKFLOW_TRANSITIONS[current]?.has(next));
}

function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== 'object') errors.push('Workflow graph must be an object.');
  if (graph && !Array.isArray(graph.nodes)) errors.push('Workflow nodes must be an array.');
  if (graph && !Array.isArray(graph.edges)) errors.push('Workflow edges must be an array.');
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const validNodes = nodes.filter((node) => node && typeof node === 'object');
  const ids = new Set(validNodes.map((node) => node.id).filter((id) => typeof id === 'string' && id.trim()));
  if (nodes.length === 0) errors.push('Workflow must contain at least one node.');
  if (nodes.some((node) => !node || typeof node.id !== 'string' || !node.id.trim())) errors.push('Every workflow node must have a non-empty string id.');
  if (new Set(validNodes.map((node) => node.id)).size !== validNodes.length) errors.push('Node ids must be unique.');
  const edgeIds = new Set();
  const edgeKeys = new Set();
  edges.forEach((edge) => {
    if (!edge || typeof edge !== 'object') {
      errors.push('Every workflow edge must be an object.');
      return;
    }
    if (edge.id !== undefined) {
      if (typeof edge.id !== 'string' || !edge.id.trim()) errors.push('Workflow edge ids must be non-empty strings.');
      else if (edgeIds.has(edge.id)) errors.push(`Edge id '${edge.id}' must be unique.`);
      else edgeIds.add(edge.id);
    }
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`Edge ${edge.id || '(unnamed)'} references an unknown node.`);
    if (edge.source === edge.target && ids.has(edge.source)) errors.push(`Edge ${edge.id || '(unnamed)'} cannot point to its own node.`);
    const edgeKey = `${String(edge.source)}\u0000${String(edge.target)}`;
    if (edgeKeys.has(edgeKey)) errors.push(`Duplicate edge from '${edge.source}' to '${edge.target}'.`);
    else edgeKeys.add(edgeKey);
  });
  const adjacency = new Map(validNodes.map((node) => [node.id, []]));
  edges.forEach((edge) => { if (edge && adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target); });
  const visiting = new Set(); const visited = new Set();
  const hasCycle = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((adjacency.get(id) || []).some(hasCycle)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  if (validNodes.some((node) => hasCycle(node.id))) errors.push('Workflow graph must be acyclic.');
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const condition = node.when || node.data?.when;
    if (condition && !validateWorkflowCondition(condition)) errors.push(`Node ${node.id} has an unsupported condition.`);
    const iterations = node.max_iterations ?? node.data?.maxIterations;
    if (iterations != null && (!Number.isInteger(Number(iterations)) || Number(iterations) < 0 || Number(iterations) > 20)) errors.push(`Node ${node.id} maxIterations must be an integer between 0 and 20.`);
  });
  const incoming = new Set(edges.filter((edge) => Boolean(edge && typeof edge === 'object')).map((edge) => edge.target));
  // React Flow uses the built-in `input` node type for a trigger node,
  // while persisted graphs may use the domain-level `trigger` type.
  if (nodes.length > 1 && validNodes.some((node) => !incoming.has(node.id) && node.type !== 'trigger' && node.type !== 'input')) {
    errors.push('Every non-trigger node must have an incoming edge.');
  }
  const requiresModel = (node) => /\b(llm|agent|model)\b/i.test([node.kind, node.data?.kind, node.data?.label, node.type].filter(Boolean).join(' '));
  validNodes.filter(requiresModel).forEach((node) => {
    if (!(node.model || node.data?.model || node.modelRouting?.primary || node.data?.modelRouting?.primary || process.env.GENOS_DEFAULT_MODEL)) {
      errors.push(`Node ${node.id} requires a real model URI or GENOS_DEFAULT_MODEL.`);
    }
  });
  return { valid: errors.length === 0, errors, nodeCount: nodes.length, edgeCount: edges.length };
}

function mapWorkflow(row) {
  if (!row) return null;
  return { ...row, graph: parseJson(row.graph_json, { nodes: [], edges: [] }), metadata: parseJson(row.metadata_json, {}) };
}

async function listWorkflows(req, res, next) {
  try {
    const db = await getDatabase();
    const workspaceId = req.query.workspaceId;
    const s = scopeSql(req);
    const rows = workspaceId
      ? await db.all(`SELECT * FROM workflows WHERE workspace_id = ? AND ${s.clause} ORDER BY updated_at DESC`, workspaceId, ...s.params)
      : await db.all(`SELECT * FROM workflows WHERE ${s.clause} ORDER BY updated_at DESC`, ...s.params);
    res.json(rows.map(mapWorkflow));
  } catch (error) { next(error); }
}

async function createWorkflow(req, res, next) {
  try {
    const db = await getDatabase();
    const { name, workspaceId, description = '', graph = { nodes: [], edges: [] }, metadata = {} } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workflow name is required.' } });
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    if (jsonByteLength(graph) > 2 * 1024 * 1024 || jsonByteLength(metadata) > 512 * 1024) return res.status(413).json({ error: { code: 'WORKFLOW_PAYLOAD_TOO_LARGE', message: 'Workflow graph and metadata exceed the configured size limits.' } });
    if (!workspaceId || typeof workspaceId !== 'string') return res.status(400).json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required.' } });
    const id = `wf-${crypto.randomUUID()}`;
    const s = scopeSql(req);
    if (workspaceId && !await db.get(`SELECT id FROM workspaces WHERE id = ? AND ${s.clause}`, workspaceId, ...s.params)) {
      return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found in this project.' } });
    }
    const workspace = await db.get(`SELECT id FROM workspaces WHERE id = ? AND ${s.clause}`, workspaceId, ...s.params);
    if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found in this project.' } });
    await withTransaction(db, async (tx) => {
      await tx.run('INSERT INTO workflows (id, workspace_id, name, description, version, status, graph_json, metadata_json, organization_id, project_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)', id, workspace.id, name.trim(), description, 'draft', JSON.stringify(graph), JSON.stringify(metadata), ...s.params);
      await tx.run('INSERT INTO workflow_versions (id, workflow_id, version, graph_json, metadata_json) VALUES (?, ?, ?, ?, ?)', `wfv-${crypto.randomUUID()}`, id, 1, JSON.stringify(graph), JSON.stringify(metadata));
    });
    res.status(201).json(mapWorkflow(await db.get('SELECT * FROM workflows WHERE id = ?', id)));
  } catch (error) { next(error); }
}

async function getWorkflow(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req); const workflow = await db.get(`SELECT * FROM workflows WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params);
    if (!workflow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found.' } });
    res.json(mapWorkflow(workflow));
  } catch (error) { next(error); }
}

async function updateWorkflow(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req); const existing = await db.get(`SELECT * FROM workflows WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found.' } });
    const graph = req.body?.graph || parseJson(existing.graph_json, {});
    if (req.body?.status && !['draft', 'staging', 'published', 'archived'].includes(req.body.status)) return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Workflow status must be draft, staging, published, or archived.' } });
    const nextStatus = req.body?.status || existing.status;
    if (!workflowTransitionAllowed(existing.status, nextStatus)) return res.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: `Workflow cannot transition from ${existing.status} to ${nextStatus}.` } });
    if (existing.status === 'published' && (req.body?.graph || req.body?.name || req.body?.description !== undefined || req.body?.metadata)) return res.status(409).json({ error: { code: 'PUBLISHED_WORKFLOW_IMMUTABLE', message: 'Published workflows cannot be modified; create a new version.' } });
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    const nextVersion = Number(existing.version || 0) + 1;
    const metadata = req.body?.metadata || parseJson(existing.metadata_json, {});
    const result = await withTransaction(db, async (tx) => {
      const update = await tx.run(`UPDATE workflows SET name = ?, description = ?, version = ?, status = ?, graph_json = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND ${s.clause}`, req.body?.name || existing.name, req.body?.description ?? existing.description, nextVersion, nextStatus, JSON.stringify(graph), JSON.stringify(metadata), req.params.id, existing.version, ...s.params);
      if (update.changes !== 1) return null;
      await tx.run('INSERT INTO workflow_versions (id, workflow_id, version, graph_json, metadata_json) VALUES (?, ?, ?, ?, ?)', `wfv-${crypto.randomUUID()}`, req.params.id, nextVersion, JSON.stringify(graph), JSON.stringify(metadata));
      return update;
    });
    if (!result) return res.status(409).json({ error: { code: 'WORKFLOW_VERSION_CONFLICT', message: 'Workflow changed while it was being updated.' } });
    res.json(mapWorkflow(await db.get(`SELECT * FROM workflows WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params)));
  } catch (error) { next(error); }
}

async function validateWorkflow(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req); const workflow = await db.get(`SELECT * FROM workflows WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params);
    if (!workflow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found.' } });
    res.json(validateGraph(req.body?.graph || parseJson(workflow.graph_json, {})));
  } catch (error) { next(error); }
}

async function createRun(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req); const workflow = await db.get(`SELECT * FROM workflows WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params);
    if (!workflow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found.' } });
    if (!['staging', 'published'].includes(workflow.status)) {
      return res.status(409).json({ error: { code: 'WORKFLOW_NOT_RUNNABLE', message: 'Only staging or published workflows can be run.' } });
    }
    const version = await db.get('SELECT version, graph_json FROM workflow_versions WHERE workflow_id = ? AND version = ?', workflow.id, workflow.version);
    if (!version) return res.status(409).json({ error: { code: 'WORKFLOW_VERSION_UNAVAILABLE', message: 'The workflow has no persisted executable version.' } });
    const graph = parseJson(version.graph_json, {});
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    const id = `wfr-${crypto.randomUUID()}`;
    const maxAttempts = jobMaxAttempts(req.body?.maxAttempts);
    const timeoutMs = jobTimeoutMs(req.body?.timeoutMs);
    const requestedPriority = Number(req.body?.priority ?? 0);
    const priority = Number.isFinite(requestedPriority) ? Math.max(0, Math.min(Math.floor(requestedPriority), 100)) : 0;
    if (jsonByteLength(req.body?.input || {}) > 512 * 1024) return res.status(413).json({ error: { code: 'WORKFLOW_INPUT_TOO_LARGE', message: 'Workflow input exceeds 512 KiB.' } });
    await db.run('INSERT INTO workflow_runs (id, workflow_id, workflow_version, organization_id, project_id, priority, status, input_json, max_attempts, timeout_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, workflow.id, workflow.version, req.tenant.organizationId, req.tenant.projectId, priority, 'queued', JSON.stringify(req.body?.input || {}), maxAttempts, timeoutMs);
    res.status(202).json({ id, workflowId: workflow.id, version: workflow.version, status: 'queued', acceptedAt: new Date().toISOString() });
  } catch (error) { next(error); }
}

async function listRuns(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req, 'w'); const rows = await db.all(`SELECT r.* FROM workflow_runs r JOIN workflows w ON w.id=r.workflow_id WHERE r.workflow_id = ? AND ${s.clause} ORDER BY r.created_at DESC`, req.params.id, ...s.params);
    res.json(rows.map((row) => ({ ...row, input: parseJson(row.input_json, {}), output: parseJson(row.output_json, null), error: parseJson(row.error_json, null) })));
  } catch (error) { next(error); }
}

async function cancelRun(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req);
    const result = await db.run(
      `UPDATE workflow_runs SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('queued', 'running')
           AND workflow_id IN (SELECT id FROM workflows WHERE ${s.clause})`,
      JSON.stringify({ message: 'Workflow run cancelled by operator.', cancelled: true }), req.params.runId, ...s.params
    );
    if (result.changes !== 1) {
      const scoped = scopeSql(req, 'w');
      const current = await db.get(`SELECT r.status FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = ? AND ${scoped.clause}`, req.params.runId, ...scoped.params);
      if (current?.status === 'cancelled') return res.json({ id: req.params.runId, status: 'cancelled' });
      return res.status(409).json({ error: { code: 'RUN_NOT_CANCELLABLE', message: 'Run does not exist or is already terminal.' } });
    }
    res.json({ id: req.params.runId, status: 'cancelled' });
  } catch (error) { next(error); }
}

module.exports = { listWorkflows, createWorkflow, getWorkflow, updateWorkflow, validateWorkflow, createRun, listRuns, cancelRun, validateGraph, workflowTransitionAllowed };
