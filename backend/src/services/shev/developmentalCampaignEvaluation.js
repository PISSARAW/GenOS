'use strict';

const { fingerprint } = require('../stateFingerprint');
const { validHash, failure, conditionsHash } = require('./developmentalCampaignContract');

function finiteNonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw failure('SHEV_CAMPAIGN_RUN_INVALID', `${name} must be non-negative.`);
  return number;
}

function validateIdentity(result, arm) {
  if (typeof result?.success !== 'boolean' || result.projectId !== arm.scope.projectId
      || typeof result.actorId !== 'string' || !result.actorId.trim()) {
    throw failure('SHEV_CAMPAIGN_RUN_INVALID', 'Run result must bind success, project, and producer identity.');
  }
}

function validatePainWindow(options) {
  const { result, phase, window } = options;
  if (typeof result.painObserved !== 'boolean'
      || (phase === 'heldout' && result.painObserved)) {
    throw failure('SHEV_CAMPAIGN_PAIN_CONDITION_INVALID', 'Training pain must be measured; held-out tasks cannot receive injected pain.');
  }
  if (phase === 'training' && result.painObserved && !validHash(result.painObservationHash)) {
    throw failure('SHEV_CAMPAIGN_PAIN_EVIDENCE_REQUIRED', 'Training pain needs a sealed SHEV observation artifact.');
  }
  if (phase === 'heldout' && result.contextHash !== window.contextHash) {
    throw failure('SHEV_CAMPAIGN_HOLDOUT_CONTEXT_INVALID', 'Runner used a context outside the sealed held-out task.');
  }
}

function normalizeOutcome(options) {
  const { result, window } = options;
  return { success: result.success, projectId: result.projectId,
    actorId: result.actorId, taskHash: window.taskHash, contextHash: window.contextHash,
    regressions: finiteNonNegative(result.regressions, 'regressions'),
    humanInterventions: finiteNonNegative(result.humanInterventions, 'humanInterventions'),
    costUsd: finiteNonNegative(result.costUsd, 'costUsd'),
    durationMs: finiteNonNegative(result.durationMs, 'durationMs'),
    tokens: finiteNonNegative(result.tokens, 'tokens'),
    painObserved: result.painObserved, painObservationHash: result.painObservationHash || null,
    developmentalPressureBefore: result.developmentalPressureBefore ?? null,
    developmentalPressureAfter: result.developmentalPressureAfter ?? null,
    progressResult: result.progressResult || 'not_tested',
    clearanceApplied: result.clearanceApplied === true,
    clearanceEvidenceHash: result.clearanceEvidenceHash || null,
    artifactHash: result.artifactHash };
}

function validateOutcome(input) {
  const { result, phase, window, arm } = input;
  validateIdentity(result, arm);
  validatePainWindow({ result, phase, window });
  const normalized = normalizeOutcome({ result, window });
  validatePressure({ outcome: normalized, phase, arm });
  validateArtifactAndBudget({ outcome: normalized, arm, usage: input.campaignUsage });
  return normalized;
}

function validateArtifactAndBudget({ outcome, arm, usage }) {
  if (!validHash(outcome.artifactHash)) throw failure('SHEV_CAMPAIGN_ARTIFACT_INVALID', 'Run artifact hash is required.');
  if (outcome.costUsd > arm.budget.costUsd || outcome.tokens > arm.budget.tokens
      || outcome.durationMs > arm.budget.seconds * 1000) {
    throw failure('SHEV_CAMPAIGN_RUN_BUDGET_EXCEEDED', 'Run exceeded its pre-registered matched arm budget.');
  }
  validateCumulativeBudget({ outcome, budget: arm.campaignBudget, usage });
}

function validateCumulativeBudget(input) {
  if (!input.budget) return;
  const usage = input.usage || {};
  const costUsd = finiteNonNegative(usage.costUsd || 0, 'campaignUsage.costUsd') + input.outcome.costUsd;
  const tokens = finiteNonNegative(usage.tokens || 0, 'campaignUsage.tokens') + input.outcome.tokens;
  const durationMs = finiteNonNegative(usage.durationMs || 0, 'campaignUsage.durationMs')
    + input.outcome.durationMs;
  if (costUsd > input.budget.costUsd || tokens > input.budget.tokens
      || durationMs > input.budget.seconds * 1000) {
    throw failure('SHEV_CAMPAIGN_CUMULATIVE_BUDGET_EXCEEDED',
      'Run would exceed its arm cumulative campaign budget.');
  }
}

function validatePressure(options) {
  const { outcome, phase, arm } = options;
  if (phase === 'training' && arm.intervention === 'full_arc') checkPressureRange(outcome);
  checkProgressClearance(outcome);
  if (!['not_tested', 'confirmed', 'inconclusive', 'regressed'].includes(outcome.progressResult)) {
    throw failure('SHEV_CAMPAIGN_PROGRESS_INVALID', 'Unknown held-out progress verdict.');
  }
}

