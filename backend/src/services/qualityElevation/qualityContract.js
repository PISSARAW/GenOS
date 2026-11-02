'use strict';
const crypto = require('node:crypto');
const POLICIES = Object.freeze({
  fast: { maxIterations: 2, minQualityScore: 70, critiques: 1, requireDoubleBlind: false },
  balanced: { maxIterations: 3, minQualityScore: 80, critiques: 2, requireDoubleBlind: true },
  critical: { maxIterations: 5, minQualityScore: 95, critiques: 3, requireDoubleBlind: true }
});
function fail(code, message) { return Object.assign(new Error(message), { code }); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function number(value, fallback, bounds) {
  const n = value ?? fallback;
  if (!Number.isFinite(n) || n < bounds[0] || n > bounds[1]) throw fail('GQEL_INVALID_CONTRACT', 'Invalid numeric limit.');
  return n;
}
function integer(value, fallback, bounds) {
  const n = number(value, fallback, bounds);
  if (!Number.isInteger(n)) throw fail('GQEL_INVALID_CONTRACT', 'Integer limit required.');
  return n;
}
function boolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw fail('GQEL_INVALID_CONTRACT', 'Boolean option required.');
  return value;
}
function inferDomain(mission) {
  const text = String(mission?.mission || mission?.prompt || mission || '').normalize('NFD').replace(/\p{M}/gu, '');
  if (/scenario|screenplay|fiction|roman|nouvelle|chanson|poeme|court.metrage|creative writing/i.test(text)) return 'creative_writing';
  if (/code|patch|fonction|bug|refactor|implemente|programming/i.test(text)) return 'software_engineering';
  return 'generic';
}
function criterion(id, description, stage = 'draft') { return { id, description, stage, kind: 'hard' }; }
function criteriaFor(profile, targetMinutes) {
  const base = [criterion('brief_coverage', 'Le livrable accomplit le brief, sans remplacer le résultat par une promesse.')];
  if (profile === 'screenplay') base.push(
    criterion('causal_chain', 'Les règles, obstacles et conséquences rendent le choix central intelligible.', 'plan'),
    criterion('character_actions', 'Motivations et informations des personnages influencent leurs décisions observables.', 'plan'),
    criterion('enacted_resolution', 'Le dénouement décisif est mis en scène, pas annoncé dans un résumé.', 'scene'),
    criterion('continuity', 'Actions, connaissances, lieux et objets restent cohérents entre les scènes.', 'scene'));
  if (targetMinutes !== null) base.push(criterion('duration_supported',
    'La durée visée est soutenue par des actions ou silences précisément décrits ; aucune conversion mots/minutes automatique.', 'scene'));
  if (profile === 'code') base.push(criterion('behavior_correct', 'Le comportement satisfait les exigences avec preuves exécutées.'));
  base.push({ id: 'craft', kind: 'soft', stage: 'draft', description: profile === 'code'
    ? 'Lisibilité et adéquation de la solution, sans régression.'
    : 'Développement, voix et efficacité de l’écriture ; aucune prime à la longueur, aux titres ou à l’autoéloge.' });
  return base;
}
function normalizeCriteria(items, defaults) {
  if (!Array.isArray(items)) throw fail('GQEL_INVALID_CONTRACT', 'criteria must be an array.');
  const result = [...defaults];
  for (const item of items) {
    const entry = typeof item === 'string' ? criterion(`custom_${result.length}`, item) : structuredClone(item);
    if (!entry?.id || !entry.description || !['hard', 'soft'].includes(entry.kind)) throw fail('GQEL_INVALID_CONTRACT', 'Invalid criterion.');
    if (result.some(existing => existing.id === entry.id)) throw fail('GQEL_INVALID_CONTRACT', 'Duplicate or weakened built-in criterion.');
    result.push({ ...entry, stage: entry.stage || 'draft' });
  }
  return result;
}
function limits(input) {
  return {
    budgetMaxTokens: integer(input.budgetMaxTokens, 120000, [1, 10000000]),
    maxCalls: integer(input.maxCalls, 80, [1, 1000]),
    maxDurationMs: integer(input.maxDurationMs, 1800000, [1, 86400000]),
    callTimeoutMs: integer(input.callTimeoutMs, 180000, [1, 3600000]),
    maxOutputTokens: integer(input.maxOutputTokens, 3000, [1, 100000]),
    maxPromptChars: integer(input.maxPromptChars, 42000, [100, 1000000]),
    maxStrategyMutations: integer(input.maxStrategyMutations, 2, [0, 20]),
    maxProtocolRepairs: integer(input.maxProtocolRepairs, 2, [0, 5]),
    maxPlanRepairs: integer(input.maxPlanRepairs, 1, [0, 5])
  };
}
function profileFor(domain, mission) {
  if (/software|programming|^code$/.test(domain)) return 'code';
  if (/scenario|screenplay|script/.test(domain)) return 'screenplay';
  return /scénario|scenario|screenplay|court.métrage/i.test(mission || '') ? 'screenplay' : 'prose';
}
function reviewOptions(input, policy) {
  const threshold = number(input.minQualityScore ?? input.minScore ?? input.threshold, policy.minQualityScore, [0, 100]);
  return { maxIterations: integer(input.maxIterations, policy.maxIterations, [1, 30]),
    threshold, minQualityScore: threshold, critiques: integer(input.critiques, policy.critiques, [1, 10]),
    requireDoubleBlind: boolean(input.requireDoubleBlind, policy.requireDoubleBlind),
    requireCalibration: boolean(input.requireCalibration, true),
    minDependencyGroups: integer(input.minDependencyGroups, 1, [1, 10]) };
}
function narrativeOptions(input) {
  return { targetMinutes: input.targetMinutes == null ? null : number(input.targetMinutes, null, [0.1, 1000]),
    minSceneCount: integer(input.minSceneCount, 1, [1, 50]), maxSceneCount: integer(input.maxSceneCount, 12, [1, 50]),
    minBodyWords: integer(input.minBodyWords, 0, [0, 100000]),
    allowProvisionalDraft: boolean(input.allowProvisionalDraft, true) };
}
function compileQualityContract(input = {}) {
  const name = input.policy || 'balanced', policy = POLICIES[name];
  if (!policy) throw fail('GQEL_INVALID_CONTRACT', 'Unknown quality policy.');
  const domain = String(input.domain || inferDomain(input.mission)).toLowerCase().trim();
  const profile = profileFor(domain, input.mission), narrative = narrativeOptions(input);
  const contract = { schema: 'genos.gqel-contract/v2', controllerRevision: '2.1-progress', domain, profile, mission: String(input.mission || ''), policy: name,
    ...reviewOptions(input, policy), ...narrative, ...limits(input),
    criteria: normalizeCriteria(input.criteria || [], criteriaFor(profile, narrative.targetMinutes)) };
  if (contract.minSceneCount > contract.maxSceneCount) throw fail('GQEL_INVALID_CONTRACT', 'Impossible scene bounds.');
  return freeze({ ...contract, contractId: `gqel-${crypto.randomUUID()}`, digest: digest(contract), createdAt: new Date().toISOString() });
}
function verifyContract(contract) {
  const { digest: expected, contractId, createdAt, ...body } = contract;
  if (contract.schema !== 'genos.gqel-contract/v2' || expected !== digest(body)) throw fail('GQEL_CONTRACT_CHANGED', 'Compile a V2 contract before execution.');
  return contract;
}
module.exports = { POLICIES, compileQualityContract, verifyContract, inferDomain, digest, freeze, fail };
