'use strict';

const assert = require('node:assert/strict');
const handoffService = require('../src/services/aTeam/handoff/handoffService');
const handoff = require('../src/services/aTeamHandoffEvidenceService');

const producer = { agentId: 'producer-1', label: 'backend' };
const consumer = { agentId: 'consumer-1', label: 'integration', dependsOn: ['backend'] };
const dossier = { workerId: 'producer-1', events: [{ evidenceReport: {
  outcome: 'success', artifacts: ['api.json'], claims: [{ statement: 'contract ready', evidence: ['proof://api'] }]
} }] };
const draft = handoff.buildHandoffsFromDossiers({ plan: { members: [producer, consumer] }, consumer, dossiers: [dossier] });
assert.equal(draft.ok, true);
assert.equal(handoffService.validate(draft.handoffs[0]).valid, true);
assert.equal(handoffService.consumerMayStart(draft.handoffs), false);

const rejected = handoffService.respond(draft.handoffs[0], { status: 'REJECT', reason: 'Schema is incomplete.' });
assert.equal(rejected.valid, true);
assert.equal(rejected.handoff.accepted, false);
assert.equal(handoffService.consumerMayStart([rejected.handoff]), false);

const accepted = handoffService.respond(draft.handoffs[0], { status: 'ACCEPT', evidenceRefs: ['proof://review'] });
assert.equal(accepted.valid, true);
assert.equal(handoffService.consumerMayStart([accepted.handoff]), true);
assert.equal(handoffService.respond(draft.handoffs[0], { status: 'REJECT' }).valid, false);
console.log('A-Team typed handoff contract and receptor checks passed.');
