'use strict';
const artifacts = require('./runtimeArtifacts');
const waves = require('./experimentWaveRuntime');
const coverage = require('./capabilityEvidenceStore');
const meristem = require('./epistemicMeristem');

async function rankHypotheses(db, input) {
  const receipts = await coverage.loadVerifiedCoverage(db, { scopeId: input.scopeId,
    resolveArtifact: artifacts.resolver(db, input.scopeId) });
  const ranked = meristem.rankExperiments({ candidates: input.contracts, coverageReceipts: receipts,
    inhibitionWeight: input.inhibitionWeight });
  const chosen = ranked.slice(0, input.limit ?? 3).map((item) => item.experiment.hypothesisId);
  const candidateHypotheses = chosen.map((id) => input.candidateHypotheses.find((item) => item.id === id));
  if (candidateHypotheses.some((item) => !item)) throw new Error('MERISTEM_HYPOTHESIS_BINDING_REQUIRED');
  return { candidateHypotheses, coverageReceiptCount: receipts.length, ranked };
}
async function sealScientificWave(db, input) {
  return require('../../../db').withTransaction(db, () => sealBoundScientificWave(db, input));
}
async function sealBoundScientificWave(db, input) {
  const results = [];
  for (const item of input.results) {
    const assessment = await db.get(`SELECT a.*, c.experiment_id, c.scope_json
      FROM scientific_assessments a JOIN scientific_claims c ON c.claim_id = a.claim_id WHERE a.assessment_id = ?`, [item.assessmentId]);
    if (!assessment || assessment.assessment_kind !== 'verifier' || assessment.verifier_status !== 'verified') {
      throw new Error('VERIFIED_SCIENTIFIC_ASSESSMENT_REQUIRED');
    }
    await assertActiveClaim(db, assessment);
    const author = await db.get('SELECT created_by FROM scientific_claims WHERE claim_id = ?', [assessment.claim_id]);
    if (author.created_by === assessment.created_by) throw new Error('INDEPENDENT_EXPERIMENT_VERIFIER_REQUIRED');
    if (JSON.parse(assessment.scope_json).scopeId !== input.scopeId) throw new Error('SCIENTIFIC_SCOPE_MISMATCH');
    const refs = JSON.parse(assessment.evidence_refs_json);
    const evidenceRefs = [];
    for (const evidenceId of refs) evidenceRefs.push(await copyEvidence(db, { ...input, evidenceId, claimId: assessment.claim_id, experimentId: item.experimentId, outcome: item.outcome }));
    const verificationRef = await artifacts.put(db, { scopeId: input.scopeId, kind: 'experiment-verification', content: {
      valid: true, experimentId: item.experimentId, verifierId: assessment.created_by,
      outcome: item.outcome, evidenceRefs, dissent: item.dissent || [], sourceAssessmentId: item.assessmentId
    } });
    results.push({ experimentId: item.experimentId, verificationRef, evidenceRefs });
  }
  return waves.sealWave(db, { ...input, results, resolveArtifact: artifacts.resolver(db, input.scopeId) });
}
async function assertActiveClaim(db, assessment) {
  const lifecycle = require('../../scientificClaimLifecycle');
  const claim = await lifecycle.scopedClaim(db, { claimId: assessment.claim_id, experimentId: assessment.experiment_id });
  const state = await lifecycle.inspect(db, claim);
  if (state.status !== 'proposed') throw new Error('SCIENTIFIC_CLAIM_INACTIVE');
}
async function copyEvidence(db, input) {
  const item = await db.get('SELECT * FROM scientific_evidence WHERE evidence_id = ? AND claim_id = ?', [input.evidenceId, input.claimId]);
  if (!item) throw new Error('SCIENTIFIC_EVIDENCE_BINDING_INVALID');
  const content = JSON.parse(item.evidence_json);
  const scientific = require('../../scientificEvidenceLedger').createScientificEvidenceLedger(db);
  const experiment = await scientific.inspectExperiment({ experimentId: item.experiment_id });
  const claim = experiment.claims.find((value) => value.claimId === input.claimId);
  const retained = claim?.evidence.find((value) => value.evidenceId === input.evidenceId);
  if (!retained || claim.status.verifierStatus !== 'verified' || artifacts.digest(content) !== item.content_hash || retained.contentHash !== item.content_hash || content.experimentId !== input.experimentId || content.outcome !== input.outcome) throw new Error('SCIENTIFIC_EVIDENCE_DIGEST_INVALID');
  return artifacts.put(db, { scopeId: input.scopeId, kind: 'scientific-wave-evidence', content: {
    evidenceId: input.evidenceId, contentHash: item.content_hash, content
  } });
}
module.exports = { rankHypotheses, sealScientificWave };
