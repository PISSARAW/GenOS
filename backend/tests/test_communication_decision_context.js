'use strict';

const assert = require('node:assert/strict');
const contextService = require('../src/services/communication/communicationDecisionContext');

function run() {
  const context = contextService.buildDecisionContext({
    agentId: 'worker-1',
    organization: 'blind_adversarial_review',
    topology: { topologyId: 'isolated_critics', variantId: 'anonymous', version: 2 },
    topologyPolicy: { variantId: 'controlled', allowedChannels: ['SIGNAL'] },
    manifest: { phenotypeId: 'Verifier', allowedChannels: ['SIGNAL'], communicationBudget: { total: 50, used: 7 } },
    relationships: [{ relationType: 'peer', disclosureLevel: 0.5 }],
    intent: { purpose: 'challenge', risk: 'high', requiresAction: true, objectiveId: 'review-1' },
    scope: { organizationId: 'org-1', projectId: 'project-1' }
  });
  assert.equal(context.schemaVersion, contextService.SCHEMA_VERSION);
  assert.equal(context.topology.variantId, 'anonymous');
  assert.equal(context.agent.phenotypeId, 'Verifier');
  assert.equal(context.intent.objectiveId, 'review-1');
  assert.equal(context.budget.remaining, 43);
  assert.deepEqual(contextService.validateDecisionContext(context), { valid: true, errors: [] });
  const denied = contextService.applyTopologyConstraints(context, {
    action: 'SIGNAL', scope: 'UNICAST', recipients: ['reviewer-1'], reasonCodes: [], meta: {}
  }, 'SIGNAL');
  assert.equal(denied.allowed, false);
  assert.equal(denied.decision.action, 'SILENCE');
  assert.equal(denied.reasonCode, 'TOPOLOGY_VARIANT_MISMATCH');

  const incomplete = contextService.buildDecisionContext({ agentId: 'worker-1', intent: {} });
  assert.equal(contextService.validateDecisionContext(incomplete).valid, false);
  assert.equal(incomplete.topology.variantId, null, 'missing dimensions stay explicit rather than being inferred');
}

run();
console.log('Communication decision context contract preserves dimensions and unknown values.');
