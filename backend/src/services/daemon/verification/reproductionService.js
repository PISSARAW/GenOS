'use strict';

/**
 * Reproduction Service — ADR 0034 D9.
 *
 * Ré-observe la base factuelle d'un finding : un échec de test
 * allégué s'est-il reproduit DEPUIS la création du finding ?
 * Reproduction = nouvel événement indépendant (temps distinct),
 * pas relecture du même signal. La reproduction causale complète
 * (snapshot + contrôle + intervention) est différée : elle
 * réutilisera workspaceSnapshotStore + controlledCausalExperiment.
 */

const eventLog = require('../daemonEventLog');

const REPRODUCTION_TYPES = ['TEST_FAILED', 'BUILD_FAILED'];

function scopeMatchesEvent(finding, event) {
  const payload = eventLog.parsePayload(event);
  const scopeValue = finding.scope && finding.scope.value;
  return payload.file === scopeValue || payload.scope === scopeValue;
}

async function eventsSinceCreation(db, job) {
  const createdAt = Date.parse((job.finding && job.finding.createdAt) || '') || 0;
  const windowMs = Math.max(60000, (job.now || Date.now()) - createdAt + 60000);
  const events = await eventLog.listRecentEvents(db, {
    territoryId: job.finding.territoryId,
    windowMs,
    now: job.now,
    types: REPRODUCTION_TYPES
  });
  return events.filter((event) => scopeMatchesEvent(job.finding, event) && strictlyAfter(event, createdAt));
}

function strictlyAfter(event, createdAt) {
  return (Date.parse(event.created_at || '') || 0) > createdAt;
}

function toEvidenceDraft(finding, occurrences) {
  const last = occurrences[occurrences.length - 1];
  return {
    side: 'supporting',
    evidenceType: 'replicated',
    description: `scope ${finding.scope.value} failed again after finding creation (independent occurrence)`,
    provenanceRecordId: `daemon-event:${last.id}`,
    metadata: { occurrences: occurrences.length }
  };
}

async function reproduceFinding(db, job) {
  if (!db || !job || !job.finding) return { reproduced: false, reason: 'finding-required' };
  const scope = job.finding.scope || {};
  if ((scope.type !== 'file' && scope.type !== 'test') || !scope.value) {
    return { reproduced: false, reason: 'scope-not-localizable' };
  }
  const occurrences = await eventsSinceCreation(db, job);
  if (occurrences.length === 0) return { reproduced: false, occurrences: 0 };
  return { reproduced: true, occurrences: occurrences.length, evidenceDraft: toEvidenceDraft(job.finding, occurrences) };
}

module.exports = { reproduceFinding, REPRODUCTION_TYPES };
