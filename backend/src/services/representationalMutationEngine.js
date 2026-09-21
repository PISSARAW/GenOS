'use strict';

const kg = require('./structuralKnowledgeGraph');

function clamp(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

function shortName(x) {
  const v = x && (x.name || x.id) || String(x);
  return v.slice(0, 30);
}

function getCategory(x) {
  return ((x && x.metadata && x.metadata.category) || (x && x.category) || '').toLowerCase();
}

function buildReprParents(a, b) {
  return [
    { id: a && (a.id || a), role: 'parent_a' },
    { id: b && (b.id || b), role: 'parent_b' },
  ];
}

function buildReprId() {
  return 'repr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function checkFirstHop(sourceId, db, targetId) {
  const out = await kg.outgoingRelations({ entityId: sourceId, db });
  const ids = (out.relations || []).map((r) => r.target_id);
  if (ids.includes(targetId)) return 0.5;
  return null;
}

async function checkSecondHop(relations, targetId, db) {
  for (const rel of relations) {
    const hop2 = await kg.outgoingRelations({ entityId: rel.target_id, db });
    if ((hop2.relations || []).some((r) => r.target_id === targetId)) return 0.75;
  }
  return 1.0;
}

async function semanticDistance(sourceId, targetId, db) {
  if (sourceId === targetId) return 0;
  const firstHop = await checkFirstHop(sourceId, db, targetId);
  if (firstHop !== null) return firstHop;
  const out = await kg.outgoingRelations({ entityId: sourceId, db });
  return checkSecondHop(out.relations || [], targetId, db);
}

function compatibilityScore(a, b) {
  const au = getCategory(a);
  const bu = getCategory(b);
  if (!au || !bu) return 0.5;
  return au === bu ? 0.4 : 0.7;
}

function potentialFromKeywords(a, b, keywords) {
  if (!keywords || !keywords.length) return 0.5;
  let score = 0;
  const aText = JSON.stringify(a || '').toLowerCase();
  const bText = JSON.stringify(b || '').toLowerCase();
  for (const kw of keywords.map(String).map((k) => k.toLowerCase())) {
    if (aText.includes(kw)) score += 0.3;
    if (bText.includes(kw)) score += 0.3;
  }
  return clamp(score, 0, 1);
}

function potentialScore(a, b, problemContext) {
  const kw = problemContext && (problemContext.keywords || problemContext.domain) || [];
  return potentialFromKeywords(a, b, kw);
}

async function evaluatePair(sourceId, targetId, ctx) {
  const [dist, compat, pot] = await Promise.all([
    semanticDistance(sourceId, targetId, ctx.db),
    Promise.resolve(compatibilityScore({ id: sourceId }, { id: targetId })),
    Promise.resolve(potentialScore({ id: sourceId }, { id: targetId }, ctx.problemContext)),
  ]);
  return { a: sourceId, b: targetId, distance: dist, compatibility: compat, potential: pot, score: dist * compat * pot };
}

function sortPairs(pairs) {
  return pairs.sort((x, y) => y.score - x.score);
}

function computeAvgScore(selected) {
  const total = selected.reduce((s, p) => s + p.score, 0);
  return selected.length > 0 ? total / selected.length : 0;
}

async function collectPairs(candidates, ctx, targetDistance) {
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < Math.min(candidates.length, i + 10); j++) {
      if (candidates[i] === candidates[j]) continue;
      const scored = await evaluatePair(candidates[i], candidates[j], ctx);
      if (scored.distance < targetDistance * 0.7) continue;
      pairs.push(scored);
    }
  }
  return pairs;
}

function buildSelectionResult(pairs, k) {
  const sorted = sortPairs(pairs);
  const selected = sorted.slice(0, k);
  const avgScore = computeAvgScore(selected);
  return {
    parents: selected.map((p) => ({ a: p.a, b: p.b })),
    pairs: selected,
    score: avgScore,
    reason: selected.length > 0
      ? 'Selectionne ' + selected.length + ' paire(s), score moyen ' + avgScore.toFixed(3)
      : 'Aucune paire valide',
  };
}

async function selectDistantParents(candidateIds, ctx) {
  ctx = ctx || {};
  const maxCandidates = ctx.maxCandidates || 20;
  const targetDistance = ctx.targetDistance || 0.6;
  const k = ctx.k || 2;
  if (!candidateIds || candidateIds.length < 2) {
    return { parents: [], pairs: [], score: 0, reason: 'Pas assez de candidats' };
  }
  const candidates = candidateIds.slice(0, maxCandidates);
  const pairs = await collectPairs(candidates, ctx, targetDistance);
  return buildSelectionResult(pairs, k);
}

function reprDescription(a, b, opts) {
  opts = opts || {};
  const A = shortName(a);
  const B = shortName(b);
  const P = opts.problemText || 'le probleme';
  const repType = opts.representationType;
  const templates = {
    market: 'Representation marchande : ' + A + ' et ' + B + ' comme acteurs/offres face a ' + P + '.',
    ecosystem: 'Representation ecosystemique : ' + A + ' et ' + B + ' comme especes/niches en competition/cooperation dans ' + P + '.',
    gradient: 'Representation champ de gradients : ' + A + ' et ' + B + ' comme attracteurs/repulseurs dans ' + P + '.',
    diffusion: 'Representation diffusion : ' + A + ' et ' + B + ' comme propagateurs dans ' + P + '.',
    stigmergic: 'Representation stigmergique : ' + A + ' et ' + B + ' laissent des traces indirectes dans ' + P + '.',
    hybrid: 'Association distante de ' + A + ' et ' + B + ' pour resoudre ' + P + '.',
  };
  return templates[repType] || templates.hybrid;
}

