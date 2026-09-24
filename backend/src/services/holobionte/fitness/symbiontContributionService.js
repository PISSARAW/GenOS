'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const immunePlane = require('../immune/holobiontImmunePlane');

function contributionError(message, code = 'HOLOBIONT_CONTRIBUTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function score(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw contributionError(`${field} must be between 0 and 1.`);
  return number;
}

function count(value, field) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number < 0) throw contributionError(`${field} must be a non-negative integer.`);
  return number;
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw contributionError(`${field} is required.`);
  return normalized;
}

function costMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contributionError('resourcesConsumed must be an object.');
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw contributionError('Resource consumption must be non-negative.');
    result[text(key, 'resource name')] = amount;
  }
  return result;
}

function validateVerification(input, contract) {
  const verification = input.verification;
  if (!verification || verification.status !== 'VERIFIED') {
    throw contributionError('A verified result attestation is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  const evidenceRefs = Array.isArray(verification.evidenceRefs)
    ? verification.evidenceRefs.map((item) => text(item, 'evidence reference')) : [];
  if (!evidenceRefs.length) throw contributionError('Verified evidence references are required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  const required = contract.evidenceRequirements;
  if (!required.every((item) => evidenceRefs.some((reference) => reference.includes(item)))) {
    throw contributionError('The attestation does not cover all contract evidence requirements.', 'HOLOBIONT_EVIDENCE_INCOMPLETE');
  }
  return {
    verifierId: text(verification.verifierId, 'verifierId'),
    resultHash: text(verification.resultHash, 'resultHash'), evidenceRefs
  };
}

async function contributionContext(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw contributionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw contributionError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  if (!session.residentSymbionts.some((item) => item.id === input.symbiontId && item.status === 'RESIDENT')) {
    throw contributionError('Only a resident symbiont can submit a contribution.', 'HOLOBIONT_SYMBIONT_NOT_RESIDENT');
  }
  const contract = await contracts.getContract(db, input.holobiontId, input.symbiontId);
  if (!contract || contract.status !== 'ACTIVE') throw contributionError('An active contract is required.', 'HOLOBIONT_CONTRACT_REQUIRED');
  if (!contract.capabilitiesOffered.includes(input.capability)) {
    throw contributionError('The contribution capability is outside the contract.', 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE');
  }
  return { session, contract };
}

function contributionRecord(input, context) {
  const evidence = validateVerification(input, context.contract);
  const benefitScore = score(input.benefitScore, 'benefitScore');
  const evidenceQuality = score(input.evidenceQuality, 'evidenceQuality');
  const contributionScore = Math.round(benefitScore * evidenceQuality * 10000) / 10000;
  return {
    ledgerId: randomUUID(), receiptId: text(input.receiptId, 'receiptId'),
    holobiontId: context.session.holobiontId, contractId: context.contract.contractId,
    contractRevision: context.contract.revision, symbiontId: input.symbiontId,
    capability: input.capability, benefitScore, contributionScore,
    costScore: score(input.costScore, 'costScore'), riskScore: score(input.riskScore, 'riskScore'),
    resourcesConsumed: costMap(input.resourcesConsumed), evidenceRefs: evidence.evidenceRefs,
    verifierId: evidence.verifierId, resultHash: evidence.resultHash,
    hostInterventions: count(input.hostInterventions, 'hostInterventions'),
    failures: count(input.failures, 'failures'), falseAlerts: count(input.falseAlerts, 'falseAlerts')
  };
}

async function recordContribution(db, input = {}) {
  const context = await contributionContext(db, input);
  const record = contributionRecord(input, context);
  const immuneReview = await immunePlane.reviewSymbiontOutput({
    symbiontId: record.symbiontId, resultHash: record.resultHash,
    evidenceRefs: record.evidenceRefs, verifierId: record.verifierId,
    claim: `Verified ${record.capability} contribution with score ${record.contributionScore}`,
    riskScore: record.riskScore, selfVerified: input.selfVerified === true
  });
  record.immuneReview = immuneReview;
  if (!immuneReview.allowed) {
    const revision = await store.appendEvent(db, {
      holobiontId: context.session.holobiontId, eventType: 'IMMUNE_REJECTION',
      expectedRevision: context.session.revision, actorId: record.verifierId,
      payload: { symbiontId: record.symbiontId, receiptId: record.receiptId, immuneReview }
    });
    return { accepted: false, reason: 'AEIS_IMMUNE_REJECTION', immuneReview, sessionRevision: revision };
  }
  await withTransaction(db, async (tx) => {
    await store.appendEvent(tx, {
      holobiontId: context.session.holobiontId,
      eventType: 'CONTRIBUTION_VERIFIED', expectedRevision: context.session.revision,
      actorId: record.verifierId,
      payload: { ...record, contributionScore: record.contributionScore }
    });
    await tx.run(`INSERT INTO holobiont_symbiosis_ledger
      (ledger_id, receipt_id, holobiont_id, contract_id, contract_revision, symbiont_id,
       capability, benefit_score, contribution_score, cost_score, risk_score,
       resources_used_json, evidence_refs_json, verifier_id, result_hash, immune_review_json,
       host_interventions, failures, false_alerts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.ledgerId, record.receiptId, record.holobiontId, record.contractId,
    record.contractRevision, record.symbiontId, record.capability, record.benefitScore,
    record.contributionScore, record.costScore, record.riskScore,
    JSON.stringify(record.resourcesConsumed), JSON.stringify(record.evidenceRefs),
    record.verifierId, record.resultHash, JSON.stringify(record.immuneReview),
    record.hostInterventions, record.failures, record.falseAlerts);
  });
  return record;
}

async function relationshipLedger(db, holobiontId, symbiontId) {
  const rows = await db.all(`SELECT * FROM holobiont_symbiosis_ledger
    WHERE holobiont_id = ? AND symbiont_id = ? ORDER BY created_at, ledger_id`, holobiontId, symbiontId);
  return rows.map((row) => ({
    ledgerId: row.ledger_id, receiptId: row.receipt_id, capability: row.capability,
    benefitScore: row.benefit_score, contributionScore: row.contribution_score,
    costScore: row.cost_score, riskScore: row.risk_score,
    resourcesConsumed: JSON.parse(row.resources_used_json), evidenceRefs: JSON.parse(row.evidence_refs_json),
    verifierId: row.verifier_id, resultHash: row.result_hash,
    immuneReview: JSON.parse(row.immune_review_json), hostInterventions: row.host_interventions,
    failures: row.failures, falseAlerts: row.false_alerts, createdAt: row.created_at
  }));
}

function mean(records, field) {
  return records.reduce((sum, item) => sum + item[field], 0) / records.length;
}

function classifyRelationship(benefit, cost, risk) {
  if (risk >= 0.8) return 'HARMFUL';
  if (benefit >= 0.7 && cost <= 0.3) return 'MUTUALISTIC';
  if (benefit > 0 && cost <= benefit) return 'COMMENSAL';
  if (benefit === 0 && cost === 0) return 'NEUTRAL';
  return risk >= 0.5 ? 'PATHOBIOTIC' : 'BURDENSOME';
}

function relationshipFitness(records) {
  if (!Array.isArray(records) || records.length === 0) return { classification: 'NEUTRAL', count: 0 };
  const benefit = mean(records, 'benefitScore');
  const cost = mean(records, 'costScore');
  const risk = mean(records, 'riskScore');
  return {
    classification: classifyRelationship(benefit, cost, risk), count: records.length, benefit, cost, risk,
    meanContribution: mean(records, 'contributionScore'),
    hostInterventions: records.reduce((sum, item) => sum + item.hostInterventions, 0),
    failures: records.reduce((sum, item) => sum + item.failures, 0),
    falseAlerts: records.reduce((sum, item) => sum + item.falseAlerts, 0)
  };
}

module.exports = { recordContribution, relationshipLedger, relationshipFitness };
