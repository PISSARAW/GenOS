const DOMAIN_PROFILES = [
  { domain: 'creative_writing', artifact: 'creative', signals: [/\\b(?:histoire|nouvelle|roman|récit|recit|fiction|conte|scénario|scenario|poème|poeme|creative writing|story)\\b/i], roles: ['direct_author', 'planned_author', 'self_correcting_literary_author'], hypotheses: ['Create the work directly from the raw artistic brief, preserving voice and productive ambiguity.', 'Create the work from an explicit dramatic and stylistic plan derived from the brief.', 'Create independently, then revise against literary craft, emotional impact, coherence, and constraint coverage.'] },
  { domain: 'security', artifact: 'technical', signals: [/\\b(?:security|sécurité|securite|vulnerability|vulnérabilit|threat|auth|oauth|permission|exploit)\\w*\\b/i], roles: ['baseline_security_engineer', 'threat_model_engineer', 'adversarial_security_engineer'], hypotheses: ['Implement the raw security need with the smallest auditable change.', 'Implement from a threat model, explicit invariants, and an attack-surface plan.', 'Implement independently, then attack, falsify, and correct the result with reproducible evidence.'] },
  { domain: 'data', artifact: 'technical', signals: [/\\b(?:data|donnée|donnee|database|sql|etl|analytics|dataset)\\w*\\b/i], roles: ['baseline_data_engineer', 'planned_data_engineer', 'data_validation_engineer'], hypotheses: ['Implement the raw data need with explicit schema and migration constraints.', 'Implement from a data-flow, integrity, and rollback plan.', 'Implement independently, then challenge correctness with boundary datasets and reconciliation checks.'] },
  { domain: 'product_design', artifact: 'design', signals: [/\\b(?:ui|ux|interface|design system|accessibilit|frontend|react|vue|css)\\w*\\b/i], roles: ['baseline_product_designer', 'planned_product_designer', 'usability_critic'], hypotheses: ['Implement the raw interface need with minimal assumptions.', 'Implement from a user-flow, hierarchy, accessibility, and interaction plan.', 'Implement independently, then correct the result against usability, accessibility, and visual-consistency evidence.'] }
];

const DEFAULT_PROFILE = { domain: 'software_engineering', artifact: 'technical', roles: ['basic_implementation', 'interview_plan_implementation', 'self_correcting_implementation'], hypotheses: ['Implement the raw need without relying on an interview-derived plan.', 'Implement from the requirements and plan produced by the user interview.', 'Implement independently, then challenge and correct the result with evidence.'] };

function domainProfile(text) {
  const t = String(text || '');
  return DOMAIN_PROFILES.find(p => p.signals.some(s => s.test(t))) || DEFAULT_PROFILE;
}

function membersFor(profile) {
  const chambers = ['direct', 'structured', 'falsification'];
  return ['basic_world', 'planned_world', 'ai_corrected_world'].map((label, i) => ({
    chamber: chambers[i],
    label, hypothesis: `${profile.hypotheses[i]} Report evidenceVector (correctness, coverage, robustness, reproducibility, novelty, cost, latency, risk, uncertainty, constraintCoverage), hardConstraintsPassed, and budgetStatus. Use null for unmeasured dimensions and cite each measured dimension in evidenceVectorEvidence using IDs from evidence[]. Never invent measurements or evidence.`, role: profile.roles[i],
    modelTier: i === 0 ? 'standard' : 'frontier', domain: profile.domain,
    artifact: profile.artifact, pipelineStage: 0
  }));
}

const EXPLICIT_PATTERNS = [
  /(?:^|\\b)(?:launch|use|using|run|start|activate|invoke|deploy|want|with)\\s+(?:the\\s+)?trinity\\b/i,
  /(?:^|\\b)(?:lance|lancer|utilise|utiliser|active|activer|invoque|invoquer|déploie|deploie|déployer|deployer|veux|souhaite)\\s+(?:le\\s+mode\\s+)?trinity\\b/i,
  /\\b(?:trinity mode|mode trinity)\\b/i, /\\bavec\\s+trinity\\b/i, /^\\s*trinity\\b/i
];

