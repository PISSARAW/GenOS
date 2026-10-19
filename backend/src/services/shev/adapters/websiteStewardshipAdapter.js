'use strict';

const { recordObservation } = require('../observationService');
const { assessWebsite } = require('../websiteStewardshipService');

function observationOf(assessment) {
  return { id: `website_${assessment.assessmentHash}`, projectId: assessment.projectId,
    domain: 'website-stewardship', dimension: assessment.dimension,
    kind: assessment.kind, epistemicStatus: assessment.epistemicStatus,
    source: `website-stewardship:${assessment.assessmentHash}`,
    observedAt: assessment.assessedAt,
    validUntil: assessment.readings.reduce((oldest, reading) =>
      reading.validUntil < oldest ? reading.validUntil : oldest, assessment.readings[0].validUntil),
    summary: `${assessment.action}: ${assessment.reason}`,
    evidenceRefs: assessment.evidenceRefs };
}

async function recordWebsiteAssessment(db, input) {
  if (input?.environment !== 'production') {
    throw new Error('SHEV only persists production website observations; previews remain candidates.');
  }
  const assessment = assessWebsite(input);
  const observation = await recordObservation(db, observationOf(assessment));
  return { assessment, observation };
}

module.exports = { recordWebsiteAssessment };
