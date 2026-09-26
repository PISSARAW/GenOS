'use strict';

/**
 * Rollout contrefactuel action-conditionné (protocole VTE de Redish).
 *
 * Au point de choix on suspend : 2-4 actions candidates deviennent des
 * branches prédites (worldModel.predictTransition chacune). À la barrière,
 * scoreBranches effondre : score = succès ? 0.5 + 0.5×(1-surprise) : 0
 * (responsabilité MOSAIC : la branche dont le modèle prédisait juste gagne
 * en fiabilité). Sélection inchangée (avis seulement) ; perdants préservés
 * avec motif (preserve_rejected_branches). Outcome par statut agents DB,
 * repli dossier défensif documenté comme heuristique.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'counterfactual_rollout';
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 4;
const MAX_ROLLOUTS = 10;

function validCandidates(candidates) {
  if (!Array.isArray(candidates)) return false;
  if (candidates.length < MIN_CANDIDATES || candidates.length > MAX_CANDIDATES) return false;
  const actions = candidates.map((candidate) => candidate && String(candidate.action || '').trim());
  if (actions.some((action) => !action)) return false;
  return new Set(actions).size === actions.length;
}

function branchOf(candidate, index) {
  return {
    branchId: String(candidate.branchId || `branch_${index + 1}`),
    actionId: candidate.actionId ? String(candidate.actionId) : null,
    action: String(candidate.action).trim().slice(0, 120),
    hypothesis: typeof candidate.hypothesis === 'string' ? candidate.hypothesis.slice(0, 200) : null,
    tagged: false
  };
}

async function tagBranch(db, orchestratorId, branch) {
  try {
    const worldModel = require('./worldModelService');
    await worldModel.predictTransition(db || null, orchestratorId, {
      actionId: branch.actionId || branch.branchId,
      action: branch.action
    });
    branch.tagged = true;
  } catch (_) {}
  return branch;
}

async function persistRollout(db, rollout) {
  if (!db || !rollout.key) return;
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject(SCOPE, rollout.key)) || {};
  const rollouts = Array.isArray(stored.rollouts) ? stored.rollouts : [];
  await store.persistObject(SCOPE, rollout.key, {
    rollouts: [...rollouts, rollout.record].slice(-MAX_ROLLOUTS)
  }, rollouts.length + 1);
}

async function planRollout(input) {
  const options = input || {};
  if (!options.orchestratorId || !validCandidates(options.candidates)) {
    throw new Error('planRollout requires orchestratorId and 2-4 candidates with distinct actions');
  }
  const branches = [];
  for (let index = 0; index < options.candidates.length; index++) {
    branches.push(await tagBranch(options.db || null, options.orchestratorId, branchOf(options.candidates[index], index)));
  }
  const rolloutId = `rollout_${Date.now()}_${branches.length}`;
  try {
    await persistRollout(options.db || null, {
      key: String(options.missionId || options.orchestratorId),
      record: { rolloutId, missionId: options.missionId || null, branches, status: 'suspended', createdAt: new Date().toISOString() }
    });
  } catch (_) {}
  return { rolloutId, missionId: options.missionId || null, branches, suspended: true };
}

function dossierOutcome(dossier) {
  const events = dossier && Array.isArray(dossier.events) ? dossier.events : [];
  for (const event of events) {
    const payload = event.payload || {};
    const outcome = payload.evidenceReport?.outcome || payload.report?.outcome || payload.outcome;
    if (outcome === 'success' || outcome === 'failed') return outcome;
  }
  for (const event of events) {
    if (event.eventType === 'AGENT_COMPLETED') return 'success';
    if (event.eventType === 'AGENT_FAILED' || event.eventType === 'WORKER_TASK_FAILED' || event.eventType === 'AGENT_RUNTIME_ERROR') return 'failed';
  }
  return 'unknown';
}

async function branchStatus(db, workerId, dossier) {
  if (db && workerId) {
    try {
      const row = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
      const status = String(row?.status || '').toLowerCase();
      if (status === 'completed') return 'success';
      if (['failed', 'error', 'terminated', 'apoptosis', 'quarantined', 'unverified', 'blocked'].includes(status)) return 'failed';
    } catch (_) {}
  }
  return dossierOutcome(dossier);
}

function pairDossier(dossiers, worker, index) {
  const list = Array.isArray(dossiers) ? dossiers : [];
  return list.find((dossier) => dossier && (dossier.workerId === worker.agentId || dossier.agentId === worker.agentId))
    || list[index] || null;
}

function loserReason(outcome, surprise) {
  if (outcome !== 'success') return 'branch_failed';
  if (surprise >= 0.5) return 'surprising_outcome';
  return 'lower_score';
}

async function scoreBranches(input) {
  const options = input || {};
  const workers = Array.isArray(options.workers) ? options.workers : [];
  const scored = [];
  for (let index = 0; index < workers.length; index++) {
    const worker = workers[index] || {};
    const dossier = pairDossier(options.dossiers, worker, index);
    const outcome = await branchStatus(options.db || null, worker.agentId, dossier);
    let surprise = outcome === 'success' ? 0 : 1;
    try {
      const worldModel = require('./worldModelService');
      const observed = await worldModel.observeTransition(options.db || null, options.orchestratorId, {
        actionId: worker.agentId, success: outcome === 'success'
      });
      surprise = observed.surprise;
    } catch (_) {}
    scored.push({
      branchId: worker.agentId || `branch_${index + 1}`,
      action: worker.role || worker.name || 'world',
      outcome,
      surprise,
      score: outcome === 'success' ? 0.5 + 0.5 * (1 - surprise) : 0
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const winner = scored.length && scored[0].score > 0 ? scored[0] : null;
  return {
    rolloutId: options.rolloutId || null,
    method: 'vte-evidence-surprise',
    advisoryOnly: true,
    winner,
    scores: scored,
    preservedLosers: scored.filter((entry) => entry !== winner).map((entry) => ({
      branchId: entry.branchId, action: entry.action, score: entry.score, reason: loserReason(entry.outcome, entry.surprise)
    })),
    limitation: 'Avis seulement : ne remplace ni jury ni gate de promotion.'
  };
}

module.exports = { planRollout, scoreBranches };
