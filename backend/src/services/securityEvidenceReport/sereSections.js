'use strict';

const {
  failure,
  text,
  optionalText,
  digest,
  isoTimestamp,
  stringList,
  optionalStringList,
  ensureUniqueIds,
  matchesScopePattern,
  targetInScope,
  canonicalValue,
  fingerprint
} = require('./serePrimitives');

function assertNoScopeConflict(inScopeTargets, outOfScopeTargets) {
  for (const allowed of inScopeTargets) {
    for (const forbidden of outOfScopeTargets) {
      if (matchesScopePattern(allowed, forbidden) || matchesScopePattern(forbidden, allowed)) {
        throw failure('SERE_MANDATE_SCOPE_CONFLICT', `Mandate target conflict: ${allowed} vs ${forbidden}`);
      }
    }
  }
}

function normalizeMandate(input) {
  if (!input || typeof input !== 'object') throw failure('SERE_MANDATE_REQUIRED');
  const scopeInput = input.scope || {};
  const inScopeTargets = stringList(scopeInput.inScopeTargets, 'SERE_MANDATE_IN_SCOPE_REQUIRED');
  if (inScopeTargets.length === 0) throw failure('SERE_MANDATE_IN_SCOPE_REQUIRED');
  const outOfScopeTargets = optionalStringList(scopeInput.outOfScopeTargets, 'SERE_MANDATE_OUT_OF_SCOPE_INVALID');
  assertNoScopeConflict(inScopeTargets, outOfScopeTargets);
  const issuedAt = isoTimestamp(input.issuedAt, 'SERE_MANDATE_ISSUED_AT_REQUIRED');
  const validUntil = isoTimestamp(input.validUntil, 'SERE_MANDATE_VALID_UNTIL_REQUIRED');
  if (Date.parse(validUntil) <= Date.parse(issuedAt)) {
    throw failure('SERE_MANDATE_WINDOW_INVALID');
  }
  const body = {
    id: text(input.id, 'SERE_MANDATE_ID_REQUIRED', 128),
    title: text(input.title, 'SERE_MANDATE_TITLE_REQUIRED', 512),
    issuer: text(input.issuer, 'SERE_MANDATE_ISSUER_REQUIRED', 256),
    issuedAt,
    validUntil,
    scope: {
      inScopeTargets,
      outOfScopeTargets,
      authorizedCategories: optionalStringList(scopeInput.authorizedCategories, 'SERE_MANDATE_CATEGORIES_INVALID'),
      rulesOfEngagement: optionalStringList(scopeInput.rulesOfEngagement, 'SERE_MANDATE_ROE_INVALID')
    }
  };
  return { ...body, mandateHash: fingerprint(body) };
}

function normalizeObservationItem(item, mandate) {
  if (!item || typeof item !== 'object') throw failure('SERE_OBSERVATION_INVALID');
  const producerId = text(item.producerId, 'SERE_OBSERVATION_PRODUCER_REQUIRED', 256);
  const verifierId = optionalText(item.verifierId, 'SERE_OBSERVATION_VERIFIER_INVALID', 256);
  const target = text(item.target, 'SERE_OBSERVATION_TARGET_REQUIRED', 512);
  const body = {
    id: text(item.id, 'SERE_OBSERVATION_ID_REQUIRED', 128),
    source: text(item.source, 'SERE_OBSERVATION_SOURCE_REQUIRED', 128).toLowerCase(),
    producerId,
    verifierId,
    independent: Boolean(verifierId && verifierId !== producerId),
    observedAt: isoTimestamp(item.observedAt, 'SERE_OBSERVATION_TIMESTAMP_REQUIRED'),
    target,
    inScope: targetInScope(target, mandate.scope),
    severity: optionalText(item.severity, 'SERE_OBSERVATION_SEVERITY_INVALID', 64)?.toLowerCase() || 'info',
    summary: text(item.summary, 'SERE_OBSERVATION_SUMMARY_REQUIRED', 2048),
    artifactRef: text(item.artifactRef, 'SERE_OBSERVATION_ARTIFACT_REF_REQUIRED', 1024),
    artifactHash: digest(item.artifactHash, 'SERE_OBSERVATION_ARTIFACT_HASH_INVALID'),
    metrics: canonicalValue(item.metrics || {})
  };
  return { ...body, observationHash: fingerprint(body) };
}

