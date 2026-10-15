'use strict';

const { PROFILES } = require('./variantUseCaseProfiles');

const STOP = new Set('avec dans pour entre apres avant cette celui celles leurs notre votre ainsi quand sans sous tout tous toute cette mission besoin faire doit sont sera avoir plus moins aussi chaque meme autre et ou de du des la le les un une en au aux a par sur qui que qu se ce ces il elle nous vous'.split(' '));
const BASELINES = Object.freeze({ trinity: 'controlled', a_team: 'project_dag', biome: 'resource',
  biocenose: 'epistemic_jury', holobionte: 'organelle', syncytium: 'hard',
  rhizome: 'routing', metapopulation: 'balanced' });
const DIAGNOSIS_WORDS = Object.freeze({ uncertainty: 'incertitude exploration',
  causalAmbiguity: 'hypotheses causes contrefactuelles', contradiction: 'refutation objections',
  provenanceRisk: 'provenance sources preuves', deterministicNeed: 'verificateur deterministe tests',
  adversarialRisk: 'attaque defense contre exemple', monitoringNeed: 'surveillance metriques',
  stagnation: 'reconfiguration exploration alternatives' });
const STRUCTURED_FLAGS = Object.freeze({
  offlineRequired: 'hors ligne sans reseau local appareil',
  privacyRequired: 'donnees confidentielles domaine prive souverainete',
  humanReviewRequired: 'autorite humaine approbation consentement',
  independentVerifierRequired: 'verificateur deterministe preuves tests',
  adversarialReviewRequired: 'refutation contre exemple attaque defense',
  multiObjectiveRequired: 'objectifs multiples qualite cout latence compromis',
  atomicStateRequired: 'transaction reservation atomique idempotence',
  sharedStateRequired: 'etat partage coherence invariants',
  longRunning: 'missions longues memoire persistance historique',
  recoveryRequired: 'panne secours reparation redondance recuperation',
  resourceScarcity: 'budget limite ressources penurie quotas',
  novelEnvironmentsRequired: 'nouvelles niches nouveaux environnements',
  modelDiversityRequired: 'diversite modeles fournisseurs independants'
});

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function stem(value) {
  return value.length > 6 ? value.replace(/(ements|ement|ations|ation|iques|ique|euses|euse|eurs|eur|es|s)$/, '') : value;
}

function terms(value) {
  return [...new Set(normalized(value).split(/\s+/).map(stem)
    .filter(word => word.length > 2 && !STOP.has(word)))];
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  return [];
}

function queryText(input = {}) {
  const mission = input.mission || input.problem || {};
  const description = typeof mission === 'string' ? [mission] : [mission.prompt, mission.goal, mission.description];
  const profile = input.problemProfile || {};
  const structured = ['needs', 'objectives', 'constraints', 'workflowShape', 'evidenceMode',
    'stateMode', 'populationMode', 'deploymentMode', 'type', 'taskFamily', 'domain',
    'priority', 'scope', 'stateConsistency'].flatMap(key => strings(profile[key]));
  const flags = Object.entries(STRUCTURED_FLAGS).filter(([key]) => profile[key] === true)
    .map(([, phrase]) => phrase);
  const diagnosis = Object.entries(input.diagnosis || input.signals || {})
    .filter(([, value]) => Number(value) >= 0.6).map(([key]) => DIAGNOSIS_WORDS[key]).filter(Boolean);
  return [input.prompt, input.goal, input.currentTask, ...description, ...structured, ...flags, ...diagnosis]
    .filter(value => typeof value === 'string').join(' ');
}

function queryWeights(input) {
  const weights = new Map(terms(queryText(input)).map(term => [term, 1]));
  for (const term of terms(strings(input.problemProfile?.priorities).join(' '))) weights.set(term, 2);
  return weights;
}

function profileTerms(topology) {
  return Object.entries(PROFILES[topology] || {}).map(([variantId, description]) => ({
    variantId, tokens: terms(description)
  }));
}

function documentFrequency(profiles) {
  const frequency = new Map();
  for (const profile of profiles) for (const term of profile.tokens) {
    frequency.set(term, (frequency.get(term) || 0) + 1);
  }
  return frequency;
}

function scoreProfile(context) {
  const matchedTerms = context.profile.tokens.filter(term => context.query.has(term));
  const weighted = matchedTerms.reduce((total, term) => total + context.query.get(term)
    * (1 + Math.log((context.count + 1) / (1 + context.frequency.get(term)))), 0);
  const score = weighted / Math.sqrt(Math.max(3, context.profile.tokens.length));
  return { variantId: context.profile.variantId, score: Number(score.toFixed(4)), matchedTerms };
}

function scoreVariants(input) {
  const profiles = profileTerms(input.topology);
  const query = queryWeights(input);
  const frequency = documentFrequency(profiles);
  return profiles.map(profile => scoreProfile({ profile, query, frequency, count: profiles.length }))
    .filter(item => !input.available || input.available.includes(item.variantId))
    .sort((left, right) => right.score - left.score || left.variantId.localeCompare(right.variantId));
}

