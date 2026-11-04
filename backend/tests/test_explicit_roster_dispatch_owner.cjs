'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const activation = require('../src/services/agentRuntimeAdapter/missionTopologyActivation');
const runtimeContext = require('../bin/orchestratorMissionRuntimeContext.cjs');

const request = {worker_roster: {agent_count: 2, types: {mode: 'explicit', kinds: ['bounded_worker']}}};
const mission = {...runtimeContext(request), prompt: 'Repair the code with two bounded workers.',
  morphology: {topology: 'parallel_forks'}};
assert.equal(mission.userTopologyRequested, false);
const context = {dispatchedAgent: {execution_mode: 'orchestrator'}, normalizedMission: mission};
assert.equal(activation.seedMorphogenesisSelection(context,
  {planMorphogenesis: () => {throw Error('Explicit worker contracts must not be replaced by topology defaults');}}), null);
assert.equal(mission.nativeMissionPlanOwnsDispatch, true);
assert.equal(activation.nativeMissionPlanOwnsDispatch(mission,
  {workerRoster: {exact: true, typePolicy: {mode: 'explicit'}}}), true);
assert.equal(activation.nativeMissionPlanOwnsDispatch(mission, {}), false);
assert.equal(activation.shouldUseNativeMissionPlan({...mission, userTopologyRequested: true, topologyId: 'trinity'}), false);
assert.equal(activation.shouldUseNativeMissionPlan({prompt: 'Repair code'}), false);
assert.equal(activation.shouldUseNativeMissionPlan({native_objectives: [{goal: 'A native step'}]}), true);
assert.throws(() => activation.shouldUseNativeMissionPlan({worker_roster:
  {agent_count: 2, types: {mode: 'explicit', kinds: ['not_a_registered_worker']}}}));
console.log('Native explicit worker roster: dispatch ownership, morphology override refusal and invalid-kind rejection PASS');
