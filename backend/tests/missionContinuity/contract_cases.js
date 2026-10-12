'use strict';

const assert = require('assert');
const contract = require('../../src/services/homeostasisContractService');
const homeostasis = require('../../src/services/homeostasisService');
const { buildMissionContext } = require('../../bin/orchestratorMissionHelpersBuildContext.cjs');

module.exports = function registerCompletionContractCases(test) {
  test('generic mission cannot complete without an explicit completion contract', () => {
    const mission = { id: 'generic_success', objective: 'Propose five ideas' };
    const built = homeostasis.buildMissionHomeostasis(mission);
    const state = contract.evaluateContract(built, {
      missionOutcome: true,
      flags: { completionContractConfigured: false }
    });
    assert.strictEqual(state.homeostasisSatisfied, false, 'agent completion alone must not certify a mission');
    assert.ok(state.failedInvariants.some((invariant) => invariant.id === 'completion_contract_configured'));
  });

  test('declared mission invariants are enforced as completion criteria', () => {
    const mission = {
      id: 'declared_invariant',
      objective: 'Propose five ideas',
      invariants: [{ id: 'ideas_reviewed', kind: 'functional', verifier: { type: 'context.flag', flag: 'ideasReviewed' } }]
    };
    const built = homeostasis.buildMissionHomeostasis(mission);
    const state = contract.evaluateContract(built, {
      missionOutcome: false,
      flags: { completionContractConfigured: true, ideasReviewed: true }
    });
    assert.strictEqual(state.homeostasisSatisfied, true, 'declared criteria should govern the mission outcome');
    assert.strictEqual(state.totalInvariants, 1, 'only the declared completion invariant should be evaluated');
  });

  test('mission context treats declared invariants as explicit completion criteria', async () => {
    const result = await buildMissionContext({
      outcome: { success: true },
      db: null,
      policyRequest: {
        invariants: [{ id: 'acceptance', kind: 'functional', verifier: { type: 'context.flag', flag: 'accepted' } }]
      }
    });
    assert.strictEqual(result.context.flags.completionContractConfigured, true);
    assert.strictEqual(result.invariants[0].id, 'acceptance');
  });
};
