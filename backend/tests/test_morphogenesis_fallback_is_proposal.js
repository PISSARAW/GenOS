'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');

async function main() {
  let transitionCalled = false;
  const runtime = new MorphogenesisRuntime({ emit: () => {}, governedTransition: {
    execute: async (input) => {
      transitionCalled = true;
      assert.equal(input.options.runtimeContext.req.user.username, 'operator');
      return { applied: true, proposed: false, committed: true, decision: 'APPLIED' };
    }
  } });
  runtime._db = {};
  const result = await runtime.executeMorphology({ topology: 'trinity', agents: [{ role: 'critic' }] }, {
    mode: 'commit', orchestratorId: 'orchestrator-1', expectedGain: 0.5, expectedRisk: 0.1,
    runtimeContext: { missionId: 'mission-1', agentId: 'orchestrator-1',
      req: { user: { username: 'operator' }, tenant: { organizationId: 'org', projectId: 'project' } },
      collectiveState: {} }
  });
  assert.equal(result.applied, true, 'the governed transition pipeline must be called and applied');
  assert.equal(result.proposed, false);
  assert.equal(result.committed, true, 'transition must return committed: true');
  assert.equal(result.decision, 'APPLIED', 'transition must return decision: ' + 'APPLIED');
  assert.equal(transitionCalled, true, 'legacy execution must call the governed transition pipeline');

  transitionCalled = false;
  const shadow = await runtime.executeMorphology({ topology: 'trinity', agents: [{ role: 'critic' }] }, {
    mode: 'shadow'
  });
  assert.equal(shadow.applied, false);
  assert.equal(transitionCalled, false, 'shadow mode must not enter the transition pipeline');

  const implicit = await runtime.executeMorphology({ topology: 'trinity', agents: [] });
  assert.equal(implicit.applied, false);
  assert.equal(transitionCalled, false, 'a governed commit must be explicitly requested');

  const bridge = require('../src/services/morphogenesis/runtime/morphogenesisGovernedTransitionBridge');
  await assert.rejects(bridge.execute({ db: {}, morphology: { topology: 'trinity', agents: [] },
    options: { mode: 'commit', transitionPlan: { id: 'mismatch', targetOrganization: 'rhizome',
      actions: [] } } }), { code: 'MORPHOGENESIS_PLAN_TARGET_MISMATCH' });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