function buildReprObject(a, b, opts) {
  opts = opts || {};
  return {
    name: shortName(a) + '<>' + shortName(b),
    representationType: opts.representationType || 'hybrid',
    parents: buildReprParents(a, b),
    description: reprDescription(a, b, opts),
    provenance: {
      source_a: a && (a.id || a),
      source_b: b && (b.id || b),
      combined_at: new Date().toISOString(),
      representation_type: opts.representationType || 'hybrid',
    },
    creativity_metrics: {
      semantic_distance: 0.75,
      remote_association: true,
      combination_depth: 2,
    },
  };
}

function recombineConcepts(a, b, ctx) {
  ctx = ctx || {};
  const opts = { problemText: ctx.problemText, representationType: ctx.representationType };
  return { id: buildReprId(), ...buildReprObject(a, b, opts) };
}

function computeRepresentationQuality(repr, problem, pair) {
  const dist = pair && pair.distance || 0.5;
  const kw = problem && (problem.keywords || problem.domain) || [];
  const relevance = potentialFromKeywords({ id: pair && pair.a }, { id: pair && pair.b }, kw);
  return clamp(dist * relevance * 1.5, 0, 1);
}

function findBestRepresentation(representations, scores) {
  if (!scores.length) return null;
  let bestIdx = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i].score > scores[bestIdx].score) bestIdx = i;
  }
  return representations[bestIdx];
}

async function findConceptById(candidateConcepts, id) {
  return candidateConcepts.find((c) => (c.id || c) === id);
}

async function generateForPair(aConcept, bConcept, opts) {
  const out = [];
  const scores = [];
  for (const repType of opts.representationTypes) {
    const ctx = { problemText: opts.problem.problem || opts.problem.domain, representationType: repType };
    const repr = recombineConcepts(aConcept, bConcept, ctx);
    const score = computeRepresentationQuality(repr, opts.problem, opts.pair);
    out.push(repr);
    scores.push({ representation_id: repr.id, score: score, type: repType });
  }
  return { representations: out, scores };
}

async function generateRepresentations(problem, candidateConcepts, options) {
  options = options || {};
  const representationTypes = options.representationTypes || ['hybrid', 'market', 'ecosystem', 'gradient', 'diffusion', 'stigmergic'];
  const k = options.k || 2;
  const targetDistance = options.targetDistance || 0.6;
  const ctx = { problemContext: problem, db: options.db, k, targetDistance };
  const selection = await selectDistantParents(
    candidateConcepts.map((c) => c.id || c),
    ctx
  );
  if (!selection.parents.length) {
    return { representations: [], best: null, scores: [], parentSelection: selection, reason: selection.reason };
  }
  const representations = [];
  const scores = [];
  for (const pair of selection.parents) {
    const aConcept = await findConceptById(candidateConcepts, pair.a);
    const bConcept = await findConceptById(candidateConcepts, pair.b);
    const opts = { problem, pair, representationTypes };
    const result = await generateForPair(aConcept, bConcept, opts);
    representations.push(...result.representations);
    scores.push(...result.scores);
  }
  const best = findBestRepresentation(representations, scores);
  return {
    representations: representations,
    best: best,
    scores: scores,
    parentSelection: selection,
    reason: 'Generated ' + representations.length + ' representations from ' + selection.parents.length + ' distant pair(s)',
  };
}

function computeQuery(problemContext) {
  return problemContext && problemContext.keywords ?
    problemContext.keywords.slice(0, 3).join(' ') :
    (problemContext && (problemContext.domain || 'generic') || 'generic');
}

async function fetchTraits(query, limit, db) {
  return kg.searchTraits({ query, limit, db });
}

function mapTraitsToConcepts(traits) {
  return (traits && traits.traits || []).map((t) => ({
    id: t.trait_id,
    name: t.trait_name,
    description: t.description,
    metadata: { category: t.promotion_level >= 1 ? 'promoted' : 'candidate' },
  }));
}

async function findCandidateConcepts(problemContext, options) {
  options = options || {};
  const query = computeQuery(problemContext);
  const limit = (options.limit || 50) * 2;
  const traits = await fetchTraits(query, limit, options.db);
  let concepts = mapTraitsToConcepts(traits);
  if (options.requireDiversity && concepts.length > 10) {
    concepts = diversifyByCategory(concepts);
  }
  return concepts.slice(0, options.limit || 50);
}

function groupByCategory(concepts) {
  const groups = {};
  for (const c of concepts) {
    const cat = c.metadata && c.metadata.category || 'unknown';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(c);
  }
  return groups;
}

function flattenGroups(groups) {
  return Object.values(groups).flatMap((arr) => arr.slice(0, 5));
}

function diversifyByCategory(concepts) {
  const groups = groupByCategory(concepts);
  return flattenGroups(groups);
}

async function generateContextualRepresentations(context, problem, options) {
  const concepts = await findCandidateConcepts(problem, Object.assign({ db: context && context.db }, options));
  if (!concepts.length) return { representations: [], best: null, scores: [], reason: 'Aucun concept trouve' };
  return generateRepresentations(problem, concepts, options);
}

module.exports = {
  semanticDistance,
  compatibilityScore,
  potentialScore,
  potentialFromKeywords,
  selectDistantParents,
  recombineConcepts,
  generateRepresentations,
  findCandidateConcepts,
  computeRepresentationQuality,
  reprDescription,
  generateContextualRepresentations,
};
