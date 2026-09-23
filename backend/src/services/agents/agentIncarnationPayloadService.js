'use strict';

/**
 * @file agentIncarnationPayloadService.js
 * @description Single canonical projection for every worker spawn path.
 * Builds { capabilities, capabilityManifest, toolLease } from one request
 * object so fleet workers, direct dispatch, topologies, A-Team stages and
 * recovery dispatches share the same dynamic capabilities instead of
 * role-only leases.
 */

function manifestBuilder() {
  return require('../capabilityResolverService').buildCapabilityManifest;
}

function leaseBuilder() {
  return require('../agentOrchestrationState').workerToolLeaseForCapabilities;
}

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function buildManifestInput(input) {
  return {
    prompt: input.prompt || input.mission || '',
    role: input.role || 'worker',
    domain: input.domain,
    mode: input.mode,
    topology: input.organization || input.topology,
    budget: { tokens: input.budgetTokens || input.tokens || 10000 },
  };
}

function fallbackResult(hint, role) {
  const caps = safeList(hint);
  return {
    capabilities: caps,
    capabilityManifest: null,
    toolLease: leaseBuilder()(role, caps),
  };
}

function manifestCapabilities(manifest, hint) {
  if (manifest && Array.isArray(manifest.owned) && manifest.owned.length) {
    return manifest.owned.map(String);
  }
  return safeList(hint);
}

/**
 * @param {object} input - { role, prompt|mission, domain, mode, organization|topology, budgetTokens|tokens, capabilitiesHint }
 * @returns {{ capabilities: string[], capabilityManifest: object|null, toolLease: string[] }}
 */
function buildLaunchCapabilities(input = {}) {
  const role = String(input.role || 'worker');
  const hint = safeList(input.capabilitiesHint || input.capabilities);
  let manifest = null;
  try {
    manifest = manifestBuilder()(buildManifestInput(input));
  } catch (_) {
    return fallbackResult(hint, role);
  }
  const capabilities = manifestCapabilities(manifest, hint);
  let toolLease = [];
  try {
    toolLease = leaseBuilder()(role, capabilities);
  } catch (_) {
    toolLease = leaseBuilder()(role, hint);
  }
  return { capabilities, capabilityManifest: manifest, toolLease };
}

module.exports = { buildLaunchCapabilities };
