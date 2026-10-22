'use strict';

const { randomUUID } = require('node:crypto');

const PERMISSION_TTL_MS = 5 * 60 * 1000;
const AUTO_RISK_LIMIT = 0.25;

function requiresHumanApproval(diagnostic, plan, simulation) {
  return simulation.riskScore > AUTO_RISK_LIMIT || diagnostic.uncertainty > 0.5
    || plan.impactLevel !== 'low' || simulation.impactLevel !== 'low';
}

function grantPermission(input) {
  const now = input.now || Date.now();
  return { id: randomUUID(), scope: `security:remediate:${input.resourceId}`,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + PERMISSION_TTL_MS).toISOString(),
    oneUse: true, policy: 'shre-deterministic-v1' };
}

function permissionValid(permission, resourceId, now = Date.now()) {
  return permission?.scope === `security:remediate:${resourceId}`
    && permission.oneUse === true && permission.consumed !== true && Date.parse(permission.expiresAt) > now;
}

module.exports = { PERMISSION_TTL_MS, AUTO_RISK_LIMIT, requiresHumanApproval, grantPermission, permissionValid };
