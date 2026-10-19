'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/services/sreHealingPolicyService');

const baseInput = {
  organizationId: 'org-1', projectId: 'project-1', serviceId: 'checkout',
  responsibilityAgentId: 'sre-checkout', now: '2026-10-19T10:10:00.000Z',
  observations: [
    { occurredAt: '2026-10-19T10:06:00.000Z', value: 140, baseline: 100, sourceRef: 'otel://latency/1' },
    { occurredAt: '2026-10-19T10:07:00.000Z', value: 145, baseline: 100, sourceRef: 'otel://latency/2' },
    { occurredAt: '2026-10-19T10:08:00.000Z', value: 150, baseline: 100, sourceRef: 'otel://latency/3' }
  ]
};

const hypotheses = [
  { id: 'db-pool', prediction: 'Pool saturation precedes latency.',
    falsificationProbeRef: 'probe://db-pool', evidenceRefs: ['trace://db/1'], supported: true,
    causalReceipt: { interventionRef: 'experiment://pool/intervention',
      controlRef: 'experiment://pool/control', outcomeRef: 'experiment://pool/outcome' } },
  { id: 'network', prediction: 'Network jitter precedes latency.',
    falsificationProbeRef: 'probe://network', evidenceRefs: ['trace://network/1'], supported: false }
];

const candidate = { actionKind: 'configuration_patch', changeRef: 'git://candidate/pool-size',
  rollbackRef: 'git://rollback/pool-size', costUsd: 0.2, blastRadius: 1,
  requiredPermissions: ['production:change'] };

test('opens a durable SRE campaign only after reproduced fresh drift', () => {
  const result = policy.detectProductionDrift(baseInput);
  assert.equal(result.status, 'DETECTED');
  assert.equal(result.responsibility.durable, true);
  assert.equal(result.evidenceRefs.length, 3);
});

test('returns NO_CHANGE when fresh evidence is insufficient', () => {
  const result = policy.detectProductionDrift({ ...baseInput,
    observations: [baseInput.observations[0]] });
  assert.equal(result.decision, 'NO_CHANGE');
  assert.equal(result.reason, 'INSUFFICIENT_FRESH_EVIDENCE');
});

test('keeps investigation open without competing falsifiable hypotheses', () => {
  const campaign = policy.detectProductionDrift(baseInput);
  const result = policy.investigateCampaign({ campaign,
    hypotheses: [hypotheses[0]], candidate });
  assert.equal(result.status, 'INVESTIGATING');
  assert.equal(result.decision, 'GATHER_EVIDENCE');
});

test('creates an unauthorized bounded candidate from one causal survivor', () => {
  const campaign = policy.detectProductionDrift(baseInput);
  const result = policy.investigateCampaign({ campaign, hypotheses, candidate });
  assert.equal(result.status, 'CANDIDATE_READY');
  assert.equal(result.causalHypothesis.id, 'db-pool');
  assert.equal(result.candidate.authorized, false);
  assert.equal(result.candidate.executionStatus, 'NOT_EXECUTED');
});

test('abstains when the candidate exceeds cost or blast-radius budgets', () => {
  const campaign = policy.detectProductionDrift({ ...baseInput,
    policy: { maxCostUsd: 0.1, maxBlastRadius: 0 } });
  const result = policy.investigateCampaign({ campaign, hypotheses, candidate });
  assert.equal(result.status, 'ABSTAINED');
  assert.equal(result.reason, 'CANDIDATE_OUTSIDE_BUDGET');
});
