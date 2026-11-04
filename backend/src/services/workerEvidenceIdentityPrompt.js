'use strict';

function missionEvidenceRefs(mission) {
  const supplied = mission.allowedEvidenceRefs || mission.evidenceRefs || [];
  return [...new Set(['mission', ...supplied].filter((item) => typeof item === 'string' && item.trim()))];
}
function workerResponseFormat(mission) {
  const method = mission.workerContract?.mission?.methodContract || mission.methodContract;
  const format = require('./agents/daemonObservationContract').responseFormat(mission.workerContract)
    || require('./agents/workerArtifactResponseSchema').workerArtifactResponseFormat(mission.workerKind || mission.role,
      missionEvidenceRefs(mission), {nativeQuality: Boolean(mission.workerContract?.qualityElevation),
        diagnosis: /artifact=diagnostic_matrix/i.test(mission.prompt || ''), missionCriteria: mission.missionCriteria || [],
        handoffs: mission.handoffContext || [], identityExperimentScenario: mission.identityExperimentScenario,
        specialtyNiche: mission.specialtyNiche, requiredEvidence: method?.requiredEvidence});
  return require('./functionInduction/responseSchema').bind(format, method);
}
function sourceReferenceInstruction(mission) {
  const refs = missionEvidenceRefs(mission);
  const observation = require('./agents/daemonObservationContract').evidenceInstruction(mission.workerContract);
  if (observation) return `Use only these exact evidence references: ${JSON.stringify(refs)}. ${observation}`;
  const sourceDescriptions = [];
  if (refs.includes('worker_self')) sourceDescriptions.push('"worker_self" is the canonical WorkerSelf block shown in this prompt');
  if (refs.includes('identity_sheet')) sourceDescriptions.push('"identity_sheet" is the minimal identity sheet shown in this prompt');
  const description = sourceDescriptions.length ? ` Source meanings: ${sourceDescriptions.join('; ')}.` : '';
  return `Use only these exact evidence references: ${JSON.stringify(refs)}.${description} `
    + 'Never invent source IDs, receipts, measurements, file changes, tests, or completed steps. '
    + 'If these references cannot substantiate the requested outcome, return outcome "unresolved".';
}
module.exports = { missionEvidenceRefs, workerResponseFormat, sourceReferenceInstruction };
