'use strict';

const MAX_ARCHIVE = 500;
const DEFAULT_NEIGHBORS = 3;

function behaviorVector(behavior) {
  if (Array.isArray(behavior)) return behavior.map(Number).filter(Number.isFinite);
  if (behavior && typeof behavior === 'object') {
    const flat = [...asNumbers(behavior.semantic), ...asNumbers(behavior.structural), ...asNumbers(behavior.features)];
    if (flat.length) return flat;
    return Object.values(behavior).map(Number).filter(Number.isFinite);
  }
  throw archiveError('TRINITY_NOVELTY_INVALID_BEHAVIOR', 'Behavior must be a numeric array or a feature object.');
}

function asNumbers(value) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function distance(left, right) {
  const length = Math.max(left.length, right.length);
  if (!length) return 0;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function addBehavior(input = {}) {
  const archive = Array.isArray(input.archive) ? [...input.archive] : [];
  const vector = behaviorVector(input.behavior !== undefined ? input.behavior : input.vector);
  if (!vector.length) throw archiveError('TRINITY_NOVELTY_EMPTY_VECTOR', 'Behavior vector must contain at least one finite number.');
  archive.push({ id: String(input.id || `behavior_${archive.length}`),
    vector, quality: clamp01(Number(input.quality ?? 0.5)),
    niche: assignNiche({ vector, nicheCount: input.nicheCount }),
    addedAt: new Date().toISOString() });
  return archive.slice(-MAX_ARCHIVE);
}

function noveltyScore(input = {}) {
  const archive = Array.isArray(input.archive) ? input.archive : [];
  const vector = behaviorVector(input.vector);
  const k = Math.max(1, Number(input.neighbors) || DEFAULT_NEIGHBORS);
  if (!archive.length) return 1;
  const distances = archive.map((entry) => distance(entry.vector, vector)).sort((a, b) => a - b);
  const nearest = distances.slice(0, Math.min(k, distances.length));
  return Number((nearest.reduce((sum, value) => sum + value, 0) / nearest.length).toFixed(6));
}

function assignNiche(input = {}) {
  const vector = behaviorVector(input.vector);
  const nicheCount = Math.max(1, Number(input.nicheCount) || 8);
  const anchor = vector.slice(0, 2);
  const key = anchor.map((value) => Math.floor(Number(value) * nicheCount)).join(':');
  return `niche_${key || '0'}`;
}

function scoreCandidate(candidate, archive, qualityWeight) {
  const vector = behaviorVector(candidate.vector);
  const quality = clamp01(Number(candidate.quality ?? 0.5));
  const novelty = noveltyScore({ archive, vector });
  const combined = (quality ** qualityWeight) * ((novelty / (1 + novelty)) ** (1 - qualityWeight));
  return { id: candidate.id, quality, novelty, combined: Number(combined.toFixed(6)) };
}

function qualityDiversitySelect(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (!candidates.length) throw archiveError('TRINITY_NOVELTY_NO_CANDIDATES', 'Quality-diversity selection requires at least one candidate.');
  const archive = Array.isArray(input.archive) ? input.archive : [];
  const qualityWeight = clamp01(Number(input.qualityWeight ?? 0.5));
  const nicheCount = Math.max(1, Number(input.nicheCount) || 8);
  const scored = candidates.map((candidate, index) => ({
    ...scoreCandidate({ ...candidate, id: candidate.id || `candidate_${index}` }, archive, qualityWeight),
    niche: assignNiche({ vector: behaviorVector(candidate.vector), nicheCount })
  }));
  const bestPerNiche = new Map();
  for (const entry of scored) {
    const current = bestPerNiche.get(entry.niche);
    if (!current || entry.combined > current.combined) bestPerNiche.set(entry.niche, entry);
  }
  const selection = [...bestPerNiche.values()].sort((a, b) => b.combined - a.combined);
  return { selection, nichesCovered: bestPerNiche.size, antiConvergence: true,
    method: 'quality_times_novelty_per_niche' };
}

function scheduleReplicas(input = {}) {
  const niches = Array.isArray(input.niches) ? input.niches : [];
  const budget = Math.max(1, Number(input.replicaBudget) || niches.length || 1);
  const populated = input.populatedNiches && typeof input.populatedNiches === 'object' ? input.populatedNiches : {};
  const ordered = [...niches].sort((a, b) => (populated[a] || 0) - (populated[b] || 0));
  const replicas = [];
  for (let i = 0; i < budget; i++) {
    const niche = ordered[i % Math.max(1, ordered.length)];
    if (niche) replicas.push({ replica: i, targetNiche: niche, pressure: 'anti_convergence' });
  }
  return { replicas, totalReplicas: replicas.length, antiConvergence: true };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function archiveError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { behaviorVector, distance, addBehavior, noveltyScore, assignNiche,
  qualityDiversitySelect, scheduleReplicas, MAX_ARCHIVE };
