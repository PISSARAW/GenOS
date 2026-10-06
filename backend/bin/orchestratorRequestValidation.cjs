'use strict';
const ACTIONS = new Set(['orchestrate', 'dispatch_worker', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological',
  'merge_trinity', 'compare_trinity', 'report_progress', 'execute_primitive', 'change_strategy', 'change_organization',
  'organization_publish', 'organization_inbox', 'organization_state', 'ontology', 'philosophy']);
function validatePayload(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('The orchestration request must be a JSON object.');
}
function validateRequest(action, policy) {
  if (!ACTIONS.has(action)) throw new Error(`Unknown orchestration action '${action}'.`);
  if (policy.timeoutMs === undefined) return;
  const timeout = Number(policy.timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeoutMs must be a finite positive duration.');
}
module.exports = { validatePayload, validateRequest };
