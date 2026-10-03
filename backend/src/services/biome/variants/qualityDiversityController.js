'use strict';

function advance(ecology, state, input) {
  const descriptor = numericDescriptor(input.descriptor);
  const archive = { ...(state.qualityDiversity || {}) };
  const candidate = makeCandidate(ecology, archive, input);
  const incumbent = archive[candidate.cell];
  const accepted = !incumbent || candidate.quality > incumbent.quality;
  if (accepted) archive[candidate.cell] = candidate;
  const offspring = makeOffspring(archive, candidate, input);
  const offspringQueue = queueOffspring(state, candidate, offspring);
  const result = candidateResult({ candidate, incumbent, accepted, archive, offspring });
  return { state: { ...state, qualityDiversity: archive, offspringQueue }, decision: result,
    action: { type: accepted ? 'QD_ELITE_ACCEPTED' : 'QD_CANDIDATE_REJECTED', status: 'applied', cell: candidate.cell } };
}

function makeCandidate(ecology, archive, input) {
  const descriptor = numericDescriptor(input.descriptor);
  const evidenceRefs = strings(input.evidenceRefs);
  if (!descriptor.length || !evidenceRefs.length) throw variantError('QD elites need a numeric descriptor and evidence.', 'BIOME_VARIANT_EVIDENCE_REQUIRED');
  validateQuality(input.quality);
  validateDescriptorDimensions(descriptor, archive, input.centroids);
  const cell = selectCell(descriptor, input.centroids);
  return { cell, descriptor, quality: input.quality, novelty: localNovelty(descriptor, archive, cell),
    strategy: input.strategy || null, evidenceRefs, tick: ecology.tick };
}

function validateQuality(quality) {
  if (!Number.isFinite(quality)) throw variantError('QD quality must be a measured finite number.', 'BIOME_VARIANT_MEASUREMENT_INVALID');
}

function validateDescriptorDimensions(descriptor, archive, centroids) {
  const archived = Object.values(archive).map((entry) => entry.descriptor);
  const centers = Array.isArray(centroids) ? centroids : [];
  const incompatible = [...archived, ...centers].some((value) => numericDescriptor(value).length !== descriptor.length);
  if (incompatible) throw variantError('QD descriptors, archive entries and centroids must share one dimension.', 'BIOME_VARIANT_DESCRIPTOR_INVALID');
}

function makeOffspring(archive, candidate, input) {
  const parent = bestOtherCell(archive, candidate.cell);
  return parent && input.strategy ? { parent, strategy: recombine(parent.strategy, input.strategy, input.mutation) } : null;
}

function queueOffspring(state, candidate, offspring) {
  if (!offspring) return state.offspringQueue || [];
  return [...(state.offspringQueue || []), { parentCell: offspring.parent.cell, cell: candidate.cell, strategy: offspring.strategy }].slice(-100);
}

function candidateResult(options) {
  const { candidate, incumbent, accepted, archive, offspring } = options;
  return { cell: candidate.cell, accepted, quality: candidate.quality, incumbentQuality: incumbent?.quality ?? null,
    occupiedCells: Object.keys(archive).length, novelty: candidate.novelty, parentCell: offspring?.parent.cell || null,
    localCompetition: accepted, offspringStrategy: offspring?.strategy || null };
}

function recombine(parent, candidate, mutation) {
  if (stringPair(parent, candidate)) return { lineage: [parent, candidate], mutations: mutation || {} };
  const left = objectStrategy(parent);
  const right = objectStrategy(candidate);
  return { ...left, ...right, mutations: { ...(left.mutations || {}), ...(right.mutations || {}), ...(mutation || {}) },
    lineage: [left.id || 'elite-parent', right.id || 'candidate-parent'] };
}

function stringPair(left, right) { return typeof left === 'string' && typeof right === 'string'; }
function objectStrategy(value) { return value && typeof value === 'object' ? value : {}; }

function selectCell(descriptor, centroids) {
  if (!Array.isArray(centroids) || !centroids.length) return descriptor.map((value) => Math.round(value * 10) / 10).join(':');
  const ranked = centroids.map((centroid, index) => ({ index, distance: distance(descriptor, numericDescriptor(centroid)) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
  return `cvt:${ranked[0].index}`;
}

function localNovelty(descriptor, archive, cell) {
  const neighbors = Object.values(archive).filter((item) => item.cell !== cell)
    .map((item) => distance(descriptor, item.descriptor)).sort((a, b) => a - b).slice(0, 5);
  return neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : 1;
}

function bestOtherCell(archive, cell) {
  return Object.values(archive).filter((item) => item.cell !== cell)
    .sort((a, b) => b.quality - a.quality || a.cell.localeCompare(b.cell))[0] || null;
}

function numericDescriptor(value) {
  const values = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  if (values.some((item) => !Number.isFinite(item) || item < 0 || item > 1)) {
    throw variantError('QD descriptors must contain finite normalized values in [0,1].', 'BIOME_VARIANT_DESCRIPTOR_INVALID');
  }
  return values;
}

function distance(left, right) {
  const size = Math.max(left.length, right.length, 1);
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - (right[index] || 0)) ** 2, 0) / size);
}

function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function variantError(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