const INTERVIEW_PATTERNS = [
  /\\binterview\\s+me\\b[\\s\\S]{0,100}\\b(plan|roadmap|specification|requirements?)\\b/i,
  /\\bask\\s+me\\b[\\s\\S]{0,80}\\bquestions?\\b[\\s\\S]{0,100}\\b(plan|roadmap|specification|requirements?)\\b/i,
  /\\b(interviewe|interroge)[ -]?moi\\b[\\s\\S]{0,100}\\b(plan|feuille de route|cahier des charges|besoins?)\\b/i,
  /\\bpose[ -]?moi\\b[\\s\\S]{0,80}\\bquestions?\\b[\\s\\S]{0,100}\\b(plan|feuille de route|cahier des charges|besoins?)\\b/i
];

function analyzeMission(mission) {
  const text = String(mission || '');
  const explicitlyRequested = EXPLICIT_PATTERNS.some(p => p.test(text));
  const interviewForPlan = INTERVIEW_PATTERNS.some(p => p.test(text));
  const profile = domainProfile(text);
  return {
    recommended: explicitlyRequested || interviewForPlan,
    explicitlyRequested, interviewForPlan,
    decision: explicitlyRequested ? 'launch' : interviewForPlan ? 'consider_after_interview' : 'not_applicable',
    domain: profile.domain, artifact: profile.artifact, members: membersFor(profile)
  };
}

function compose(mission) {
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error('Trinity mission is required.'), { code: 'TRINITY_MISSION_REQUIRED' });
  const analysis = analyzeMission(goal);
  return analysis.members.map((member, index) => ({
    ...member, worldNumber: index + 1,
    mission: `Trinity mission: ${goal}\nDomain: ${analysis.domain}\nSealed chamber: ${member.chamber}\nWorld strategy: ${member.hypothesis}\nDo not request, read, or infer other chamber outputs. Return an artifact, acceptance checks, evidence, uncertainties, and execution limits.`
  }));
}

function normalizeIntegrationChecks(checks) {
  return Array.isArray(checks) ? [...new Set(checks.map((id) => String(id).trim()).filter(Boolean))] : [];
}

function normalizeClaimVerificationChecks(checks) {
  return Array.isArray(checks)
    ? checks.filter((entry) => entry && typeof entry === 'object').map((entry) => ({
      claim: String(entry.claim || '').trim(),
      commandIds: Array.isArray(entry.commandIds) ? [...new Set(entry.commandIds.map((id) => String(id).trim()).filter(Boolean))] : []
    })).filter((entry) => entry.claim && entry.commandIds.length)
    : [];
}

function designHypotheses(mission, supplied = {}) {
  const analysis = analyzeMission(mission);
  const candidates = hypothesisDesign.normalizeCandidates(supplied);
  const selectedTriplet = hypothesisDesign.selectTriplet(candidates)
    || analysis.members.map((member) => ({ chamber: member.chamber, hypothesis: member.hypothesis, sourceRefs: ['mission'] }));
  const integrationChecks = normalizeIntegrationChecks(supplied.integrationChecks);
  const claimVerificationChecks = normalizeClaimVerificationChecks(supplied.claimVerificationChecks);
  return {
    centralProblem: String(supplied.centralProblem || mission || '').trim(),
    assumptions: Array.isArray(supplied.assumptions) ? supplied.assumptions : [],
    uncertainties: Array.isArray(supplied.uncertainties) ? supplied.uncertainties : [],
    decisionVariables: Array.isArray(supplied.decisionVariables) ? supplied.decisionVariables : [],
    candidateHypotheses: candidates.length ? candidates : analysis.members.map((member) => ({ chamber: member.chamber, hypothesis: member.hypothesis, sourceRefs: ['mission'] })),
    selectedTriplet,
    integrationChecks,
    claimVerificationChecks,
    selectionMethod: candidates.length >= 3 && hypothesisDesign.selectTriplet(candidates) ? 'supplied_candidates_v1' : 'fixed_v1',
    utilityScore: null
  };
}

const telemetry = require('./telemetryObserver');
const adaptive = require('./adaptiveParameterService');
const { calculateEvIndex } = require('./trinityValueService');
const trinityPareto = require('./trinityParetoService');
const hypothesisDesign = require('./trinityHypothesisDesignService');

