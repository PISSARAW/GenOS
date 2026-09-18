const assert = require('node:assert/strict');
const plasmid = require('../src/services/capabilityPlasmidService');

const packet = plasmid.createPlasmid('security_review', { hash: 'h1', tests: ['test-security'], permissions: ['read'] });
const agent = plasmid.assimilate({ capabilities: [], plasmids: [] }, packet);
assert.deepEqual(agent.capabilities, ['security_review']);
assert.throws(() => plasmid.assimilate({ capabilities: [], plasmids: [] }, plasmid.createPlasmid('unsafe')));
console.log('Capability plasmid checks passed.');
