'use strict';

const assert = require('node:assert/strict');
const iamPolicyEngine = require('../src/services/iamPolicyEngine');
const { requireForcePromotionPermission } = require('../src/middleware/releaseForcePromotionPermission');

async function invoke(user, body) {
  const response = { statusCode: 200, payload: null, nextCalled: false };
  const res = {
    status(code) { response.statusCode = code; return res; },
    json(payload) { response.payload = payload; return res; }
  };
  const req = { user, body, headers: {}, method: 'POST', path: '/release-1/promote', baseUrl: '/api/releases', params: { id: 'release-1' } };
  await requireForcePromotionPermission(req, res, () => { response.nextCalled = true; });
  return response;
}

async function main() {
  const originalAuthorize = iamPolicyEngine.authorize;
  iamPolicyEngine.authorize = async ({ context, fallbackAllowed }) =>
    iamPolicyEngine.evaluatePolicies([], context, fallbackAllowed);
  try {
    const operator = { isAuthenticated: true, role: 'operator', permissions: ['workspace:write'] };
    const normalPromotion = await invoke(operator, { environment: 'production' });
    assert.equal(normalPromotion.nextCalled, true, 'Normal promotion remains available to workspace writers');

    const forcedOperator = await invoke(operator, { force: true, overrideReason: 'incident' });
    assert.equal(forcedOperator.statusCode, 403, 'Workspace writers cannot bypass rollout with a reason string');
    assert.match(forcedOperator.payload.error.message, /release:force_promote/);

    const admin = { isAuthenticated: true, role: 'admin', permissions: ['all'] };
    const forcedAdmin = await invoke(admin, { force: true, overrideReason: 'incident' });
    assert.equal(forcedAdmin.nextCalled, true, 'Administrators retain the explicit override path');
    console.log('Release force promotion requires dedicated authority: PASS');
  } finally {
    iamPolicyEngine.authorize = originalAuthorize;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
