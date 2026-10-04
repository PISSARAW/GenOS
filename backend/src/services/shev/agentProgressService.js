'use strict';

const { createHash } = require('node:crypto');
const ledger = require('../gvxDevelopmentLedger');

const HASH = /^[a-f0-9]{64}$/;

function better(caseResult) {
  if (caseResult.regression) return false;
  if (caseResult.direction === 'higher') return caseResult.candidate > caseResult.baseline;
  return caseResult.direction === 'lower' && caseResult.candidate < caseResult.baseline;
}

function validCase(caseResult, expected) {
  return expected.has(caseResult?.contextHash) && Number.isFinite(caseResult.baseline)
    && Number.isFinite(caseResult.candidate) && ['higher', 'lower'].includes(caseResult.direction)
    && typeof caseResult.regression === 'boolean'
    && Array.isArray(caseResult.evidenceRefs) && caseResult.evidenceRefs.length > 0;
}

function validWindowProof(window, receipt) {
  return HASH.test(window.artifactHash || '') && receipt?.verified === true
    && receipt.artifactHash === window.artifactHash;
}

function validHeldoutWindows(windows, training, receipts) {
  const contexts = windows.map((window) => window.contextHash);
  return contexts.length >= 2 && contexts.every((context) => HASH.test(context) && !training.has(context))
    && new Set(contexts).size === contexts.length
    && windows.every((window, index) => validWindowProof(window, receipts[index]));
}

function heldoutWindows(transfer) {
  if (!['monitored', 'consolidated'].includes(transfer?.state)
    || !Array.isArray(transfer.monitoring?.windows)
    || !Array.isArray(transfer.verifiedEvidence) || transfer.verifiedEvidence.length < 2) {
    throw new Error('SHEV GVX transfer lacks independently verified monitoring windows.');
  }
  const training = new Set([transfer.contextHash,
    ...(transfer.trialEvidence || []).map((trial) => trial.contextHash)].filter(Boolean));
  const windows = transfer.monitoring.windows;
  if (!validHeldoutWindows(windows, training, transfer.verifiedEvidence)) {
    throw new Error('SHEV GVX monitoring does not establish distinct held-out contexts.');
  }
  return windows;
}

function validAssessment(assessment, windows) {
  const expected = new Set(windows.map((window) => window.contextHash));
  return assessment && typeof assessment.verifierRef === 'string' && assessment.verifierRef.trim()
    && Array.isArray(assessment.cases) && assessment.cases.length === windows.length
    && assessment.cases.every((item) => validCase(item, expected))
    && new Set(assessment.cases.map((item) => item.contextHash)).size === expected.size;
}

async function transferContext(db, input) {
  const initiative = await db.get(`SELECT * FROM shev_initiatives
    WHERE id = ? AND project_id = ? AND kind = 'learn'`, [input.initiativeId, input.projectId]);
  if (!initiative) throw new Error('SHEV agent progress requires a learning initiative.');
  const scope = { organizationId: input.organizationId, projectId: input.projectId,
    entityId: input.entityId };
  const event = await ledger.getEvent(db, input.gvxEventId, scope);
  if (event?.type !== 'transfer_recorded') throw new Error('SHEV GVX transfer event is absent.');
  return { event, windows: heldoutWindows(event.payload.transfer) };
}

async function recordAgentProgress(db, input) {
  if (!input?.organizationId || !input.projectId || !input.entityId
    || typeof input.verify !== 'function') throw new TypeError('SHEV transfer verification is required.');
  const id = `shev_progress_${createHash('sha256').update(`${input.initiativeId}\0${input.gvxEventId}`).digest('hex')}`;
  const existing = await db.get('SELECT * FROM shev_agent_progress WHERE id = ?', [id]);
  if (existing) return { ...existing, replayed: true };
  const { event, windows } = await transferContext(db, input);
  const assessment = await input.verify({ transfer: event.payload.transfer, windows });
  const expected = new Set(windows.map((window) => window.contextHash));
  if (!validAssessment(assessment, windows)) {
    throw new Error('SHEV held-out transfer assessment is incomplete.');
  }
  const improved = assessment.cases.filter(better).length;
  const regressions = assessment.cases.filter((item) => item.regression).length;
  const result = regressions ? 'regressed' : improved === windows.length ? 'confirmed' : 'inconclusive';
  const metrics = { heldoutCount: windows.length, improvedCount: improved,
    regressions, passRate: improved / windows.length,
    contextHashes: [...expected] };
  const evidenceRefs = [...new Set(assessment.cases.flatMap((item) => item.evidenceRefs))];
  await db.run(`INSERT OR IGNORE INTO shev_agent_progress
    (id, initiative_id, gvx_event_id, entity_id, result, metrics_json, verifier_ref, evidence_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.initiativeId, input.gvxEventId,
    input.entityId, result, JSON.stringify(metrics), assessment.verifierRef,
    JSON.stringify(evidenceRefs)]);
  return db.get('SELECT * FROM shev_agent_progress WHERE id = ?', [id]);
}

module.exports = { recordAgentProgress };
