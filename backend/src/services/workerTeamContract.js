'use strict';

function missionFields(input = {}) {
  const handoffs = input.handoffContext || [];
  return {
    handoffContext: structuredClone(handoffs),
    missionCriteria: structuredClone(criteria(input)),
    depends_on: structuredClone(input.depends_on || input.dependsOn || []),
    pipeline_stage: input.pipeline_stage ?? input.pipelineStage ?? 0,
    workerArtifactContract: input.workerArtifactContract || null,
    boundaryTestContract: input.boundaryTestContract || null,
    allowedEvidenceRefs: references(input, handoffs)
  };
}

function criteria(input) { return input.missionCriteria || input.success_criteria || input.successCriteria || []; }
function references(input, handoffs) {
  return [...new Set([...(input.allowedEvidenceRefs || []), ...handoffs.flatMap(item => item.evidenceRefs || [])])];
}

function instruction(mission) {
  if (!mission.missionCriteria?.length && !mission.handoffContext?.length) return '';
  const format = require('./workerEvidenceIdentityPrompt').workerResponseFormat(mission);
  const acceptance = mission.workerContract?.qualityElevation
    ? 'Omit acceptanceEvaluations rather than self-certifying success: the native runtime derives them from its independent signed quality review. '
    : 'Include acceptanceEvaluations for the mission criteria. ';
  return 'FINAL RESPONSE CONTRACT: Return exactly one JSON object satisfying this complete mission-specific schema. '
    + 'The earlier base artifact example is only a subset. Include all required root fields. ' + acceptance
    + 'For received handoffs, include integrationConstraints and handoffEvaluations. Keep the entire deliverable in candidate. '
    + 'For creative_candidate, workerArtifact.content must also contain assumptions and falsificationTest; '
    + 'workerArtifact.provenance must contain sourceRefs from the allowed references. Never duplicate candidate in artifactText. '
    + 'Do not invent proof or mark unverified criteria passed.\n' + JSON.stringify(format.schema);
}

function assertReport(mission, report) {
  if (!mission.missionCriteria?.length && !mission.handoffContext?.length) return;
  const format = require('./workerEvidenceIdentityPrompt').workerResponseFormat(mission);
  const validate = new (require('ajv'))({ allErrors: true, strict: false }).compile(format.schema);
  if (validate(report)) return;
  throw Object.assign(new Error('Worker report violates its mission and handoff contract.'), {
    code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
    workerArtifactDiagnostics: { violations: validate.errors }
  });
}

module.exports = { missionFields, assertReport, instruction };