function buildSourceGroups(items) {
  const grouped = new Map();
  for (const item of items) {
    const existing = grouped.get(item.source) || [];
    existing.push(item);
    grouped.set(item.source, existing);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, entries]) => {
      const groupBody = {
        source,
        count: entries.length,
        observationIds: entries.map((entry) => entry.id),
        observationHashes: entries.map((entry) => entry.observationHash)
      };
      return { ...groupBody, observations: entries, sourceGroupHash: fingerprint(groupBody) };
    });
}

function normalizeObservations(input, mandate) {
  if (!Array.isArray(input) || input.length === 0) throw failure('SERE_OBSERVATIONS_REQUIRED');
  const items = ensureUniqueIds(
    input.map((item) => normalizeObservationItem(item, mandate)),
    'SERE_OBSERVATION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const bySource = buildSourceGroups(items);
  const body = {
    totalCount: items.length,
    sources: bySource.map((group) => group.source),
    items,
    bySource
  };
  return { ...body, sectionHash: fingerprint(body) };
}

function normalizeChronologyEvent(event, index) {
  if (!event || typeof event !== 'object') throw failure('SERE_CHRONOLOGY_EVENT_INVALID');
  const evidenceRefs = stringList(event.evidenceRefs, 'SERE_CHRONOLOGY_EVIDENCE_REQUIRED');
  if (evidenceRefs.length === 0) throw failure('SERE_CHRONOLOGY_EVIDENCE_REQUIRED');
  const sequence = Number.isInteger(event.sequence) ? event.sequence : index + 1;
  const body = {
    id: text(event.id, 'SERE_CHRONOLOGY_ID_REQUIRED', 128),
    occurredAt: isoTimestamp(event.occurredAt, 'SERE_CHRONOLOGY_TIMESTAMP_REQUIRED'),
    sequence,
    phase: text(event.phase, 'SERE_CHRONOLOGY_PHASE_REQUIRED', 128).toLowerCase(),
    kind: text(event.kind, 'SERE_CHRONOLOGY_KIND_REQUIRED', 128).toLowerCase(),
    actorId: text(event.actorId, 'SERE_CHRONOLOGY_ACTOR_REQUIRED', 256),
    summary: text(event.summary, 'SERE_CHRONOLOGY_SUMMARY_REQUIRED', 2048),
    evidenceRefs
  };
  return { ...body, eventHash: fingerprint(body) };
}

function compareChronologyEvents(left, right) {
  const timeDelta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  if (timeDelta !== 0) return timeDelta;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.id.localeCompare(right.id);
}

function groupChronologyByPhase(items) {
  const buckets = [];
  for (const item of items) {
    const current = buckets[buckets.length - 1];
    if (!current || current.phase !== item.phase) {
      buckets.push({
        phase: item.phase,
        startedAt: item.occurredAt,
        endedAt: item.occurredAt,
        eventIds: [item.id],
        events: [item]
      });
    } else {
      current.endedAt = item.occurredAt;
      current.eventIds.push(item.id);
      current.events.push(item);
    }
  }
  return buckets.map((bucket, index) => {
    const summaryBody = {
      bucketIndex: index + 1,
      phase: bucket.phase,
      startedAt: bucket.startedAt,
      endedAt: bucket.endedAt,
      eventIds: bucket.eventIds
    };
    return { ...summaryBody, events: bucket.events, bucketHash: fingerprint(summaryBody) };
  });
}

function normalizeChronology(events) {
  if (!Array.isArray(events) || events.length === 0) throw failure('SERE_CHRONOLOGY_REQUIRED');
  const items = ensureUniqueIds(
    events.map((event, index) => normalizeChronologyEvent(event, index)),
    'SERE_CHRONOLOGY_ID_DUPLICATE'
  ).sort(compareChronologyEvents);
  const buckets = groupChronologyByPhase(items);
  const body = {
    totalEvents: items.length,
    windowStart: items[0].occurredAt,
    windowEnd: items[items.length - 1].occurredAt,
    items,
    buckets
  };
  return { ...body, sectionHash: fingerprint(body) };
}

function normalizeConfirmation(entry, hypothesisId) {
  const body = {
    id: text(entry?.id, 'SERE_CONFIRMATION_ID_REQUIRED', 128),
    hypothesisId,
    observationId: text(entry?.observationId, 'SERE_CONFIRMATION_OBSERVATION_REQUIRED', 128),
    verifierId: text(entry?.verifierId, 'SERE_CONFIRMATION_VERIFIER_REQUIRED', 256),
    independent: entry?.independent === true,
    rationale: text(entry?.rationale, 'SERE_CONFIRMATION_RATIONALE_REQUIRED', 2048),
    evidenceHash: digest(entry?.evidenceHash, 'SERE_CONFIRMATION_HASH_INVALID')
  };
  return { ...body, confirmationHash: fingerprint(body) };
}

function normalizeRefutation(entry, hypothesisId) {
  const body = {
    id: text(entry?.id, 'SERE_REFUTATION_ID_REQUIRED', 128),
    hypothesisId,
    observationId: text(entry?.observationId, 'SERE_REFUTATION_OBSERVATION_REQUIRED', 128),
    verifierId: text(entry?.verifierId, 'SERE_REFUTATION_VERIFIER_REQUIRED', 256),
    independent: entry?.independent === true,
    counterexample: text(entry?.counterexample, 'SERE_REFUTATION_COUNTEREXAMPLE_REQUIRED', 2048),
    evidenceHash: digest(entry?.evidenceHash, 'SERE_REFUTATION_HASH_INVALID')
  };
  return { ...body, refutationHash: fingerprint(body) };
}

function normalizeUnknownItem(entry, defaultHypothesisId = null) {
  const body = {
    id: text(entry?.id, 'SERE_UNKNOWN_ID_REQUIRED', 128),
    hypothesisId: optionalText(entry?.hypothesisId ?? defaultHypothesisId, 'SERE_UNKNOWN_HYPOTHESIS_INVALID', 128),
    area: text(entry?.area, 'SERE_UNKNOWN_AREA_REQUIRED', 256),
    description: text(entry?.description, 'SERE_UNKNOWN_DESCRIPTION_REQUIRED', 2048),
    impact: text(entry?.impact, 'SERE_UNKNOWN_IMPACT_REQUIRED', 1024),
    mitigationRef: optionalText(entry?.mitigationRef, 'SERE_UNKNOWN_MITIGATION_INVALID', 256)
  };
  return { ...body, unknownHash: fingerprint(body) };
}

function normalizeHypothesisItem(item) {
  const id = text(item?.id, 'SERE_HYPOTHESIS_ID_REQUIRED', 128);
  const status = text(item?.status, 'SERE_HYPOTHESIS_STATUS_REQUIRED', 64).toLowerCase();
  if (!['confirmed', 'refuted', 'unknown', 'contested'].includes(status)) {
    throw failure('SERE_HYPOTHESIS_STATUS_INVALID');
  }
  const confirmations = ensureUniqueIds(
    (item.confirmations || []).map((entry) => normalizeConfirmation(entry, id)),
    'SERE_CONFIRMATION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const refutations = ensureUniqueIds(
    (item.refutations || []).map((entry) => normalizeRefutation(entry, id)),
    'SERE_REFUTATION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const unknowns = ensureUniqueIds(
    (item.unknowns || []).map((entry) => normalizeUnknownItem(entry, id)),
    'SERE_UNKNOWN_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const body = {
    id,
    statement: text(item.statement, 'SERE_HYPOTHESIS_STATEMENT_REQUIRED', 2048),
    proposedBy: text(item.proposedBy, 'SERE_HYPOTHESIS_PROPOSER_REQUIRED', 256),
    status,
    confirmations,
    refutations,
    unknowns
  };
  return { ...body, hypothesisHash: fingerprint(body) };
}

function normalizeHypotheses(input) {
  const source = Array.isArray(input) ? { items: input } : (input || {});
  if (!Array.isArray(source.items) || source.items.length === 0) {
    throw failure('SERE_HYPOTHESES_REQUIRED');
  }
  const items = ensureUniqueIds(
    source.items.map(normalizeHypothesisItem),
    'SERE_HYPOTHESIS_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const globalUnknowns = (source.unknowns || []).map((entry) => normalizeUnknownItem(entry, null));
  const confirmations = ensureUniqueIds(items.flatMap((item) => item.confirmations), 'SERE_CONFIRMATION_ID_DUPLICATE');
  const refutations = ensureUniqueIds(items.flatMap((item) => item.refutations), 'SERE_REFUTATION_ID_DUPLICATE');
  const unknowns = ensureUniqueIds(
    [...items.flatMap((item) => item.unknowns), ...globalUnknowns],
    'SERE_UNKNOWN_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const body = { items, confirmations, refutations, unknowns };
  return { ...body, sectionHash: fingerprint(body) };
}

module.exports = {
  normalizeMandate,
  normalizeObservations,
  normalizeChronology,
  normalizeHypotheses
};
