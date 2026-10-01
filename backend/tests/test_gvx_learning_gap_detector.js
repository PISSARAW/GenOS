'use strict';

const assert = require('node:assert/strict');
const detector = require('../src/services/gvxLearningGapDetector');

const graph = { nodes: [{ skillId: 'routing', epistemicStatus: 'unknown' }, { skillId: 'memory', epistemicStatus: 'empirically_supported' }] };

async function main() {
  const result = detector.detect({ graph, predictionErrors: [{ skillId: 'routing', severity: 0.9, sourceId: 'p1' }],
    failures: [{ skillId: 'routing', severity: 0.8, sourceId: 'f1' }], futureTasks: [], learningProgress: [] });
  assert.equal(result.goals[0].skillId, 'routing');
  assert.equal(result.goals[0].status, 'proposed');
  await assert.rejects(detector.proposeBackgroundGoals({ graph }), { code: 'GVX_BACKGROUND_GOAL_DENIED' });
  const bounded = await detector.proposeBackgroundGoals({ graph, background: true, maxCost: 3,
    predictionErrors: [{ skillId: 'routing', severity: 0.8 }], failures: [{ skillId: 'routing', severity: 0.7 }],
    authority: { isAllowed: async (_skill, budget) => budget.maxSteps === 1 && budget.maxCost === 3 } });
  assert.equal(bounded.goals[0].execution, 'requires_external_dispatch');
  assert.equal(bounded.autonomousExecution, false);
  console.log('GVX learning gap checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
