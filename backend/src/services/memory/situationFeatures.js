'use strict';

// These lexical dimensions are an engineering vocabulary, not neural axes.
const DIMENSIONS = Object.freeze({
  coordination: /\b(concurren\w*|parallel\w*|race|deadlock|contention|simultan\w*|verrou\w*|mutex|serializ\w*|serialis\w*)\b/,
  sharedState: /\b(shared|partag\w*|sqlite|transaction\w*|database|fichier\w*|file|wal|state|etat)\b/,
  externalDependency: /\b(network|reseau|http\w*|grpc|api|socket|provider|fournisseur|remote|distant\w*)\b/,
  resourcePressure: /\b(saturat\w*|capacity|capacite|quota|pool|memory|memoire|budget|exhaust\w*|epuis\w*)\b/,
  authority: /\b(permission\w*|authorization|autorisation|lease|rbac|tenant|credential\w*|secret\w*)\b/,
  isolation: /\b(isolat\w*|sandbox|worktree|workspace|capsule|confin\w*)\b/,
  recovery: /\b(rollback|retry|retries|reprise|recovery|restore|restaur\w*|checkpoint|snapshot|annul\w*|cancel\w*)\b/,
  verification: /\b(evidence|preuve\w*|receipt\w*|recu\w*|test\w*|oracle|reproduc\w*|reproduct\w*|counterexample|contre.exemple)\b/
});

function normalize(text) {
  return String(text || '').slice(0, 100000).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function memoryText(item) {
  const fields = ['title', 'summary', 'content', 'actionInput', 'observationOutput'];
  const parts = fields.map((key) => typeof item[key] === 'string' ? item[key].slice(0, 16000) : '');
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 32).filter((tag) => typeof tag === 'string') : [];
  return [...parts, ...tags.map((tag) => tag.slice(0, 120))].join(' ');
}

function encode(text) {
  const normalized = normalize(text);
  return Object.keys(DIMENSIONS).filter((key) => DIMENSIONS[key].test(normalized));
}

function overlap(queryFeatures, itemFeatures) {
  if (queryFeatures.length === 0) return { score: 0, matched: [] };
  const present = new Set(itemFeatures);
  const matched = queryFeatures.filter((key) => present.has(key));
  const union = new Set([...queryFeatures, ...itemFeatures]);
  return { score: matched.length / union.size, matched };
}

function resolvePhase(query, options) {
  const explicit = options.recallPhase;
  if (['exploration', 'diagnosis', 'verification'].includes(explicit)) return explicit;
  const text = normalize(query);
  if (/\b(verif\w*|validat\w*|test\w*|assert\w*|preuve\w*|prove|audit\w*)\b/.test(text)) return 'verification';
  if (/\b(diagnos\w*|cause\w*|bug\w*|debug\w*|erreur\w*|error\w*|timeout\w*|echec\w*|fail\w*)\b/.test(text)) return 'diagnosis';
  return 'exploration';
}

module.exports = { encode, memoryText, normalize, overlap, resolvePhase };