function compatible(input) {
  if (input.topology !== 'holobionte') return true;
  const policy = require('../../holobionte/variants').getVariant(input.variantId);
  return policy.analyzeFit(input.problemProfile || {}).compatible;
}

function missingPreconditions(input) {
  if (input.topology !== 'holobionte') return [];
  const policy = require('../../holobionte/variants').getVariant(input.variantId);
  return policy.analyzeFit(input.problemProfile || {}).reasons;
}

function decisive(ranking) {
  const [best, next] = ranking;
  if (!best || best.matchedTerms.length < 2 || best.score < 1.1) return false;
  return !next || best.score >= next.score * 1.2 || best.score - next.score >= 0.55;
}

function meaningfulLocal(input) {
  const local = input.localSelection;
  return Boolean(local?.variantId && local.method !== 'safe_baseline'
    && Array.isArray(local.reasons) && local.reasons.length
    && ready(input, local.variantId));
}

function localReview(input, ranking) {
  const local = input.localSelection;
  if (!meaningfulLocal(input)) return null;
  const best = ranking[0];
  const current = ranking.find(item => item.variantId === local.variantId);
  const override = best && current && best.variantId !== local.variantId
    && best.matchedTerms.length >= 4 && best.score - current.score >= 2.5;
  if (override) return null;
  return { ...local, confidence: 0.5, calibrationStatus: 'uncalibrated',
    reasons: [...local.reasons, ...(best && best.variantId !== local.variantId
      ? [`DOCUMENTED_ALTERNATIVE:${best.variantId}`] : [])],
    alternatives: ranking.slice(0, 3).map(item => item.variantId) };
}

function ready(input, variantId) {
  return variantId !== 'default' && compatible({ ...input, variantId });
}

function fallbackChoice(input, reason) {
  const baseline = BASELINES[input.topology] || 'default';
  const local = input.localSelection;
  const localId = local?.variantId || baseline;
  if ((reason === 'NO_DOCUMENTED_SIGNAL' || !ready(input, baseline)) && ready(input, localId)) {
    return { variantId: localId, local };
  }
  return { variantId: ready(input, baseline) ? baseline : 'default', local: null };
}

function fallback(input, reason, ranking) {
  const choice = fallbackChoice(input, reason);
  return { ...choice.local, variantId: choice.variantId,
    method: choice.local?.method || 'safe_baseline', confidence: 0.5,
    calibrationStatus: 'uncalibrated', reasons: [reason, ...(input.rejectedReasons || [])],
    alternatives: ranking.slice(0, 3).map(item => item.variantId) };
}

function audited(selection, scored, rejected) {
  return { ...selection, evaluatedVariantCount: scored.length,
    rankedCandidates: scored.slice(0, 5).map(item => ({ variantId: item.variantId,
      score: item.score, matchedTerms: item.matchedTerms })),
    incompatibleCandidates: rejected.slice(0, 5).map(item => item.variantId) };
}

function selectVariant(input) {
  const scored = scoreVariants(input);
  const rejected = scored.filter(item => item.matchedTerms.length >= 2
    && !compatible({ ...input, variantId: item.variantId }));
  const rejectedReasons = rejected.slice(0, 3).flatMap(item => missingPreconditions({
    ...input, variantId: item.variantId }).map(reason => `${item.variantId}:${reason}`));
  const context = { ...input, rejectedReasons };
  const ranking = scored.filter(item => compatible({ ...input, variantId: item.variantId }));
  const reviewedLocal = localReview(context, ranking);
  if (reviewedLocal) return audited(reviewedLocal, scored, rejected);
  const hasSignal = ranking.some(item => item.matchedTerms.length >= 2 && item.score >= 1.1);
  if (!hasSignal) return audited(fallback(context, rejected.length
    ? 'DOCUMENTED_PRECONDITION_MISSING' : 'NO_DOCUMENTED_SIGNAL', ranking), scored, rejected);
  if (!decisive(ranking)) return audited(fallback(context, 'AMBIGUOUS_DOCUMENTED_USE_CASE', ranking), scored, rejected);
  const winner = ranking[0];
  const local = input.localSelection?.variantId === winner.variantId ? input.localSelection : null;
  return audited({ ...local, variantId: winner.variantId,
    method: local?.method || 'documented_use_case',
    confidence: 0.5, calibrationStatus: 'uncalibrated',
    reasons: winner.matchedTerms.map(term => `DOCUMENTED_SIGNAL:${term}`),
    alternatives: ranking.slice(1, 4).map(item => item.variantId) }, scored, rejected);
}

function candidateFit(input) {
  if (!input.variant || !PROFILES[input.topology]?.[input.variant]) return null;
  if (!compatible({ ...input, variantId: input.variant })) return null;
  const result = scoreVariants(input).find(item => item.variantId === input.variant);
  if (!result || result.matchedTerms.length < 2 || result.score < 1.1) return null;
  return Math.min(0.95, Number((0.5 + result.score / 10).toFixed(4)));
}

module.exports = { BASELINES, PROFILES, scoreVariants, selectVariant, candidateFit };
