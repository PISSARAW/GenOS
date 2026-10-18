'use strict';

const { withTransaction } = require('../db');
const migration = require('../db/migrations/migratePromotionEvidenceDossiers');
const authority = require('./missionEnvelopeAuthority');
const contract = require('./promotionEvidenceContract');
const { fingerprint } = require('./stateFingerprint');

async function trustedAuthority(db, input) {
  if (!input?.runId || !input.agentId) throw contract.failure('PROMOTION_EVIDENCE_AUTHORITY_REQUIRED');
  const asserted = await authority.assertRun(db, { runId: input.runId, agentId: input.agentId });
  const saved = await authority.read(db, input.runId);
  if (!saved || saved.hash !== asserted.hash) {
    throw contract.failure('PROMOTION_EVIDENCE_AUTHORITY_CHANGED');
  }
  return saved;
}

async function verifiedReplay(db, input) {
  const row = await db.get('SELECT * FROM causal_state_replay_receipts WHERE id = ?',
    input.replayReceiptId);
  if (!row || row.run_id !== input.runId || row.status !== 'verified') {
    throw contract.failure('PROMOTION_EVIDENCE_REPLAY_REQUIRED');
  }
  const receipt = contract.parseCanonical(row.receipt_json, 'PROMOTION_EVIDENCE_REPLAY_INVALID');
  const body = { ...receipt };
  delete body.receiptHash;
  if (receipt.receiptHash !== row.receipt_hash || fingerprint(body) !== row.receipt_hash
      || receipt.promotionEligible !== false || row.authority_hash !== input.authorityHash) {
    throw contract.failure('PROMOTION_EVIDENCE_REPLAY_INVALID');
  }
  return receipt;
}

async function prepare(db, input) {
  await migration.migratePromotionEvidenceDossiers(db);
  const trusted = await trustedAuthority(db, input);
  await verifiedReplay(db, { ...input, authorityHash: trusted.hash });
  return trusted;
}

async function loadDossier(db, dossierId) {
  const row = await db.get('SELECT * FROM promotion_evidence_dossiers WHERE id = ?', dossierId);
  if (!row) throw contract.failure('PROMOTION_EVIDENCE_DOSSIER_NOT_FOUND');
  return row;
}

function assertOwned(row, input, trusted) {
  if (row.run_id !== input.runId || row.agent_id !== input.agentId) {
    throw contract.failure('PROMOTION_EVIDENCE_SCOPE_MISMATCH');
  }
  if (row.authority_hash !== trusted.hash) {
    throw contract.failure('PROMOTION_EVIDENCE_AUTHORITY_CHANGED');
  }
  if (row.status !== 'open') throw contract.failure('PROMOTION_EVIDENCE_DOSSIER_SEALED');
}

function assertClaim(row, claimId) {
  const claims = contract.parseCanonical(row.claims_json, 'PROMOTION_EVIDENCE_CLAIMS_INVALID');
  if (!claims.some((claim) => claim.id === claimId)) {
    throw contract.failure('PROMOTION_EVIDENCE_CLAIM_UNKNOWN');
  }
}

