const DOMAIN_PROFILES = [
  {
    domain: 'creative_writing', artifact: 'creative',
    signals: [/\b(?:histoire|nouvelle|roman|récit|recit|fiction|conte|scénario|scenario|poème|poeme|creative writing|story)\b/i],
    roles: ['direct_author', 'planned_author', 'self_correcting_literary_author'],
    hypotheses: [
      'Create the work directly from the raw artistic brief, preserving voice and productive ambiguity.',
      'Create the work from an explicit dramatic and stylistic plan derived from the brief.',
      'Create independently, then revise against literary craft, emotional impact, coherence, and constraint coverage.'
    ]
  },
  {
    domain: 'security', artifact: 'technical',
    signals: [/\b(?:security|sécurité|securite|vulnerability|vulnérabilit|threat|auth|oauth|permission|exploit)\w*\b/i],
    roles: ['baseline_security_engineer', 'threat_model_engineer', 'adversarial_security_engineer'],
    hypotheses: [
      'Implement the raw security need with the smallest auditable change.',
      'Implement from a threat model, explicit invariants, and an attack-surface plan.',
      'Implement independently, then attack, falsify, and correct the result with reproducible evidence.'
    ]
  },
  {
    domain: 'data', artifact: 'technical',
    signals: [/\b(?:data|donnée|donnee|database|sql|etl|analytics|dataset)\w*\b/i],
    roles: ['baseline_data_engineer', 'planned_data_engineer', 'data_validation_engineer'],
    hypotheses: [
      'Implement the raw data need with explicit schema and migration constraints.',
      'Implement from a data-flow, integrity, and rollback plan.',
      'Implement independently, then challenge correctness with boundary datasets and reconciliation checks.'
    ]
  },
  {
    domain: 'product_design', artifact: 'design',
    signals: [/\b(?:ui|ux|interface|design system|accessibilit|frontend|react|vue|css)\w*\b/i],
    roles: ['baseline_product_designer', 'planned_product_designer', 'usability_critic'],
    hypotheses: [
      'Implement the raw interface need with minimal assumptions.',
      'Implement from a user-flow, hierarchy, accessibility, and interaction plan.',
      'Implement independently, then correct the result against usability, accessibility, and visual-consistency evidence.'
    ]
  }
];

const DEFAULT_PROFILE = {
  domain: 'software_engineering', artifact: 'technical',
  roles: ['basic_implementation', 'interview_plan_implementation', 'self_correcting_implementation'],
  hypotheses: [
    'Implement the raw need without relying on an interview-derived plan.',
    'Implement from the requirements and plan produced by the user interview.',
    'Implement independently, then challenge and correct the result with evidence.'
  ]
};

function domainProfile(mission) {
  const text = String(mission || '');
  return DOMAIN_PROFILES.find((profile) => profile.signals.some((signal) => signal.test(text))) || DEFAULT_PROFILE;
}

function membersFor(profile) {
  return ['basic_world', 'planned_world', 'ai_corrected_world'].map((label, index) => ({
    label,
    hypothesis: profile.hypotheses[index],
    role: profile.roles[index],
    modelTier: index === 0 ? 'standard' : 'frontier',
    domain: profile.domain,
    artifact: profile.artifact,
    pipelineStage: 0
  }));
}

function analyzeMission(mission) {
  const text = String(mission || '');
  const explicitlyRequested = [
    /(?:^|\b)(?:launch|use|using|run|start|activate|invoke|deploy|want|with)\s+(?:the\s+)?trinity\b/i,
    /(?:^|\b)(?:lance|lancer|utilise|utiliser|active|activer|invoque|invoquer|déploie|deploie|déployer|deployer|veux|souhaite)\s+(?:le\s+mode\s+)?trinity\b/i,
    /\b(?:trinity mode|mode trinity)\b/i,
    /\bavec\s+trinity\b/i,
    /^\s*trinity\b/i
  ].some((pattern) => pattern.test(text));
  const interviewForPlan = [
    /\binterview\s+me\b[\s\S]{0,100}\b(plan|roadmap|specification|requirements?)\b/i,
    /\bask\s+me\b[\s\S]{0,80}\bquestions?\b[\s\S]{0,100}\b(plan|roadmap|specification|requirements?)\b/i,
    /\b(interviewe|interroge)[ -]?moi\b[\s\S]{0,100}\b(plan|feuille de route|cahier des charges|besoins?)\b/i,
    /\bpose[ -]?moi\b[\s\S]{0,80}\bquestions?\b[\s\S]{0,100}\b(plan|feuille de route|cahier des charges|besoins?)\b/i
  ].some((pattern) => pattern.test(text));
  const profile = domainProfile(text);
  return {
    recommended: explicitlyRequested || interviewForPlan,
    explicitlyRequested,
    interviewForPlan,
    decision: explicitlyRequested ? 'launch' : interviewForPlan ? 'consider_after_interview' : 'not_applicable',
    domain: profile.domain,
    artifact: profile.artifact,
    members: membersFor(profile)
  };
}

