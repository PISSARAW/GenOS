const assert = require('node:assert/strict');
const gossip = require('../src/services/boundedGossipService');

const peers = Array.from({ length: 100 }, (_, index) => ({ id: `a-${index}` }));
assert.equal(gossip.selectPeers('a-0', peers, { fanout: 3 }).length, 3);
const seen = new Set();
assert.equal(gossip.nextHop({ message: { id: 'signal-1', expiresAt: Date.now() + 1000 }, agentId: 'a-0', peers, seen, options: { fanout: 3 } }).length, 3);
assert.equal(gossip.nextHop({ message: { id: 'signal-1' }, agentId: 'a-0', peers, seen, options: { fanout: 3 } }).length, 0);
console.log('Bounded gossip checks passed.');
