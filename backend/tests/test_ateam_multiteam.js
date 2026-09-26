'use strict';

const assert = require('assert');
const { composeMultiteam } = require('../src/services/aTeam/multiteam/multiteamComposer');

function run() {
  const composed = composeMultiteam({ teams: [{ teamId: 'front' }, { teamId: 'api' }], contracts: [{ contractId: 'api-to-front', fromTeamId: 'api', toTeamId: 'front', provides: ['schema'], acceptanceCriteria: ['schema validated'] }] });
  assert.deepEqual(composed.graph.topologicalLayers, [['team:api'], ['team:front']]);
  assert.equal(composed.council.participants.length, 2);
  const budgeted = composeMultiteam({
    teams: [{ teamId: 'api', budget: { tokens: 20 } }, { teamId: 'web', objective: 'Ship UI' }],
    contracts: [], globalBudget: { tokens: 100 }, systemObjective: 'Ship product'
  });
  assert.deepEqual(budgeted.budget.local, { api: { tokens: 20 }, web: { tokens: 80 } });
  assert.equal(budgeted.objectives.complete, false);
  assert.throws(() => composeMultiteam({ teams: [{ teamId: 'a', budget: 80 }, { teamId: 'b', budget: 80 }], globalBudget: { tokens: 100 } }), { code: 'ATEAM_MTS_BUDGET_EXCEEDED' });
  assert.throws(() => composeMultiteam({ teams: [{ teamId: 'one' }], depth: 3 }), { code: 'ATEAM_MTS_LIMIT' });
  assert.throws(() => composeMultiteam({ teams: [{ teamId: 'a' }, { teamId: 'b' }], contracts: [{ fromTeamId: 'a', toTeamId: 'b', provides: ['x'], acceptanceCriteria: ['y'] }, { fromTeamId: 'b', toTeamId: 'a', provides: ['x'], acceptanceCriteria: ['y'] }] }), { code: 'ATEAM_MTS_CYCLE' });
}

run();
console.log('A-Team multiteam composition passed.');
