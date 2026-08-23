const assert = require('assert');
const progress = require('./src/services/userProgressService');

assert.equal(progress.silenceRequested('Build the feature and keep me updated.'), false);
assert.equal(progress.silenceRequested('Work silently and only return the final result.'), true);
assert.equal(progress.silenceRequested('Travaille en silence, sans compte-rendu.'), true);
assert.equal(progress.reportingPolicy('Normal mission').mode, 'milestones');
assert.equal(progress.reportingPolicy('Normal mission', true).mode, 'silent');
assert.deepEqual(progress.report({ orchestratorId: 'root', message: 'hidden', silent: true }), { reported: false, silent: true });

const visible = progress.report({
  orchestratorId: 'root', phase: 'working', message: 'Two workers are verifying the fix.',
  progressPercent: 150, completed: ['diagnosis'], next: ['tests']
}, { emitEvent: (event) => ({ id: 'test-event', ...event }) });
assert.equal(visible.reported, true);
assert.equal(visible.event.eventType, 'ORCHESTRATOR_USER_UPDATE');
assert.equal(visible.event.payload.progressPercent, 100);
assert.deepEqual(visible.event.payload.completed, ['diagnosis']);
assert.match(progress.milestoneFromEvent({ eventType: 'AGENT_COMPLETED', payload: { evidenceReport: { claims: [{ statement: 'Tests pass.' }] } } }, { agentName: 'Verifier' }).message, /Verifier finished: Tests pass/);
assert.equal(progress.milestoneFromEvent({ eventType: 'AGENT_STEP' }), null);
console.log('User-facing orchestrator progress checks passed.');
