'use strict';

const crypto = require('crypto');

const INTENTS = ['answer', 'explain', 'analyze', 'diagnose', 'verify', 'compare',
  'optimize', 'plan', 'create', 'transform', 'implement', 'act', 'retrieve'];

function normalizeRequest(raw) {
  const src = raw && typeof raw === 'object' ? raw : { mission: String(raw || '') };
  const mission = String(src.mission || src.task || src.prompt || '').trim();
  const text = mission.toLowerCase().replace(/\s+/g, ' ').trim();
  return { mission, text, hints: pickHints(src) };
}

function pickHints(src) {
  return {
    repo: boolOf(src.repo || src.workspace_root),
    web: boolOf(src.web || src.freshness_required),
    files: boolOf(src.files || src.paths),
    risk: String(src.risk || 'low'),
  };
}

function boolOf(value) {
  return Boolean(value);
}

function fingerprintRequest(normalized) {
  const base = normalized.text + '|' + JSON.stringify(normalized.hints);
  return 'req_' + crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
}

function detectIntent(text) {
  return earlyIntent(text) || lateIntent(text) || 'answer';
}

function earlyIntent(text) {
  if (hasAny(text, ['explique', 'explain', 'pourquoi'])) return 'explain';
  if (hasAny(text, ['compare', ' vs ', 'versus', 'difference'])) return 'compare';
  if (hasAny(text, ['optimis', 'optimiz', 'meilleur chemin', 'minimi'])) return 'optimize';
  if (hasAny(text, ['planifie', 'plan ', 'voyage', 'tour du monde', 'calendrier'])) return 'plan';
  if (hasAny(text, ['cree', 'crée', 'ecris une chanson', 'écris', 'histoire', 'idees', 'idées'])) return 'create';
  if (hasAny(text, ['convertis', 'transforme', 'traduis', 'reformate', 'trier'])) return 'transform';
  return null;
}

function lateIntent(text) {
  if (hasAny(text, ['implemente', 'implémente', 'ajoute', 'ecris cette fonction', 'refactor', 'migre'])) return 'implement';
  if (hasAny(text, ['deploie', 'supprime', 'modifie le fichier', 'execute'])) return 'act';
  if (hasAny(text, ['cherche', 'ou est', 'où est', 'retrouve', 'prix de', 'actualit'])) return 'retrieve';
  if (hasAny(text, ['diagnostique', 'bug', 'faille', 'lent', 'crash', 'regression'])) return 'diagnose';
  if (hasAny(text, ['verifie', 'vérifie', 'est-ce vrai', 'demontr', 'prouve'])) return 'verify';
  if (hasAny(text, ['analyse'])) return 'analyze';
  return null;
}

function hasAny(text, needles) {
  return needles.some((n) => text.includes(n));
}

function detectEpistemic(text) {
  return {
    exact: isArithmetic(text),
    empirical: hasAny(text, ['mesure', 'profil', 'benchmark', 'experience']),
    factual: hasAny(text, ['qu’est-ce', 'quest-ce', 'definition', 'arbre binaire']),
    historical: hasAny(text, ['napoleon', 'histoire', 'epoque', 'époque']),
    current: hasAny(text, ['prix', 'actualit', 'version', 'latest', 'news']),
    speculative: hasAny(text, ['et si', 'contrefactuel', 'imagine']),
    creative: hasAny(text, ['chanson', 'histoire', 'idee', 'idée', 'eminem', 'claire bennet']),
  };
}

function isArithmetic(text) {
  return /^[0-9+\-*/().\s^%]+$/.test(text) && /[0-9]/.test(text) && text.length < 64;
}

function detectEnvironment(text, hints) {
  return {
    closed_world: isArithmetic(text) || text.length < 32,
    repo: Boolean(hints.repo) || hasAny(text, ['repo', 'classe', 'code', 'bug', 'faille', 'feature']),
    files: Boolean(hints.files) || hasAny(text, ['pdf', 'csv', 'document', 'fichier']),
    web: Boolean(hints.web) || hasAny(text, ['prix', 'actualit', 'news', 'web', 'sujet']),
    external_system: hasAny(text, ['api', 'service', 'deploy', 'production']),
  };
}

function detectRequestClass(text, intent) {
  const found = earlyClass(text) || lateClass(text);
  return found || intentToClass(intent);
}

function earlyClass(text) {
  if (isArithmetic(text)) return 'deterministic_trivial';
  if (hasAny(text, ['claire bennet', 'trois manieres', 'trois façons'])) return 'diverse_solutions';
  if (hasAny(text, ['conway', 'sat ', 'combinatoire difficile'])) return 'hard_combinatorial';
  if (hasAny(text, ['faille'])) return 'security_audit';
  if (hasAny(text, ['bug inconnu', 'bug quelque part'])) return 'unknown_bug';
  if (hasAny(text, ['ce test echoue', 'reproducer'])) return 'known_bug';
  if (hasAny(text, ['flaky', 'intermittent', 'race condition'])) return 'flaky_bug';
  if (hasAny(text, ['marchait avant', 'regression'])) return 'regression';
  return null;
}

