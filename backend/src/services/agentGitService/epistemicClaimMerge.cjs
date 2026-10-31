'use strict';

const crypto = require('node:crypto');
const { validateClaim, evidenceQuality } = require('../epistemic/claimTypes');

async function collectClaims(db, req, agentId) {
  const scope = req.tenant ? `AND (organization_id IS NULL OR organization_id = ?)
    AND (project_id IS NULL OR project_id = ?)` : '';
  const args = req.tenant ? [agentId, req.tenant.organizationId, req.tenant.projectId] : [agentId];
  return db.all(`SELECT * FROM epistemic_claims WHERE producer_agent_id = ? ${scope} ORDER BY id`, ...args);
}

async function collectEpistemicState(db, req, agentId) {
  const claims = await collectClaims(db, req, agentId);
  const scope = req.tenant ? 'AND organization_id = ? AND project_id = ?' : '';
  const args = req.tenant ? [agentId, req.tenant.organizationId, req.tenant.projectId] : [agentId];
  const events = await db.all(`SELECT payload_json FROM epistemic_events WHERE event_type = 'contradiction'
    AND json_extract(payload_json, '$.agentId') = ? ${scope} ORDER BY created_at, id LIMIT 1000`, ...args);
  return { claims, contradictions: events.map((row) => JSON.parse(row.payload_json)) };
}

function parseClaim(row) {
  if (!row) return null;
  try { return JSON.parse(row.claim_json); } catch (_) { return null; }
}

function calibrate(row) {
  if (!row) return null;
  const claim = parseClaim(row);
  if (!claim || !validateClaim(claim).valid) return null;
  const { confidence, ...withoutRawConfidence } = claim;
  return { ...row, claim_json: JSON.stringify(withoutRawConfidence), quality: evidenceQuality(withoutRawConfidence) };
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function compatible(left, right) {
  const a = parseClaim(left);
  const b = parseClaim(right);
  return a && b && a.subject === b.subject && a.statement === b.statement && a.type === b.type;
}

function combineEvidence(left, right) {
  const a = parseClaim(left);
  const b = parseClaim(right);
  const evidence = [...new Map([...a.evidence, ...b.evidence].map((item) => [JSON.stringify(item), item])).values()];
  return calibrate({ ...left, revision: Math.max(Number(left.revision || 0), Number(right.revision || 0)) + 1,
    claim_json: JSON.stringify({ ...a, evidence }),
    status: left.status === 'active' && right.status === 'active' ? 'active' : 'contested' });
}

function mergeClaims(ctx) {
  const base = new Map((ctx.base || []).map((row) => [row.id, row]));
  const left = new Map((ctx.left || []).map((row) => [row.id, row]));
  const right = new Map((ctx.right || []).map((row) => [row.id, row]));
  const claims = [];
  const contradictions = [];
  const conflicts = [];
  for (const id of new Set([...base.keys(), ...left.keys(), ...right.keys()])) {
    const a = left.get(id);
    const b = right.get(id);
    const aChanged = !same(base.get(id), a);
    const bChanged = !same(base.get(id), b);
    if (require('./epistemicClaimMergeValues1.cjs').mergeClaimsValue2({ a, aChanged, b, bChanged, compatible, same })) {
      contradictions.push({ id, reason: 'divergent_claim', left: a || null, right: b || null,
        leftObjectId: ctx.leftObjectId, rightObjectId: ctx.rightObjectId, status: 'unresolved' });
      continue;
    }
    const selected = require('./epistemicClaimMergeValues1.cjs').mergeClaimsValue1({ a, aChanged, b, bChanged, calibrate, combineEvidence, same });
    if (require('./epistemicClaimMergeValues1.cjs').mergeClaimsValue4({ a, b, selected })) conflicts.push({ section: 'epistemicClaims', id, reason: 'invalid_typed_evidence' });
    else if (selected) claims.push(selected);
  }
  markSubjectContradictions(claims, contradictions);
  return { claims, contradictions, conflicts };
}

function markSubjectContradictions(claims, contradictions) {
  const bySubject = new Map();
  for (const row of claims) {
    const claim = parseClaim(row);
    if (!claim?.subject) continue;
    const entries = bySubject.get(claim.subject) || [];
    entries.push({ row, statement: claim.statement });
    bySubject.set(claim.subject, entries);
  }
  for (const [subject, entries] of bySubject) {
    if (new Set(entries.map((item) => item.statement)).size < 2) continue;
    contradictions.push({ subject, reason: 'potential_subject_conflict',
      claimIds: entries.map((item) => item.row.id), status: 'unresolved' });
    for (const item of entries) item.row.status = 'contested';
  }
}

async function replaceClaims(ctx) {
  if (!Array.isArray(ctx.state.epistemicClaims)) return;
  const { db, req, targetAgentId, state } = ctx;
  const claims = state.epistemicClaims.map(calibrate);
  if (claims.some((row) => !row || row.producer_agent_id !== targetAgentId)) {
    throw new Error('Epistemic claim evidence or producer is invalid.');
  }
  for (const row of claims) {
    if (require('./epistemicClaimMergeValues1.cjs').replaceClaimsValue3({ req, get row() { return row; } })) {
      throw new Error('Epistemic claim scope mismatch.');
    }
  }
  await db.run("UPDATE epistemic_claims SET status = 'superseded' WHERE producer_agent_id = ?", targetAgentId);
  await require('./epistemicClaimMergeStages1.cjs').replaceClaimsStage1({ Error, claims, db, targetAgentId, upsertClaim });
  for (const contradiction of state.epistemicContradictions || []) {
    await recordContradiction({ db: db, req: req, contradiction: contradiction, agentId: targetAgentId });
  }
}

async function upsertClaim(db, row) {
  await db.run(`INSERT INTO epistemic_claims (id, subject, claim_json, quality, status, revision,
    organization_id, project_id, producer_agent_id, producer_run_id, producer_authority_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, claim_json = excluded.claim_json,
    quality = excluded.quality, status = excluded.status, revision = excluded.revision`,
  row.id, row.subject, row.claim_json, row.quality, row.status, row.revision,
  row.organization_id, row.project_id, row.producer_agent_id, row.producer_run_id,
  row.producer_authority_hash);
}

async function recordContradiction({ db, req, contradiction, agentId } = {}) {
  const payload = JSON.stringify({ ...contradiction, agentId });
  const fingerprint = crypto.createHash('sha256').update(payload).digest('hex');
  await db.run(`INSERT OR IGNORE INTO epistemic_events (id, event_type, payload_json,
    emitted_at, fingerprint, organization_id, project_id) VALUES (?, 'contradiction', ?, ?, ?, ?, ?)`,
  `agent-git-${fingerprint.slice(0, 32)}`, payload, new Date().toISOString(), fingerprint,
  req.tenant?.organizationId || null, req.tenant?.projectId || null);
}

module.exports = { collectClaims, collectEpistemicState, mergeClaims, calibrate, replaceClaims };
