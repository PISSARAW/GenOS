const assert = require('node:assert/strict');
const gate = require('../src/services/morphogenesis/plasmidGateService');
const resolver = require('../src/services/morphogenesis/plasmidResolverService');

const manifest = resolver.buildManifest({
  id: `plasmid-test-${Date.now()}`,
  capability: 'review',
  code: 'review-v1',
  requiredTools: ['read'],
  requiredAuthority: 'review',
  evidence: [{ id: 'proof-1' }]
});
assert.equal(manifest.status, resolver.PLASMID_STATUS.AVAILABLE);
resolver.registerPlasmid(manifest);

const recipient = {
  id: 'recipient', phenotype: 'reviewer', capabilities: [], canExpress: () => true,
  authorityProfile: { review: true }, immuneStatus: 'healthy', toolLease: ['read']
};
assert.equal(resolver.resolvePlasmid({
  requiredCapability: 'review', targetAgent: recipient, availablePlasmids: [manifest]
}).plasmidId, manifest.id);
assert.throws(() => resolver.registerPlasmid(manifest), /already registered/);

const acquired = resolver.acquirePlasmid({ plasmidId: manifest.id, fromAgentId: 'donor', toAgentId: recipient.id });
assert.equal(acquired.status, resolver.PLASMID_STATUS.LEASED);
assert.throws(() => resolver.acquirePlasmid({ plasmidId: manifest.id, fromAgentId: 'donor', toAgentId: 'other' }), /not available/);
const assimilated = resolver.assimilatePlasmid({ plasmidId: manifest.id, agentId: recipient.id, recipient });
assert.equal(assimilated.status, resolver.PLASMID_STATUS.ASSIMILATED);
assert.throws(() => resolver.assimilatePlasmid({ plasmidId: manifest.id, agentId: recipient.id, recipient }), /must be leased/);

const invalid = resolver.buildManifest({
  id: `${manifest.id}-denied`, capability: 'review', code: 'review-v1',
  requiredTools: ['write'], requiredAuthority: 'review'
});
resolver.registerPlasmid(invalid);
resolver.acquirePlasmid({ plasmidId: invalid.id, fromAgentId: 'donor', toAgentId: recipient.id });
assert.throws(() => resolver.assimilatePlasmid({ plasmidId: invalid.id, agentId: recipient.id, recipient }), /gate failed/);
assert.equal(gate.getPlasmidHistory(invalid.id).at(-1).status, 'leased');

const history = gate.getPlasmidHistory(manifest.id);
assert.equal(Object.isFrozen(history), true);
assert.equal(gate.transitionStatus(manifest.id, 'available', 'invalid-resurrection').success, false);
resolver.clearRegistry();
console.log('Plasmid lifecycle gates passed.');
