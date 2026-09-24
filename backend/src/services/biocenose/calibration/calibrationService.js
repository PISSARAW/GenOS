'use strict';

const { randomUUID } = require('crypto');
const calibrationStore = require('./calibrationStore');

async function recordResolution(input) {
  validateResolution(input);
  const entries = input.forecasts.map((forecast) => ({
    calibrationId: randomUUID(), communityId: input.communityId, memberId: forecast.memberId,
    domain: input.domain, eventId: input.eventId, probability: forecast.probability,
    outcome: input.outcome, brierScore: (forecast.probability - input.outcome) ** 2,
    oracleRef: input.oracleRef, actorId: input.actorId, createdAt: new Date().toISOString()
  }));
  await calibrationStore.appendBatch(input.db, entries);
  return { eventId: input.eventId, domain: input.domain, calibratedCount: entries.length };
}

async function reputation(input) {
  const records = await calibrationStore.list(input.db, input.memberId, input.domain);
  const meanBrier = records.length ? records.reduce((sum, record) => sum + record.brierScore, 0) / records.length : null;
  return {
    memberId: input.memberId, domain: input.domain, sampleCount: records.length,
    meanBrier, reputation: meanBrier === null ? null : 1 - meanBrier, calibrated: records.length > 0
  };
}

function validateResolution(input) {
  const valid = hasResolutionIdentity(input) && hasForecasts(input);
  if (!valid) throw Object.assign(new Error('A resolved binary outcome, oracle reference, domain and valid forecasts are required.'), { code: 'BIOCENOSE_CALIBRATION_INVALID' });
}

function hasResolutionIdentity(input) {
  return input && input.db && typeof input.communityId === 'string'
    && typeof input.eventId === 'string' && typeof input.domain === 'string' && input.domain.trim()
    && typeof input.oracleRef === 'string' && input.oracleRef.trim()
    && (input.outcome === 0 || input.outcome === 1);
}

function hasForecasts(input) {
  return Array.isArray(input.forecasts) && input.forecasts.length > 0
    && input.forecasts.every(validForecast);
}

function validForecast(value) {
  return value && typeof value.memberId === 'string' && value.memberId.trim()
    && Number.isFinite(value.probability) && value.probability >= 0 && value.probability <= 1;
}

module.exports = { recordResolution, reputation };
