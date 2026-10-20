'use strict';

const assert = require('node:assert/strict');
const { topologyDetails } = require('../src/services/topology/topologyDetails.cjs');

const identities = [
  ['sessionId', 'session-1'], ['rhizomeId', 'rhizome-1'],
  ['communityId', 'community-1'], ['holobiontId', 'holobiont-1'],
  ['metapopulationId', 'metapopulation-1'], ['biomeId', 'biome-1']
];

for (const [field, value] of identities) {
  const details = topologyDetails({ [field]: value });
  assert.equal(details.sessionId, value, field);
}

const scoped = topologyDetails({ communityId: 'community-2',
  holobiontId: 'holobiont-2', metapopulationId: 'metapopulation-2' });
assert.equal(scoped.communityId, 'community-2');
assert.equal(scoped.holobiontId, 'holobiont-2');
assert.equal(scoped.metapopulationId, 'metapopulation-2');

process.stdout.write('Topology details: PASS\n');
