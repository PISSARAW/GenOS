'use strict';

const crypto = require('crypto');
const policies = require('./garagePolicies');

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined)
    .map((key) => [key, canonical(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function validate(request) {
  if (!request.orchestratorId || !request.workerId) throw error('GARAGE_REQUEST_INVALID', 'Parent and worker are required.');
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) throw error('GARAGE_REQUEST_INVALID', 'A nonempty mission is required.');
  if (Buffer.byteLength(JSON.stringify(request)) > 262144) throw error('GARAGE_REQUEST_INVALID', 'Request exceeds 256 KiB.');
  policies.resolve(request.mode);
  validateScheduling(request);
}

function validateScheduling(request) {
  if (!Array.isArray(request.dependsOn) || request.dependsOn.length > 32) throw error('GARAGE_REQUEST_INVALID', 'Invalid dependencies.');
  if (request.dependsOn.includes(request.requestId)) throw error('GARAGE_REQUEST_INVALID', 'A request cannot depend on itself.');
  if (!Number.isFinite(request.priority) || request.priority < 0 || request.priority > 1) throw error('GARAGE_REQUEST_INVALID', 'Priority must be within [0,1].');
  validateTiming(request);
}

function validateTiming(request) {
  if (!Number.isFinite(request.urgency) || request.urgency < 0 || request.urgency > 1) throw error('GARAGE_REQUEST_INVALID', 'Urgency must be within [0,1].');
  if (!Number.isFinite(Date.parse(request.deadlineAt))) throw error('GARAGE_REQUEST_INVALID', 'Invalid deadline.');
  if (Date.parse(request.deadlineAt) > Date.now() + 86400000) throw error('GARAGE_REQUEST_INVALID', 'Deadline exceeds the 24-hour bound.');
  if (!Number.isFinite(Number(request.estimatedCost || 0))) throw error('GARAGE_REQUEST_INVALID', 'Invalid estimated cost.');
}

async function scope(db, request) {
  const row = await db.get(`SELECT a.workspace_id, a.role, a.name, a.isolation_mode,
    w.organization_id, w.project_id FROM agents a JOIN agents p ON p.id = a.parent_agent_id
    LEFT JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND p.id = ? AND a.execution_mode = 'worker'
      AND p.execution_mode = 'orchestrator' AND a.workspace_id IS p.workspace_id`,
  request.workerId, request.orchestratorId);
  if (!row) throw error('GARAGE_SCOPE_INVALID', 'Worker must belong to its orchestrator and workspace.');
  for (const [field, key] of [['organizationId', 'organization_id'], ['projectId', 'project_id']]) {
    if (request[field] && request[field] !== row[key]) throw error('GARAGE_SCOPE_INVALID', 'Request scope does not match persisted scope.');
  }
  return row;
}

function defaults(input) {
  return {
    ...input, requestId: input.requestId || `garage-${crypto.randomUUID()}`,
    mode: input.mode || require('./garageFabricService').chooseMode(input).mode,
    prompt: input.prompt || input.mission, priority: input.priority ?? 0.5, urgency: input.urgency ?? 0,
    preemptible: input.preemptible === true, dependsOn: input.dependsOn || [],
    lane: input.lane || input.role || 'default',
    deadlineAt: input.deadlineAt || new Date(Date.now() + 3600000).toISOString()
  };
}

async function prepare(db, input) {
  const previous = input.requestId ? await db.get('SELECT deadline_at FROM garage_queue WHERE request_id = ?', input.requestId) : null;
  const request = defaults({ ...input, deadlineAt: input.deadlineAt || previous?.deadline_at });
  validate(request);
  const identity = await scope(db, request);
  request.organizationId = identity.organization_id;
  request.projectId = identity.project_id;
  request.workspaceId = identity.workspace_id;
  request.role = identity.role;
  request.name = input.name || identity.name;
  request.workspaceIsolation = identity.isolation_mode;
  if (policies.resolve(request.mode).isolated && !['Branch', 'Sandbox', 'Container'].includes(identity.isolation_mode)) {
    throw error('GARAGE_ISOLATION_REQUIRED', 'Pallet policy requires an isolated persisted worker.');
  }
  return request;
}

module.exports = { prepare, scope, hash, error };
