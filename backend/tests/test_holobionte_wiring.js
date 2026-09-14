const assert = require('node:assert/strict');
const holobionte = require('../src/services/holobionteCoordinationService');

const composition = holobionte.composeHolobiont('Integrate specialized symbiotic capabilities under a host authority.');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'specialist_expert_committee');
assert.ok(composition.capabilityContract.required.includes('IMMUNE_SYSTEM'));
assert.ok(composition.capabilityContract.required.includes('LOCAL_INFERENCE'));
assert.equal(composition.engines.host_orchestrator, 'cloud');
assert.equal(composition.engines.specialist_symbiont, 'local');
assert.equal(composition.host.role, 'host_orchestrator');
assert.equal(composition.symbiotes.length, 3);

const clean = holobionte.hostVeto({
  events: [{ evidenceReport: { claims: [{ statement: 'The host integrates a verified, coherent and well-supported symbiotic capability with reproducible evidence.' }] } }]
});
assert.equal(clean.allowed, true);
assert.equal(clean.reason, 'accepted');

const repetitive = 'erreur boucle '.repeat(40);
const noisy = holobionte.hostVeto({ events: [{ evidenceReport: { claims: [{ statement: repetitive }] } }] });
assert.equal(noisy.allowed, false);
assert.equal(noisy.reason, 'immune_veto');

const empty = holobionte.hostVeto({ events: [] });
assert.equal(empty.allowed, false);
assert.equal(empty.reason, 'no_deliverable');

console.log('Holobionte wiring checks: PASS');
