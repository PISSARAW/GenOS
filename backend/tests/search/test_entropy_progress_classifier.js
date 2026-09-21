const assert = require('node:assert/strict')
const sentinel = require('../../src/services/swarmSentinelService')
const { CausalProgressService } = require('../../src/services/search/causalProgressService')
const {
  classifySearchState,
  SEARCH_STATE,
  ENTROPY_LOW_THRESHOLD,
  ENTROPY_HIGH_THRESHOLD,
  PROGRESS_LOW_THRESHOLD,
  PROGRESS_MEDIUM_THRESHOLD
} = require('../../src/services/search/entropyProgressClassifier')

// Helper : créer un rapport causal directement sans passer par le sentinel

function causalReportFromSteps(steps) {
  const svc = new CausalProgressService()
  for (const step of steps) {
    svc.ingestEvent({ eventType: 'AGENT_STEP', action: 'probe', payload: step })
  }
  return svc.report()
}

// Étapes "progresseuses" avec coût très faible pour obtenir searchYield > 0.3
function progressSteps(count = 2) {
  return Array.from({ length: count }, () => ({
    evidenceGain: 0.5,
    uncertaintyReduction: 0.3,
    constraintsResolved: 1,
    verifiedArtifactDelta: 0.2,
    objectiveDelta: 0.2,
    hypothesisInformationGain: 0.1,
    tokensConsumed: 1,
    timeConsumed: 0.01,
    costConsumed: 0.0001
  }))
}

// Étapes "sans progrès" — coût élevé, aucun gain
function stagnationSteps(count = 2) {
  return Array.from({ length: count }, () => ({
    evidenceGain: 0,
    uncertaintyReduction: 0,
    constraintsResolved: 0,
    verifiedArtifactDelta: 0,
    objectiveDelta: 0,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  }))
}

// Métriques d'entropie injectables
const LOW_ENTROPY = { normalizedEntropy: 0.1, uniqueActions: 1, entropy: 0.1 }
const HIGH_ENTROPY = { normalizedEntropy: 0.95, uniqueActions: 15, entropy: 3.9 }
const MEDIUM_ENTROPY = { normalizedEntropy: 0.55, uniqueActions: 5, entropy: 2.3 }

// ---------------------------------------------------------------------------
// Productive exploitation : faible entropie, fort progrès
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-pe'
  const causalReport = causalReportFromSteps(progressSteps(2))
  const classification = classifySearchState(agentId, causalReport, LOW_ENTROPY)

  assert.equal(classification.state, SEARCH_STATE.PRODUCTIVE_EXPLOITATION, 'low entropy + good progress → productive exploitation')
  assert.ok(classification.diagnostics.region === 'low_entropy_high_progress')
}

// ---------------------------------------------------------------------------
// Productive exploration : forte entropie, fort progrès
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-px'
  const causalReport = causalReportFromSteps(progressSteps(2))
  const classification = classifySearchState(agentId, causalReport, HIGH_ENTROPY)

  assert.equal(classification.state, SEARCH_STATE.PRODUCTIVE_EXPLORATION, 'high entropy + good progress → productive exploration')
  assert.ok(classification.diagnostics.region === 'high_entropy_high_progress')
}

// ---------------------------------------------------------------------------
// Stagnation mécanique : faible entropie, zéro progrès
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-ms'
  const causalReport = causalReportFromSteps(stagnationSteps(2))
  const classification = classifySearchState(agentId, causalReport, LOW_ENTROPY)

  assert.equal(classification.state, SEARCH_STATE.MECHANICAL_STAGNATION, 'low entropy + no progress → mechanical stagnation')
  assert.ok(classification.diagnostics.region === 'low_entropy_low_progress')
}

// ---------------------------------------------------------------------------
// Exploration panique : forte entropie, zéro progrès
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-panic'
  const causalReport = causalReportFromSteps(stagnationSteps(2))
  const classification = classifySearchState(agentId, causalReport, HIGH_ENTROPY)

  assert.equal(classification.state, SEARCH_STATE.PANIC_EXPLORATION, 'high entropy + no progress → panic exploration')
  assert.ok(classification.diagnostics.region === 'high_entropy_low_progress')
}

// ---------------------------------------------------------------------------
// Lock-in hypothèse : entropie moyenne, zéro progrès
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-lock'
  const causalReport = causalReportFromSteps(stagnationSteps(2))
  const classification = classifySearchState(agentId, causalReport, MEDIUM_ENTROPY)

  assert.equal(classification.state, SEARCH_STATE.HYPOTHESIS_LOCK_IN, 'medium entropy + no progress → hypothesis lock-in')
  assert.ok(classification.diagnostics.region === 'medium_entropy_low_progress')
}

// ---------------------------------------------------------------------------
// Cas non classé : progrès modéré, entropie modérée → stagnation par défaut
// ---------------------------------------------------------------------------

{
  const agentId = 'agent-moderate'
  const causalReport = causalReportFromSteps([
    { evidenceGain: 0.05, uncertaintyReduction: 0.02, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0.01, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.005 }
  ])
  const classification = classifySearchState(agentId, causalReport, MEDIUM_ENTROPY)

  // progrès faible mais pas nul → peut tomber dans le path par défaut
  assert.ok(
    [SEARCH_STATE.MECHANICAL_STAGNATION, SEARCH_STATE.HYPOTHESIS_LOCK_IN].includes(classification.state),
    'ambiguous moderate case defaults to a stagnation-like state'
  )
}

// ---------------------------------------------------------------------------
// Sans agent / rapport invalide → état de sécurité
// ---------------------------------------------------------------------------

{
  const classification = classifySearchState(null, null)
  assert.equal(classification.state, SEARCH_STATE.MECHANICAL_STAGNATION, 'missing inputs → safe default stagnation')
}

// ---------------------------------------------------------------------------
// Rapport de recherche complet (produceSearchReport)
// ---------------------------------------------------------------------------

{
  const agentId = 'report-agent'
  const svc = new CausalProgressService()
  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'probe',
    payload: { evidenceGain: 0.2, uncertaintyReduction: 0.1, constraintsResolved: 1, verifiedArtifactDelta: 0, objectiveDelta: 0.05, hypothesisInformationGain: 0.02, tokensConsumed: 20, timeConsumed: 0.2, costConsumed: 0.002 }
  })
  const report = require('../../src/services/search/entropyProgressClassifier').produceSearchReport(agentId, svc)

  assert.ok(report.agentId === agentId)
  assert.ok(report.searchState)
  assert.ok(typeof report.metrics.normalizedEntropy === 'number')
  assert.ok(typeof report.causalProgress === 'object')
}

console.log('Entropy × Progression classifier tests passed.')
