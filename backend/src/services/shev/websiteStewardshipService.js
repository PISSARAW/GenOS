'use strict';

const { createHash } = require('node:crypto');

const SENSOR_NAMES = ['analytics', 'seo', 'geo', 'links', 'content', 'appsec'];
const VERDICTS = new Set(['stable', 'degradation', 'opportunity', 'inconclusive']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validEvidence(reading) {
  return nonEmpty(reading.verifierRef) && Array.isArray(reading.evidenceRefs)
    && reading.evidenceRefs.length > 0 && reading.evidenceRefs.length <= 20
    && reading.evidenceRefs.every((ref) => nonEmpty(ref) && ref.length <= 512);
}

function normalizeReading(reading, environment) {
  if (!reading || !SENSOR_NAMES.includes(reading.sensor) || !VERDICTS.has(reading.verdict)
    || reading.environment !== environment || !nonEmpty(reading.source)
    || !validEvidence(reading) || !Number.isFinite(Date.parse(reading.observedAt))
    || !Number.isFinite(Date.parse(reading.validUntil))) {
    throw new TypeError('Website stewardship sensor receipt is invalid.');
  }
  return { sensor: reading.sensor, verdict: reading.verdict, environment,
    source: reading.source, verifierRef: reading.verifierRef,
    observedAt: new Date(reading.observedAt).toISOString(),
    validUntil: new Date(reading.validUntil).toISOString(),
    evidenceRefs: [...new Set(reading.evidenceRefs)] };
}

function normalizeReadings(input) {
  if (!['production', 'preview'].includes(input?.environment)
    || !Array.isArray(input.readings) || input.readings.length !== SENSOR_NAMES.length) {
    throw new TypeError('Website stewardship requires the complete sensor panel.');
  }
  const readings = input.readings.map((reading) => normalizeReading(reading, input.environment));
  if (new Set(readings.map((reading) => reading.sensor)).size !== SENSOR_NAMES.length) {
    throw new TypeError('Website stewardship sensor receipts are missing or duplicated.');
  }
  return SENSOR_NAMES.map((name) => readings.find((reading) => reading.sensor === name));
}

function epistemicGap(readings, assessedAt) {
  return readings.some((reading) => reading.verdict === 'inconclusive'
    || Date.parse(reading.observedAt) > assessedAt || Date.parse(reading.validUntil) <= assessedAt);
}

function classify(readings, assessedAt) {
  if (epistemicGap(readings, assessedAt)) {
    return { action: 'NO_CHANGE', kind: 'blind_spot', epistemicStatus: 'unknown',
      reason: 'preuve-incomplete-ou-perimee' };
  }
  const appsec = readings.find((reading) => reading.sensor === 'appsec');
  if (appsec.verdict === 'degradation') {
    return { action: 'INITIATE', kind: 'risk', epistemicStatus: 'observed',
      reason: 'risque-appsec-a-investiguer' };
  }
  if (readings.some((reading) => reading.verdict === 'degradation')) {
    return { action: 'INITIATE', kind: 'degradation', epistemicStatus: 'observed',
      reason: 'derive-mesuree-a-diagnostiquer' };
  }
  if (readings.some((reading) => reading.verdict === 'opportunity')) {
    return { action: 'INITIATE', kind: 'opportunity', epistemicStatus: 'observed',
      reason: 'opportunite-a-experimenter' };
  }
  return { action: 'NO_CHANGE', kind: 'state', epistemicStatus: 'observed',
    reason: 'aucune-derive-mesuree' };
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assessWebsite(input) {
  if (!nonEmpty(input?.projectId) || !nonEmpty(input.dimension)
    || !nonEmpty(input.targetUrl) || !Number.isFinite(Date.parse(input.assessedAt))) {
    throw new TypeError('Website stewardship assessment scope is invalid.');
  }
  const assessedAt = Date.parse(input.assessedAt);
  const readings = normalizeReadings(input);
  const decision = classify(readings, assessedAt);
  const evidenceRefs = [...new Set(readings.flatMap((reading) => reading.evidenceRefs))];
  const assessment = { projectId: input.projectId, dimension: input.dimension,
    targetUrl: input.targetUrl, environment: input.environment,
    assessedAt: new Date(assessedAt).toISOString(), readings, evidenceRefs, ...decision };
  return { ...assessment, assessmentHash: hash(assessment) };
}

module.exports = { SENSOR_NAMES, assessWebsite };
