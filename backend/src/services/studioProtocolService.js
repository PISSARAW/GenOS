'use strict';
const { randomUUID, createHash } = require('crypto');
const { withTransaction } = require('../db');
const { createScientificEvidenceLedger } = require('./scientificEvidenceLedger');

function invalid(message) {
  return Object.assign(new Error(message), { code: 'STUDIO_PROTOCOL_INVALID', status: 400 });
}

function validate(input) {
  if (!String(input.title || '').trim()) throw invalid('Titre requis.');
  if (!Number.isSafeInteger(input.seed)) throw invalid('Seed entier explicite requis.');
  if (!input.protocol?.question || !input.protocol?.falsification) throw invalid('Question et critère de falsification requis.');
  if (!input.inputs || typeof input.inputs !== 'object' || Array.isArray(input.inputs)) throw invalid('Entrées JSON objet requises.');
  validateBudget(input.budget);
  if (!['L1', 'L2', 'L3', 'L4', 'L5'].includes(input.proofLevel || 'L1')) throw invalid('Niveau persistant L1–L5 requis.');
  if (Buffer.byteLength(JSON.stringify(input)) > 262144) throw invalid('Protocole limité à 256 Kio.');
}

function validateBudget(budget) {
  for (const key of ['tokens', 'costUsd', 'durationMs', 'maxTrials']) {
    if (!Number.isFinite(budget?.[key]) || budget[key] < 0) throw invalid('Budget explicite non négatif requis : ' + key);
  }
  if (!Number.isSafeInteger(budget.maxTrials) || budget.maxTrials < 1) throw invalid('maxTrials entier positif requis.');
  if (budget.durationMs < 1) throw invalid('Durée maximale positive requise.');
}

async function workspace(db, options) {
  const found = await db.get('SELECT id FROM workspaces WHERE id=? AND organization_id=? AND project_id=?',
    options.workspaceId, options.organizationId, options.projectId);
  if (!found) throw Object.assign(new Error('Workspace introuvable dans ce projet.'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
  return found.id;
}

async function register(db, input) {
  validate(input);
  const workspaceId = await workspace(db, input);
  const experimentId = 'exp-' + randomUUID();
  const protocol = { ...input.protocol, seed: input.seed, budget: input.budget, inputs: input.inputs,
    inputsHash: createHash('sha256').update(JSON.stringify(input.inputs)).digest('hex'),
    budgetEnforcement: 'declaration_only', replaySource: input.replaySource || null };
  await withTransaction(db, async tx => {
    await tx.run("INSERT INTO experiments (id,workspace_id,title,experiment_type,status,chaos_level,color,results_summary) VALUES (?,?,?,'scientific_experiment','Setup',0,'#0969da',?)",
      experimentId, workspaceId, input.title, 'Protocole enregistré. Aucun essai exécuté ni succès démontré.');
    await createScientificEvidenceLedger(tx).createExperiment({ experimentId, title: input.title,
      proofLevel: input.proofLevel || 'L1', protocol, environment: input.environment || {},
      topologyRefs: input.topologyRefs || [], createdBy: input.actor });
  });
  return { experimentId, status: 'registered', protocol, executionStarted: false, promotionEligible: false };
}

async function replay(db, input) {
  const source = await db.get(`SELECT e.* FROM experiments e JOIN workspaces w ON w.id=e.workspace_id
    WHERE e.id=? AND w.organization_id=? AND w.project_id=?`, input.experimentId, input.organizationId, input.projectId);
  if (!source) throw Object.assign(new Error('Expérience introuvable.'), { code: 'EXPERIMENT_NOT_FOUND', status: 404 });
  const ledger = await createScientificEvidenceLedger(db).inspectExperiment({ experimentId: source.id });
  return register(db, { ...input, workspaceId: source.workspace_id, title: source.title + ' — rejeu des entrées',
    protocol: ledger.protocol, seed: ledger.protocol.seed, budget: ledger.protocol.budget, inputs: ledger.protocol.inputs,
    proofLevel: ledger.proofLevel, environment: ledger.environment, topologyRefs: ledger.topologyRefs,
    replaySource: { experimentId: source.id, inputsHash: ledger.protocol.inputsHash } });
}

module.exports = { register, replay };
