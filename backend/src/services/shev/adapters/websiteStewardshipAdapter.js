'use strict';

const { createHash } = require('node:crypto');
const { recordObservation } = require('../observationService');
const { recordProjectEffect } = require('../effectService');
const { assessWebsite } = require('../websiteStewardshipService');
const { verifyLongitudinalWebsiteEffect } = require('../websiteCandidateService');

function scopeSource(assessment) {
  const scope = `${assessment.projectId}\0${assessment.dimension}\0${assessment.targetUrl}`;
  return `website-stewardship:${createHash('sha256').update(scope).digest('hex')}`;
}

function observationOf(assessment) {
  return { id: `website_${assessment.assessmentHash}`, projectId: assessment.projectId,
    domain: 'website-stewardship', dimension: assessment.dimension,
    kind: assessment.kind, epistemicStatus: assessment.epistemicStatus,
    source: scopeSource(assessment),
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

async function recordLongitudinalWebsiteEffect(db, input) {
  const receipt = verifyLongitudinalWebsiteEffect(input);
  const latest = input.windows.at(-1);
  const { observation } = await recordWebsiteAssessment(db, latest);
  const effect = await recordProjectEffect(db, { projectId: input.candidate.projectId,
    initiativeId: input.candidate.initiativeId, postObservationId: observation.id,
    monitoringIntervalMs: input.monitoringIntervalMs,
    verify: async () => ({ result: receipt.result, verifierRef: receipt.verifierRef,
      evidenceRefs: receipt.evidenceRefs }) });
  return { receipt, observation, effect };
}

module.exports = { recordWebsiteAssessment, recordLongitudinalWebsiteEffect };
