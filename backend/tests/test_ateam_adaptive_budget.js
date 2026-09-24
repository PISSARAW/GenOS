'use strict';

const assert = require('assert');
const { assessBoundaryRisk } = require('../src/services/aTeam/boundaries/boundaryRiskService');
const { assignBoundarySpanners } = require('../src/services/aTeam/boundaries/boundarySpannerService');
const { allocateCriticalPathBudget } = require('../src/services/aTeam/budget/criticalPathBudgetService');

function run() {
  assert.equal(assessBoundaryRisk({ interfaceCount: 8, domainCount: 5, criticality: 1, historicalFailures: 1 }).level, 'high');
  assert.equal(assignBoundarySpanners([{ from: 'ml', to: 'api' }], [{ memberId: 'm1', domain: 'ml', capabilities: ['boundary_spanning'] }])[0].ownerMemberId, 'm1');
  const allocation = allocateCriticalPathBudget({ totalBudget: 100, criticalPath: ['a'], work: [{ id: 'a', impact: 1, confidence: 1, urgency: 1, uncertainty: 1 }, { id: 'b', impact: 0.5, confidence: 1, urgency: 0.5, uncertainty: 0.2 }] });
  assert(Math.abs(allocation.allocations.reduce((sum, item) => sum + item.amount, 0) - 100) < 1e-8);
  assert(allocation.allocations[0].amount > allocation.allocations[1].amount);
}

run();
console.log('A-Team adaptive budget policies passed.');
