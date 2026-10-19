'use strict';

const { validatePropagule } = require('../metapopulation/contracts/propaguleContract');
const { selectCandidates } = require('../metapopulation/migration/migrationPolicyService');

const SCHEMA = 'genos.adapter-ecology.multi-repository-migration/v1';

function migrationError(message, code = 'ADAPTER_MULTI_REPOSITORY_MIGRATION_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) migrationError(`${field} is required.`);
  return result;
}

function textList(value, field, required = false) {
  if (!Array.isArray(value)) migrationError(`${field} must be an array.`);
  const items = [...new Set(value.map((item) => text(item, field)))];
  if (required && !items.length) migrationError(`${field} must not be empty.`);
  return items;
}

function normalizeRepository(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) migrationError('repository must be an object.');
  return {
    repositoryId: text(value.repositoryId, 'repositoryId'),
    adapterId: text(value.adapterId, 'adapterId'),
    dependsOn: textList(value.dependsOn || [], 'dependsOn'),
    baselineRef: text(value.baselineRef, 'baselineRef'),
    rollbackAction: text(value.rollbackAction, 'rollbackAction'),
    evidenceRequirements: textList(value.evidenceRequirements, 'evidenceRequirements', true)
  };
}

function validateRepositories(values, pilotRepositoryId) {
  if (!Array.isArray(values) || values.length < 2) migrationError('At least two repository demes are required.');
  const repositories = values.map(normalizeRepository);
  const ids = new Set(repositories.map((item) => item.repositoryId));
  if (ids.size !== repositories.length) migrationError('Repository deme identities must be unique.');
  if (!ids.has(pilotRepositoryId)) migrationError('pilotRepositoryId must name a repository deme.');
  for (const repository of repositories) {
    if (repository.dependsOn.some((dependency) => !ids.has(dependency) || dependency === repository.repositoryId)) {
      migrationError(`Repository ${repository.repositoryId} has an invalid dependency.`);
    }
  }
  return repositories;
}

function scheduleWaves(repositories, pilotRepositoryId) {
  const pilot = repositories.find((item) => item.repositoryId === pilotRepositoryId);
  const pending = new Map(repositories.filter((item) => item !== pilot).map((item) => [item.repositoryId, item]));
  const completed = new Set([pilotRepositoryId]);
  const waves = [[pilot]];
  while (pending.size) {
    const ready = [...pending.values()].filter((item) => item.dependsOn.every((dependency) => completed.has(dependency)));
    if (!ready.length) migrationError('Repository dependency graph contains a cycle.', 'ADAPTER_MIGRATION_DEPENDENCY_CYCLE');
    ready.sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
    waves.push(ready);
    for (const item of ready) { pending.delete(item.repositoryId); completed.add(item.repositoryId); }
  }
  return waves;
}

function propagule(input, repository, sourceDemeId) {
  const candidate = validatePropagule({
    propaguleId: `${input.missionId}:${repository.repositoryId}`,
    sourceDemeId, targetDemeId: repository.repositoryId, type: 'ARTIFACT',
    payloadRef: input.artifactRef, migrationReason: 'controlled multi-repository propagation',
    lineageRefs: input.lineageRefs, sourceEvidence: input.sourceEvidence,
    provenance: { source: 'adapter-ecology', missionId: input.missionId,
      adapterId: repository.adapterId, baselineRef: repository.baselineRef },
    sourceFitness: input.sourceFitness, novelty: input.novelty
  });
  const selected = selectCandidates([candidate], {
    policy: 'elite', limit: 1, sourceDemeId, targetDemeId: repository.repositoryId
  });
  if (selected.length !== 1) migrationError('Metapopulation policy rejected a repository propagule.');
  return selected[0];
}

function sourceFor(repository, pilotRepositoryId, sourceRepositoryId) {
  if (repository.repositoryId === pilotRepositoryId) return sourceRepositoryId;
  return repository.dependsOn[0] || pilotRepositoryId;
}

function migrationWave(input, repositories, index) {
  return {
    waveIndex: index,
    status: index === 0 ? 'AWAITING_EVIDENCE' : 'PENDING',
    repositoryIds: repositories.map((item) => item.repositoryId),
    propagules: repositories.map((item) => propagule(input, item,
      sourceFor(item, input.pilotRepositoryId, input.sourceRepositoryId))),
    evidenceRequirements: Object.fromEntries(repositories.map((item) => [item.repositoryId, item.evidenceRequirements]))
  };
}

