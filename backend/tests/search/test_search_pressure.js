/**
 * Tests du Search Pressure Service (Phase 4).
 *
 * Invariants :
 *  - Pression augmente avec stagnation/falsifications/contradictions
 *  - Pression diminue avec preuves et réductions d'incertitude
 *  - Le rayon d'escalade s'adapte à la pression
 */
const assert = require('node:assert/strict')
const {
  SearchPressureModel,
  SEARCH_PRESSURE_CAUSES,
  ESCALATION_RADII
} = require('../../src/services/search/searchPressureService')

// ---------------------------------------------------------------------------
// Pression initiale = 0
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  assert.equal(m.report().pressure, 0, 'starts with zero pressure')
  assert.equal(m.report().recommendedRadius, ESCALATION_RADII.LOCAL)
}

// ---------------------------------------------------------------------------
// Augmentation avec stagnation
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  const r = m.update({ searchYield: 0, stepsSinceProgress: 3 })
  assert.ok(r.pressure > 0, 'pressure rises on stagnation')
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.LOW_INFORMATION_GAIN))
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.THREE_LOW_YIELD_STEPS))
}

// ---------------------------------------------------------------------------
// Augmentation avec hypothèse falsifiée + contradiction
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  const r = m.update({ searchYield: 0, falsifiedHypotheses: 1, contradictions: 1 })
  assert.ok(r.pressure > 0.2, 'pressure rises on falsification')
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.HYPOTHESIS_FALSIFIED))
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.CONTRADICTION))
}

// ---------------------------------------------------------------------------
// Réduction avec preuves
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  m.update({ searchYield: 0, stepsSinceProgress: 3 })
  const before = m.report().pressure
  const r = m.update({ searchYield: 0.5, uncertaintyReduction: 0.3 })
  assert.ok(r.pressure < before, 'pressure drops on evidence gain')
}

// ---------------------------------------------------------------------------
// Rayon d'escalade proportionnel à la pression
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  m.update({ searchYield: 0, stepsSinceProgress: 10, falsifiedHypotheses: 2 })
  const r = m.report()
  assert.ok([ESCALATION_RADII.STRUCTURAL, ESCALATION_RADII.RADICAL].includes(r.recommendedRadius))
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

{
  const m = new SearchPressureModel()
  m.update({ searchYield: 0, stepsSinceProgress: 5 })
  m.reset()
  assert.equal(m.report().pressure, 0)
  assert.equal(m.report().causes.length, 0)
}

console.log('Search Pressure tests passed.')
