'use strict';

const nicheDiscovery = require('../niches/nicheDiscoveryService');
const nicheStore = require('../niches/nicheStore');

function advance(ecology, state, input) {
  const sources = { ...(state.sources || {}) };
  const { source, existing } = updateSource(sources, input);
  sources[source.sourceId] = source;
  const discovered = updateKnowledgeNiche(ecology, source);
  const pollination = recordPollination(ecology, pollinate(source, sources));
  return { state: { ...state, sources }, decision: { source, previous: existing?.sourceId || null, pollination,
    corroborationCount: Object.values(sources).filter((item) => item.topic === source.topic && !item.duplicateOf).length,
    nicheIds: discovered.map((item) => item.nicheId) },
    action: { type: source.exhausted ? 'KNOWLEDGE_SOURCE_EXHAUSTED' : 'KNOWLEDGE_SOURCE_INTEGRATED', status: 'applied', sourceId: source.sourceId } };
}

function updateSource(sources, input) {
  const source = normalizeSource(input);
  if (!source.sourceId || !source.provenance.length) throw variantError('Knowledge sources require identity and provenance.', 'BIOME_VARIANT_INPUT_INVALID');
  const existing = sources[source.sourceId];
  if (existing) source.provenance = unique([...existing.provenance, ...source.provenance]);
  if (existing?.exhausted && input.refresh !== true) source.exhausted = true;
  const duplicate = source.duplicateOf || findDuplicate(source, sources);
  source.duplicateOf = duplicate;
  source.contradictions = unique([...source.contradictions, ...findContradictions(source, sources)]);
  if (duplicate) source.credibility = Math.min(source.credibility, 0.3);
  return { source, existing };
}

function updateKnowledgeNiche(ecology, source) {
  const opportunity = { status: 'candidate', opportunityId: `source-${source.sourceId}`,
    descriptor: `Knowledge niche: ${source.topic || source.sourceId}`, opportunityScore: source.credibility * source.freshness,
    novelty: source.duplicateOf ? 0 : source.novelty, evidenceRefs: source.provenance,
    justifiedUncertainty: 0, requiredCapabilities: ['WEB_FORAGING'] };
  const discovered = source.exhausted ? [] : nicheDiscovery.discoverNiches({ opportunityMap: [opportunity], existingNiches: ecology.niches });
  ecology.niches = discovered.reduce((current, niche) => nicheStore.upsertNiche(current, niche), ecology.niches);
  return discovered;
}

function recordPollination(ecology, pollination) {
  ecology.ecologicalState.knowledgePollinations = [...(ecology.ecologicalState.knowledgePollinations || []), ...pollination].slice(-500);
  return pollination;
}

function normalizeSource(input) {
  return { sourceId: text(input.sourceId), topic: text(input.topic), credibility: bounded(input.credibility),
    freshness: bounded(input.freshness), novelty: bounded(input.novelty), duplicateOf: text(input.duplicateOf),
    contradictions: strings(input.contradictions), provenance: strings(input.provenance || input.evidenceRefs),
    exhausted: input.exhausted === true };
}

function findDuplicate(source, sources) {
  return Object.values(sources).find((other) => source.provenance.some((ref) => other.provenance.includes(ref)))?.sourceId || null;
}

function findContradictions(source, sources) {
  return Object.values(sources).filter((other) => source.contradictions.includes(other.sourceId)
    || other.contradictions.includes(source.sourceId)).map((other) => other.sourceId);
}

function pollinate(source, sources) {
  if (source.exhausted || source.credibility < 0.5) return [];
  return Object.values(sources).filter((other) => other.sourceId !== source.sourceId && other.topic === source.topic
    && !other.exhausted).map((other) => ({ from: source.sourceId, to: other.sourceId, evidenceRefs: source.provenance }));
}

function unique(values) { return [...new Set(values)]; }
function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function bounded(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
function variantError(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