function planMigration(input = {}) {
  const normalized = {
    missionId: text(input.missionId, 'missionId'),
    sourceRepositoryId: text(input.sourceRepositoryId, 'sourceRepositoryId'),
    pilotRepositoryId: text(input.pilotRepositoryId, 'pilotRepositoryId'),
    artifactRef: text(input.artifactRef, 'artifactRef'),
    lineageRefs: textList(input.lineageRefs, 'lineageRefs', true),
    sourceEvidence: Array.isArray(input.sourceEvidence) ? input.sourceEvidence : [],
    sourceFitness: Number(input.sourceFitness), novelty: Number(input.novelty)
  };
  if (normalized.sourceRepositoryId === normalized.pilotRepositoryId) migrationError('Pilot and source repository demes must differ.');
  const repositories = validateRepositories(input.repositories, normalized.pilotRepositoryId);
  const scheduled = scheduleWaves(repositories, normalized.pilotRepositoryId);
  return {
    schema: SCHEMA, missionId: normalized.missionId, status: 'AWAITING_WAVE_EVIDENCE',
    currentWave: 0, waves: scheduled.map((wave, index) => migrationWave(normalized, wave, index)),
    rollbackPlan: Object.fromEntries(repositories.map((item) => [item.repositoryId, {
      adapterId: item.adapterId, action: item.rollbackAction, baselineRef: item.baselineRef,
      evidenceRequirements: item.evidenceRequirements
    }])),
    completedRepositoryIds: [], receipts: [], consultative: true
  };
}

function normalizeOutcomes(report, wave) {
  if (Number(report?.waveIndex) !== wave.waveIndex || !Array.isArray(report.repositoryOutcomes)) {
    migrationError('Wave report does not match the active wave.');
  }
  const byId = new Map(report.repositoryOutcomes.map((item) => [item.repositoryId, item]));
  return wave.repositoryIds.map((repositoryId) => {
    const outcome = byId.get(repositoryId);
    if (!outcome || !['ACCEPTED', 'REJECTED'].includes(outcome.decision)) migrationError(`Outcome missing for ${repositoryId}.`);
    const evidenceRefs = textList(outcome.evidenceRefs || [], 'evidenceRefs');
    const missing = wave.evidenceRequirements[repositoryId].filter((item) => !evidenceRefs.includes(item));
    return { repositoryId, decision: outcome.decision, evidenceRefs,
      receiptId: text(outcome.receiptId, 'receiptId'), missingEvidence: missing };
  });
}

function rollbackActions(plan, outcomes) {
  const applied = new Set([...plan.completedRepositoryIds,
    ...outcomes.filter((item) => item.decision === 'ACCEPTED').map((item) => item.repositoryId)]);
  return [...applied].sort().map((repositoryId) => ({ repositoryId, ...plan.rollbackPlan[repositoryId] }));
}

function advanceMigration(plan, report) {
  if (plan?.schema !== SCHEMA || plan.status !== 'AWAITING_WAVE_EVIDENCE') migrationError('Migration is not awaiting evidence.');
  const wave = plan.waves[plan.currentWave];
  const outcomes = normalizeOutcomes(report, wave);
  if (outcomes.some((item) => item.missingEvidence.length)) {
    return { ...plan, status: 'BLOCKED_EVIDENCE', blockedOutcomes: outcomes, rollbackActions: [] };
  }
  const waves = plan.waves.map((item) => ({ ...item }));
  if (outcomes.some((item) => item.decision === 'REJECTED')) {
    waves[plan.currentWave].status = 'FAILED';
    return { ...plan, waves, status: 'ROLLBACK_REQUIRED', rollbackActions: rollbackActions(plan, outcomes),
      receipts: [...plan.receipts, ...outcomes] };
  }
  waves[plan.currentWave].status = 'COMPLETED';
  const completedRepositoryIds = [...plan.completedRepositoryIds, ...wave.repositoryIds];
  const nextWave = plan.currentWave + 1;
  if (nextWave >= waves.length) return { ...plan, waves, status: 'COMPLETED', completedRepositoryIds,
    receipts: [...plan.receipts, ...outcomes], currentWave: nextWave };
  waves[nextWave].status = 'AWAITING_EVIDENCE';
  return { ...plan, waves, status: 'AWAITING_WAVE_EVIDENCE', completedRepositoryIds,
    receipts: [...plan.receipts, ...outcomes], currentWave: nextWave };
}

module.exports = { SCHEMA, planMigration, advanceMigration };
