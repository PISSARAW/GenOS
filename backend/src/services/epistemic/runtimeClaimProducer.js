'use strict';

const crypto = require('node:crypto');
const { migrateEpistemicEvents } = require('../../db/migrations/migrateEpistemicEvents');
const { evidenceQuality } = require('./core');
const { extractEvidenceReport } = require('../agentEvidenceService');
const authority = require('./claimProducerAuthority');

function statements(event) {
  if (!['EVIDENCE_REPORT', 'AGENT_COMPLETED'].includes(event.eventType)) return [];
  const report = extractEvidenceReport(event.payload);
  if (!Array.isArray(report.claims)) return [];
  return report.claims.slice(0, 100).filter(item => item && typeof item.statement === 'string'
    && item.statement.trim().length > 0 && item.statement.length <= 16000);
}

function claimId(runId, eventId, index) {
  return `runtime_${crypto.createHash('sha256').update(JSON.stringify([runId, eventId, index]))
    .digest('hex').slice(0, 32)}`;
}

async function record(db, input) {
  const claims = statements(input.event);
  if (!claims.length || input.decision?.authorityRefusal || input.decision?.duplicate) return 0;
  if (!input.event.id || !input.decision?.run?.id) return 0;
  const runId = input.decision.run.id;
  if (input.event.payload?.executionRunId !== runId) return 0;
  const producer = await authority.resolve(db, { agentId: input.agentId, runId });
  await migrateEpistemicEvents(db);
  for (const [index, item] of claims.entries()) {
    const claim = { id: claimId(runId, input.event.id, index),
      subject: `mission:${producer.runId}`, statement: item.statement,
      type: 'belief', origin: 'SelfGenerated', verification: 'self_reported',
      producerEventId: input.event.id, evidence: [],
      reportedEvidence: item.evidence || null };
    await db.run(`INSERT OR IGNORE INTO epistemic_claims
      (id, subject, claim_json, quality, revision, producer_agent_id, producer_run_id,
       producer_authority_hash, status, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
    claim.id, claim.subject, JSON.stringify(claim), evidenceQuality(claim),
    producer.agentId, producer.runId, producer.authorityHash);
  }
  return claims.length;
}

module.exports = { record, statements, claimId };
