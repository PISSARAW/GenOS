const assert = require('node:assert/strict')
const { createClones, createVariants, selectBestVariant } = require('../../src/services/search/cognitiveAffinityService')
const { createRandomGenome } = require('../../src/services/search/searchGenomeService')
const { HypothesisLedger, HYPOTHESIS_STATUS } = require('../../src/services/search/hypothesisLedgerService')

{
  const base = { id: 'h1', statement: 'test' }
  const clones = createClones(base, 4)
  assert.equal(clones.length, 4)
  assert.ok(clones[0].parent === 'h1')
}

{
  const g = createRandomGenome()
  const variants = createVariants(g, 4, 'minimal')
  assert.equal(variants.length, 4)
  assert.ok(variants[0].mutations.length >= 1)
}

{
  const ledger = new HypothesisLedger()
  const g = createRandomGenome()
  const variants = createVariants(g, 4, 'minimal')
  const best = selectBestVariant(variants, ledger, 'agent-1')
  assert.ok(best, 'best variant selected')
}

console.log('Cognitive Affinity tests passed.')
