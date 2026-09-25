'use strict';

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fitChecks(policy, context) {
  const capabilities = new Set(Array.isArray(context.capabilities) ? context.capabilities : []);
  const checks = [];
  for (const capability of policy.fit.requiredCapabilities || []) {
    checks.push({ name: `capability:${capability}`, met: capabilities.has(capability) });
  }
  if (policy.fit.localEngine) checks.push({ name: 'local-engine', met: context.localEngineAvailable === true });
  if (policy.fit.immunePlane) checks.push({ name: 'immune-plane', met: context.immunePlaneAvailable === true });
  if (policy.fit.succession) checks.push({ name: 'succession', met: context.successionAvailable === true });
  return checks;
}

function analyzeFit(policy, context = {}) {
  const checks = fitChecks(policy, context);
  const unmet = checks.filter((item) => !item.met).map((item) => item.name);
  const score = checks.length ? (checks.length - unmet.length) / checks.length : 1;
  return { variant: policy.name, compatible: unmet.length === 0, score, reasons: unmet };
}

function createPolicy(policy) {
  return Object.freeze({
    name: policy.name,
    analyzeFit: (context) => analyzeFit(policy, context),
    configureHost: () => copy(policy.host),
    configureAdmission: () => copy(policy.admission),
    configureResources: () => copy(policy.resources),
    configureImmunePolicy: () => copy(policy.immune),
    configureTransmission: () => copy(policy.transmission),
    configureSuccession: () => copy(policy.succession),
    configureStopConditions: () => copy(policy.stopConditions),
    configurePlacement: () => copy(policy.placement || {}),
    configureMemory: () => copy(policy.memory || {}),
    configureCompetition: () => copy(policy.competition || {}),
    configureTool: () => copy(policy.tool || {}),
    configureSynchronization: () => copy(policy.synchronization || {})
  });
}

module.exports = { createPolicy };
