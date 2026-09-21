const assert = require('node:assert/strict')
const sentinel = require('../../src/services/swarmSentinelService')
const { CausalProgressService } = require('../../src/services/search/causalProgressService')
const {
  classifySearchState, SEARCH_STATE
} = require('../../src/services/search/entropyProgressClassifier')

function causalReportFromSteps(steps) {
  const svc = new CausalProgressService()
  for (const step of steps) svc.ingestEvent({ eventType: 'AGENT_STEP', action: 'probe', payload: step })
  return svc.report()
}

function progressSteps(count = 2) {
  return Array.from({ length: count }, () => ({
    evidenceGain: 0.5, uncertaintyReduction: 0.3, constraintsResolved: 1,
    verifiedArtifactDelta: 0.2, objectiveDelta: 0.2, hypothesisInformationGain: 0.1,
    tokensConsumed: 1, timeConsumed: 0.01, costConsumed: 0.0001, provenance: 'observed'
  }))
}

function stagnationSteps(count = 2) {
  return Array.from({ length: count }, () => ({
    evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0,
    verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0,
    tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: 'observed'
  }))
}

const LOW_ENTROPY = { normalizedEntropy: 0.1, uniqueActions: 1, entropy: 0.1 }
const HIGH_ENTROPY = { normalizedEntropy: 0.95, uniqueActions: 15, entropy: 3.9 }
const MEDIUM_ENTROPY = { normalizedEntropy: 0.55, uniqueActions: 5, entropy: 2.3 }

// Productive exploitation
{
  const r = classifySearchState('a', causalReportFromSteps(progressSteps(2)), LOW_ENTROPY)
  assert.equal(r.state, SEARCH_STATE.PRODUCTIVE_EXPLOITATION)
}

// Productive exploration
{
  const r = classifySearchState('a', causalReportFromSteps(progressSteps(2)), HIGH_ENTROPY)
  assert.equal(r.state, SEARCH_STATE.PRODUCTIVE_EXPLORATION)
}

// Mechanical stagnation
{
  const r = classifySearchState('a', causalReportFromSteps(stagnationSteps(2)), LOW_ENTROPY)
  assert.equal(r.state, SEARCH_STATE.MECHANICAL_STAGNATION)
}

// Panic exploration
{
  const r = classifySearchState('a', causalReportFromSteps(stagnationSteps(2)), HIGH_ENTROPY)
  assert.equal(r.state, SEARCH_STATE.PANIC_EXPLORATION)
}

// Medium variation stagnation (P0-3 : plus de HYPOTHESIS_LOCK_IN)
{
  const r = classifySearchState('a', causalReportFromSteps(stagnationSteps(2)), MEDIUM_ENTROPY)
  assert.equal(r.state, SEARCH_STATE.MEDIUM_VARIATION_STAGNATION, 'medium entropy + low progress → medium_variation_stagnation, not HYPOTHESIS_LOCK_IN')
}

// Missing inputs
{
  const r = classifySearchState(null, null)
  assert.equal(r.state, SEARCH_STATE.MECHANICAL_STAGNATION)
}

console.log('Entropy × Progression classifier v2 tests passed.')
