/**
 * Tests du Search Pressure v4 — recalibré.
 */
const assert = require('node:assert/strict')
const {
  SearchPressureModel,
  SEARCH_PRESSURE_CAUSES,
  ESCALATION_RADII
} = require('../../src/services/search/searchPressureService')

// Pression initiale = 0
{
  const m = new SearchPressureModel()
  assert.equal(m.report().pressure, 0)
}

// Stagnation fait monter la pression
{
  const m = new SearchPressureModel()
  const r = m.update({ searchYield: 0, stepsSinceProgress: 3 })
  assert.ok(r.pressure > 0)
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.LOW_INFORMATION_GAIN))
}

// Falsification fait monter la pression
{
  const m = new SearchPressureModel()
  const r = m.update({ searchYield: 0, falsifiedHypotheses: 1 })
  assert.ok(r.pressure > 0)
  assert.ok(r.causes.includes(SEARCH_PRESSURE_CAUSES.HYPOTHESIS_FALSIFIED))
}

// Inertie : une même falsification ne fait pas monter la pression indéfiniment
{
  const m = new SearchPressureModel()
  let r
  for (let i = 0; i < 5; i++) {
    r = m.update({ searchYield: 0, falsifiedHypotheses: 1 })
  }
  assert.ok(r.pressure < 1.0, 'pressure should not reach 1.0 with same input')
  assert.ok(r.pressure > 0.2, 'pressure should be significant')
}

// Reset
{
  const m = new SearchPressureModel()
  m.update({ searchYield: 0, stepsSinceProgress: 5 })
  m.reset()
  assert.equal(m.report().pressure, 0)
}

console.log('Search Pressure v4 tests passed.')
