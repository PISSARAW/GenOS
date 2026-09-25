'use strict';

const assert = require('node:assert/strict');
const relational = require('../src/services/crossAgentRelationalService');
const resolver = require('../src/services/morphogenesis/relationResolverService');

function verifyRelationCatalog() {
  for (const type of ['friend', 'stranger', 'parent', 'child', 'sibling', 'twin', 'colleague', 'neighbor']) {
    assert.ok(relational.RELATION_TYPES.has(type), `${type} is writable`);
    assert.ok(relational.deriveProperties(type).epistemicIndependence !== undefined, `${type} has a profile`);
  }
  assert.equal(relational.inferRelationClass('sibling'), 'lineage');
  assert.equal(relational.inferRelationClass('neighbor'), 'social');
  assert.equal(relational.inferRelationClass('coworker'), 'organizational');
  assert.equal(resolver.isLineageRelation('twin'), true);
  assert.equal(resolver.isLineageRelation('friend'), false);
}

function verifyVerifierSelection() {
  const selected = resolver.selectVerifier({ candidates: [
    { agentId: 'twin', relationType: 'twin', domainCompetence: 1, epistemicIndependence: 1, errorCorrelation: 0 },
    { agentId: 'independent', relationType: 'stranger', domainCompetence: 0.8, epistemicIndependence: 0.95, errorCorrelation: 0.1 }
  ] });
  assert.equal(selected.candidate.agentId, 'independent');
  assert.equal(resolver.selectVerifier({ candidates: [{ agentId: 'sibling', relationType: 'sibling' }] }), null);
}

function verifyPartnerSelection() {
  const selected = resolver.selectPartner({ relationType: 'friend', candidates: [
    { agentId: 'neighbor', relationType: 'neighbor', domainCompetence: 1 },
    { agentId: 'friend', relationType: 'friend', domainCompetence: 0.5 }
  ] });
  assert.equal(selected.candidate.agentId, 'friend');
  assert.ok(resolver.EXTENDED_RELATION_TYPES.includes('neighbor'));
}

async function verifyPersistedProfile() {
  let queryScope;
  const db = { all: async (_sql, args) => {
    queryScope = args.slice(2);
    return [{ id: 'friendship', source_agent_id: 'a', target_agent_id: 'b', relation_type: 'friend',
      relation_class: 'social', metadata_json: JSON.stringify({ familiarity: 0.91, epistemicIndependence: 0.8 }),
      organization_id: 'org', project_id: 'project' }];
  } };
  const profile = await resolver.getRelationProfile('a', 'b', { db, organizationId: 'org', projectId: 'project' });
  assert.deepEqual(queryScope, ['org', 'project']);
  assert.equal(profile.properties.familiarity, 0.91);
  assert.equal(profile.properties.epistemicIndependence, 0.8);
  assert.equal(profile.direction, 'forward');
}

verifyRelationCatalog();
verifyVerifierSelection();
verifyPartnerSelection();
verifyPersistedProfile().then(() => console.log('Agent relation profile tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
