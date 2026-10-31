'use strict';

const kinds = require('./agents/workerKindService');

const NUMBER_WORDS = Object.freeze({ un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3,
  three: 3, quatre: 4, four: 4, cinq: 5, five: 5, six: 6, sept: 7, seven: 7,
  huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20 });
const MAX_REQUESTED_WORKERS = 64;
const MAX_REQUESTED_TASKS = 100000;

function firstValue(source, names) {
  for (const name of names) if (source?.[name] !== undefined) return source[name];
  return undefined;
}

function parseCount(text, labels) {
  const labelPattern = labels.join('|');
  const numberPattern = '(\\d{1,6}|un|une|one|deux|two|trois|three|quatre|four|cinq|five|six|sept|seven|huit|eight|neuf|nine|dix|ten|onze|douze|treize|quatorze|quinze|seize|vingt)';
  const match = String(text || '').toLowerCase().match(new RegExp(`\\b${numberPattern}\\s+(?:${labelPattern})\\b`, 'i'));
  if (!match) return null;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1]];
  return Number.isSafeInteger(count) ? count : null;
}

function countValue(config) {
  const { source, names, text, labels, maximum = MAX_REQUESTED_WORKERS } = config;
  const supplied = firstValue(source, names);
  const count = supplied === undefined || supplied === null ? parseCount(text, labels) : Number(supplied);
  if (count === null) return null;
  if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
    throw Object.assign(new Error(`Requested count must be an integer between 1 and ${maximum}.`), { code: 'WORKER_CARDINALITY_INVALID' });
  }
  return count;
}

function typePolicy(source, task, assignments) {
  const raw = rawTypePolicy(source);
  if (isAllTypesRequest(raw, task)) return allTypesPolicy();
  return resolveConfiguredTypePolicy({ raw, source, assignments });
}

function resolveConfiguredTypePolicy(context) {
  const { raw, source, assignments } = context;
  const policy = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const listed = Array.isArray(raw) ? raw : (policy.kinds || policy.workerKinds || policy.worker_kinds || []);
  const assignedKinds = assignmentKinds(assignments);
  const mode = resolveTypeMode({ policy, source, listed, assignedKinds });
  const quotas = policy.quotas || policy.mix || {};
  return resolvePolicyKinds({ mode, listed, assignedKinds, quotas });
}

function resolvePolicyKinds(policy) {
  validateTypeSelection(policy);
  validateQuotas(policy.quotas);
  const resolved = resolveKindList(policy.listed.length ? policy.listed : policy.assignedKinds);
  return { mode: policy.mode, kinds: [...new Set(resolved)], quotas: policy.quotas };
}

function validateTypeSelection({ mode, listed, assignedKinds, quotas }) {
  if (mode === 'mix' && Object.keys(quotas).length === 0) {
    throw Object.assign(new Error('Worker type mix requires at least one registered kind quota.'), { code: 'WORKER_TYPE_POLICY_INVALID' });
  }
  if (requiresKinds(mode) && !listed.length && !assignedKinds.length) {
    throw Object.assign(new Error(`Worker type policy '${mode}' requires at least one registered kind.`), { code: 'WORKER_TYPE_POLICY_INVALID' });
  }
}

function requiresKinds(mode) {
  return mode === 'explicit' || mode === 'allowlist';
}

function isAllTypesRequest(raw, task) {
  return raw === 'all' || raw === 'all_registered'
    || /\b(all worker types|all types|tous les types|tous les types de workers)\b/i.test(task);
}

function allTypesPolicy() {
  return { mode: 'all_registered', kinds: [], quotas: {} };
}

function assignmentKinds(assignments) {
  return Object.values(assignments || {}).map(workerKindOf).filter(Boolean);
}

function rawTypePolicy(source) {
  return source.types || source.workerTypes || source.worker_types
    || source.workerTypePolicy || source.worker_type_policy;
}

function workerKindOf(item) {
  return item?.workerKind || item?.worker_kind;
}

function resolveTypeMode({ policy, source, listed, assignedKinds }) {
  const mode = policy.mode || source.workerTypeMode || source.worker_type_mode
    || (listed.length || assignedKinds.length ? 'explicit' : 'auto');
  if (['auto', 'all_registered', 'explicit', 'allowlist', 'mix'].includes(mode)) return mode;
  throw Object.assign(new Error(`Unsupported worker type policy '${mode}'.`), { code: 'WORKER_TYPE_POLICY_INVALID' });
}

function resolveKindList(values) {
  return values.map((value) => kinds.resolveWorkerKind(value));
}

function validateQuotas(quotas) {
  for (const [kind, count] of Object.entries(quotas)) validateQuota(kind, count);
}

function validateQuota(kind, count) {
  kinds.resolveWorkerKind(kind);
  if (Number.isSafeInteger(Number(count)) && Number(count) > 0) return;
  throw Object.assign(new Error(`Worker type quota for '${kind}' must be a positive integer.`), { code: 'WORKER_TYPE_QUOTA_INVALID' });
}

function typeCount(policy) {
  if (policy.mode === 'all_registered') return Object.keys(kinds.KINDS).length;
  if (policy.mode === 'mix') return Object.values(policy.quotas).reduce((sum, value) => sum + Number(value), 0);
  return policy.kinds.length || null;
}

function resolveWorkerRosterRequest(request = {}, task = '') {
  const { source, assignments, types } = normalizeRosterInput(request, task);
  const resolvedCount = resolveWorkerCount({ source, assignments, types, task });
  const taskCount = resolveTaskCount(source, task);
  if (taskCount !== null) {
    throw Object.assign(new Error('Task-count scheduling is not implemented; refusing to report an unexecuted task roster.'), {
      code: 'WORKER_TASK_SCHEDULING_UNSUPPORTED', requestedTasks: taskCount
    });
  }
  validateRosterCardinality(types, resolvedCount);
  return resolvedCount || types.mode !== 'auto'
    ? { requestedWorkers: resolvedCount, requestedTasks: null, exact: resolvedCount !== null,
      typePolicy: types, explicitAssignments: assignments }
    : null;
}

function normalizeRosterInput(request, task) {
  const source = { ...request, ...(request.workerRoster || request.worker_roster || {}) };
  const assignments = request.workerAssignments || request.worker_assignments || {};
  return { source, assignments, types: typePolicy(source, task, assignments) };
}

function resolveWorkerCount(input) {
  const { source, assignments, types, task } = input;
  const explicit = countValue({ source, names: ['agentCount', 'agent_count', 'workerCount', 'worker_count', 'requestedWorkers', 'requested_workers'], text: task,
    labels: ['agents?', 'workers?', 'rôles?', 'roles?'] });
  return explicit || Object.keys(assignments).length || typeCount(types);
}

function resolveTaskCount(source, task) {
  return countValue({ source, names: ['taskCount', 'task_count', 'requestedTasks', 'requested_tasks'], text: task,
    labels: ['tâches?', 'taches?', 'tasks?'], maximum: MAX_REQUESTED_TASKS });
}

function validateRosterCardinality(types, count) {
  const required = Object.keys(kinds.KINDS).length;
  if (types.mode !== 'all_registered' || count === null || count >= required) return;
  throw Object.assign(new Error(`The all_registered worker policy needs at least ${required} workers; ${count} were requested.`), {
    code: 'WORKER_TYPE_CARDINALITY_CONFLICT', requiredWorkers: required, requestedWorkers: count
  });
}

module.exports = { resolveWorkerRosterRequest, parseCount, MAX_REQUESTED_WORKERS, MAX_REQUESTED_TASKS };