function checkPressureRange(outcome) {
  const values = [outcome.developmentalPressureBefore, outcome.developmentalPressureAfter];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw failure('SHEV_CAMPAIGN_PRESSURE_INVALID', 'Full-arc training must report bounded pressure measurements.');
  }
}

function checkProgressClearance(outcome) {
  if (outcome.progressResult !== 'confirmed') return;
  const invalid = !outcome.clearanceApplied || !validHash(outcome.clearanceEvidenceHash)
    || !Number.isFinite(outcome.developmentalPressureBefore)
    || !Number.isFinite(outcome.developmentalPressureAfter)
    || outcome.developmentalPressureAfter >= outcome.developmentalPressureBefore;
  if (invalid) throw failure('SHEV_CAMPAIGN_CLEARANCE_UNVERIFIED',
    'Confirmed held-out progress must bind an observed endocrine decay.');
}

function validateVerification(input) {
  const { receipt, outcome, manifest, arm } = input;
  if (!validReceiptBinding({ receipt, outcome, manifest, arm })
      || !validReceiptEvidence(receipt, outcome, arm)) {
    throw failure('SHEV_CAMPAIGN_VERIFICATION_INVALID', 'Independent verifier receipt does not bind arm, mode, actor, and artifacts.');
  }
  return { verifierId: receipt.verifierId, artifactHash: receipt.artifactHash,
    evidenceRefs: [...new Set(receipt.evidenceRefs)], executionMode: receipt.executionMode,
    conditionsHash: receipt.conditionsHash, outcomeHash: receipt.outcomeHash,
    interventionAttestation: receipt.interventionAttestation || null };
}

function validReceiptBinding({ receipt, outcome, manifest, arm }) {
  return validReceiptScope(receipt, arm) && validReceiptMode(receipt, manifest, arm)
    && validVerifier(receipt, outcome) && validOutcomeBinding(receipt, outcome)
    && validInterventionAttestation(receipt, manifest, arm);
}

function validReceiptScope(receipt, arm) {
  return receipt?.projectId === arm.scope.projectId && receipt.workspaceId === arm.workspaceId
    && receipt.initialSnapshotHash === arm.initialSnapshotHash
    && receipt.intervention === arm.intervention;
}

function validReceiptMode(receipt, manifest, arm) {
  return receipt?.verified === true && receipt.executionMode === manifest.mode
    && receipt.conditionsHash === conditionsHash(arm);
}

function validVerifier(receipt, outcome) {
  return Boolean(receipt?.verifierId) && receipt.verifierId !== outcome.actorId;
}

function validOutcomeBinding(receipt, outcome) {
  return receipt?.artifactHash === outcome.artifactHash
    && receipt.outcomeHash === fingerprint(outcome);
}

function validInterventionAttestation(receipt, manifest, arm) {
  if (manifest.mode !== 'field') return true;
  const expected = arm.interventionAttestation;
  const observed = receipt?.interventionAttestation;
  return observed?.shevEnabled === expected?.shevEnabled
    && observed?.evidenceHash === expected?.evidenceHash;
}

function armEvidenceHashes(arm) {
  return [arm.runtimeLock?.evidenceHash, arm.environmentLock?.evidenceHash,
    arm.interventionAttestation?.evidenceHash].filter(Boolean);
}

function validReceiptEvidence(receipt, outcome, arm) {
  const evidence = receipt.evidenceRefs;
  const required = [outcome.artifactHash, outcome.painObservationHash,
    outcome.clearanceEvidenceHash, ...armEvidenceHashes(arm)].filter(Boolean);
  return Array.isArray(evidence) && evidence.length > 0
    && evidence.every((hash) => validHash(hash))
    && required.every((hash) => evidence.includes(hash));
}

function average(runs, key) {
  return runs.reduce((sum, run) => sum + run[key], 0) / Math.max(1, runs.length);
}

function armMetrics(runs) {
  const totalCostUsd = runs.reduce((sum, run) => sum + run.costUsd, 0);
  const totalDurationMs = runs.reduce((sum, run) => sum + run.durationMs, 0);
  const totalTokens = runs.reduce((sum, run) => sum + run.tokens, 0);
  return { windows: runs.length,
    successRate: runs.filter((run) => run.success).length / Math.max(1, runs.length),
    regressionRate: average(runs, 'regressions'),
    humanInterventionsPerWindow: average(runs, 'humanInterventions'),
    meanCostUsd: average(runs, 'costUsd'), meanDurationMs: average(runs, 'durationMs'),
    meanTokens: average(runs, 'tokens'), totalCostUsd, totalDurationMs, totalTokens };
}

function exceedsCampaignBudget(metrics, budget) {
  return budget && (metrics.totalCostUsd > budget.costUsd || metrics.totalTokens > budget.tokens
    || metrics.totalDurationMs > budget.seconds * 1000);
}

function assertCampaignBudgets(manifest, metrics) {
  for (const armName of ['control', 'treatment']) {
    if (exceedsCampaignBudget(metrics[armName], manifest.arms[armName].campaignBudget)) {
      throw failure('SHEV_CAMPAIGN_CUMULATIVE_BUDGET_EXCEEDED',
        `${armName} exceeded its cumulative campaign budget.`);
    }
  }
}

