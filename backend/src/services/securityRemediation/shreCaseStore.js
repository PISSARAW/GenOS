'use strict';

const { randomUUID } = require('node:crypto');
const { AdaptiveStateService } = require('../adaptiveStateService');

const SCOPE = 'security_homeostatic_recovery_v1';

function tenantKey(tenant) {
  if (!tenant?.organizationId || !tenant?.projectId) throw new Error('SHRE_TENANT_SCOPE_REQUIRED');
  return `${tenant.organizationId}::${tenant.projectId}`;
}

async function load(db, tenant) {
  const key = tenantKey(tenant);
  const store = new AdaptiveStateService(db);
  const state = await store.restoreObject(SCOPE, key) || { cases: {} };
  state.cases = state.cases && typeof state.cases === 'object' ? state.cases : {};
  return { key, store, state };
}

async function save(context) {
  await context.store.persistObject(SCOPE, context.key, context.state, Date.now());
}

function createId() {
  return `shre_${randomUUID()}`;
}

function requireCase(state, caseId) {
  const current = state.cases[caseId];
  if (!current) throw new Error('SHRE_CASE_NOT_FOUND');
  return current;
}

module.exports = { SCOPE, load, save, createId, requireCase };
