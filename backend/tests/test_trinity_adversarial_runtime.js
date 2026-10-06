'use strict';
const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const service = require('../src/services/trinityAdversarialCrossExamination');
async function main() {
  const original = router.generate;
  const calls = [];
  router.generate = async input => {
    calls.push(input);
    assert.equal(input.cognitiveObjects.mission, 'Challenge this invariant');
    if (input.cognitiveObjects.evidence.defenderDossiers) return { model: 'fixture', provider: 'fixture', text: JSON.stringify({ attacks: [
      { id: 'a1', targetWorld: 3, attackStatement: 'Boundary input invalidates the claim', counterexample: { description: 'Reproduce the failing boundary input', reproductionSteps: ['run boundary check'] } }
    ] }) };
    assert.ok(input.cognitiveObjects.evidence.defenderReport);
    return { model: 'fixture', provider: 'fixture', text: JSON.stringify({ defenses: [
      { attackId: 'a1', response: 'refute', evidence: ['boundary-check'] }
    ] }) };
  };
  try {
    const worlds = [1, 2, 3].map(worldNumber => ({ worldNumber, report: { claims: [], evidence: [] } }));
    const review = await service.crossExamine({ worlds, mission: 'Challenge this invariant',
      config: { attackerWorldIndex: 1, evidenceGates: [{ passes: refs => refs.includes('boundary-check') }] } });
    assert.equal(review.attackerWorld, 2);
    const defense = calls.find(call => call.cognitiveObjects.evidence.defenderReport?.worldNumber === 3);
    assert.equal(defense.cognitiveObjects.evidence.attacks[0].targetWorld, 3);
    assert.equal(review.adjudication[0].verdict, 'refuted');
    assert.equal(service.enforceVariantGate({ canMerge: true }, review).canMerge, true);
    assert.equal(service.adjudicate(review.attacks, review.defenses, [])[0].verdict, 'attack_stands_insufficient_evidence');
    assert.equal(service.adjudicate(review.attacks, [{ attackId: 'other', targetWorld: 3, response: 'concede' }], [])[0].verdict, 'attack_stands');
  } finally { router.generate = original; }
  console.log('Adversarial runtime contexts, world identity and evidence gates: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
