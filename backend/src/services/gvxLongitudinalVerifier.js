'use strict';

const { hash, sameScope } = require('./gvxContracts');

function matchedWindow(window, input) {
  const proof = input.proofs.find((item) => item.artifactHash === window.artifactHash
    && item.verifierId === 'gvx-somatic-assessment-v1' && item.requirement === 'gvx-somatic-assessment');
  const decision = proof?.businessDecision;
  const binding = decision?.binding;
  return decision?.assessmentStatus === 'recommend_somatic_trial' && sameScope(binding?.scope, input.binding.scope)
    && binding.parentHash === input.binding.parentHash && binding.candidateHash === input.binding.candidateHash
    && binding.applicationId === input.binding.applicationId && binding.observationId === window.observationId
    && binding.contextHash === window.contextHash;
}

function verify(input) {
  let artifact;
  try { artifact = JSON.parse(input.artifact.toString('utf8')); } catch (_) { return { verified: false }; }
  if (artifact?.schema !== 'genos.gvx.longitudinal-assessment/v1' || !artifact.binding
      || input.evidence.artifactHash !== input.artifactHash) return { verified: false };
  const windows = artifact.windows;
  if (!validWindows(artifact)) return { verified: false };
  const identities = new Set(windows.map((item) => item.observationId));
  const contexts = new Set(windows.map((item) => item.contextHash));
  const proofs = input.evidence.supportingReceipts || [];
  const valid = identities.size === windows.length && contexts.size === windows.length
    && windows.every((window) => matchedWindow(window, { binding: artifact.binding, proofs }));
  return { verified: valid, evidenceClass: 'independent_longitudinal_measurements', businessDecision: {
    maturity: valid ? 'mature_somatic_eligible' : 'inconclusive', binding: artifact.binding,
    windowCount: windows.length, assessmentHash: hash(artifact) } };
}

module.exports = { verify };

function validWindows(artifact) { return Array.isArray(artifact.windows) && Number.isInteger(artifact.minimumStableWindows) && artifact.minimumStableWindows >= 3 && artifact.windows.length >= artifact.minimumStableWindows; }
