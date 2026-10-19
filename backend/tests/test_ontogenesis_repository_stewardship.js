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
    console.log('Ontogenesis repository stewardship contract checks passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
