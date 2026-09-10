const { state } = require('./jobWorkerState');

function workflowScopeKey(row) {
  return `${row.organization_id || 'global'}:${row.project_id || 'global'}`;
}

function comparePriority(left, right) {
  const priority = Number(right.priority || 0) - Number(left.priority || 0);
  if (priority) return priority;
  return String(left.created_at || '').localeCompare(String(right.created_at || '')) || String(left.id).localeCompare(String(right.id));
}

function pickNextScope(ordered, lastScope) {
  return ordered.find((row) => workflowScopeKey(row) !== lastScope) || ordered[0] || null;
}

function selectFairWorkflow(rows = [], table = 'workflow_runs') {
  const ordered = [...rows].sort(comparePriority);
  const lastScope = state.lastScopeByTable.get(table) || null;
  const next = pickNextScope(ordered, lastScope);
  if (next) state.lastScopeByTable.set(table, workflowScopeKey(next));
  return next;
}

module.exports = { workflowScopeKey, selectFairWorkflow };
