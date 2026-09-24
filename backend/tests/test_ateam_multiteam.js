'use strict';

const assert = require('assert');
const { composeMultiteam } = require('../src/services/aTeam/multiteam/multiteamComposer');

function run() {
  const composed = composeMultiteam({ teams: [{ teamId: 'front' }, { teamId: 'api' }], contracts: [{ contractId: 'api-to-front', fromTeamId: 'api', toTeamId: 'front', provides: ['schema'], acceptanceCriteria: ['schema validated'] }] });
  assert.deepEqual(composed.graph.topologicalLayers, [['team:api'], ['team:front']]);
  assert.equal(composed.council.participants.length, 2);
  assert.throws(() => composeMultiteam({ teams: [{ teamId: 'one' }], depth: 3 }), { code: 'ATEAM_MTS_LIMIT' });
  assert.throws(() => composeMultiteam({ teams: [{ teamId: 'a' }, { teamId: 'b' }], contracts: [{ fromTeamId: 'a', toTeamId: 'b', provides: ['x'], acceptanceCriteria: ['y'] }, { fromTeamId: 'b', toTeamId: 'a', provides: ['x'], acceptanceCriteria: ['y'] }] }), { code: 'ATEAM_MTS_CYCLE' });
}

run();
console.log('A-Team multiteam composition passed.');
