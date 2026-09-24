'use strict';

const { allocateTeamBudget } = require('./teamBudgetAllocator');

function allocateCriticalPathBudget(input = {}) {
  const pathIds = new Set(Array.isArray(input.criticalPath) ? input.criticalPath : []);
  const work = (Array.isArray(input.work) ? input.work : []).map((item) => ({ ...item, criticalPath: pathIds.has(item.id) ? 1 : 0.25 }));
  return allocateTeamBudget({ totalBudget: input.totalBudget, work });
}

module.exports = { allocateCriticalPathBudget };
