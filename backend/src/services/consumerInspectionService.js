'use strict';

const crypto = require('node:crypto');
const events = require('./strategyExecutionEvents');

function verifyHash(record) {
  const actual = crypto.createHash('sha256').update(record.payload_json).digest('hex');
  if (actual !== record.payload_hash) throw new Error('CONSUMER_PROVENANCE_INTEGRITY');
  return JSON.parse(record.payload_json);
}

async function promotionEvidence(db, request) {
  const parents = await db.all(`SELECT * FROM provenance_records WHERE subject_type = 'strategy_promotion'
    AND subject_id = ? AND organization_id = ? AND project_id = ? ORDER BY created_at, id LIMIT 100`,
  request.runId, request.scope.organizationId, request.scope.projectId);
  const result = [];
  for (const parent of parents) result.push(await inspectParent(db, parent, request));
  return result;
}

async function inspectParent(db, parent, request) {
  const payload = verifyHash(parent);
  if (payload.runId !== request.runId || payload.agentId !== request.agentId) throw new Error('CONSUMER_PARENT_BINDING');
  const stored = await require('./aeisAssemblyStore').readAssembly(db, payload.assemblyId);
  const expected = [request.scope.organizationId, request.scope.projectId, request.workspaceId].join(':');
  if (stored.runId !== request.runId || stored.scopeId !== expected) throw new Error('CONSUMER_ASSEMBLY_BINDING');
  const memories = await db.all(`SELECT p.*, d.id AS memory_id, d.provenance_hash, d.created_by AS agent_id
    FROM provenance_records p JOIN genome_decisions d ON d.provenance_record_id = p.id
    WHERE p.parent_hash = ? AND p.organization_id = ? AND p.project_id = ?
      AND d.organization_id = p.organization_id AND d.project_id = p.project_id LIMIT 100`,
  parent.payload_hash, request.scope.organizationId, request.scope.projectId);
  return { id: parent.id, hash: parent.payload_hash, assemblyId: payload.assemblyId,
    assemblyAccepted: stored.evaluation.allAccepted === true,
    verifierResultIds: payload.verifierResultIds, memories: memories.map(row => memoryView(row, payload)) };
}

function memoryView(row, parent) {
  const payload = verifyHash(row);
  if (row.agent_id !== parent.agentId || payload.agentId !== row.agent_id || payload.decisionId !== row.memory_id) {
    throw new Error('CONSUMER_MEMORY_OWNER');
  }
  if (row.provenance_hash !== row.payload_hash) throw new Error('CONSUMER_MEMORY_BINDING');
  return { id: row.memory_id, agentId: row.agent_id, hash: row.payload_hash,
    parentHash: row.parent_hash, integrityChecked: true };
}

async function inspect(db, request) {
  return require('../db').withTransaction(db, async () => {
    const runId = await resolveRunId(db, request);
    return runId ? inspectConsistent(db, { ...request, runId }) : null;
  });
}

async function listRuns(db, request) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(request.limit) || 20)));
  const query = String(request.query || '').trim();
  const status = String(request.status || '').trim();
  const terms = [request.agentId, request.scope.organizationId, request.scope.projectId];
  const filters = ['r.agent_id = ?', 'w.organization_id = ?', 'w.project_id = ?'];
  if (query) {
    filters.push('(r.id LIKE ? OR r.status LIKE ? OR COALESCE(r.guardrail_reason, \'\') LIKE ?)');
    const pattern = `%${query}%`;
    terms.push(pattern, pattern, pattern);
  }
  if (status) {
    filters.push('r.status = ?');
    terms.push(status);
  }
  const rows = await db.all(`SELECT r.* FROM strategy_execution_runs r
    JOIN agents a ON a.id = r.agent_id JOIN workspaces w ON w.id = a.workspace_id
    WHERE ${filters.join(' AND ')} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`, ...terms, limit);
  const runs = await Promise.all(rows.map(row => events.hydrateRun(db, row)));
  return { runs, query, status, limit };
}

async function resolveRunId(db, request) {
  if (request.runId) return request.runId;
  const row = await db.get(`SELECT r.id FROM strategy_execution_runs r
    JOIN agents a ON a.id = r.agent_id JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?
    ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1`,
  request.agentId, request.scope.organizationId, request.scope.projectId);
  return row?.id;
}

async function inspectConsistent(db, request) {
  const workspace = await db.get(`SELECT w.id, w.name FROM strategy_execution_runs r
    JOIN agents a ON a.id = r.agent_id JOIN workspaces w ON w.id = a.workspace_id
    WHERE r.id = ? AND w.organization_id = ? AND w.project_id = ?`,
  request.runId, request.scope.organizationId, request.scope.projectId);
  if (!workspace) return null;
  const run = await events.getRun(db, request.runId);
  const journal = await require('./promotionExecutionJournal').read(db, request.runId);
  const provenance = await promotionEvidence(db, { ...request, workspaceId: workspace.id, agentId: run.agentId });
  const snapshots = await db.all(`SELECT id, label, step_number FROM workspace_snapshots
    WHERE workspace_id = ? ORDER BY step_number DESC LIMIT 100`, workspace.id);
  return { workspace, run, promotion: journal ? { phase: journal.phase, integrityChecked: true } : null,
    provenance, snapshots };
}

module.exports = { inspect, listRuns };
