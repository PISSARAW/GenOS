'use strict';

const { randomUUID } = require('crypto');

const HASH = /^[a-f0-9]{64}$/;
const SPLITS = Object.freeze(['evolution', 'holdout', 'ood']);

function invalid(code, details = []) {
  return Object.assign(new Error([code, ...details].join(',')), { code, details });
}

function validateActors(actors) {
  const roles = ['producerId', 'evaluatorId', 'verifierId', 'authorizerId'];
  if (!actors || roles.some((role) => !actors[role])) return ['campaign-actors-required'];
  return new Set(roles.map((role) => actors[role])).size === roles.length
    ? [] : ['campaign-actors-not-independent'];
}

function validateDatasets(datasets) {
  if (!datasets || SPLITS.some((split) => !HASH.test(datasets[split]?.hash || ''))) {
    return ['campaign-dataset-hashes-required'];
  }
  const hashes = SPLITS.map((split) => datasets[split].hash);
  const cases = SPLITS.map((split) => datasets[split].caseIds || []);
  if (new Set(hashes).size !== hashes.length) return ['campaign-dataset-hashes-overlap'];
  if (cases.some((entries) => !entries.length || new Set(entries).size !== entries.length)) {
    return ['campaign-dataset-cases-invalid'];
  }
  const allCases = cases.flat();
  return new Set(allCases).size === allCases.length ? [] : ['campaign-dataset-cases-overlap'];
}

function validateThresholds(thresholds) {
  const keys = ['competenceGain', 'oodGain', 'projectGain', 'maxProxyGap'];
  return thresholds && keys.every((key) => Number.isFinite(thresholds[key]) && thresholds[key] >= 0)
    ? [] : ['campaign-thresholds-invalid'];
}

function validatePlan(input) {
  const errors = [];
  if (!input?.responsibilityId || !input?.motivationEvidenceId) errors.push('campaign-motivation-required');
  if (!Number.isInteger(input?.generationCount) || input.generationCount < 3) errors.push('campaign-generations-insufficient');
  errors.push(...validateActors(input?.actors), ...validateDatasets(input?.datasets));
  errors.push(...validateThresholds(input?.thresholds));
  return errors;
}

function createCampaignPlan(input) {
  const errors = validatePlan(input);
  if (errors.length) throw invalid('AIDE2_CAMPAIGN_INVALID', errors);
  return Object.freeze({
    schema: 'genos.aide2.campaign/v1', campaignId: input.campaignId || randomUUID(),
    responsibilityId: input.responsibilityId, motivationEvidenceId: input.motivationEvidenceId,
    generationCount: input.generationCount, actors: Object.freeze({ ...input.actors }),
    datasets: Object.freeze(Object.fromEntries(SPLITS.map((split) => [split,
      Object.freeze({ hash: input.datasets[split].hash, caseIds: Object.freeze([...input.datasets[split].caseIds]) })]))),
    thresholds: Object.freeze({ ...input.thresholds }), selectionSplit: 'evolution',
    sealedEvaluationSplits: Object.freeze(['holdout', 'ood']), promotionAuthority: 'none'
  });
}

module.exports = { SPLITS, createCampaignPlan, validatePlan };
