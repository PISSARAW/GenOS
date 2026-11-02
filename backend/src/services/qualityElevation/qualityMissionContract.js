'use strict';

const { compileQualityContract, verifyContract, digest, freeze, fail } = require('./qualityContract');

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw fail('GQEL_INVALID_CONTRACT', `${label} must be an object.`);
  }
  return value;
}

function normalizeContract(value, mission) {
  object(value, 'qualityElevation');
  if (value.schema !== undefined) return freeze(structuredClone(verifyContract(value)));
  return compileQualityContract({ ...value, mission: value.mission || mission.prompt || mission.mission || mission.task || '' });
}

function reviewerRoute(value) {
  object(value, 'qualityRuntime reviewer');
  for (const key of ['id', 'model']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw fail('GQEL_INVALID_CONTRACT', `Reviewer ${key} is required.`);
  }
  const route = { id: value.id, model: value.model };
  for (const key of ['dependencyGroup', 'focus']) {
    if (value[key] !== undefined) route[key] = String(value[key]);
  }
  return route;
}

function normalizeRuntime(value = {}) {
  object(value, 'qualityRuntime');
  const result = {};
  if (value.generatorModel !== undefined) {
    if (typeof value.generatorModel !== 'string' || !value.generatorModel.trim()) throw fail('GQEL_INVALID_CONTRACT', 'Generator model is invalid.');
    result.generatorModel = value.generatorModel;
  }
  if (value.reviewers !== undefined) {
    if (!Array.isArray(value.reviewers)) throw fail('GQEL_INVALID_CONTRACT', 'Reviewer routes must be an array.');
    result.reviewers = value.reviewers.map(reviewerRoute);
  }
  if (value.planScenes !== undefined) {
    if (typeof value.planScenes !== 'boolean') throw fail('GQEL_INVALID_CONTRACT', 'planScenes must be boolean.');
    result.planScenes = value.planScenes;
  }
  Object.assign(result, finalSelector(value));
  return freeze(result);
}

function finalSelector(value) {
  if (value.finalArtifactMemberId === undefined) return {};
  if (typeof value.finalArtifactMemberId !== 'string' || !value.finalArtifactMemberId.trim()) throw fail('GQEL_INVALID_CONTRACT', 'Final artifact member selector is invalid.');
  return { finalArtifactMemberId: value.finalArtifactMemberId };
}

function qualityMissionFields(input = {}) {
  const persisted = input.workerContract || {};
  const requested = input.qualityElevation ?? persisted.qualityElevation;
  if (requested == null) return noQualityFields(input);
  const fields = { qualityElevation: normalizeContract(requested, input),
    qualityRuntime: normalizeRuntime(input.qualityRuntime ?? persisted.qualityRuntime) };
  const repair = input.qualityRepair ?? persisted.qualityRepair;
  if (repair != null) fields.qualityRepair = freeze(structuredClone(object(repair, 'qualityRepair')));
  assertPersistedQuality(persisted, fields);
  return fields;
}

function noQualityFields(input) {
  if (input.qualityRuntime != null || input.qualityRepair != null) {
    throw fail('GQEL_INVALID_CONTRACT', 'Quality routes or repair diagnostics require an explicit quality obligation.');
  }
  return {};
}

function prepareQualityMission(mission) {
  Object.assign(mission, qualityMissionFields(mission));
  return mission;
}

function qualityWorkerFields(mission) {
  const { qualityRepair, ...fields } = qualityMissionFields(mission);
  return fields;
}

function qualityIdentity(value) {
  return value ? [value.contractId, value.contractDigest, value.runtimeDigest] : null;
}

function assertPersistedQuality(contract, requested) {
  if (!contract.qualityElevation) return;
  verifyContract(contract.qualityElevation);
  const expected = qualityAuthority({ qualityElevation: contract.qualityElevation,
    qualityRuntime: contract.qualityRuntime, qualityRepair: contract.qualityRepair });
  const actual = qualityAuthority(requested);
  if (digest(qualityIdentity(expected)) !== digest(qualityIdentity(actual))) throw fail('GQEL_CONTRACT_CHANGED', 'Dispatched quality obligation differs from its persisted worker contract.');
}

function restoreWorkerQuality(mission, contract) {
  const explicit = Object.hasOwn(mission, 'qualityElevation');
  if (explicit && !mission.qualityElevation && contract.qualityElevation) {
    throw fail('GQEL_CONTRACT_CHANGED', 'A persisted quality obligation cannot be removed.');
  }
  const fields = qualityMissionFields({ ...mission, workerContract: contract });
  assertPersistedQuality(contract, fields);
  Object.assign(mission, fields);
  if (!contract.qualityElevation && mission.qualityElevation) {
    throw fail('GQEL_CONTRACT_CHANGED', 'Quality must be assigned before persisting the worker contract.');
  }
}

function qualityAuthority(mission) {
  const contract = mission.qualityElevation ?? mission.workerContract?.qualityElevation;
  if (!contract) return null;
  verifyContract(contract);
  return { contractId: contract.contractId, contractDigest: contract.digest,
    runtimeDigest: digest(mission.qualityRuntime ?? mission.workerContract?.qualityRuntime ?? {}),
    workerContractDigest: mission.workerContract?.qualityElevation?.digest ?? null,
    repairDigest: digest(mission.qualityRepair ?? mission.workerContract?.qualityRepair ?? null) };
}

function assertQualityAuthority(envelope, mission) {
  if (digest(envelope.qualityElevation ?? null) !== digest(qualityAuthority(mission))) {
    throw fail('EXECUTION_AUTHORITY_CONTEXT_CHANGED', 'Execution quality obligation changed after authority sealing.');
  }
}

module.exports = { qualityMissionFields, qualityWorkerFields, prepareQualityMission, restoreWorkerQuality,
  qualityAuthority, assertQualityAuthority, assertPersistedQuality };
