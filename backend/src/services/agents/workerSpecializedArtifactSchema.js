'use strict';

const text = () => ({ type: 'string', minLength: 1 });
const texts = minimum => ({ type: 'array', minItems: minimum, items: text() });
function content(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: true };
}
function contentSchema(type) {
  const schemas = {
    creative_candidate: content({ candidate: { ...text(),
      description: 'Complete deliverable text or notation; decoded line breaks must be real newlines, not literal backslash-n text.' },
    assumptions: texts(1), falsificationTest: text() }),
    clinical_report: content({ caseScope: { const: 'synthetic_educational' },
      differentialConsiderations: texts(1), uncertainty: text(), safetyNote: text(),
      missingInformation: texts(0), emergencyWarningSigns: texts(0) })
  };
  return schemas[type] || null;
}
function contentInstruction(type) {
  return {
    creative_candidate: 'Put the complete deliverable only in workerArtifact.content.candidate, not a preview or duplicate artifactText. For multiline text or notation, serialize JSON once so the decoded candidate contains real newline characters. Do not emit literal backslash-n text or formatting backslashes at line ends. Include every header and section requested by the mission.',
    clinical_report: 'Keep missingInformation and emergencyWarningSigns as explicit arrays. Fill requested educational sections with general, non-diagnostic considerations; otherwise keep them empty. Never invent patient facts, diagnose, rank diagnoses or prescribe. These sections do not certify clinical correctness.'
  }[type] || '';
}
module.exports = { contentSchema, contentInstruction };
