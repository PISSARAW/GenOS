'use strict';

const crypto = require('node:crypto');
const { evaluateArtifact, inferDomainFromMission } = require('./qualityEvaluatorRegistry');
const { compareVersions } = require('./qualityComparisonService');
const { detectStagnation, defectSignature, contentDigest } = require('./qualityStagnationDetector');

const POLICIES = {
  fast: { maxIterations: 2, minQualityScore: 70, threshold: 70, critiques: 1, requireDoubleBlind: false },
  balanced: { maxIterations: 3, minQualityScore: 80, threshold: 80, critiques: 2, requireDoubleBlind: false },
  critical: { maxIterations: 5, minQualityScore: 95, threshold: 95, critiques: 3, requireDoubleBlind: true }
};

function resolvePolicyConfig(policyName, overrides = {}) {
  const base = POLICIES[policyName] || POLICIES.balanced;
  const minScore = overrides.minQualityScore ?? overrides.threshold ?? base.minQualityScore;
  return {
    maxIterations: overrides.maxIterations || base.maxIterations,
    threshold: minScore,
    minQualityScore: minScore,
    critiques: overrides.critiques || base.critiques,
    requireDoubleBlind: overrides.requireDoubleBlind ?? base.requireDoubleBlind ?? false
  };
}

function compileQualityContract(input = {}) {
  const domain = input.domain || inferDomainFromMission(input.mission);
  const policy = resolvePolicyConfig(input.policy, input);
  const contractId = `gqel-contract-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  return {
    contractId,
    domain,
    mission: input.mission || '',
    policy: input.policy || 'balanced',
    maxIterations: policy.maxIterations,
    threshold: policy.threshold,
    minQualityScore: policy.minQualityScore,
    requireDoubleBlind: policy.requireDoubleBlind,
    critiques: policy.critiques,
    criteria: Array.isArray(input.criteria) ? input.criteria : [],
    budgetMaxTokens: input.budgetMaxTokens || 100000,
    createdAt: new Date().toISOString()
  };
}

function createElevationSession(contract) {
  return {
    sessionId: `gqel-session-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    contract,
    versions: [],
    comparisons: [],
    bestVersionIndex: 0,
    strategyMutations: 0,
    status: 'in_progress',
    createdAt: new Date().toISOString()
  };
}

function recordIterationVersion(session, content, evaluation) {
  const versionNum = session.versions.length + 1;
  const digest = contentDigest(content);
  const defSig = defectSignature(evaluation.defects);

  const versionRecord = {
    version: versionNum,
    content,
    digest,
    score: evaluation.score,
    passed: evaluation.passed,
    defects: evaluation.defects,
    defectSignature: defSig,
    metrics: evaluation.metrics,
    recordedAt: new Date().toISOString()
  };

  session.versions.push(versionRecord);

  if (session.versions.length > 1) {
    const prior = session.versions[session.versions.length - 2];
    const comparison = compareVersions(prior, versionRecord);
    session.comparisons.push(comparison);

    const currentBest = session.versions[session.bestVersionIndex];
    if (versionRecord.score > currentBest.score && comparison.regressionFree) {
      session.bestVersionIndex = versionNum - 1;
    }
  }

  return versionRecord;
}

function decideContinuation(session, stagnationCheck) {
  const lastIndex = session.versions.length - 1;
  const last = session.versions[lastIndex];
  const contract = session.contract;

  if (last.passed && last.score >= contract.threshold) {
    session.status = 'promoted';
    return { action: 'stop', reason: 'QUALITY_CRITERIA_SATISFIED', status: 'promoted' };
  }

  if (stagnationCheck.stagnated) {
    if (stagnationCheck.recommendedAction === 'mutate_strategy' && session.strategyMutations < 2) {
      session.strategyMutations++;
      return { action: 'mutate_strategy', reason: stagnationCheck.reason, status: 'in_progress' };
    }
    session.status = 'stagnated';
    return { action: 'stop', reason: stagnationCheck.reason, status: 'stagnated' };
  }

  if (session.versions.length >= contract.maxIterations) {
    session.status = last.score > session.versions[0].score ? 'partially_improved' : 'rejected';
    return { action: 'stop', reason: 'MAX_ITERATIONS_REACHED', status: session.status };
  }

  return { action: 'continue_repair', reason: 'DEFECTS_PENDING', status: 'in_progress' };
}

function formatRepairGuidance(defects, mutationNotice) {
  const lines = ['Veuillez corriger impérativement les défauts identifiés :'];
  for (const d of defects) {
    lines.push(`- [${d.severity.toUpperCase()}] (${d.section}): ${d.message}`);
  }
  if (mutationNotice) {
    lines.push(`\nNote méthodologique : Stagnation observée. ${mutationNotice}`);
  }
  return lines.join('\n');
}

function buildRepairPrompt(originalPrompt, version, options = {}) {
  const defectText = formatRepairGuidance(version.defects || [], options.mutationNotice);
  const textContent = typeof version.content === 'string'
    ? version.content
    : (version.content?.candidate || JSON.stringify(version.content));

  return `${originalPrompt}\n\n--- INSTRUCTION DE RÉPARATION QUALITATIVE (GQEL) ---\n`
    + `La version précédente (V${version.version}) a obtenu un score de ${version.score}/100.\n`
    + `${defectText}\n\n`
    + `Conservez les acquis et livrez une version améliorée complète sans régression.\n`
    + `Version précédente de référence :\n${textContent.slice(0, 4000)}`;
}

function resolveDriverAndInput(driverOrInput, options = {}) {
  const isDriver = typeof driverOrInput?.generate === 'function';
  const input = isDriver ? options : (driverOrInput || {});
  const genFn = isDriver ? driverOrInput.generate.bind(driverOrInput) : (input.generator || options.generator);
  return { input, generator: genFn };
}

async function executeElevationLoop(driverOrInput, options = {}) {
  const { input, generator } = resolveDriverAndInput(driverOrInput, options);
  const contract = input.contract || compileQualityContract(input);
  const session = input.session || createElevationSession(contract);
  let currentPrompt = contract.mission;

  while (true) {
    const iter = session.versions.length + 1;
    const content = await generator({ iteration: iter, prompt: currentPrompt, repairPrompt: currentPrompt });
    const evaluation = evaluateArtifact(contract.domain, content, { mission: contract.mission });
    const currentVersion = recordIterationVersion(session, content, evaluation);

    const stagnation = detectStagnation(session.versions);
    const decision = decideContinuation(session, stagnation);

    if (decision.action === 'stop') break;

    const mutationNotice = decision.action === 'mutate_strategy'
      ? 'Changement de perspective : décomposez le conflit et reformulez l\'obstacle principal.'
      : null;

    currentPrompt = buildRepairPrompt(contract.mission, currentVersion, { mutationNotice });
  }

  const best = session.versions[session.bestVersionIndex];
  const initial = session.versions[0];
  const demonstratedGain = best && initial ? Number((best.score - initial.score).toFixed(2)) : 0;

  return {
    promoted: session.status === 'promoted',
    contract,
    session,
    finalStatus: session.status,
    bestVersion: best,
    demonstratedGain,
    isImproved: demonstratedGain > 0,
    totalIterations: session.versions.length,
    comparisons: session.comparisons
  };
}

module.exports = {
  compileQualityContract,
  createElevationSession,
  recordIterationVersion,
  decideContinuation,
  buildRepairPrompt,
  executeElevationLoop,
  POLICIES
};
