const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function validateGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const ids = new Set(nodes.map((node) => node.id).filter(Boolean));
  const errors = [];
  if (!graph || typeof graph !== 'object') errors.push('Workflow graph must be an object.');
  if (nodes.length === 0) errors.push('Workflow must contain at least one node.');
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) errors.push('Node ids must be unique.');
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`Edge ${edge.id || '(unnamed)'} references an unknown node.`);
  });
  const incoming = new Set(edges.map((edge) => edge.target));
  // React Flow uses the built-in `input` node type for a trigger node,
  // while persisted graphs may use the domain-level `trigger` type.
  if (nodes.length > 1 && nodes.some((node) => !incoming.has(node.id) && node.type !== 'trigger' && node.type !== 'input')) {
    errors.push('Every non-trigger node must have an incoming edge.');
  }
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
    const { name, workspaceId = null, description = '', graph = { nodes: [], edges: [] }, metadata = {} } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workflow name is required.' } });
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    const id = `wf-${crypto.randomUUID()}`;
    const s = scopeSql(req);
    await db.run('INSERT INTO workflows (id, workspace_id, name, description, version, status, graph_json, metadata_json, organization_id, project_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)', id, workspaceId, name.trim(), description, 'draft', JSON.stringify(graph), JSON.stringify(metadata), ...s.params);
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
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    const nextVersion = Number(existing.version || 0) + 1;
    await db.run('UPDATE workflows SET name = ?, description = ?, version = ?, status = ?, graph_json = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', req.body?.name || existing.name, req.body?.description ?? existing.description, nextVersion, req.body?.status || existing.status, JSON.stringify(graph), JSON.stringify(req.body?.metadata || parseJson(existing.metadata_json, {})), req.params.id);
    res.json(mapWorkflow(await db.get('SELECT * FROM workflows WHERE id = ?', req.params.id)));
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
    const graph = parseJson(workflow.graph_json, {});
    const validation = validateGraph(graph);
    if (!validation.valid) return res.status(422).json({ error: { code: 'INVALID_GRAPH', message: validation.errors.join(' '), details: validation } });
    const id = `wfr-${crypto.randomUUID()}`;
    await db.run('INSERT INTO workflow_runs (id, workflow_id, workflow_version, status, input_json) VALUES (?, ?, ?, ?, ?)', id, workflow.id, workflow.version, 'queued', JSON.stringify(req.body?.input || {}));
    res.status(202).json({ id, workflowId: workflow.id, version: workflow.version, status: 'queued', acceptedAt: new Date().toISOString() });
  } catch (error) { next(error); }
}

async function listRuns(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req); const rows = await db.all(`SELECT r.* FROM workflow_runs r JOIN workflows w ON w.id=r.workflow_id WHERE r.workflow_id = ? AND w.organization_id=? AND w.project_id=? ORDER BY r.created_at DESC`, req.params.id, ...s.params);
    res.json(rows.map((row) => ({ ...row, input: parseJson(row.input_json, {}), output: parseJson(row.output_json, null), error: parseJson(row.error_json, null) })));
  } catch (error) { next(error); }
}

module.exports = { listWorkflows, createWorkflow, getWorkflow, updateWorkflow, validateWorkflow, createRun, listRuns, validateGraph };
