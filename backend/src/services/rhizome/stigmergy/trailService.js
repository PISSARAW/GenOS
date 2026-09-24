'use strict';

const { normalizeTrail } = require('../contracts/trailContract');
const decayService = require('./trailDecayService');
const trailTrustService = require('../security/trailTrustService');

function trailMetadata(marker, options, matrix) {
  const kind = options.kind || 'CAPABILITY_FOUND';
  const confidence = options.confidence === undefined ? 0.5 : options.confidence;
  return normalizeTrail({
    trailId: options.trailId || `${kind}:${marker}`,
    locus: options.locus || marker,
    kind,
    capability: options.capability,
    source: options.source || 'system',
    evidenceRefs: options.evidenceRefs || [],
    supporters: options.supporters || [],
    trustWeight: options.trustWeight,
    intensity: 0,
    confidence,
    createdAt: new Date(Number.isFinite(options.now) ? options.now : Date.now()).toISOString(),
    halfLifeMs: options.halfLifeMs || decayService.halfLifeMs({ kind, confidence }, matrix.halfLifeMs),
    scope: options.scope
  });
}

function deposit(matrix, marker, options = {}) {
  const current = matrix.trails.get(marker);
  const trust = options.identityContext
    ? trailTrustService.contribution({
      current, identityContext: options.identityContext, amount: options.amount,
      confidence: options.confidence, isRepellent: options.isRepellent === true,
      trustedDigests: options.trustedIdentityDigests
    })
    : { amount: options.amount, supporters: current?.supporters || [], trustWeight: current?.trustWeight ?? 1 };
  const metadata = trailMetadata(marker, { ...options, supporters: trust.supporters, trustWeight: trust.trustWeight }, matrix);
  const entry = matrix.depositTrace(marker, trust.amount, options.isRepellent === true);
  const typed = {
    ...entry,
    ...metadata,
    intensity: entry.intensity,
    lastUpdatedMs: Number.isFinite(options.now) ? options.now : entry.lastUpdatedMs
  };
  matrix.trails.set(marker, typed);
  return typed;
}

function intensity(matrix, marker, now) {
  const entry = matrix.trails.get(marker);
  return entry ? decayService.decay(entry, now, matrix.halfLifeMs) : 0;
}

module.exports = { deposit, intensity, evaporate: decayService.evaporate };
