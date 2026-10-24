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

  test('mission context accepts an explicit completion contract from camel or snake case request fields', async () => {
    const completionContract = {
      invariants: [{ id: 'receipt_bound', kind: 'epistemic', verifier: { type: 'evidence.present', evidence: 'worker_evidence' } }],
      requiredEvidence: ['worker_evidence']
    };
    const camel = await buildMissionContext({ outcome: { success: true }, db: null,
      request: { completionContract } });
    const snake = await buildMissionContext({ outcome: { success: true }, db: null,
      policyRequest: { completion_contract: completionContract } });

    assert.strictEqual(camel.completionContract, completionContract);
    assert.strictEqual(snake.completionContract, completionContract);
    assert.strictEqual(camel.context.flags.completionContractConfigured, true);
    assert.strictEqual(snake.context.flags.completionContractConfigured, true);
    assert.strictEqual(camel.context.flags.missionOutcome, false);
    assert.strictEqual(snake.context.flags.missionOutcome, false);
  });

  test('empty contracts and free-form success criteria do not configure the completion gate', async () => {
    const empty = await buildMissionContext({ outcome: { success: true }, db: null,
      request: { completion_contract: { invariants: [], requiredEvidence: [] } } });
    const proseOnly = await buildMissionContext({ outcome: { success: true }, db: null,
      request: { successCriteria: ['Say the mission passed'] } });

    assert.strictEqual(empty.completionContract, null);
    assert.strictEqual(empty.context.flags.completionContractConfigured, false);
    assert.strictEqual(proseOnly.context.flags.completionContractConfigured, false);
  });
};
