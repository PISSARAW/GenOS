'use strict';

const assembler = require('./trinityArtifactAssembler');

async function promote(db, input, executePromotion) {
  if (!eligibleSynthesis(input.result)) return { promoted: false, reason: 'no_merge' };
  const row = await db.get('SELECT design_json FROM trinity_experiments WHERE mission_id = ?', input.missionId);
  const design = JSON.parse(row?.design_json || '{}');
  if (!design.synthesisPlan) return { promoted: false, reason: 'synthesized_claims_require_artifact_assembly' };
  const result = input.result;
  const worlds = result.comparativeAnalysis?.scoredWorlds || [];
  try {
    assembler.validatePlan(design.synthesisPlan, worlds);
    const claims = result.mergedEvidence?.claims || [];
    if (!admissibleClaims(claims, design.synthesisPlan)) {
      return { promoted: false, reason: 'synthesis_claim_artifact_mapping_required' };
    }
    const base = worlds.find(world => world.worldNumber === design.synthesisPlan.baseWorld);
    const composite = { ...base, report: { ...result.mergedEvidence, claims } };
    const candidate = { ...result, canMerge: true, outcome: 'PROMOTE_WORLD',
      selectedWorld: base.worldNumber, selectedRole: 'claim_synthesis', synthesisPlan: design.synthesisPlan,
      comparativeAnalysis: { ...result.comparativeAnalysis,
        scoredWorlds: worlds.map(world => world === base ? composite : world) } };
    return commitCandidate(db, { input, candidate }, executePromotion);
  } catch (error) {
    return { promoted: false, reason: error.code || 'synthesis_assembly_failed' };
  }
}

function commitCandidate(db, context, executePromotion) {
  const commit = executePromotion || require('./trinityComparativeBarrier').promoteWinner;
  return commit(db, { ...context.input, result: context.candidate });
}

function eligibleSynthesis(result) {
  if (result?.outcome !== 'SYNTHESIZE_CLAIMS' || result.reason !== 'frontier_claims_are_evidence_backed_and_mission_linked') return false;
  const analysis = result.comparativeAnalysis;
  if (analysis?.pareto?.outcome !== 'SYNTHESIZE_CLAIMS' || !hasSynthesisInputs(analysis)) return false;
  const expected = require('./trinityClaimGraphService').synthesize(analysis.scoredWorlds,
    { ...analysis.pareto, outcome: 'KEEP_PARETO_SET' }, analysis.claimGraph);
  return Boolean(expected && JSON.stringify(expected.claims) === JSON.stringify(result.mergedEvidence?.claims));
}

function hasSynthesisInputs(analysis) {
  return Array.isArray(analysis.scoredWorlds) && Array.isArray(analysis.pareto.frontier)
    && Array.isArray(analysis.claimGraph?.nodes) && Array.isArray(analysis.claimGraph?.edges);
}

function admissibleClaims(claims, plan) {
  return claims.length >= 2 && claims.every(claim => manifestCoversClaim(claim, plan));
}

function manifestCoversClaim(claim, plan) {
  return Array.isArray(claim.artifactPaths) && claim.artifactPaths.length > 0
    && claim.artifactPaths.every(path => plan.files.some(file => file.path === path && file.worldNumber === claim.sourceWorld));
}

module.exports = { promote };
