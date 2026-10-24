'use strict';

const { createHash } = require('node:crypto');
const {
  lockedCapability, assertAuthority, assertNoRevocation, assertDescriptor,
  validateContract, invocationReceipt, adapterError
} = require('./adapterContract');

async function invokeEmbeddedCapability(input) {
  if (typeof input.recordReceipt !== 'function') throw adapterError('GCI_RECEIPT_STORE_UNAVAILABLE');
  const capability = lockedCapability({ ...input, mode: 'embedded' });
  const descriptor = await input.readDescriptor({ capabilityId: capability.capabilityId, version: capability.version });
  assertDescriptor({ descriptor, capability, mode: 'embedded' });
  validateContract(descriptor.inputContract, input.args, 'GCI_INPUT_INVALID');
  await assertAuthority({ ...input, capability });
  await assertNoRevocation({ ...input, capability, scope: { organizationId: input.organizationId,
    projectId: input.projectId }, visited: new Set() });
  const artifact = await input.readArtifact({ digest: capability.implementationDigest });
  verifyArtifactDigest(artifact, capability.implementationDigest);
  await verifyProvenance(input, descriptor, artifact);
  const result = await invokeSandbox({ input, descriptor, artifact, capability });
  validateContract(descriptor.outputContract, result, 'GCI_OUTPUT_INVALID');
  const receipt = invocationReceipt({ ...input, capability, mode: 'embedded', result });
  await input.recordReceipt(receipt);
  return { result, receipt };
}

function verifyArtifactDigest(artifact, expectedDigest) {
  if (!Buffer.isBuffer(artifact) && !(artifact instanceof Uint8Array)) throw adapterError('GCI_ARTIFACT_UNAVAILABLE');
  const digest = `sha256:${createHash('sha256').update(artifact).digest('hex')}`;
  if (digest !== expectedDigest) throw adapterError('GCI_ARTIFACT_CHANGED');
}

async function verifyProvenance(input, descriptor, artifact) {
  if (typeof input.verifyProvenance !== 'function') throw adapterError('GCI_PROVENANCE_VERIFIER_UNAVAILABLE');
  const verified = await input.verifyProvenance({ descriptor, artifact, lockfile: input.lockfile });
  if (verified !== true) throw adapterError('GCI_PROVENANCE_INVALID');
}

async function invokeSandbox(context) {
  const { input, descriptor, artifact, capability } = context;
  if (typeof input.sandboxedRuntime !== 'function') throw adapterError('GCI_SANDBOX_UNAVAILABLE');
  return input.sandboxedRuntime({ artifact, descriptor, args: input.args,
    authority: capability.effectiveAuthority, limits: descriptor.constraints, sideEffects: descriptor.sideEffects });
}

module.exports = { invokeEmbeddedCapability };
