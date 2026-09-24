'use strict';

const store = require('../holobiontStore');
const contractsService = require('../contracts/symbiosisContractService');

function resilienceError(message, code = 'HOLOBIONT_RESILIENCE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function score(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw resilienceError(`${field} must be between 0 and 1.`);
  return number;
}

async function residentContracts(db, session) {
  const residents = session.residentSymbionts.filter((item) => item.status === 'RESIDENT');
  const contracts = await Promise.all(residents.map((item) => contractsService.getContract(db, session.holobiontId, item.id)));
  return contracts.filter((item) => item && item.status === 'ACTIVE');
}

function addProvider(providers, capability, symbiontId) {
  providers[capability] = providers[capability] || [];
  if (!providers[capability].includes(symbiontId)) providers[capability].push(symbiontId);
}

function providerCatalog(session, contracts) {
  const providers = {};
  for (const contract of contracts) {
    for (const capability of contract.capabilitiesOffered) addProvider(providers, capability, contract.symbiontId);
  }
  for (const capability of session.phenotype.capabilities || []) addProvider(providers, capability, 'HOST');
  return providers;
}

function nicheReport(providers, contracts, constitution) {
  const required = constitution.essentialCapabilities || [];
  const capabilities = [...new Set([...required, ...Object.keys(providers)])].sort();
  const contractById = new Map(contracts.map((item) => [item.symbiontId, item]));
  return capabilities.map((capability) => {
    const all = providers[capability] || [];
    const hostCore = all.includes('HOST');
    const ids = all.filter((id) => id !== 'HOST').sort((left, right) => {
      const ceilingDiff = (contractById.get(left)?.dependencyCeiling || 0) - (contractById.get(right)?.dependencyCeiling || 0);
      return ceilingDiff || left.localeCompare(right);
    });
    return {
      capability, essential: required.includes(capability), hostCore,
      symbiontProviders: ids, redundancy: ids.length + Number(hostCore),
      primary: ids[0] || (hostCore ? 'HOST' : null), backups: ids.slice(1)
    };
  });
}

function summarizeNiches(niches) {
  const missingEssential = niches.filter((item) => item.essential && item.redundancy === 0).map((item) => item.capability);
  const singleProvider = niches.filter((item) => item.essential && item.redundancy === 1);
  return {
    missingEssential,
    singlePointCapabilities: singleProvider.map((item) => item.capability),
    keystoneSymbionts: [...new Set(singleProvider.flatMap((item) => item.symbiontProviders))],
    redundantCapabilities: niches.filter((item) => item.redundancy > 1).map((item) => item.capability)
  };
}

async function analyzeSymbioticResilience(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw resilienceError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (!session.constitution) throw resilienceError('Host constitution is required.', 'HOLOBIONT_CONSTITUTION_REQUIRED');
  const contracts = await residentContracts(db, session);
  const niches = nicheReport(providerCatalog(session, contracts), contracts, session.constitution);
  return { holobiontId: session.holobiontId, sessionRevision: session.revision, niches,
    ...summarizeNiches(niches), dependencyControl: input.observations
      ? evaluateDependencyControl({ constitution: session.constitution, contracts, observations: input.observations }) : null };
}

function dependencyAction(observation) {
  if (observation.backupAvailable) return 'USE_RESIDENT_BACKUP';
  if (observation.reconstructionAvailable) return 'EXTRACT_PROCEDURE';
  return observation.replaceability < 0.5 ? 'RECRUIT_BACKUP_AND_REDUCE_COUPLING' : 'RECRUIT_BACKUP';
}

function evaluateDependencyControl(input = {}) {
  const constitution = input.constitution;
  if (!constitution || !Array.isArray(input.contracts) || !Array.isArray(input.observations)) {
    throw resilienceError('constitution, contracts and observations are required.');
  }
  const contractById = new Map(input.contracts.map((item) => [item.symbiontId, item]));
  const evaluations = input.observations.map((item) => dependencyEvaluation(item, contractById, constitution));
  return {
    allowed: evaluations.every((item) => item.allowed), evaluations,
    violations: evaluations.filter((item) => !item.allowed).map((item) => item.symbiontId)
  };
}

function dependencyEvaluation(item, contractById, constitution) {
  const symbiontId = String(item.symbiontId || '').trim();
  if (!symbiontId || !Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length) {
    throw resilienceError('Dependency observations require a symbiontId and evidenceRefs.');
  }
  const dependency = score(item.dependencyScore, 'dependencyScore');
  const replaceability = score(item.replaceability, 'replaceability');
  const contract = contractById.get(symbiontId);
  if (!contract) throw resilienceError(`No active contract for ${symbiontId}.`, 'HOLOBIONT_CONTRACT_REQUIRED');
  const ceiling = Math.min(constitution.maxDependencyPerSymbiont, contract.dependencyCeiling);
  const allowed = dependency <= ceiling;
  return {
    symbiontId, dependency, ceiling, allowed,
    action: allowed ? 'MAINTAIN' : dependencyAction({ ...item, replaceability })
  };
}

module.exports = { analyzeSymbioticResilience, evaluateDependencyControl };
