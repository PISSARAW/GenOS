const assert = require('node:assert/strict')
const { SearchPatchService } = require('../../src/services/search/searchPatchService')

// Create a patch
{
  const svc = new SearchPatchService();
  const patch = svc.createPatch('p1', 'hypothesis', { statement: 'Cache bug' });
  assert.equal(patch.id, 'p1');
  assert.equal(patch.type, 'hypothesis');
  assert.equal(patch.visits, 0);
}

// Record steps and check yield
{
  const svc = new SearchPatchService();
  svc.createPatch('p1', 'hypothesis', { statement: 'Cache bug' });

  let result = svc.recordStep('p1', 0.5);
  assert.ok(result.marginalYield > 0, 'positive yield');

  result = svc.recordStep('p1', 0.3);
  assert.ok(result.marginalYield > 0, 'still positive');

  result = svc.recordStep('p1', 0.1);
  assert.ok(result.marginalYield > 0, 'decreasing but positive');
}

// Patch departure
{
  const svc = new SearchPatchService();
  svc.createPatch('p1', 'hypothesis', { statement: 'Cache bug' });

  // Low info gain repeatedly -> should depart
  for (let i = 0; i < 5; i++) {
    svc.recordStep('p1', 0.01);
  }

  const result = svc.evaluatePatch('p1');
  assert.ok(result.shouldDepart, 'should depart after low yield');
}

// Find best alternative
{
  const svc = new SearchPatchService();
  svc.createPatch('p1', 'hypothesis', { statement: 'A' });
  svc.createPatch('p2', 'hypothesis', { statement: 'B' });
  svc.createPatch('p3', 'hypothesis', { statement: 'C' });

  for (let i = 0; i < 3; i++) {
    svc.recordStep('p1', 0.1);
    svc.recordStep('p2', 0.8);
    svc.recordStep('p3', 0.3);
  }

  const best = svc.findBestAlternative('p1', ['p1', 'p2', 'p3']);
  assert.equal(best, 'p2', 'p2 is best alternative');
}

console.log('Search Patch tests passed.')
