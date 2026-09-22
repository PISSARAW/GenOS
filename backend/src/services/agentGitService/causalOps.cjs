'use strict';

const { getCommit, collectAncestors } = require('./commitGraph');
const { getDatabase } = require('../../db');
const { treeHash } = require('./canonical');
const crypto = require('crypto');
const { json, verifyObjectSignatureLocal, verifySingleObject } = require('./verifyHelpers.cjs');
const { identityOf } = require('./sectionIdentity.cjs');

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

function checkBudgets(runs) {
  return runs.every(r => {
    const budget = JSON.parse(r.budget_json || '{}');
    return typeof budget.allocated === 'number' && typeof budget.consumed === 'number' && budget.consumed <= budget.allocated;
  });
}

function checkPermissions(permissions) {
  return permissions.every(p => {
    const perms = JSON.parse(p.permissions_json || '[]');
    const denied = JSON.parse(p.denied_tools_json || '[]');
    return perms.filter(t => denied.includes(t)).length === 0;
  });
}

function checkDecisions(decisions) {
  return decisions.every(d => typeof d.synaptic_weight === 'number' && d.synaptic_weight > 0);
}

function checkOutcomeInvariants(state) {
  const invariants = {};
  if (state.runs && Array.isArray(state.runs)) invariants.budgetsConsistent = checkBudgets(state.runs);
  if (state.permissions && Array.isArray(state.permissions)) invariants.permissionsConsistent = checkPermissions(state.permissions);
  if (state.decisions && Array.isArray(state.decisions)) invariants.decisionsValid = checkDecisions(state.decisions);
  return invariants;
}

async function replay(req) {
  const db = await getDatabase();
  const scope = scopeSql(req, 'w');
  const object = await db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, req.body?.objectId, ...scope.params);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const state = JSON.parse(object.state_json);
  const digest = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  const events = Array.isArray(state.events) ? state.events : [];
  const signatureValid = verifyObjectSignatureLocal(object);
  const stateHashValid = digest === object.state_hash;
  const causalOrdered = events.every((event, index, all) => index === 0 || String(all[index - 1].created_at) <= String(event.created_at));
  const outcomeInvariants = checkOutcomeInvariants(state);
  const integrityReplay = stateHashValid && signatureValid;
  const executionReplay = { eventCount: events.length, causalOrdered, stateHashValid, signatureValid, outcomeInvariants, executionMode: 'verification_only', applied: false };
  return { success: integrityReplay, status: integrityReplay ? 'verified' : 'verification_failed', operation: 'replay', objectId: object.id, replayVerified: integrityReplay, state, stateHash: digest, runtimeReplay: executionReplay };
}

async function buildCausalBlame(db, commit, section) {
  const state = JSON.parse(commit.state_json);
  const items = Array.isArray(state[section]) ? state[section] : [];
  const itemIds = new Set(items.map(i => identityOf(section, i)));
  const history = [];
  let current = commit;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const currentItems = JSON.parse(current.state_json);
    const currentSection = Array.isArray(currentItems[section]) ? currentItems[section] : [];
    collectBlameEntries({ currentSection, itemIds, current, history, section });
    if (current.parentIds && current.parentIds.length > 0) current = await getCommit(db, current.parentIds[0]);
    else current = null;
  }
  return history.reverse();
}

function collectBlameEntries(ctx) {
  const { currentSection, itemIds, current, history, section } = ctx;
  for (const item of currentSection) {
    const id = identityOf(section, item);
    if (itemIds.has(id)) history.push({ commitId: current.id, item, createdAt: current.created_at, introducedBy: current.created_by || 'unknown', metadata: json(current.metadata_json, {}) });
  }
}

async function blame(req) {
  const db = await getDatabase();
  const scope = scopeSql(req, 'w');
  const agent = await db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, req.body?.agentId, ...scope.params);
  if (!agent) return { success: false, error: 'Agent not found.' };
  const section = String(req.body?.section || 'decisions');
  const rows = Array.isArray(agent[section]) ? agent[section] : [];
  const objectId = req.body?.objectId;
  if (objectId) {
    const commit = await getCommit(db, objectId);
    if (!commit) return { success: false, error: 'Object not found.' };
    const blame = await buildCausalBlame(db, commit, section);
    return { success: true, operation: 'blame', agentId: agent.id, section, objectId, blame };
  }
  return { success: true, operation: 'blame', agentId: agent.id, section, entries: rows.map((item) => ({ id: item.id || item.event_id || item.action_input, sourceAgentId: item.created_by || item.agent_id || agent.id, createdAt: item.created_at })) };
}

async function detectCycles(db, objects) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();
  const objMap = new Map(objects.map(o => [o.id, o]));
  function dfs(id, path) {
    if (inStack.has(id)) { cycles.push({ cycle: [...path, id], start: id }); return; }
    if (visited.has(id)) return;
    visited.add(id);
    inStack.add(id);
    const obj = objMap.get(id);
    if (obj) {
      const parents = obj.parent_commit_id ? [obj.parent_commit_id] : [];
      for (const pid of parents) { if (objMap.has(pid)) dfs(pid, [...path, id]); }
    }
    inStack.delete(id);
  }
  for (const obj of objects) { if (!visited.has(obj.id)) dfs(obj.id, []); }
  return cycles;
}

// verifySingleObject est importé depuis verifyHelpers.cjs

async function fsck(req) {
  const db = await getDatabase();
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scope.clause}`, req.body?.agentId, ...scope.params);
  const issues = [];
  for (const object of objects) { const objectIssues = await verifySingleObject(db, object, objects); issues.push(...objectIssues); }
  const cycles = await detectCycles(db, objects);
  for (const cycle of cycles) issues.push({ id: cycle.start, issue: 'dag_cycle', cycle: cycle.cycle });
  const refs = await db.all(`SELECT ref_key, agent_id, ref_name, object_id FROM agent_git_refs WHERE agent_id = ?`, req.body?.agentId);
  for (const ref of refs) {
    if (ref.object_id && !objects.some(o => o.id === ref.object_id)) issues.push({ id: ref.ref_key, issue: 'dangling_ref', refName: ref.ref_name, objectId: ref.object_id });
  }
  return { success: true, operation: 'fsck', checked: objects.length, healthy: issues.length === 0, issues };
}

module.exports = { replay, blame, fsck, buildCausalBlame, detectCycles, verifySingleObject, checkOutcomeInvariants };
