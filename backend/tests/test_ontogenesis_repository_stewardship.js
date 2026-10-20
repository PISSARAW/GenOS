'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const projects = require('../src/services/ontogenesis/projectStore');
const stewardship = require('../src/services/ontogenesis/repositoryStewardshipService');

const baseContract = {
  intent: 'Réduire durablement les régressions du dépôt.',
  constraints: ['Ne jamais publier automatiquement.'],
  invariants: ['Une preuve indépendante précède toute adoption.']
};

async function createProject(db, id) {
  await projects.createProject(db, { id, rootPath: 'C:/repo', branch: 'codex/stewardship',
    objective: baseContract.intent, config: fixture.testConfig() });
}

function candidate(contract, overrides = {}) {
  return { projectId: 'stewardship', candidateId: 'candidate-a', contractHash: contract.contractHash,
    baseSha: 'a'.repeat(40), workspaceRef: 'capsule://candidate-a', executorId: 'coding-agent-a', isolated: true,
    hypothesis: { statement: 'La garde ciblée supprime la régression.',
      falsificationCriterion: 'Le scénario de régression échoue encore.',
      evidencePlan: ['Exécuter le scénario avant et après.'] }, ...overrides };
}

function assessment(overrides = {}) {
  return { projectId: 'stewardship', assessmentId: 'assessment-a', candidateId: 'candidate-a',
    proof: { source: 'ontogenesis-verifier', exitCode: 0, verifierId: 'independent-reviewer',
      candidateId: 'candidate-a', treeHash: 'c'.repeat(64), evidenceRefs: ['test://regression'] },
    integration: { status: 'committed', sha: 'd'.repeat(40), treeHash: 'c'.repeat(64) },
    effect: { verifierId: 'effect-reviewer', metric: 'regressions', baseline: 2, observed: 0,
      direction: 'decrease', observedAfterSha: 'd'.repeat(40), evidenceRefs: ['probe://post-integration'] },
    ...overrides };
}

async function verifyDecisionGates(db, contract) {
  const transportOnly = await stewardship.assessCandidate(db, assessment({ assessmentId: 'transport-only',
    effect: null }));
  assert.equal(transportOnly.decision, 'NO_CHANGE');
  assert.deepEqual(transportOnly.reasons, ['effet-post-integration-requis']);

  const selfReviewed = await stewardship.assessCandidate(db, assessment({ assessmentId: 'self-reviewed',
    proof: { ...assessment().proof, verifierId: 'coding-agent-a' } }));
  assert.equal(selfReviewed.decision, 'NO_CHANGE');
  assert.deepEqual(selfReviewed.reasons, ['preuve-non-independante']);

  const adopted = await stewardship.assessCandidate(db, assessment());
  assert.equal(adopted.decision, 'ADOPT');
  assert.equal((await stewardship.assessCandidate(db, assessment())).replayed, true);
  assert.deepEqual(await stewardship.resumeStewardship(db, 'stewardship'), {
    projectId: 'stewardship', contractVersion: contract.version, contractHash: contract.contractHash,
    candidateId: 'candidate-a', decision: 'ADOPT', nextAction: 'observe_repository',
    reason: 'effet-projet-demontre', assessmentId: 'assessment-a' });
}

async function verifyStaleResume(db, contract) {
  const revised = await stewardship.registerContract(db, { projectId: 'stewardship',
    expectedVersion: contract.version, contract: { ...contract.contract,
      constraints: [...contract.contract.constraints, 'Conserver les reçus causaux.'] } });
  const resumed = await stewardship.resumeStewardship(db, 'stewardship');
  assert.equal(resumed.decision, 'NO_CHANGE');
  assert.equal(resumed.nextAction, 'reconcile_contract');
  const stale = await stewardship.assessCandidate(db, assessment({ assessmentId: 'stale-assessment' }));
  assert.equal(stale.decision, 'NO_CHANGE');
  assert.ok(stale.reasons.includes('contrat-candidat-obsolete'));
  assert.equal(revised.version, contract.version + 1);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await createProject(db, 'stewardship');
    const first = await stewardship.registerContract(db, { projectId: 'stewardship',
      expectedVersion: 0, contract: baseContract });
    assert.equal(first.version, 1);
    assert.match(first.contractHash, /^[a-f0-9]{64}$/);
    await assert.rejects(stewardship.registerContract(db, { projectId: 'stewardship',
      expectedVersion: 0, contract: baseContract }), /version-contrat-obsolete/);
    await assert.rejects(stewardship.registerContract(db, { projectId: 'stewardship', expectedVersion: 1,
      contract: { ...baseContract, invariants: ['Le changement compile.'] } }),
    /affaiblissement-contrat-non-justifie/);

    const second = await stewardship.registerContract(db, { projectId: 'stewardship', expectedVersion: 1,
      contract: { ...baseContract, constraints: [...baseContract.constraints, 'Respecter le budget.'] } });
    assert.equal(second.previousHash, first.contractHash);
    assert.equal(second.version, 2);

    await assert.rejects(stewardship.proposeCandidate(db, candidate(second, { isolated: false })),
      /candidat-non-isole/);
    await assert.rejects(stewardship.proposeCandidate(db, candidate(second, { hypothesis: null })),
      /hypothese-requise/);
    const proposed = await stewardship.proposeCandidate(db, candidate(second));
    assert.equal(proposed.replayed, false);
    assert.equal((await stewardship.proposeCandidate(db, candidate(second))).replayed, true);
    await assert.rejects(stewardship.proposeCandidate(db, candidate(second, { baseSha: 'b'.repeat(40) })),
      /candidate-idempotence-conflit/);

    const state = await stewardship.currentState(db, 'stewardship');
    assert.equal(state.contract.contractHash, second.contractHash);
    assert.equal(state.candidate.hypothesis.falsificationCriterion,
      'Le scénario de régression échoue encore.');
    assert.equal((await db.get(`SELECT COUNT(*) AS n FROM ontogenesis_memory
      WHERE project_id = ? AND kind = 'constraint'`, ['stewardship'])).n, 2);
    await verifyDecisionGates(db, second);
    await verifyStaleResume(db, second);
    assert.equal((await db.get(`SELECT COUNT(*) AS n FROM ontogenesis_memory
      WHERE project_id = ? AND kind IN ('decision', 'failure')`, ['stewardship'])).n, 4);
    console.log('Ontogenesis repository stewardship contract checks passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
