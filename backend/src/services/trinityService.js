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

function scoreWorldEvidence(report, domain = 'software_engineering') {
  const weights = DOMAIN_WEIGHTS[domain] || DOMAIN_WEIGHTS.software_engineering;
  if (!report || typeof report !== 'object') {
    return {
      totalScore: 0,
      claimsScore: 0,
      testsCoverage: 0,
      robustnessScore: 0,
      domain,
      weights
    };
  }

  const claims = Array.isArray(report.claims) ? report.claims : [];
  let provenClaims = 0;
  for (const c of claims) {
    const hasEv = c && (
      (Array.isArray(c.evidence) && c.evidence.length > 0) ||
      (Array.isArray(c.receipts) && c.receipts.length > 0) ||
      (Array.isArray(c.sourceRefs) && c.sourceRefs.length > 0)
    );
    if (hasEv) provenClaims++;
  }
  const claimsScore = claims.length > 0 ? (provenClaims / claims.length) : (report.outcome === 'success' ? 0.7 : 0);

  let testsCoverage = 0;
  if (typeof report.coverage === 'number') {
    testsCoverage = Math.max(0, Math.min(1, report.coverage));
  } else if (report.creativeEvaluation && typeof report.creativeEvaluation.constraintCoverage === 'number') {
    testsCoverage = Math.max(0, Math.min(1, report.creativeEvaluation.constraintCoverage));
  } else if (Array.isArray(report.tests) && report.tests.length > 0) {
    const passed = report.tests.filter((t) => {
      if (typeof t === 'string') return !t.toLowerCase().includes('fail') && !t.toLowerCase().includes('error');
      return t && !t.failed && !t.error;
    }).length;
    testsCoverage = passed / report.tests.length;
  } else if (report.outcome === 'success') {
    testsCoverage = 0.8;
  }

  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties.length : 0;
  const unverified = Array.isArray(report.unverifiedClaims) ? report.unverifiedClaims.length : 0;
  const hasFailure = report.failure || report.outcome === 'failed';
  let robustnessScore = 1.0;
  if (hasFailure) robustnessScore -= 0.6;
  robustnessScore -= (uncertainties * 0.1);
  robustnessScore -= (unverified * 0.15);
  robustnessScore = Math.max(0, Math.min(1, robustnessScore));

  const totalScore = Number((weights.alpha * claimsScore + weights.beta * testsCoverage + weights.gamma * robustnessScore).toFixed(4));

  return {
    totalScore,
    claimsScore: Number(claimsScore.toFixed(4)),
    testsCoverage: Number(testsCoverage.toFixed(4)),
    robustnessScore: Number(robustnessScore.toFixed(4)),
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

  scoredWorlds.sort((a, b) => b.score - a.score);
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

  return {
    domain,
    scoredWorlds,
    bestWorld: best,
    bestScore: best ? best.score : 0,
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
            statement: `[World ${w.worldNumber} cross-perspective] ${claim.statement}`,
            evidence: claim.evidence || []
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