const DOMAIN_WEIGHTS = {
  creative_writing: { alpha: 0.30, beta: 0.25, gamma: 0.45 },
  security: { alpha: 0.35, beta: 0.45, gamma: 0.20 },
  data: { alpha: 0.30, beta: 0.45, gamma: 0.25 },
  product_design: { alpha: 0.30, beta: 0.30, gamma: 0.40 },
  software_engineering: { alpha: 0.35, beta: 0.40, gamma: 0.25 }
};

const clamp01 = v => Math.max(0, Math.min(1, v));
const textItems = v => Array.isArray(v) ? v.filter(i => (typeof i === 'string' ? i.trim().length > 0 : Boolean(i))) : [];

function evidenceWeightOf(claim) {
  if (!claim || typeof claim !== 'object') return 0;
  return textItems(claim.evidence).length + textItems(claim.receipts).length * 2 + textItems(claim.sourceRefs).length * 1.5;
}

function isSubstantiveClaim(claim) {
  return String(claim && claim.statement || '').replace(/\\[\\s*\\]/g, '').replace(/[#>*_`\\-\\s]/g, '').length >= 20;
}

function hasExplicitCoverage(report) {
  if (typeof report.coverage === 'number') return true;
  if (report.creativeEvaluation && typeof report.creativeEvaluation.constraintCoverage === 'number') return true;
  return Array.isArray(report.tests) && report.tests.length > 0;
}

function passedTests(report) {
  const tests = Array.isArray(report.tests) ? report.tests : [];
  return tests.filter(t => (typeof t === 'string' ? !/fail|error/i.test(t) : !(t && (t.failed || t.error)))).length;
}

function scoreWorldEvidence(report, domain = 'software_engineering') {
  const weights = adaptive.routeWeights(domain) || DOMAIN_WEIGHTS[domain] || DOMAIN_WEIGHTS.software_engineering;
  if (!report || typeof report !== 'object') return { totalScore: 0, claimsScore: 0, testsCoverage: 0, robustnessScore: 0, provenClaims: 0, substantiveClaims: 0, evidenceWeight: 0, hasDeliverable: false, domain, weights };
  const claims = Array.isArray(report.claims) ? report.claims : [];
  let provenClaims = 0, substantiveClaims = 0, evidenceWeight = 0;
  for (const c of claims) {
    const w = evidenceWeightOf(c);
    if (w > 0) provenClaims++;
    evidenceWeight += clamp01(w / 3);
    if (isSubstantiveClaim(c)) substantiveClaims++;
  }
  const hasArtifact = typeof report.artifactText === 'string' && report.artifactText.trim().length > 0;
  const claimsScore = claims.length > 0 ? provenClaims / claims.length : (hasArtifact ? 0.3 : 0);
  let testsCoverage = 0;
  if (typeof report.coverage === 'number') testsCoverage = clamp01(report.coverage);
  else if (report.creativeEvaluation && typeof report.creativeEvaluation.constraintCoverage === 'number') testsCoverage = clamp01(report.creativeEvaluation.constraintCoverage);
  else if (Array.isArray(report.tests) && report.tests.length > 0) testsCoverage = passedTests(report) / report.tests.length;
  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties.length : 0;
  const unverified = Array.isArray(report.unverifiedClaims) ? report.unverifiedClaims.length : 0;
  const hasFailure = Boolean(report.failure) || report.outcome === 'failed';
  const hasDeliverable = hasArtifact || hasExplicitCoverage(report);
  let robustnessScore = 1.0;
  if (hasFailure) robustnessScore -= 0.6;
  robustnessScore -= uncertainties * 0.1;
  robustnessScore -= unverified * 0.15;
  if (claims.length > 0 && provenClaims === 0) robustnessScore -= 0.3;
  robustnessScore -= Math.min(0.3, (claims.length - substantiveClaims) * 0.1);
  if (!hasDeliverable) robustnessScore -= 0.1;
  const evidenceDensity = claims.length > 0 ? clamp01(evidenceWeight / claims.length) : 0;
  robustnessScore -= (1 - evidenceDensity) * 0.15;
  robustnessScore = clamp01(robustnessScore);
  const totalScore = Number((weights.alpha * claimsScore + weights.beta * testsCoverage + weights.gamma * robustnessScore).toFixed(4));
  return { totalScore, claimsScore: Number(claimsScore.toFixed(4)), testsCoverage: Number(testsCoverage.toFixed(4)), robustnessScore: Number(robustnessScore.toFixed(4)), provenClaims, substantiveClaims, evidenceWeight: Number(evidenceWeight.toFixed(4)), hasDeliverable, domain, weights };
}

function scoreWorld(entry, domain) {
  const r = entry.report || entry.evidenceReport || entry;
  const d = scoreWorldEvidence(r, domain);
  return { worldNumber: entry.worldNumber || 0, role: entry.role || entry.strategy || `world_${entry.worldNumber || 1}`, name: entry.name || `Trinity World ${entry.worldNumber || 1}`, agentId: entry.agentId || entry.id || null, score: d.totalScore, breakdown: d, report: r };
}

function compareWorlds(worldEntries, domain = 'software_engineering') {
  const entries = Array.isArray(worldEntries) ? worldEntries : [];
  const scored = entries.map((e, i) => { const s = scoreWorld(e, domain); s.worldNumber = e.worldNumber || i + 1; return s; });
  scored.sort((a, b) => b.score - a.score || (b.breakdown.provenClaims || 0) - (a.breakdown.provenClaims || 0) || (b.breakdown.evidenceWeight || 0) - (a.breakdown.evidenceWeight || 0) || a.worldNumber - b.worldNumber);
  const best = scored[0] || null;
  const bestScore = best ? best.score : 0;
  const tiedWorlds = scored.filter(w => Math.abs(w.score - bestScore) <= 1e-6).map(w => w.worldNumber);
  const matrix = scored.map(w => ({
    worldNumber: w.worldNumber, role: w.role, score: w.score,
    strengths: [], weaknesses: []
  }));
  return { domain, scoredWorlds: scored, bestWorld: best, bestScore, tied: tiedWorlds.length > 1, tiedWorlds, comparisonMatrix: matrix, timestamp: new Date().toISOString() };
}

function comparisonDetail(comparison, decision) {
  const count = comparison?.scoredWorlds?.length || 0;
  if (decision && decision.canMerge === false) {
    return `Compared ${count} Trinity worlds in domain '${comparison?.domain}'. Outcome: ${comparison?.pareto?.outcome || 'ESCALATE_EXPERIMENT'} (${comparison?.pareto?.reason || 'no unique verified Pareto winner'}).`;
  }
  const winner = comparison?.scoredWorlds?.find((world) => world.worldNumber === comparison?.pareto?.selectedWorld);
  return `Compared ${count} Trinity worlds in domain '${comparison?.domain}'. Unique verified Pareto candidate: World ${winner?.worldNumber} (${winner?.role}).`;
}

async function recordWorldComparison(db, comparisonData) {
  const { missionId, orchestratorId, comparison, decision } = comparisonData || {};
  if (db && missionId) {
    for (const w of (comparison?.scoredWorlds || [])) {
      if (w.agentId) {
        const vector = comparison.pareto?.worlds?.find((candidate) => candidate.worldNumber === w.worldNumber)?.vector;
        await db.run(`UPDATE trinity_worlds SET status = 'compared', evidence_vector_json = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`, vector ? JSON.stringify(vector) : null, w.agentId);
      }
    }
  }
  telemetry.emitEvent({ eventType: 'TRINITY_WORLD_COMPARISON_RECORDED', agentId: orchestratorId || 'trinity_orchestrator', action: 'COMPARE', detail: comparisonDetail(comparison, decision), severity: 'info', payload: { missionId, outcome: comparison?.pareto?.outcome, frontier: comparison?.pareto?.frontier?.map((world) => world.worldNumber) || [], bestScore: comparison?.bestScore, merged: decision && typeof decision.canMerge === 'boolean' ? decision.canMerge : null, comparisonMatrix: comparison?.comparisonMatrix } });
  return comparison;
}

function evidenceBackedClaim(claim) {
  return Boolean(claim && isSubstantiveClaim(claim) && evidenceWeightOf(claim) > 0);
}

function complementaryClaimsFrom(worlds, winner, claimGraph) {
  const claims = [];
  for (const world of worlds) {
    if (world.worldNumber === winner.worldNumber) continue;
    const worldClaims = Array.isArray(world.report?.claims) ? world.report.claims : [];
    for (const claim of worldClaims) {
      if (!evidenceBackedClaim(claim) || !hasComplementEdge(claim, winner.report?.claims, claimGraph)) continue;
      claims.push({ ...claim, statement: `[World ${world.worldNumber} complementary] ${claim.statement}` });
    }
  }
  return claims;
}

function hasComplementEdge(claim, winnerClaims, claimGraph) {
  if (!claim?.id || !Array.isArray(winnerClaims) || !Array.isArray(claimGraph?.edges)) return false;
  return winnerClaims.some((winnerClaim) => winnerClaim?.id && claimGraph.edges.some((edge) => {
    if (edge?.type !== 'complements') return false;
    return (edge.from === claim.id && edge.to === winnerClaim.id)
      || (edge.to === claim.id && edge.from === winnerClaim.id);
  }));
}

function mergeTrinityEvidence(worldEntries, options = {}) {
  const domain = options.domain || 'software_engineering';
  const entries = Array.isArray(worldEntries) ? worldEntries : [];
  const comparison = compareWorlds(entries, domain);
  const pareto = trinityPareto.compare(entries, options);
  comparison.pareto = pareto;
  const accepted = pareto.outcome === 'PROMOTE_WORLD';
  if (accepted) {
    const winner = comparison.scoredWorlds.find((world) => world.worldNumber === pareto.selectedWorld);
    const winnerReport = winner.report || {};
    const winnerClaims = Array.isArray(winnerReport.claims) ? winnerReport.claims.filter(evidenceBackedClaim) : [];
    const complementaryClaims = complementaryClaimsFrom(comparison.scoredWorlds, winner, options.claimGraph);
    return { canMerge: true, outcome: pareto.outcome, selectedWorld: winner.worldNumber, selectedRole: winner.role, bestScore: comparison.bestScore, comparativeAnalysis: comparison, mergedEvidence: { ...winnerReport, author: { name: 'Trinity Consolidated Synthesis', selectedWorld: winner.worldNumber, selectedRole: winner.role }, outcome: 'success', claims: [...winnerClaims, ...complementaryClaims], comparativeAnalysis: { winner: winner.worldNumber, winningRole: winner.role, score: comparison.bestScore, matrix: comparison.comparisonMatrix, evidenceVector: winner.vector } } };
  }
  return { canMerge: false, outcome: pareto.outcome, selectedWorld: null, bestScore: comparison.bestScore, reason: pareto.reason || `Pareto frontier retained ${pareto.frontier.length} candidates.`, recommendation: 'Escalate to human review or re-launch with modified mission.', comparativeAnalysis: comparison, mergedEvidence: null };
}

function validateWorldEntries(entries) {
  const numbers = entries.map((e, i) => Number(e && (e.worldNumber || i + 1)));
  if (entries.length !== 3 || numbers.some(n => !Number.isInteger(n) || n < 1) || new Set(numbers).size !== 3) return { valid: false, reason: 'Trinity requires exactly three distinct world dossiers.' };
  const bad = entries.find(e => !hasValidWorldEvidence(e));
  return bad ? { valid: false, reason: `World ${bad.worldNumber || 'unknown'} has no valid evidence dossier.` } : { valid: true, reason: null };
}

function hasValidWorldEvidence(entry) {
  const r = entry && (entry.report || entry.evidenceReport || entry);
  if (!r || typeof r !== 'object') return false;
  if (r.outcome === 'failed') return Boolean(r.failure && String(r.failure.reason || '').trim());
  return Array.isArray(r.claims) && r.claims.some(c => isSubstantiveClaim(c) && evidenceWeightOf(c) > 0);
}

function rejectionReason(validation, comparison, threshold) {
  if (!validation.valid) return validation.reason;
  if (comparison.tied) return `Trinity comparison is tied across worlds ${comparison.tiedWorlds.join(', ')}.`;
  return `All three worlds failed to meet the evidence threshold of ${threshold} (best score: ${comparison.bestScore}).`;
}

module.exports = { analyzeMission, compose, designHypotheses, calculateEvIndex, domainProfile, DOMAIN_WEIGHTS, scoreWorldEvidence, compareWorlds, recordWorldComparison, mergeTrinityEvidence };
