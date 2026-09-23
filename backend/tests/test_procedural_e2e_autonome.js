'use strict';

// E2E autonome — le cycle complet du papier, en une seule exécution :
//
//   P0 = mauvaise procédure (dead-end)
//     -> exécution -> failure / surprise (prediction error)
//     -> LTD (dépression des synapses du chemin échoué)
//     -> consolidation (le chemin mort est appris comme échec)
//     -> mutation déterministe -> candidate sealed
//     -> immune inspection
//     -> baseline fork ─┬─ candidate fork (même état initial)
//     -> causal comparison
//     -> promotion gate
//     -> P1 persisted as child of P0
//     -> load(P1) identique, phylogénie [P0, P1], fitness réelle mesurée

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const identity = require('../src/services/proceduralIdentityService');
const mutation = require('../src/services/proceduralMutationSelectionService');
const plasticity = require('../src/services/proceduralPlasticityService');
const predictionError = require('../src/services/proceduralPredictionErrorService');
const consolidation = require('../src/services/proceduralConsolidationService');
const runtime = require('../src/services/proceduralRuntimeService');
const persistence = require('../src/services/proceduralPersistenceService');
const semantics = require('../src/services/proceduralGraphSemanticsService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// ——— Simulateur de procédure déterministe ———
// Marche le graphe depuis l'entrypoint ; un nœud sans synapse sortante
// (dead-end) fait échouer la procédure. C'est LE défaut de P0.
function procedureRunner(organism, initialState) {
  void initialState; // état initial identique pour les deux forks — non utilisé par la marche
  const nodes = organism.structure.nodes;
  const synapses = organism.structure.synapses;
  const turns = [];
  let current = nodes[0];
  let steps = 0;
  while (current && steps < 10) {
    turns.push({ node: current.id, type: current.type });
    if (current.type === 'terminal') return { turns, outcome: 'success' };
    const outgoing = synapses.filter((s) => s.from === current.id);
    if (!outgoing.length) return { turns, outcome: 'failure' }; // dead-end
    const usable = outgoing.find((s) => (s.weight == null ? 0.5 : Number(s.weight)) > 0.2);
    if (!usable) return { turns, outcome: 'failure' }; // synapses trop déprimées
    current = nodes.find((n) => n.id === usable.to);
    steps++;
  }
  return { turns, outcome: 'failure' };
}

function makeP0() {
  return identity.sealOrganism({
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { version: 1, parentId: null, lineageId: 'lineage-e2e-autonome' },
    structure: {
      nodes: [
        { id: 'start', type: 'action', required: true, locked: true },
        { id: 'patch', type: 'action' }, // dead-end : aucune synapse sortante
        { id: 'end', type: 'terminal', required: true },
      ],
      synapses: [
        { from: 'start', to: 'patch', type: 'excitatory', weight: 0.8 },
      ],
    },
    fitness: { score: 0.2, components: { success: 0.2, robustness: 0.3, evidence: 0.4, risk: 0.1 } },
  });
}

async function main() {
  const dbPath = path.join(__dirname, `test-procedural-autonome-${Date.now()}.db`);
  const db = new sqlite3.Database(dbPath);
  for (const stmt of persistence.TABLE_SQL.split(';').filter((s) => s.trim())) {
    await run(db, stmt);
  }

  // ═══ 1. P0 = mauvaise procédure, persistée ═══
  const p0 = makeP0();
  const savedP0 = await persistence.persistGenome(db, p0, { status: 'active' });
  assert.ok(savedP0.metadata.id);

  // ═══ 2. Exécution de P0 -> failure ═══
  const initialState = { workspace: 'clean', budget: 100 };
  const p0Run = procedureRunner(p0, initialState);
  assert.strictEqual(p0Run.outcome, 'failure', 'P0 doit échouer (dead-end sur patch)');
  assert.ok(p0Run.turns.some((t) => t.node === 'patch'));

  // ═══ 3. Prediction error : surprise négative -> LTD + mutation search ═══
  const pe = predictionError.computePredictionError({
    expectedReward: 0.8, // P0 croyait réussir
    observedReward: 0,   // échec réel
  });
  const action = predictionError.peAction(pe);
  assert.strictEqual(action.isSurprising, true, 'un échec inattendu doit être surprenant');
  assert.strictEqual(action.triggerLTD, true, 'surprise négative -> LTD');
  assert.strictEqual(action.triggerMutationSearch, true, 'surprise négative -> recherche de mutation');

  // ═══ 4. LTD : les synapses du chemin échoué se dépriment ═══
  const failedSynapse = p0.structure.synapses.find((s) => s.from === 'start');
  const LTD_POLICY = { plasticity: { enabled: true, learningRate: 0.1 } };
  const ltdSynapse = plasticity.applyLTD(failedSynapse, { success: 0, safety: 0.1, cost: 0.9, evidence: 0 }, LTD_POLICY);
  assert.ok(ltdSynapse.weight < failedSynapse.weight, `LTD doit déprimer le poids (${failedSynapse.weight} -> ${ltdSynapse.weight})`);

  // ═══ 5. Consolidation : l'échec est appris (épisode + contraste) ═══
  const episodes = [
    consolidation.episodeFrom({ trajectory: ['start', 'patch'], outcome: 'failure', context: initialState }),
    consolidation.episodeFrom({ trajectory: ['start', 'patch'], outcome: 'failure', context: initialState }),
    consolidation.episodeFrom({ trajectory: ['start', 'patch'], outcome: 'failure', context: initialState }),
  ];
  const replay = consolidation.replaySummary(episodes);
  assert.strictEqual(replay.successRate, 0, 'P0 échoue systématiquement');
  assert.strictEqual(replay.failureCount, 3);

  // ═══ 6. Cycle d'évolution avec validation causale intégrée ═══
  const result = await runtime.runEvolutionCycle(db, savedP0, {
    variantCount: 15, // assez de variants pour couvrir les paires ADD_SYNAPSE disponibles
    policy: { minEvidence: 0.5, minRobustness: 0.0, maxNodes: 100, epsilon: 0.05 },
    causalRunner: procedureRunner,
    initialState,
  });

  assert.strictEqual(result.promoted, true,
    `le cycle doit promouvoir une réparation causale: ${JSON.stringify(result.attempts.map((a) => ({ op: a.operation, stage: a.stage, reason: a.reason && a.reason.slice(0, 90) })))}`);

  const p1 = result.saved;
  const promotedAttempt = result.attempts.find((a) => !a.rejected);

  // ═══ 7. Assertions fortes ═══
  assert.notStrictEqual(p1.metadata.id, savedP0.metadata.id);
  assert.strictEqual(p1.metadata.version, savedP0.metadata.version + 1);
  assert.strictEqual(p1.metadata.parentId, savedP0.metadata.id);
  assert.strictEqual(p1.metadata.structureHash, identity.structureHash(p1));
  assert.strictEqual(p1.metadata.stateHash, identity.stateHash(p1));
  const p1Validation = identity.validateOrganism(p1);
  assert.strictEqual(p1Validation.valid, true, `P1 valide: ${p1Validation.errors.join('; ')}`);
  const p1Semantics = semantics.validateGraphSemantics(p1);
  assert.strictEqual(p1Semantics.valid, true, `P1 exécutable: ${p1Semantics.errors.join('; ')}`);

  // ═══ 8. La preuve causale est présente et positive ═══
  assert.ok(promotedAttempt.causal, 'la tentative promue doit porter la preuve causale');
  assert.strictEqual(promotedAttempt.causal.verdict, 'CAUSAL_IMPROVEMENT');
  assert.strictEqual(promotedAttempt.causal.improvement, true);
  assert.ok(promotedAttempt.causal.comparison.divergenceCount > 0, 'les trajectoires doivent diverger');
  assert.strictEqual(promotedAttempt.causal.comparison.baselineScore, 0, 'baseline (P0) échoue');
  assert.strictEqual(promotedAttempt.causal.comparison.candidateScore, 1, 'candidate (P1) réussit');
  assert.strictEqual(promotedAttempt.causal.comparison.sameInitialState, true);

  // ═══ 9. Fitness réelle dérivée des forks, pas déclarée ═══
  assert.ok(p1.fitness.score > savedP0.fitness.score, `fitness(P1)=${p1.fitness.score} > fitness(P0)=${savedP0.fitness.score}`);
  assert.ok(p1.fitness.components.evidence >= 0.5, 'evidence >= minEvidence (dérivée de la divergence causale)');

  // ═══ 10. P1 exécute réellement avec succès ═══
  const p1Run = procedureRunner(p1, initialState);
  assert.strictEqual(p1Run.outcome, 'success', 'la procédure mutée doit réellement réussir');

  // ═══ 11. Immunité PASS ═══
  assert.strictEqual(p1.immune.rejected, false);
  assert.strictEqual(p1.immune.findings.length, 0);

  // ═══ 12. Persistence : load(P1) identique, phylogénie [P0, P1] ═══
  const loaded = await persistence.loadGenome(db, p1.metadata.id);
  assert.deepStrictEqual(loaded, p1, 'load(P1) doit retourner exactement le même organisme');
  const phylogeny = await persistence.getPhylogeny(db, p1.metadata.id);
  assert.strictEqual(phylogeny.length, 2);
  assert.strictEqual(phylogeny[0].metadata.id, savedP0.metadata.id);
  assert.strictEqual(phylogeny[1].metadata.id, p1.metadata.id);

  // ═══ 13. Traçabilité : chaque rejet porte son stage ═══
  const stages = new Set(result.attempts.map((a) => a.stage));
  assert.ok(stages.has('causal') || stages.has('semantics') || stages.has('gate'),
    `des candidats doivent être écartés par les gates: ${[...stages].join(', ')}`);

  await new Promise((resolve) => db.close(resolve));
  try {
    fs.unlinkSync(dbPath);
  } catch (e) {
    if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
  }
  console.log('=== procedural E2E autonome (P0 defect -> causal repair -> P1 promoted): all passed ===');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
