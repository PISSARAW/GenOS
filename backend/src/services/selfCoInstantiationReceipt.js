'use strict';

/**
 * Self Co-Instantiation Receipt — preuve de co-instantiation causale.
 *
 * À chaque décision importante, le système enregistre un reçu qui atteste
 * que l'état du soi était causalement couplé à l'action sélectionnée.
 *
 * Référence : AAAI 2026 — "Time, Identity and Consciousness in Language Model Agents"
 * (Perrier & Bennett) : distingue "talks like a stable self" de "organized like one"
 * via la co-instantiation à un objectif-pas-objectif.
 *
 * Le reçu contient :
 *   - identity_version : version de l'identité au moment de la décision
 *   - genome_version : version du génome
 *   - self_model_version : version du soi calibré
 *   - active_self_constraints : contraintes actives du soi au moment T
 *   - autobiographical_lessons_used : leçons mobilisées
 *   - lineage_constraints : contraintes héritées de la lignée
 *   - result : résultat de la décision
 *
 * Métrique clé : SelfActionCausalCoupling = P(action|self_state) - P(action|self_state_ablated)
 * Si ~0, le soi est décoratif. Si >0, le soi est fonctionnellement causal.
 */

const crypto = require('crypto');
const { extractActiveConstraints } = require('./agentSelfService');

const RECEIPT_TABLE = 'self_co_instantiation_receipts';

function receiptId() {
  return `receipt-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

async function ensureReceiptTable(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE} (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    receipt_type TEXT NOT NULL,
    identity_version TEXT,
    genome_version TEXT,
    self_model_version TEXT,
    active_constraints_json TEXT NOT NULL DEFAULT '{}',
    autobiographical_lessons_json TEXT NOT NULL DEFAULT '[]',
    lineage_constraints_json TEXT NOT NULL DEFAULT '{}',
    decision_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '{}',
    coupling_evidence_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(active_constraints_json)),
    CHECK (json_valid(autobiographical_lessons_json)),
    CHECK (json_valid(lineage_constraints_json)),
    CHECK (json_valid(decision_json)),
    CHECK (json_valid(result_json)),
    CHECK (json_valid(coupling_evidence_json))
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_receipt_agent ON ${RECEIPT_TABLE}(agent_id, created_at)`);
}

/**
 * Émet un reçu de co-instantiation pour une décision.
 *
 * @param {object} db
 * @param {object} params
 * @param {string} params.agentId
 * @param {object} params.agentSelf — l'état complet du soi (AgentSelf)
 * @param {object} params.decision — la décision prise
 * @param {object} params.result — le résultat observé
 * @param {object} [params.couplingEvidence] — preuves de couplage causale
 */
function validateEmitParams(params) {
  const { agentId, agentSelf } = params;
  if (!agentId || !agentSelf) {
    throw new Error('emitReceipt requires agentId and agentSelf');
  }
}

async function emitReceipt(db, params) {
  await ensureReceiptTable(db);

  validateEmitParams(params);
  const { agentId, agentSelf, decision, result, couplingEvidence = {} } = params;

  const activeConstraints = extractActiveConstraints(agentSelf);
  const lessons = agentSelf.autobiographical?.lessons || [];
  const lineageConstraints = {
    parentIds: agentSelf.identity?.parents || [],
    generation: agentSelf.identity?.generation || 0,
    inheritedTraits: agentSelf.identity?.inheritedTraits || []
  };

  const receipt = {
    id: receiptId(),
    agent_id: agentId,
    receipt_type: params.receiptType || 'decision',
    identity_version: agentSelf.identity?.id || null,
    genome_version: agentSelf.identity?.lineageId || null,
    self_model_version: agentSelf.version,
    active_constraints_json: JSON.stringify(activeConstraints),
    autobiographical_lessons_json: JSON.stringify(lessons.map(l => l.id)),
    lineage_constraints_json: JSON.stringify(lineageConstraints),
    decision_json: JSON.stringify(decision || {}),
    result_json: JSON.stringify(result || {}),
    coupling_evidence_json: JSON.stringify(couplingEvidence),
    created_at: new Date().toISOString()
  };

  await db.run(
    `INSERT INTO ${RECEIPT_TABLE}
      (id, agent_id, receipt_type, identity_version, genome_version, self_model_version,
       active_constraints_json, autobiographical_lessons_json, lineage_constraints_json,
       decision_json, result_json, coupling_evidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    receipt.id, receipt.agent_id, receipt.receipt_type, receipt.identity_version,
    receipt.genome_version, receipt.self_model_version, receipt.active_constraints_json,
    receipt.autobiographical_lessons_json, receipt.lineage_constraints_json,
    receipt.decision_json, receipt.result_json, receipt.coupling_evidence_json, receipt.created_at
  );

  return receipt;
}

/**
 * Récupère l'historique des reçus de co-instantiation pour un agent.
 */
async function getReceipts(db, agentId, options = {}) {
  await ensureReceiptTable(db);
  const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || 50)));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const rows = await db.all(
    `SELECT * FROM ${RECEIPT_TABLE} WHERE agent_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    agentId, limit, offset
  );
  return rows.map(deserializeReceipt);
}