function compose(mission) {
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error('Trinity mission is required.'), { code: 'TRINITY_MISSION_REQUIRED' });
  const analysis = analyzeMission(goal);
  return analysis.members.map((member, index) => ({
    ...member,
    worldNumber: index + 1,
    mission: `Trinity shared mission: ${goal}\nDomain: ${analysis.domain}\nWorld strategy: ${member.hypothesis}\nReturn domain-appropriate evidence and integration constraints to the orchestrator.`
  }));
}

const telemetry = require('./telemetryObserver');

const DOMAIN_WEIGHTS = {
  creative_writing: { alpha: 0.30, beta: 0.25, gamma: 0.45 },
  security: { alpha: 0.35, beta: 0.45, gamma: 0.20 },
  data: { alpha: 0.30, beta: 0.45, gamma: 0.25 },
  product_design: { alpha: 0.30, beta: 0.30, gamma: 0.40 },
  software_engineering: { alpha: 0.35, beta: 0.40, gamma: 0.25 }
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function textItems(value) {
  return Array.isArray(value)
    ? value.filter((item) => (typeof item === 'string' ? item.trim().length > 0 : Boolean(item)))
    : [];
}

// Proof quality is not uniform: a cryptographic receipt proves execution, a
// source reference proves provenance, a bare evidence string is the weakest.
function evidenceWeightOf(claim) {
  if (!claim || typeof claim !== 'object') return 0;
  return textItems(claim.evidence).length
    + textItems(claim.receipts).length * 2
    + textItems(claim.sourceRefs).length * 1.5;
}

// Placeholder claims such as empty markdown checklists carry no verifiable
// content and must not count as robust evidence.
function isSubstantiveClaim(claim) {
  const text = String(claim && claim.statement || '')
    .replace(/\[\s*\]/g, '')
    .replace(/[#>*_`\-\s]/g, '');
  return text.length >= 20;
}

function hasExplicitCoverage(report) {
  return typeof report.coverage === 'number'
    || (report.creativeEvaluation && typeof report.creativeEvaluation.constraintCoverage === 'number')
    || (Array.isArray(report.tests) && report.tests.length > 0);
}

function passedTests(report) {
  const tests = Array.isArray(report.tests) ? report.tests : [];
  return tests.filter((t) => (typeof t === 'string' ? !/fail|error/i.test(t) : !(t && (t.failed || t.error)))).length;
}

function scoreWorldEvidence(report, domain = 'software_engineering') {
  const weights = DOMAIN_WEIGHTS[domain] || DOMAIN_WEIGHTS.software_engineering;
  if (!report || typeof report !== 'object') {
    return {
      totalScore: 0,
      claimsScore: 0,
      testsCoverage: 0,
      robustnessScore: 0,
      provenClaims: 0,
      substantiveClaims: 0,
      evidenceWeight: 0,
      hasDeliverable: false,
      domain,
      weights
    };
  }

  const claims = Array.isArray(report.claims) ? report.claims : [];
  let provenClaims = 0;
  let substantiveClaims = 0;
  let evidenceWeight = 0;
  for (const c of claims) {
    const weight = evidenceWeightOf(c);
    if (weight > 0) provenClaims++;
    evidenceWeight += clamp01(weight / 3);
    if (isSubstantiveClaim(c)) substantiveClaims++;
  }

  const hasArtifact = typeof report.artifactText === 'string' && report.artifactText.trim().length > 0;
  // An empty dossier is not partially proven just because it reported success.
  const claimsScore = claims.length > 0 ? (provenClaims / claims.length) : (hasArtifact ? 0.3 : 0);

  let testsCoverage = 0;
  if (typeof report.coverage === 'number') {
    testsCoverage = clamp01(report.coverage);
  } else if (report.creativeEvaluation && typeof report.creativeEvaluation.constraintCoverage === 'number') {
    testsCoverage = clamp01(report.creativeEvaluation.constraintCoverage);
  } else if (Array.isArray(report.tests) && report.tests.length > 0) {
    testsCoverage = passedTests(report) / report.tests.length;
  }

  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties.length : 0;
  const unverified = Array.isArray(report.unverifiedClaims) ? report.unverifiedClaims.length : 0;
  const hasFailure = Boolean(report.failure) || report.outcome === 'failed';
  const hasDeliverable = hasArtifact || hasExplicitCoverage(report);
  let robustnessScore = 1.0;
  if (hasFailure) robustnessScore -= 0.6;
  robustnessScore -= (uncertainties * 0.1);
  robustnessScore -= (unverified * 0.15);
  // Claims that are asserted but not proven, or that are just placeholders,
  // must reduce robustness instead of being rewarded as a clean success.
  if (claims.length > 0 && provenClaims === 0) robustnessScore -= 0.3;
  robustnessScore -= Math.min(0.3, (claims.length - substantiveClaims) * 0.1);
  if (!hasDeliverable) robustnessScore -= 0.1;
  const evidenceDensity = claims.length > 0 ? clamp01(evidenceWeight / claims.length) : 0;
  robustnessScore -= (1 - evidenceDensity) * 0.15;
  robustnessScore = clamp01(robustnessScore);

  const totalScore = Number((weights.alpha * claimsScore + weights.beta * testsCoverage + weights.gamma * robustnessScore).toFixed(4));

  return {
    totalScore,
    claimsScore: Number(claimsScore.toFixed(4)),
    testsCoverage: Number(testsCoverage.toFixed(4)),
    robustnessScore: Number(robustnessScore.toFixed(4)),
    provenClaims,
    substantiveClaims,
    evidenceWeight: Number(evidenceWeight.toFixed(4)),
    hasDeliverable,
    domain,
    weights
  };
}

function compareWorlds(worldEntries, domain = 'software_engineering') {
  const entries = Array.isArray(worldEntries) ? worldEntries : [];
  const scoredWorlds = entries.map((entry, index) => {
    const report = entry.report || entry.evidenceReport || entry;
    const worldNumber = entry.worldNumber || index + 1;
    const role = entry.role || entry.strategy || `world_${worldNumber}`;
    const scoreData = scoreWorldEvidence(report, domain);
    return {
      worldNumber,
      role,
      name: entry.name || `Trinity World ${worldNumber}`,
      agentId: entry.agentId || entry.id || null,
      score: scoreData.totalScore,
      breakdown: scoreData,
      report
    };
  });

  // A score tie is common when dossiers share the same structure. Break it
  // deterministically by proof volume so the winner is not just array order.
  scoredWorlds.sort((a, b) => b.score - a.score
    || (b.breakdown.provenClaims || 0) - (a.breakdown.provenClaims || 0)
    || (b.breakdown.evidenceWeight || 0) - (a.breakdown.evidenceWeight || 0)
    || a.worldNumber - b.worldNumber);
  const best = scoredWorlds[0] || null;

  const comparisonMatrix = scoredWorlds.map((w) => {
    const strengths = [];
    const weaknesses = [];
    if (w.breakdown.claimsScore >= 0.8) strengths.push('High empirical claim verification');
    else if (w.breakdown.claimsScore < 0.5) weaknesses.push('Unverified assertions');

    if (w.breakdown.testsCoverage >= 0.8) strengths.push('Broad test & constraint coverage');
    else if (w.breakdown.testsCoverage < 0.5) weaknesses.push('Sparse test verification');

    if (w.breakdown.robustnessScore >= 0.8) strengths.push('High robustness without known failures');
    else if (w.breakdown.robustnessScore < 0.5) weaknesses.push('Fragile or unresolved failure states');

    return {
      worldNumber: w.worldNumber,
      role: w.role,
      score: w.score,
      strengths,
      weaknesses
    };
  });

  const bestScore = best ? best.score : 0;
  const tiedWorlds = scoredWorlds
    .filter((w) => Math.abs(w.score - bestScore) <= 1e-6)
    .map((w) => w.worldNumber);

  return {
    domain,
    scoredWorlds,
    bestWorld: best,
    bestScore,
    tied: tiedWorlds.length > 1,
    tiedWorlds,
    comparisonMatrix,
    timestamp: new Date().toISOString()
  };
}

async function recordWorldComparison(db, comparisonData) {
  const { missionId, orchestratorId, comparison } = comparisonData || {};
  if (db && missionId) {
    try {
      for (const w of (comparison?.scoredWorlds || [])) {
        if (w.agentId) {
          await db.run(
            `UPDATE trinity_worlds SET status = 'compared', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`,
            w.agentId
          ).catch(() => {});
        }
      }
    } catch (_) {}
  }

  telemetry.emitEvent({
    eventType: 'TRINITY_WORLD_COMPARISON_RECORDED',
    agentId: orchestratorId || 'trinity_orchestrator',
    action: 'COMPARE',
    detail: `Compared ${comparison?.scoredWorlds?.length || 0} Trinity worlds in domain '${comparison?.domain}'. Winner: World ${comparison?.bestWorld?.worldNumber} (${comparison?.bestWorld?.role}) score=${comparison?.bestScore}`,
    severity: 'info',
    payload: {
      missionId,
      bestWorldNumber: comparison?.bestWorld?.worldNumber,
      bestRole: comparison?.bestWorld?.role,
      bestScore: comparison?.bestScore,
      comparisonMatrix: comparison?.comparisonMatrix
    }
  });

  return comparison;
}

function mergeTrinityEvidence(worldEntries, options = {}) {
  const domain = options.domain || 'software_engineering';
  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.70;
  const comparison = compareWorlds(worldEntries, domain);

  if (comparison.bestScore >= threshold && comparison.bestWorld) {
    const winnerReport = comparison.bestWorld.report || {};
    // Synthesize complementary insights from other worlds
    const complementaryClaims = [];
    for (const w of comparison.scoredWorlds) {
      if (w.worldNumber === comparison.bestWorld.worldNumber) continue;
      const otherClaims = Array.isArray(w.report?.claims) ? w.report.claims : [];
      for (const claim of otherClaims) {
        if (claim && claim.statement) {
          complementaryClaims.push({
            ...claim,
            statement: `[World ${w.worldNumber} cross-perspective] ${claim.statement}`,
            evidence: Array.isArray(claim.evidence) ? claim.evidence : []
          });
        }
      }
    }

    const mergedEvidence = {
      ...winnerReport,
      author: {
        name: 'Trinity Consolidated Synthesis',
        selectedWorld: comparison.bestWorld.worldNumber,
        selectedRole: comparison.bestWorld.role
      },
      outcome: 'success',
      claims: [...(Array.isArray(winnerReport.claims) ? winnerReport.claims : []), ...complementaryClaims],
      comparativeAnalysis: {
        winner: comparison.bestWorld.worldNumber,
        winningRole: comparison.bestWorld.role,
        score: comparison.bestScore,
        matrix: comparison.comparisonMatrix
      }
    };

    return {
      canMerge: true,
      selectedWorld: comparison.bestWorld.worldNumber,
      selectedRole: comparison.bestWorld.role,
      bestScore: comparison.bestScore,
      comparativeAnalysis: comparison,
      mergedEvidence
    };
  }

  return {
    canMerge: false,
    selectedWorld: null,
    bestScore: comparison.bestScore,
    reason: `All three worlds failed to meet the evidence threshold of ${threshold} (best score: ${comparison.bestScore}).`,
    recommendation: 'Escalate to human review or re-launch with modified mission.',
    comparativeAnalysis: comparison,
    mergedEvidence: null
  };
}

module.exports = {
  analyzeMission,
  compose,
  domainProfile,
  DOMAIN_WEIGHTS,
  scoreWorldEvidence,
  compareWorlds,
  recordWorldComparison,
  mergeTrinityEvidence
};
