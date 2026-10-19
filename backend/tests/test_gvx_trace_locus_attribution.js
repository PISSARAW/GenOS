'use strict';

const assert = require('node:assert/strict');
const attribution = require('../src/services/gvxTraceLocusAttribution');
const registries = require('../src/services/gvxVerifierRegistry');
const controlPlane = require('../src/services/gvxVerifierControlPlaneRegistry');

controlPlane.registerVerifierImplementation({ id: 'artifact',
  requirements: [attribution.ATTRIBUTION_REQUIREMENT],
  verify: async ({ artifact }) => ({ verified: true, businessDecision: JSON.parse(artifact.toString()) }) });

function fixture() {
  const decisions = new Map();
  const trace = { traceId: 'trace-1', producer: { actorId: 'solver', workspaceId: 'producer-world' },
    events: [{ eventId: 'event-1', componentRef: 'router:v1', status: 'failed', evidenceRefs: ['log:1'] }] };
  const loci = [{ locusId: 'route-policy', componentRef: 'router:v1', field: 'fallbackPolicy',
    currentValue: 'direct', mutationPolicy: { maxEdits: 1 } }];
  const hypothesis = { hypothesisId: 'cause-1', statement: 'The direct route caused the observed failure.',
    locusId: 'route-policy', eventRefs: ['event-1'], diagnosis: 'false_negative',
    evidence: { artifactRef: 'attribution-1', verifierId: 'artifact' } };
  decisions.set('attribution-1', Buffer.from(JSON.stringify({ traceId: 'trace-1', hypothesisId: 'cause-1',
    locusId: 'route-policy', independentVerifier: { actorId: 'reviewer', workspaceId: 'review-world' } })));
  return { trace, loci, hypotheses: [hypothesis], verifierRegistry: registries.fromTrustedRegistry(['artifact']),
    artifactReader: async ({ artifactRef }) => decisions.get(artifactRef), decisions };
}

async function main() {
  const input = fixture();
  const result = await attribution.attribute(input);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].locus.locusId, 'route-policy');
  assert.equal(result.promotionAllowed, false);

  const unknownEvent = fixture();
  unknownEvent.hypotheses[0].eventRefs = ['missing'];
  const rejectedEvent = await attribution.attribute(unknownEvent);
  assert.equal(rejectedEvent.rejected[0].reason, 'hypothesis-event-unknown');

  const wrongComponent = fixture();
  wrongComponent.trace.events[0].componentRef = 'tool:v2';
  const rejectedComponent = await attribution.attribute(wrongComponent);
  assert.equal(rejectedComponent.rejected[0].reason, 'hypothesis-component-mismatch');

  const selfVerified = fixture();
  selfVerified.decisions.set('attribution-1', Buffer.from(JSON.stringify({ traceId: 'trace-1',
    hypothesisId: 'cause-1', locusId: 'route-policy',
    independentVerifier: { actorId: 'solver', workspaceId: 'review-world' } })));
  const rejectedVerifier = await attribution.attribute(selfVerified);
  assert.equal(rejectedVerifier.rejected[0].reason, 'attribution-verifier-not-independent');

  await assert.rejects(attribution.attribute({ ...fixture(), hypotheses: [] }), {
    code: 'GVX_TRACE_ATTRIBUTION_INVALID'
  });
  console.log('GVX trace-to-locus attribution checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
