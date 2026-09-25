const assert = require('node:assert/strict');
const plasmid = require('../src/services/capabilityPlasmidService');

const packet = plasmid.createPlasmid('security_review', { tests: ['test-security'], permissions: ['read'] });
const agent = plasmid.assimilate({ capabilities: [], plasmids: [] }, packet);
assert.deepEqual(agent.capabilities, ['security_review']);
assert.deepEqual(plasmid.assimilate(agent, packet).plasmids, [packet.id]);
assert.throws(() => plasmid.assimilate(agent, { ...packet, capability: 'tampered' }), /intact contract/);
assert.throws(() => plasmid.assimilate({ capabilities: [], plasmids: [] }, plasmid.createPlasmid('unsafe')));
console.log('Capability plasmid checks passed.');
