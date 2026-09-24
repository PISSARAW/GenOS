'use strict';

const assert = require('assert');
const { buildTeamDebrief } = require('../src/services/aTeam/learning/teamDebriefService');
const { summarizePerformance } = require('../src/services/aTeam/learning/teamPerformanceMemory');
const { deriveStaffingSignals } = require('../src/services/aTeam/learning/staffingLearningService');
const { buildMorphologyCandidate, planTeamMorphogenesis } = require('../src/services/aTeam/learning/aTeamMorphogenesisBridge');
const { validatePlan } = require('../src/services/morphogenesis/morphogenesisPlannerService');

function run() {
  const debrief = buildTeamDebrief({ teamRun: { teamRunId: 'run-1', status: 'COMPLETED' }, objectiveMet: true, evidenceIds: ['ev-1'], metrics: { completionRate: 1, reworkRate: 0.1 }, lessons: [{ statement: 'Add a security specialist', category: 'staffing', reusable: true, evidenceId: 'ev-1' }] });
  assert.equal(summarizePerformance([debrief]).successRate, 1);
  assert.equal(deriveStaffingSignals([debrief])[0].occurrences, 1);
  const candidate = buildMorphologyCandidate({ workGraph: { workGraphId: 'wg-1', nodes: [{ requiredCapabilities: ['security'] }] }, variants: ['expert_committee'] });
  assert.deepEqual(candidate.requiredCapabilities, ['security']);
  assert.equal(candidate.workGraphId, 'wg-1');
  assert.equal(candidate.topology, 'a_team');
  const transition = planTeamMorphogenesis({ mission: { goal: 'build independent workstreams', parallelWorkstreams: 2 }, morphologyContext: { expression: null, currentState: { topology: 'specialist_expert_committee', agents: new Map() } } });
  assert.equal(transition.variantPlan.variant, 'project_dag');
  const graph = transition.plan.morphologyPatch.graph;
  assert.equal(graph.nodes.find((node) => node.nodeId === graph.rootNodeId).topology, 'a_team');
  assert.equal(validatePlan({ plan: transition.plan }).valid, true);
}

run();
console.log('A-Team debrief and learning passed.');
