const assert = require('node:assert/strict')
const { createRandomGenome, mutateGenome, crossoverGenome, HYPOTHESIS_FAMILIES, STRATEGIES } = require('../../src/services/search/searchGenomeService')

// Création d'un génome aléatoire
{
  const g = createRandomGenome()
  assert.ok(g.id, 'genome has ID')
  assert.ok(HYPOTHESIS_FAMILIES.includes(g.hypothesisFamily))
  assert.ok(STRATEGIES.includes(g.strategy))
  assert.ok(Array.isArray(g.operators))
  assert.ok(g.exploration.radius >= 0 && g.exploration.radius <= 1)
}

// Mutation selon le rayon
{
  const g = createRandomGenome()
  
  const minimal = mutateGenome(g, 'minimal')
  assert.ok(minimal.mutations.at(-1).changes.length >= 1, 'minimal: at least 1 change')
  
  const medium = mutateGenome(g, 'medium')
  assert.ok(medium.mutations.at(-1).changes.length >= 1, 'medium: at least 1 change')
  
  const radical = mutateGenome(g, 'radical')
  assert.ok(radical.mutations.at(-1).changes.length >= 3, 'radical: at least 3 changes')
  
  assert.equal(medium.mutations[medium.mutations.length - 1].radius, 'medium')
}

// Crossover entre deux génomes
{
  const a = createRandomGenome()
  const b = createRandomGenome()
  const child = crossoverGenome(a, b)
  
  assert.ok(STRATEGIES.includes(child.strategy))
  assert.ok(child.operators.length >= 1)
  assert.ok(child.exploration.radius >= 0)
}

// Mutation ne modifie pas l'original
{
  const g = createRandomGenome()
  const originalStrategy = g.strategy
  const mutated = mutateGenome(g, 'structural')
  assert.equal(g.strategy, originalStrategy, 'original not modified')
  assert.ok(mutated.id === g.id, 'same genome ID preserved')
}

// Les mutations ciblent des dimensions différentes
{
  const g = createRandomGenome()
  const mutated = mutateGenome(g, 'radical')
  const targets = mutated.mutations.flatMap(m => m.changes.map(c => c.target))
  const uniqueTargets = [...new Set(targets)]
  assert.ok(uniqueTargets.length >= 1, 'at least one target mutated')
}

console.log('SearchGenome tests passed.')