function pairedWins(control, treatment) {
  let treatmentWins = 0;
  let controlWins = 0;
  for (let index = 0; index < control.length; index += 1) {
    if (treatment[index].success && !control[index].success) treatmentWins += 1;
    if (control[index].success && !treatment[index].success) controlWins += 1;
  }
  return { treatmentWins, controlWins, ties: control.length - treatmentWins - controlWins };
}

function signTestPValue(wins) {
  const count = wins.treatmentWins + wins.controlWins;
  if (!count) return 1;
  let term = 2 ** -count;
  let tail = 0;
  for (let k = 0; k <= count; k += 1) {
    if (k >= wins.treatmentWins) tail += term;
    term *= (count - k) / (k + 1);
  }
  return Math.min(1, tail);
}

function progressMetrics(runs) {
  const confirmed = runs.filter((run) => run.progressResult === 'confirmed');
  const cleared = confirmed.filter((run) => run.clearanceApplied
    && run.developmentalPressureAfter < run.developmentalPressureBefore);
  return { confirmedHeldout: confirmed.length, pressureClearances: cleared.length,
    pressureGrewDuringTraining: false };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function reportStatus(options) {
  if (!options.complete) return 'in_progress';
  if (options.mode === 'protocol') return 'protocol_only';
  if (!options.durationMet) return 'awaiting_duration';
  return options.supported ? 'field_evidence_complete' : 'hypothesis_not_supported';
}

function evaluate(manifest, runs, now = Date.now()) {
  const controlTrain = runs.control.training;
  const treatmentTrain = runs.treatment.training;
  const control = runs.control.heldout;
  const treatment = runs.treatment.heldout;
  const controlMetrics = armMetrics(control);
  const treatmentMetrics = armMetrics(treatment);
  const allMetrics = { control: armMetrics([...controlTrain, ...control]),
    treatment: armMetrics([...treatmentTrain, ...treatment]) };
  assertCampaignBudgets(manifest, allMetrics);
  const wins = pairedWins(control, treatment);
  const pValue = signTestPValue(wins);
  const progress = progressMetrics(treatment);
  progress.pressureGrewDuringTraining = treatmentTrain.some((run) => run.painObserved
    && run.developmentalPressureAfter > run.developmentalPressureBefore);
  const costRatio = ratio(treatmentMetrics.meanCostUsd, controlMetrics.meanCostUsd);
  const durationRatio = ratio(treatmentMetrics.meanDurationMs, controlMetrics.meanDurationMs);
  const tokenRatio = ratio(treatmentMetrics.meanTokens, controlMetrics.meanTokens);
  const thresholds = manifest.thresholds;
  const checks = { successGain: treatmentMetrics.successRate - controlMetrics.successRate
      >= thresholds.minSuccessDelta,
    pairedSignificance: pValue <= thresholds.maxPValue,
    regressionBound: treatmentMetrics.regressionRate - controlMetrics.regressionRate
      <= thresholds.maxRegressionIncrease,
    humanInterventionReduction: controlMetrics.humanInterventionsPerWindow
      - treatmentMetrics.humanInterventionsPerWindow >= thresholds.minHumanInterventionReduction,
    costBound: costRatio !== null && costRatio <= thresholds.maxCostRatio,
    durationBound: durationRatio !== null && durationRatio <= thresholds.maxDurationRatio,
    tokenBound: tokenRatio !== null && tokenRatio <= (thresholds.maxTokenRatio ?? 1.25),
    repeatedPain: treatmentTrain.filter((run) => run.painObserved).length >= thresholds.minPainEpisodes,
    heldoutProgress: progress.confirmedHeldout >= thresholds.minConfirmedHeldout,
    endocrineClearance: progress.pressureClearances >= thresholds.minConfirmedHeldout,
    developmentalPressureInduced: progress.pressureGrewDuringTraining };
  const elapsedMs = Math.max(0, now - Date.parse(manifest.startedAt));
  const durationMet = elapsedMs >= manifest.minimumDurationMs;
  const complete = Object.values(runs).every((arm) => arm.training.length === manifest.trainingWindows.length
    && arm.heldout.length === manifest.heldoutWindows.length);
  const supported = Object.values(checks).every(Boolean);
  const status = reportStatus({ complete, mode: manifest.mode, durationMet, supported });
  return { schema: 'genos.shev-developmental-campaign-report/v1', campaignId: manifest.campaignId,
    manifestHash: manifest.manifestHash, mode: manifest.mode, elapsedMs, durationMet, complete,
    arms: { control: controlMetrics, treatment: treatmentMetrics }, paired: { ...wins, pValue },
    costRatio, durationRatio, tokenRatio, campaignUsage: allMetrics,
    developmental: progress, checks, status,
    benchmarkQualified: status === 'field_evidence_complete', promotionEligible: false };
}

module.exports = { validateOutcome, validateVerification, evaluate, armMetrics, signTestPValue };
