const assert = require('node:assert/strict')
const { NegativeSearchMemory } = require('../../src/services/search/negativeSearchMemoryService')

{
  const mem = new NegativeSearchMemory();
  const hyp = { id: 'h1', statement: 'Cache invalidation' };
  mem.recordFailure('agent-1', hyp, { ref: 'E1', strength: 0.9, reliability: 0.8 }, { signature: 'env1', scope: 'agent' });
  
  assert.ok(mem.getActiveTrails('agent-1').length === 1, 'one active trail');
  assert.ok(mem.isPathBlocked('agent-1', 'Cache invalidation'), 'path blocked');
  assert.ok(!mem.isPathBlocked('agent-1', 'Other'), 'other not blocked');
}

{
  const mem = new NegativeSearchMemory();
  mem.trails.set('old', { id: 'old', agentId: 'agent-1', statement: 'Old', evidence: 'E1', confidence: 0.5, ttl: 1, createdAt: Date.now() - 100, active: true });
  mem.evaporate();
  assert.ok(!mem.trails.has('old'), 'old trail evaporated');
}

console.log('Negative Search Memory tests passed.')
