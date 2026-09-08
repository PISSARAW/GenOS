const assert = require('node:assert/strict');
const { dossierToCandidate } = require('../src/services/arenaTaskEvaluation');

const dossier = { name: 'anonymous-worker', report: { claims: [], tests: [] } };
const first = dossierToCandidate(dossier);
const second = dossierToCandidate(dossier);
assert.equal(first.candidateId, second.candidateId);
assert.match(first.candidateId, /^candidate-[a-f0-9]{24}$/);
console.log('Evaluation candidate identities are reproducible.');