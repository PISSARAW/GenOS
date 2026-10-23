'use strict';

const { createHash } = require('node:crypto');
const { allocationWitness } = require('./biomeAllocationFeedback');

function isBiomeSteward(mission = {}) {
  const assignment = mission.workerAssignment || mission;
  const topology = String(assignment.topology || mission.morphologyTopology || '').toLowerCase();
  const role = String(assignment.topologyRole || mission.topologyRole || mission.role || '').toLowerCase();
  return topology === 'biome' && role === 'resource_steward';
}

function normalizeUnresolvedResponse(result, responseFormat, mission) {
  if (!isBiomeSteward(mission) || responseFormat?.name !== 'genos_worker_artifact'
    || !result?.schemaViolation) return null;
  let response = result.structured;
  if (!response || typeof response !== 'object') {
    try { response = JSON.parse(result.text || ''); } catch { return null; }
  }
  if (response.outcome !== 'unresolved' || (response.claims || []).length > 0
    || (Array.isArray(response.uncertainties) && response.uncertainties.length > 0)) return null;

  const normalized = { ...response,
    uncertainties: ['The worker returned unresolved without specifying the missing evidence or reason.'] };
  const validate = new (require('ajv'))({ allErrors: true, strict: false }).compile(responseFormat.schema);
  if (!validate(normalized)) return null;
  return { ...result, text: JSON.stringify(normalized), structured: normalized, schemaViolation: undefined,
    schemaNormalization: { rule: 'unresolved_requires_explanation', preservedOutcome: true } };
}

function normalizeGenerationResult(result, mission) {
  if (!result?.schemaViolation || !isBiomeSteward(mission)) return result;
  const supplied = Array.isArray(mission.allowedEvidenceRefs) ? mission.allowedEvidenceRefs
    : (Array.isArray(mission.evidenceRefs) ? mission.evidenceRefs : []);
  const format = require('../agents/workerArtifactResponseSchema').workerArtifactResponseFormat(
    mission.workerKind || mission.role, [...new Set(['mission', ...supplied.filter((item) => typeof item === 'string' && item.trim())])],
    { diagnosis: /artifact=diagnostic_matrix/i.test(mission.prompt || ''),
      missionCriteria: mission.missionCriteria || [], handoffs: mission.handoffContext || [] });
  return normalizeUnresolvedResponse(result, format, mission) || result;
}

function recoverExhaustedAllocation(report, mission, modelOutput = '') {
  if (!isBiomeSteward(mission)) return null;
  const maxAttempts = Number(mission.recoveryMaxAttempts);
  const attempt = Number(mission.recoveryAttempt);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || !Number.isInteger(attempt) || attempt < maxAttempts) return null;
  if (report?.specialtyAssessment?.inScope === false) return null;

  const source = String(mission.prompt || mission.currentTask || '');
  const candidate = allocationWitness(source);
  if (!candidate) return null;
  const validation = require('../morphogenesisRolePrompt').validateBiomeAllocation(candidate, source, mission);
  if (!validation?.passed) return null;

  const statement = JSON.stringify(candidate);
  const specialtyAssessment = report?.specialtyAssessment || {
    niche: mission.specialtyNiche || 'biome:resource_steward', inScope: true, evidence: ['mission']
  };
  const normalized = { ...report, outcome: 'success',
    claims: [{ statement, evidence: ['mission'] }], uncertainties: [], specialtyAssessment };
  const receipt = {
    schema: 'genos.biome-allocation-recovery/v1',
    strategy: 'bounded_backtracking',
    trigger: 'recovery_budget_exhausted',
    sourceRefs: ['mission'],
    modelOutputSha256: createHash('sha256').update(String(modelOutput)).digest('hex'),
    candidate,
    candidateSha256: createHash('sha256').update(statement).digest('hex'),
    validation
  };
  normalized.morphogenesisRecoveryReceipt = receipt;
  return { report: normalized, modelReply: JSON.stringify({ outcome: 'success', claims: normalized.claims,
    uncertainties: [], specialtyAssessment }) };
}

function applyExhaustedRecovery(report, mission, modelOutput) {
  const recovery = recoverExhaustedAllocation(report, mission, modelOutput);
  if (!recovery) return report;
  return { ...recovery.report, fullText: recovery.modelReply, fullTextTruncated: false };
}

module.exports = { isBiomeSteward, normalizeUnresolvedResponse, normalizeGenerationResult,
  recoverExhaustedAllocation, applyExhaustedRecovery };
