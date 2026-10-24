'use strict';
const ACTIONS = new Set(['orchestrate', 'dispatch_worker', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological',
  'merge_trinity', 'compare_trinity', 'report_progress', 'execute_primitive', 'change_strategy', 'change_organization',
  'organization_publish', 'organization_inbox', 'organization_state', 'ontology', 'philosophy',
  'execute_mission_action']);
function validatePayload(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('The orchestration request must be a JSON object.');
  const hasIntent = ['action', 'mission', 'task', 'strategy'].some(field => request[field] !== undefined);
  if (!hasIntent) throw new Error('The orchestration request must declare an action, mission, task, or strategy.');
  for (const field of ['action', 'mission', 'task', 'strategy']) {
    if (request[field] !== undefined && (typeof request[field] !== 'string' || !request[field].trim())) {
      throw new Error(`${field} must be a non-empty string.`);
    }
  }
}
function validateRequest(action, policy) {
  if (!ACTIONS.has(action)) throw new Error(`Unknown orchestration action '${action}'.`);
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Orchestration policy must be an object.');
  if (action === 'orchestrate' || action === 'dispatch_team') {
    require('../src/services/workerRosterRequestService').resolveWorkerRosterRequest(policy, policy.mission || policy.task || '');
  }
  if (policy.timeoutMs === undefined) return;
  if (typeof policy.timeoutMs !== 'number' || !Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a finite positive number.');
  }
}
module.exports = { validatePayload, validateRequest };
