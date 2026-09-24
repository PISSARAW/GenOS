'use strict';

const assert = require('node:assert/strict');
const { assessFreshness } = require('../src/services/aTeam/memory/knowledgeFreshnessService');
const { routeKnowledgeNeed } = require('../src/services/aTeam/memory/knowledgeRoutingService');

const recent = new Date(Date.now() - 2 * 86400000).toISOString();
assert.equal(assessFreshness({ lastSuccess: recent, evidenceCount: 2 }).fresh, true);
assert.equal(assessFreshness({ lastSuccess: 'invalid', evidenceCount: 5 }).fresh, false);
assert.equal(assessFreshness({ lastSuccess: recent, evidenceCount: 0 }).fresh, false);

(async () => {
  const routed = await routeKnowledgeNeed({
    need: 'Authentication contract for the profile endpoint',
    capability: 'oauth_security',
    referenceIds: ['contract://profile', '', 'contract://profile'],
    findExperts: async () => [{ agentId: 'security-7', domain: 'oauth_security', score: 0.92, freshnessAssessment: { fresh: true } }]
  });
  assert.equal(routed.delivery, 'UNICAST');
  assert.equal(routed.expert.agentId, 'security-7');
  assert.deepEqual(routed.knowledgeRefs, ['contract://profile']);
  const missing = await routeKnowledgeNeed({ need: 'API contract', capability: 'api', findExperts: async () => [] });
  assert.equal(missing.status, 'NO_FRESH_EXPERT');
  console.log('A-Team expertise freshness and selective knowledge routing: OK');
})().catch((error) => { console.error(error); process.exit(1); });
