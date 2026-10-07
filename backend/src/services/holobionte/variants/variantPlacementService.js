'use strict';

const { invalid, record } = require('./variantInputValidation.js');

function placementVariant(input) {
  const requirement = String(input.variantId || 'local-first');
  const edgeCore = requirement === 'edge-core/cloud-symbionts';
  const localOnly = requirement === 'local-first' || edgeCore;
  const wantsCloudCore = requirement === 'cloud-core/edge-symbionts' || requirement === 'cloud-core/edge-sync';
  return { requirement, edgeCore, wantsCloudCore, localOnly,
    requireConnectedEdge: requirement === 'cloud-core/edge-symbionts',
    requireAsyncSync: requirement === 'cloud-core/edge-sync' };
}

function availableEngines(input) {
  return new Set(Array.isArray(input.availableEngines) ? input.availableEngines : []);
}

function requestedHost(input, variant) {
  if (variant.localOnly || input.offline === true) return 'local';
  return variant.wantsCloudCore ? 'cloud' : input.preferredEngine || 'local';
}

function verifyFallback(input, engines) {
  return input.allowLocalFallback === true && typeof input.verifyLocalFallback === 'function'
    && input.verifyLocalFallback() === true && engines.has('local');
}

function chooseHost(context) {
  const { input, variant, engines } = context;
  const target = requestedHost(input, variant);
  const verifiedFallback = verifyFallback(input, engines);
  const host = engines.has(target) ? target : verifiedFallback ? 'local' : target;
  return { requestedHost: target, host, fallback: host === target ? null : 'local' };
}

function placementGuards(context) {
  const { input, variant, placement, engines } = context;
  const classes = Array.isArray(input.dataClasses) ? input.dataClasses : [];
  const restricted = new Set(Array.isArray(input.restrictedDataClasses) ? input.restrictedDataClasses : []);
  const remoteNeeded = needsRemoteExecutor(input, variant, placement);
  const engineReady = hasRequiredEngines({ input, variant, placement, engines });
  const privacyBlocked = blocksRemoteData({ input, classes, restricted, remoteNeeded });
  const cloudSymbionts = usesEdgeSymbionts(variant, placement);
  const leaseValid = !cloudSymbionts || edgeLeaseAllowed(input.edgeLease, input.verifyEdgeLease, input.requiredEdgeCapability);
  const edgeReady = !cloudSymbionts || variant.requireConnectedEdge !== true || input.edgeConnected === true;
  const remoteReady = remoteExecutorHealthy(input, variant);
  return { classes, restricted, remoteNeeded, engineReady, privacyBlocked, leaseValid, edgeReady, remoteReady, cloudSymbionts };
}

function remoteExecutorHealthy(input, variant) {
  if (!variant.edgeCore || input.requiresRemoteCapability !== true) return true;
  return typeof input.verifyCloudConnectivity === 'function'
    && input.verifyCloudConnectivity(input.connectivityReceipt) === true;
}

function needsRemoteExecutor(input, variant, placement) {
  return placement.host !== 'local' || (variant.edgeCore && input.requiresRemoteCapability === true);
}

function hasRequiredEngines(context) {
  const { input, variant, placement, engines } = context;
  const localHostReady = engines.has(placement.host);
  if (!variant.edgeCore || input.requiresRemoteCapability !== true) return localHostReady;
  return localHostReady && engines.has('cloud');
}

function blocksRemoteData(context) {
  const { input, classes, restricted, remoteNeeded } = context;
  return remoteNeeded && input.redacted !== true && classes.some((item) => restricted.has(item));
}

function usesEdgeSymbionts(variant, placement) {
  return variant.wantsCloudCore && placement.host === 'cloud';
}

function placementReason(guards) {
  if (!guards.engineReady) return 'ENGINE_UNAVAILABLE';
  if (guards.privacyBlocked) return 'PRIVACY_REDACTION_REQUIRED';
  if (!guards.leaseValid) return 'EDGE_LEASE_REQUIRED';
  if (!guards.edgeReady) return 'EDGE_UNAVAILABLE';
  if (!guards.remoteReady) return 'REMOTE_CONNECTIVITY_UNVERIFIED';
  return null;
}

function placementResult(context) {
  const { input, variant, placement, guards } = context;
  const dataClasses = !guards.remoteNeeded ? guards.classes
    : input.redacted === true ? guards.classes.filter((item) => !guards.restricted.has(item)) : guards.classes;
  const symbionts = variant.edgeCore && input.requiresRemoteCapability === true ? 'cloud-on-demand'
    : guards.cloudSymbionts ? 'edge' : placement.host;
  const exportProof = placementResultExportProof(placement, guards, input);
  const exportProofVerified = exportProof !== null && typeof input.verifyNoExport === 'function'
    && input.verifyNoExport(exportProof) === true;
  const reason = placementResultReason(guards, input, exportProofVerified);
  return { accepted: reason === null, host: placement.host, requestedHost: placement.requestedHost,
    symbionts, fallback: placement.fallback, dataClasses,
    pendingSync: variant.requireAsyncSync === true && input.edgeConnected !== true,
    reason, exportProof, exportProofVerified };
}

function planPlacement(input = {}) {
  const variant = placementVariant(input);
  const engines = availableEngines(input);
  const context = { input, variant, engines };
  context.placement = chooseHost(context);
  context.guards = placementGuards(context);
  return placementResult(context);
}

function planPlacementBatch(input = {}) {
  if (!Array.isArray(input.steps) || !input.steps.length) throw invalid('Placement batch requires at least one step.');
  const steps = input.steps.map((raw, index) => {
    const step = record(raw, `steps[${index}]`);
    return { stepId: String(step.stepId || index), ...planPlacement({ ...input, ...step, steps: undefined }) };
  });
  return { accepted: steps.every((step) => step.accepted),
    localCorePreserved: steps.every((step) => step.host === 'local'),
    cloudOnDemandStepIds: steps.filter((step) => step.symbionts === 'cloud-on-demand').map((step) => step.stepId), steps };
}

function edgeLeaseAllowed(lease, verifier, requiredCapability) {
  return Boolean(lease && typeof verifier === 'function' && verifier(lease) === true
    && lease.leaseId && lease.deviceId && Date.parse(lease.expiresAt) > Date.now()
    && Array.isArray(lease.capabilities) && lease.capabilities.includes(requiredCapability));
}

function placementResultExportProof(placement, guards, input) {
  return placement.host === 'local' && !guards.remoteNeeded && typeof input.attestNoExport === 'function'
    ? input.attestNoExport({ dataClasses: guards.classes }) : null;
}

function placementResultReason(guards, input, exportProofVerified) {
  return placementReason(guards) || (input.requireExportProof === true && !exportProofVerified ? 'NO_EXPORT_PROOF_REQUIRED' : null);
}


module.exports = { placementVariant, availableEngines, requestedHost, verifyFallback, chooseHost, placementGuards, remoteExecutorHealthy, needsRemoteExecutor, hasRequiredEngines, blocksRemoteData, usesEdgeSymbionts, placementReason, placementResult, planPlacement, planPlacementBatch, edgeLeaseAllowed, placementResultExportProof, placementResultReason };
