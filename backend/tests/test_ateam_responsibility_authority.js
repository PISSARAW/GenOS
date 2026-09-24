'use strict';

const assert = require('node:assert/strict');
const { assessMutation } = require('../src/services/aTeam/responsibility/boundaryPolicyService');
const { observeAteamIntegration } = require('../src/services/aTeamIntegrationObserver');

const owner = {
  agentId: 'security-1', label: 'security',
  authority: { owns: ['auth-policy'], mayModify: ['auth-policy'], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] }
};
const proposer = {
  agentId: 'backend-1', label: 'backend',
  authority: { owns: ['api'], mayModify: ['api'], mayPropose: ['auth-policy'], mustConsult: ['auth-policy'], mayRead: ['auth-policy'], cannotOverride: [] }
};
const members = [owner, proposer];
assert.equal(assessMutation({ scope: 'auth-policy' }, proposer, members).code, 'MISSING_CONSULTATION');
assert.equal(assessMutation({ scope: 'auth-policy', consulted: true }, proposer, members).allowed, true);
assert.equal(assessMutation({ scope: 'auth-policy' }, { agentId: 'frontend-1', authority: { owns: ['ui'], mayModify: ['ui'], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] } }, members).code, 'AUTHORITY_VIOLATION');

const report = { workerId: 'backend-1', events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 'OAuth token validation' }], mutations: [] } }] };
const observed = observeAteamIntegration({ members, workers: [{ agentId: 'backend-1', role: 'backend_engineer' }], dossiers: [report] });
assert.deepEqual(observed.failures, []);
console.log('A-Team responsibility and authority checks passed.');
