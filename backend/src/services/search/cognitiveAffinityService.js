/**
 * Cognitive Affinity Maturation — Phase 7.
 *
 * Inspiration immunitaire : autour d'une hypothèse prometteuse,
 * créer des variantes par petites mutations et sélectionner les meilleures.
 */

const { createRandomGenome, mutateGenome } = require('./searchGenomeService')

function createClones(baseHypothesis, count = 4) {
  const clones = []
  for (let i = 0; i < count; i++) {
    clones.push({
      id: `${baseHypothesis.id}_clone_${i}`,
      statement: baseHypothesis.statement,
      mutations: [],
      parent: baseHypothesis.id,
      affinity: 0.5
    })
  }
  return clones
}

function createVariants(baseGenome, count = 4, radius = 'minimal') {
  const variants = []
  for (let i = 0; i < count; i++) {
    variants.push(mutateGenome(baseGenome, radius))
  }
  return variants
}

function selectBestVariant(variants, ledger, agentId) {
  let best = variants[0];
  let bestScore = -Infinity;

  for (const v of variants) {
    // Score basé sur la diversité des mutations et l'absence de falsification
    const diversityScore = v.mutations.flatMap(m => m.changes).length;
    const isKnownDead = ledger.hypothesesForAgent(agentId)
      .some(h => h.status === 'falsified' && h.statement.includes(v.hypothesisFamily));
    const score = diversityScore + (isKnownDead ? -5 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best;
}

module.exports = { createClones, createVariants, selectBestVariant }