function lateClass(text) {
  return lateClassA(text) || lateClassB(text);
}

function lateClassA(text) {
  if (hasAny(text, ['lent', 'performance', 'profil'])) return 'performance';
  if (hasAny(text, ['deux possibilites', 'deux architectures', 'deux options'])) return 'feature_options';
  if (hasAny(text, ['explique-moi ce repo', 'explique ce repo'])) return 'repo_understanding';
  if (hasAny(text, ['chanson comme eminem', 'comme eminem'])) return 'style_constrained_creation';
  if (hasAny(text, ['tour du monde en 880', 'epoque du bouquin'])) return 'historical_planning';
  if (hasAny(text, ['autre approche', 'autre solution'])) return 'variant';
  return null;
}

function lateClassB(text) {
  if (hasAny(text, ['fais mieux', 'ameliore'])) return 'improvement';
  if (hasAny(text, ['verifie encore', 'vérifie encore'])) return 'revalidation';
  if (hasAny(text, ['programmation dynamique', 'dijkstra'])) return 'standard_algorithmic';
  if (hasAny(text, ['est-ce vrai', 'est vrai que'])) return 'claim_verification';
  if (hasAny(text, ['resume', 'résumé'])) return 'summarize';
  if (hasAny(text, ['comment genos'])) return 'genos_question';
  if (hasAny(text, ['donne-moi 20 idees', '20 idées'])) return 'open_ideation';
  if (hasAny(text, ['cree cette app', 'projet logiciel complet'])) return 'full_project';
  return null;
}

function intentToClass(intent) {
  const map = {
    explain: 'explanation', analyze: 'data_analysis', diagnose: 'unknown_bug',
    verify: 'claim_verification', compare: 'comparison', optimize: 'single_objective_opt',
    plan: 'modern_planning', create: 'artistic_creation', transform: 'mechanical_transform',
    implement: 'isolated_codegen', act: 'env_action', retrieve: 'doc_retrieval',
    answer: 'factual_stable',
  };
  return map[intent] || 'factual_stable';
}

function buildVerification(text, cls) {
  const needsReview = hasAny(cls, ['security', 'hard_combinatorial', 'unknown_bug']);
  return {
    deterministic: cls === 'deterministic_trivial' || cls === 'mechanical_transform',
    tests_possible: hasAny(text, ['code', 'fonction', 'bug', 'feature', 'test']),
    formal_proof_possible: cls === 'hard_combinatorial' || cls === 'formal_proof',
    independent_review_needed: needsReview,
  };
}

function buildTemporal(text) {
  const fresh = hasAny(text, ['prix', 'actualit', 'news', 'latest', 'version']);
  return {
    freshness_required: fresh,
    validity_horizon: fresh ? 'hours' : null,
  };
}

function buildAction(text) {
  const risky = hasAny(text, ['deploy', 'delete', 'production', 'supprime']);
  const write = risky || hasAny(text, ['modifie', 'ajoute', 'implemente', 'migre', 'refactor']);
  return { read_only: !write, reversible: !risky, risk: risky ? 'high' : 'low' };
}

function classifyRequest(normalized) {
  const text = normalized.text || '';
  const intent = detectIntent(text);
  const cls = detectRequestClass(text, intent);
  return {
    intent, request_class: cls,
    epistemic_mode: detectEpistemic(text),
    environment: detectEnvironment(text, normalized.hints || {}),
    complexity: estimateComplexity(text, cls),
    verification: buildVerification(text, cls),
    temporal: buildTemporal(text),
    action: buildAction(text),
    objectives: countObjectives(text),
    reuse: { prior_result_exists: false, prior_result_valid: false, better_candidate_exists: false },
  };
}

function estimateComplexity(text, cls) {
  const big = hasAny(text, ['conway', 'complet', 'multi-domaines', 'grande mission']);
  return {
    estimated_search_space: big ? 'large' : null,
    decomposition_needed: big || text.length > 400 || cls === 'full_project',
    parallelism_value: big ? 3 : 0,
    solver_value: cls === 'hard_combinatorial' ? 3 : 0,
  };
}

function countObjectives(text) {
  const competing = hasAny(text, [' vs ', 'cout vs', 'coût vs', 'trade-off', 'compromis']);
  return { count: competing ? 2 : 1, competing };
}

function profileRequest(raw) {
  const normalized = normalizeRequest(raw);
  const semanticId = fingerprintRequest(normalized);
  const profile = classifyRequest(normalized);
  return { normalized, semanticId, profile };
}

module.exports = {
  INTENTS,
  normalizeRequest,
  fingerprintRequest,
  classifyRequest,
  profileRequest,
};