async function open(db, input) {
  const trusted = await prepare(db, input);
  const claims = contract.normalizeClaims(input.claims);
  const policy = contract.normalizePolicy(input.policy);
  const id = input.id || contract.identifier('promotion-dossier');
  await db.run(`INSERT INTO promotion_evidence_dossiers
    (id, run_id, agent_id, replay_receipt_id, claims_json, policy_json,
      authority_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
  id, input.runId, input.agentId, input.replayReceiptId, contract.canonicalJson(claims),
  contract.canonicalJson(policy), trusted.hash);
  return { schema: contract.DOSSIER_SCHEMA, id, runId: input.runId, agentId: input.agentId,
    replayReceiptId: input.replayReceiptId, claims, policy, authorityHash: trusted.hash,
    status: 'open', promotionEligible: false };
}

async function addEvidence(db, input) {
  const trusted = await trustedAuthority(db, input);
  const row = await loadDossier(db, input.dossierId);
  assertOwned(row, input, trusted);
  assertClaim(row, input.claimId);
  const independent = input.verifierId !== input.producerId && input.verifierId !== input.agentId;
  const item = contract.evidenceRecord({ ...input, id: input.id || contract.identifier('evidence'),
    independent });
  await db.run(`INSERT INTO promotion_evidence_items
    (id, dossier_id, claim_id, kind, status, source_ref, source_hash, producer_id,
      verifier_id, independent, payload_json, evidence_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.id, item.dossierId, item.claimId,
  item.kind, item.status, item.sourceRef, item.sourceHash, item.producerId, item.verifierId,
  item.independent ? 1 : 0, contract.canonicalJson(item.payload), item.evidenceHash);
  return item;
}

async function addFalsification(db, input) {
  const trusted = await trustedAuthority(db, input);
  const row = await loadDossier(db, input.dossierId);
  assertOwned(row, input, trusted);
  assertClaim(row, input.claimId);
  const independent = input.verifierId !== input.agentId;
  const attempt = contract.falsificationRecord({ ...input,
    id: input.id || contract.identifier('falsification'), independent });
  await db.run(`INSERT INTO promotion_falsification_attempts
    (id, dossier_id, claim_id, method, verifier_id, independent, outcome,
      counterexample_json, attempt_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  attempt.id, attempt.dossierId, attempt.claimId, attempt.method, attempt.verifierId,
  attempt.independent ? 1 : 0, attempt.outcome,
  contract.canonicalJson(attempt.counterexample), attempt.attemptHash);
  return attempt;
}

function evidenceFromRow(row) {
  return contract.evidenceRecord({ id: row.id, dossierId: row.dossier_id,
    claimId: row.claim_id, kind: row.kind, status: row.status, sourceRef: row.source_ref,
    sourceHash: row.source_hash, producerId: row.producer_id, verifierId: row.verifier_id,
    independent: row.independent === 1,
    payload: contract.parseCanonical(row.payload_json, 'PROMOTION_EVIDENCE_PAYLOAD_INVALID') });
}

function attemptFromRow(row) {
  return contract.falsificationRecord({ id: row.id, dossierId: row.dossier_id,
    claimId: row.claim_id, method: row.method, verifierId: row.verifier_id,
    independent: row.independent === 1, outcome: row.outcome,
    counterexample: contract.parseCanonical(row.counterexample_json,
      'PROMOTION_FALSIFICATION_PAYLOAD_INVALID') });
}

function verifyRecords(rows, options) {
  const records = [];
  const integrityIssues = [];
  for (const row of rows) {
    try {
      const record = options.parser(row);
      records.push(record);
      if (record[options.hashKey] !== row[options.storedKey]) {
        integrityIssues.push(`${row.id}:hash-mismatch`);
      }
    } catch (error) {
      integrityIssues.push(`${row.id}:${error.code || 'invalid'}`);
    }
  }
  return { records, integrityIssues };
}

async function evidenceSet(db, dossierId) {
  const rows = await db.all(`SELECT * FROM promotion_evidence_items
    WHERE dossier_id = ? ORDER BY id`, dossierId);
  return verifyRecords(rows, { parser: evidenceFromRow, hashKey: 'evidenceHash',
    storedKey: 'evidence_hash' });
}

async function attemptSet(db, dossierId) {
  const rows = await db.all(`SELECT * FROM promotion_falsification_attempts
    WHERE dossier_id = ? ORDER BY id`, dossierId);
  return verifyRecords(rows, { parser: attemptFromRow, hashKey: 'attemptHash',
    storedKey: 'attempt_hash' });
}

async function seal(db, input) {
  const trusted = await trustedAuthority(db, input);
  return withTransaction(db, async () => {
    const row = await loadDossier(db, input.dossierId);
    assertOwned(row, input, trusted);
    let replayVerified = true;
    const integrityIssues = [];
    try {
      await verifiedReplay(db, { runId: input.runId, replayReceiptId: row.replay_receipt_id,
        authorityHash: trusted.hash });
    } catch (error) {
      replayVerified = false;
      integrityIssues.push(error.code || 'PROMOTION_EVIDENCE_REPLAY_INVALID');
    }
    const evidenceResult = await evidenceSet(db, row.id);
    const attemptResult = await attemptSet(db, row.id);
    integrityIssues.push(...evidenceResult.integrityIssues, ...attemptResult.integrityIssues);
    const claims = contract.parseCanonical(row.claims_json, 'PROMOTION_EVIDENCE_CLAIMS_INVALID');
    const policy = contract.parseCanonical(row.policy_json, 'PROMOTION_EVIDENCE_POLICY_INVALID');
    const decision = contract.evaluate({ claims, policy, evidence: evidenceResult.records,
      attempts: attemptResult.records, replayVerified, integrityIssues });
    const receipt = contract.decisionReceipt({ id: contract.identifier('promotion-decision'),
      dossierId: row.id, runId: row.run_id, agentId: row.agent_id,
      replayReceiptId: row.replay_receipt_id, authorityHash: row.authority_hash, claims,
      evidence: evidenceResult.records, attempts: attemptResult.records, decision });
    const result = await db.run(`UPDATE promotion_evidence_dossiers SET status = 'sealed',
      disposition = ?, decision_receipt_json = ?, decision_receipt_hash = ?,
      sealed_at = datetime('now') WHERE id = ? AND status = 'open'`, decision.disposition,
    contract.canonicalJson(receipt), receipt.receiptHash, row.id);
    if (result.changes !== 1) throw contract.failure('PROMOTION_EVIDENCE_DOSSIER_SEALED');
    return receipt;
  });
}

async function readDecision(db, dossierId) {
  const row = await loadDossier(db, dossierId);
  if (row.status !== 'sealed' || !row.decision_receipt_json) {
    throw contract.failure('PROMOTION_EVIDENCE_DECISION_REQUIRED');
  }
  const receipt = contract.parseCanonical(row.decision_receipt_json,
    'PROMOTION_EVIDENCE_DECISION_INVALID');
  const body = { ...receipt };
  delete body.receiptHash;
  if (receipt.receiptHash !== row.decision_receipt_hash
      || fingerprint(body) !== row.decision_receipt_hash
      || receipt.disposition !== row.disposition || receipt.authorizesPromotion !== false) {
    throw contract.failure('PROMOTION_EVIDENCE_DECISION_INVALID');
  }
  return receipt;
}

function expectedStatements(claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    throw contract.failure('PROMOTION_EVIDENCE_EXPECTED_CLAIMS_REQUIRED');
  }
  const statements = claims.map((claim) => typeof claim === 'string' ? claim : claim?.statement)
    .filter((statement) => typeof statement === 'string' && statement.trim())
    .map((statement) => statement.trim());
  if (!statements.length) throw contract.failure('PROMOTION_EVIDENCE_EXPECTED_CLAIMS_REQUIRED');
  return new Set(statements);
}

async function assertClaimBinding(db, input, receipt) {
  const row = await loadDossier(db, input.dossierId);
  const claims = contract.parseCanonical(row.claims_json, 'PROMOTION_EVIDENCE_CLAIMS_INVALID');
  if (fingerprint(claims) !== receipt.claimsHash) {
    throw contract.failure('PROMOTION_EVIDENCE_DECISION_INVALID');
  }
  const actual = new Set(claims.map((claim) => claim.statement));
  const missing = [...expectedStatements(input.expectedClaims)]
    .filter((statement) => !actual.has(statement));
  if (missing.length) throw contract.failure('PROMOTION_EVIDENCE_CLAIMS_MISMATCH');
}

async function assertRequired(db, input) {
  if (input.contract?.promotion?.require_evidence_dossier_v2 !== true) return null;
  if (!input.dossierId) throw contract.failure('PROMOTION_EVIDENCE_DOSSIER_REQUIRED');
  const trusted = await trustedAuthority(db, input);
  const receipt = await readDecision(db, input.dossierId);
  if (receipt.runId !== input.runId || receipt.agentId !== input.agentId
      || receipt.authorityHash !== trusted.hash) {
    throw contract.failure('PROMOTION_EVIDENCE_SCOPE_MISMATCH');
  }
  await assertClaimBinding(db, input, receipt);
  if (receipt.disposition !== 'promote' || receipt.promotionEligible !== true) {
    const error = contract.failure(`PROMOTION_EVIDENCE_${receipt.disposition.toUpperCase()}`);
    error.receipt = receipt;
    throw error;
  }
  return receipt;
}

module.exports = { open, addEvidence, addFalsification, seal, readDecision, assertRequired };