/**
 * Calcule le couplage causal entre le soi et l'action.
 *
 * SelfActionCausalCoupling = P(action|self_state) - P(action|self_state_ablated)
 *
 * @returns {object} { couplingScore, selfStateHash, ablatedStateHash, confidence }
 */
function computeCoupling(agentSelf, decision, ablatedDecision = null) {
  const selfStateHash = hashSelfState(agentSelf);
  const activeConstraints = extractActiveConstraints(agentSelf);

  // Si la décision diffère de la décision ablation, le couplage est fort
  const couplingScore = ablatedDecision
    ? computeDecisionDelta(decision, ablatedDecision)
    : estimateConstraintInfluence(activeConstraints, decision);

  return {
    couplingScore,
    selfStateHash,
    ablatedStateHash: ablatedDecision ? hashSelfState({ ...agentSelf, regulatory: { ...agentSelf.regulatory, confidence: 0.5, uncertainty: 0.5 } }) : null,
    constraintsUsed: Object.keys(activeConstraints).filter(k => activeConstraints[k] !== null && activeConstraints[k] !== undefined),
    lessonCount: agentSelf.autobiographical?.lessons?.length || 0,
    confidence: agentSelf.operational?.competence?.confidence ?? 0.5
  };
}

function deserializeReceipt(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    receiptType: row.receipt_type,
    identityVersion: row.identity_version,
    genomeVersion: row.genome_version,
    selfModelVersion: row.self_model_version,
    activeConstraints: JSON.parse(row.active_constraints_json || '{}'),
    autobiographicalLessons: JSON.parse(row.autobiographical_lessons_json || '[]'),
    lineageConstraints: JSON.parse(row.lineage_constraints_json || '{}'),
    decision: JSON.parse(row.decision_json || '{}'),
    result: JSON.parse(row.result_json || '{}'),
    couplingEvidence: JSON.parse(row.coupling_evidence_json || '{}'),
    createdAt: row.created_at
  };
}

function hashSelfState(agentSelf) {
  const canonical = {
    id: agentSelf.identity?.id,
    confidence: agentSelf.operational?.competence?.confidence,
    energy: agentSelf.regulatory?.energy,
    dissonance: agentSelf.regulatory?.dissonance,
    uncertainty: agentSelf.regulatory?.uncertainty
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

function computeDecisionDelta(decision, ablatedDecision) {
  const dStr = JSON.stringify(decision);
  const aStr = JSON.stringify(ablatedDecision);
  return dStr === aStr ? 0.0 : 1.0;
}

function estimateConstraintInfluence(constraints, decision) {
  let influence = 0;
  const constraintKeys = Object.keys(constraints);
  if (constraintKeys.length === 0) return 0;

  // Heuristique : si une contrainte du soi correspond à un champ de la décision,
  // c'est une preuve de couplage
  for (const key of constraintKeys) {
    if (decision && decision[key] !== undefined) influence += 1;
    if (decision && decision.constraints && decision.constraints[key] !== undefined) influence += 1;
  }
  return Math.min(1.0, influence / constraintKeys.length);
}

/**
 * Génère un résumé lisible d'un reçu pour le prompt de l'agent.
 */
function formatReceiptPrompt(receipt) {
  return [
    `[CO-INSTANTIATION RECEIPT]`,
    `- Type : ${receipt.receiptType || 'decision'}`,
    `- Constraints actives : ${Object.keys(receipt.activeConstraints || {}).join(', ')}`,
    `- Leçons mobilisées : ${(receipt.autobiographicalLessons || []).length}`,
    `- Couplage causal : ${(receipt.couplingEvidence?.couplingScore ?? 0).toFixed(2)}`,
  ].join('\n');
}

module.exports = {
  emitReceipt,
  getReceipts,
  computeCoupling,
  formatReceiptPrompt,
  ensureReceiptTable,
  RECEIPT_TABLE
};
