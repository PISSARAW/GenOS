'use strict';

/**
 * Réverbération entretenue (RPT — trou central comblé, partiellement).
 *
 * Boucle récurrente bornée qui maintient une trace compacte par agent SANS
 * nouvel input : chaque mise à jour rejoue jusqu'à 5 passes de raffinement
 * (fusion des clauses quasi-dupliquées) jusqu'à convergence (attracteur),
 * avec décroissance temporelle de l'activation (demi-vie 30 min).
 *
 * Choix délibérés : fonctions pures, aucun appel LLM (coût nul,
 * déterministe, testable), état borné (9 clauses de 160 chars), best-effort
 * (retourne null/'' en cas d'échec, ne casse jamais l'appelant).
 * Pas de tick autonome en tâche de fond : sans événement, la trace décroît
 * au chargement au lieu de tourner à vide (risque boucle/ressources).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');
const { computeSalience } = require('./autobiographicalMemory/salience');

const SCOPE = 'reverberation';
const MAX_PASSES = 5;
const MAX_CLAUSES = 9;
const MAX_CLAUSE_CHARS = 160;
const HALF_LIFE_MS = 30 * 60 * 1000;
const SETTLE_JACCARD = 0.6;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function truncate(text, max) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function tokens(text) {
  return new Set(String(text || '').toLowerCase().match(/[a-z0-9_àâäéèêëîïôöùûüç-]+/g) || []);
}

function jaccard(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size && !right.size) return 1;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function mergePass(clauses) {
  const kept = [];
  let changed = false;
  for (const clause of clauses) {
    const twin = kept.find((other) => jaccard(other.text, clause.text) >= SETTLE_JACCARD);
    if (twin) {
      twin.weight = Math.max(twin.weight, clause.weight);
      changed = true;
    } else {
      kept.push({ ...clause });
    }
  }
  return { clauses: kept.slice(0, MAX_CLAUSES), changed };
}

function applyDecay(state, now) {
  const elapsed = Math.max(0, now - (state.updatedAt || now));
  const factor = Math.pow(0.5, elapsed / HALF_LIFE_MS);
  return { ...state, activation: clamp01(state.activation * factor), updatedAt: now };
}

function blankState(now) {
  return { clauses: [], activation: 0, passes: 0, settled: true, updatedAt: now };
}

async function reverberate(db, agentId, input) {
  const options = input || {};
  const now = Number(options.now || Date.now());
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject(SCOPE, agentId)) || {};
  let state = applyDecay({
    clauses: Array.isArray(stored.clauses) ? stored.clauses : [],
    activation: Number(stored.activation) || 0,
    passes: 0, settled: true, updatedAt: Number(stored.updatedAt) || now
  }, now);
  const gist = truncate(options.gist, MAX_CLAUSE_CHARS);
  if (gist) {
    state.clauses.push({ text: gist, weight: clamp01(options.weight) });
    state.activation = clamp01(state.activation * 0.85 + clamp01(options.weight) * 0.15 + 0.15);
  }
  let passes = 0;
  let settled = false;
  while (passes < MAX_PASSES && !settled) {
    const sweep = mergePass(state.clauses);
    state.clauses = sweep.clauses;
    settled = !sweep.changed;
    passes += 1;
  }
  state.passes = passes;
  state.settled = settled;
  state.updatedAt = now;
  await store.persistObject(SCOPE, agentId, state, passes);
  return state;
}

async function updateFromEvent(db, agentId, event) {
  if (!db || !agentId || !event) return null;
  try {
    const detail = event.detail || (event.payload && event.payload.task) || '';
    const gist = truncate(detail, MAX_CLAUSE_CHARS);
    if (!gist) return null;
    const { salience } = computeSalience(event);
    return await reverberate(db, agentId, { gist, weight: salience });
  } catch (_) {
    return null;
  }
}

function formatTrace(state) {
  if (!state || !state.clauses.length) return '';
  const lines = state.clauses.map((clause) => `- ${clause.text} (poids ${(Number(clause.weight) || 0).toFixed(2)})`);
  return [
    `[RÉVERBÉRATION ENTRETENUE — ${state.settled ? 'convergée' : 'divergente'} en ${state.passes} passe(s), activation ${(clamp01(state.activation) * 100).toFixed(0)}%]`,
    ...lines
  ].join('\n');
}

async function loadTraceBlock(db, agentId) {
  if (!db || !agentId) return '';
  try {
    const store = new AdaptiveStateService(db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    if (!Array.isArray(stored.clauses) || !stored.clauses.length) return '';
    return formatTrace(applyDecay({ ...stored, passes: Number(stored.passes) || 0, settled: stored.settled !== false }, Date.now()));
  } catch (_) {
    return '';
  }
}

module.exports = { reverberate, updateFromEvent, loadTraceBlock, formatTrace };
