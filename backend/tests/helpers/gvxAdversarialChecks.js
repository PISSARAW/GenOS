'use strict';

const assert = require('node:assert/strict');
const registry = require('../../src/services/gvxVerifierRegistry');
const ledger = require('../../src/services/gvxDevelopmentLedger');
const remote = require('../../src/services/gvxRemoteVerifierClient');
const { scope } = require('./gvxStandardFixture');

async function check(fixture, cycle) {
  const adapters = await require('../../src/services/gvxStandardLifecycleAdapters').createAdapters({ db: fixture.db,
    signal: { scope, entityId: scope.entityId, agentId: scope.entityId, sourceEventId: 'adversarial' } });
  const experiment = await adapters.experimentInput({ operationId: 'adversarial', candidate: cycle.proposal.candidate });
  const proof = cycle.experiment.outcomes[0].evidence[0];
  const artifact = JSON.parse((await experiment.artifactReader({ artifactRef: proof.artifactRef })).toString());
  artifact.metrics.accuracy = [1,1,1];
  const bytes = Buffer.from(JSON.stringify(artifact));
  const rejected = await registry.verifyEvidence({ registry: experiment.verifierRegistry,
    artifactReader: async () => bytes, requirement: proof.requirement,
    evidence: { ...proof, artifactHash: registry.digest(bytes) } });
  assert.equal(rejected.verified, false);
  const events = await ledger.listAllEvents(fixture.db, scope);
  const assessment = events.find((event) => event.payload.kind === 'somatic_assessment');
  const falsified = JSON.parse(JSON.stringify(assessment.payload.assessmentInput));
  falsified.binding.contextHash = 'a'.repeat(64);
  const checked = await require('../../src/services/gvxAssessmentVerification').verifyAssessment({
    verifierRegistry: experiment.verifierRegistry, assessmentInput: falsified,
    assessment: assessment.payload.assessment, artifactRef: 'bad-context',
    verificationReceipts: cycle.experiment.outcomes.flatMap((item) => item.evidence.map((entry) => entry.signedReceipt)) });
  assert.equal(checked.verified, false);
  await checkClaimReplay({ fixture, events, cycle });
  await checkRuntimeBinding({fixture,events,experiment});
  const denied = await remote.signedRequest({ ...fixture.remote, endpoint: '/v1/authorize',
    payload: { profileId: fixture.profile.id, scope, action: 'gvx.somatic.apply',
      parentHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64) } });
  assert.equal(denied.allowed, false);
}

async function checkClaimReplay({ fixture, events, cycle }) {
  const stage = (name) => events.find((event) => event.payload.kind === 'gvx_cycle_stage' && event.payload.stage === name).payload.value;
  const { signedReceipt, ...claim } = stage('receipt');
  const receipts = [...cycle.experiment.outcomes.flatMap((outcome) => outcome.evidence.map((item) => item.signedReceipt)),
    stage('assessment-verification').signedReceipt, stage('monitoring-verification').signedReceipt];
  const repeated = await remote.issueDevelopmentReceipt({ ...fixture.remote, claim, verificationReceipts: receipts });
  assert.equal(repeated.signature, signedReceipt.signature);
  await assert.rejects(remote.issueDevelopmentReceipt({ ...fixture.remote, claim: { ...claim, receiptId: 'different-credit' },
    verificationReceipts: receipts }), { reason: 'GVX_MEASUREMENT_ALREADY_CLAIMED' });
  await assert.rejects(remote.issueDevelopmentReceipt({ ...fixture.remote, claim: { ...claim, agentId: 'another-agent' },
    verificationReceipts: receipts }), { reason: 'GVX_DEVELOPMENT_CLAIM_NOT_MEASURED' });
}

module.exports = { check };

async function checkRuntimeBinding({fixture,events,experiment}) {
  const record=events.find(event=>event.payload.kind==='somatic_observation');
  const observation=JSON.parse(JSON.stringify(record.payload.observation));
  observation.binding.applicationId='unknown-runtime-application';
  const checked=await require('../../src/services/gvxAssessmentVerification').verifyAssessment({
    verifierRegistry:experiment.verifierRegistry,assessmentInput:observation,
    assessment:record.payload.assessment,artifactRef:'bad-runtime-binding',verificationReceipts:observation.verificationReceipts});
  assert.equal(checked.verified,false);
  await assert.rejects(remote.signedRequest({...fixture.remote,endpoint:'/v1/evaluate',payload:{
    profileId:fixture.profile.id,scope,condition:'monitorA',arm:'candidate',applicationId:'unknown',
    observationId:'fresh',operationId:'unknown:fresh:candidate'}}),{reason:'GVX_RUNTIME_APPLICATION_NOT_APPLIED'});
}
