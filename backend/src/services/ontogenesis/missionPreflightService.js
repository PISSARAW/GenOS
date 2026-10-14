'use strict';

const topologyCapabilities = require('../topologyCapabilityService');
const { CATALOG } = require('./topologySelector');

function unique(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.trim()))];
}

function executionAudit(required, declared) {
  if (!Array.isArray(declared)) {
    return { status: 'unverified', required, declared: [], admitted: [], missing: [] };
  }
  const provided = new Set(declared);
  const admitted = required.filter((capability) => provided.has(capability));
  const missing = required.filter((capability) => !provided.has(capability));
  return { status: missing.length ? 'blocked' : 'admitted', required, declared, admitted, missing };
}

function canonicalAudit(contract, catalog) {
  const entries = new Map((Array.isArray(catalog) ? catalog : [])
    .map((entry) => [String(entry.capability || '').toUpperCase(), entry]));
  const requirements = contract.required.map((capability) => {
    const entry = entries.get(capability.toUpperCase());
    return { capability, catalogState: entry?.state || 'non_catalogue', level: entry?.level || null };
  });
  return {
    contract,
    requirements,
    operational: requirements.filter((entry) => entry.catalogState === 'operationnel').map((entry) => entry.capability),
    notFullyOperational: requirements.filter((entry) => entry.catalogState !== 'operationnel')
      .map((entry) => entry.capability)
  };
}

function selectedRuntimeRequirements(topology) {
  return (CATALOG.find((entry) => entry.id === topology) || {}).needs || [];
}

function conceptAudit(concepts = {}) {
  const blocked = Array.isArray(concepts.blockedConcepts) ? concepts.blockedConcepts : [];
  const unavailable = blocked.map((concept) => ({
    id: concept.id, source: concept.source || 'unknown', reason: concept.reason || 'indisponible'
  }));
  const blocking = blocked.filter((concept) => [
    'unknown', 'runtime', 'existing_adapter', 'capability', 'capability_graph'
  ].includes(concept.source));
  const integrationEvidence = (concepts.resolvedConcepts || [])
    .filter((concept) => concept.implementationContractReference)
    .map((concept) => concept.implementationContractReference);
  return {
    unavailable,
    blocking: blocking.map((concept) => concept.id),
    requiredEvidenceAtIntegration: integrationEvidence
  };
}

function blockingReasons(morphology, execution, concepts) {
  const reasons = [];
  if (morphology.error) reasons.push(`morphologie-invalide:${morphology.error}`);
  execution.missing.forEach((capability) => reasons.push(`capacite-execution-manquante:${capability}`));
  concepts.blocking.forEach((id) => reasons.push(`concept-indisponible:${id}`));
  return reasons;
}

function preflightStatus(input) {
  if (input.reasons.length) return 'blocked';
  if (input.execution.status === 'unverified') return 'unverified';
  if (input.canonical.notFullyOperational.length || input.concepts.unavailable.length) return 'admitted_with_gaps';
  return 'admitted';
}

function dispatchRefusal(preflight) {
  const reasons = preflight?.blockingReasons;
  if (!preflight?.execution || !Array.isArray(reasons)) return 'preflight-mission-indisponible';
  if (reasons.length) return reasons.join(',');
  if (preflight.execution.status === 'unverified') return 'capacites-execution-non-attestees';
  if (preflight.execution.status !== 'admitted') return 'capacites-execution-non-admises';
  return null;
}

function buildMissionPreflight(input = {}) {
  const mission = input.mission || {};
  const config = input.config || {};
  const morphology = mission.morphology || {};
  const topology = input.topology || morphology.selectedTopology || null;
  const organization = input.organization || morphology.selectedOrganization || null;
  const contract = topologyCapabilities.contractFor({ mode: topology, organization });
  const requiredExecution = selectedRuntimeRequirements(topology);
  const execution = executionAudit(requiredExecution, config.availableCapabilities);
  const canonical = canonicalAudit(contract, mission.capabilityCatalog);
  const concepts = conceptAudit(mission.concepts);
  const reasons = blockingReasons(morphology, execution, concepts);
  return {
    version: 1,
    status: preflightStatus({ reasons, execution, canonical, concepts }),
    execution,
    topology: canonical,
    concepts,
    declaredMissionCapabilities: unique(mission.capabilities || []),
    blockingReasons: reasons
  };
}

module.exports = { buildMissionPreflight, dispatchRefusal };
