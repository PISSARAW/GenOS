'use strict';

/**
 * Génomes d'hypothèses (reproduction cognitive, déterministe seedée).
 *
 * Une hypothèse devient un organisme : {ontology, causalAssumptions,
 * abstractions, invariants, strategy, operators, evidenceRequirements,
 * predictionModel} — tableaux de chaînes bornés. Opérateurs : crossover
 * (single-point, uniform, inherit 80/20 social, rival-invert), mutate
 * (délétion, duplication, inversion, seedée mulberry32), graft (greffe
 * d'une propriété donneuse), twinSplit (clone ×2 divergé), fossilToHypothesis
 * (résurrection : hard_parts + raison d'extinction, à revalider).
 * Aucun appel LLM : mécanique structurelle pure, replay exact par seed.
 */

const GENOME_FIELDS = ['ontology', 'causalAssumptions', 'abstractions', 'invariants', 'strategy', 'operators', 'evidenceRequirements', 'predictionModel'];
const MAX_GENES = 12;
const MAX_GENE_CHARS = 200;

function cleanGenes(list) {
  if (!Array.isArray(list)) return [];
  const genes = [];
  for (const item of list) {
    if (typeof item !== 'string' || !item.trim()) continue;
    genes.push(item.trim().slice(0, MAX_GENE_CHARS));
    if (genes.length >= MAX_GENES) break;
  }
  return genes;
}

function createGenome(input) {
  const data = input || {};
  const genome = { id: typeof data.id === 'string' ? data.id.slice(0, 64) : null, origin: data.origin || null };
  for (const field of GENOME_FIELDS) genome[field] = cleanGenes(data[field]);
  return genome;
}

function hashSeed(seed) {
  const text = String(seed ?? 'genos');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function crossoverGenes(left, right, rand, mode) {
  if (mode === 'uniform') return left.map((gene, index) => (rand() < 0.5 ? gene : (right[index % Math.max(right.length, 1)] || gene)));
  const point = 1 + Math.floor(rand() * Math.max(left.length - 1, 1));
  return [...left.slice(0, point), ...right.slice(point)];
}

function invertGenes(genes) {
  return genes.map((gene) => (gene.startsWith('not:') ? gene.slice(4) : `not:${gene}`));
}

function crossover(a, b, options) {
  const settings = options || {};
  const rand = mulberry32(hashSeed(settings.seed));
  const mode = settings.strategy || 'single-point';
  const child = createGenome({ origin: { parents: [a.id, b.id].filter(Boolean), mode, seed: String(settings.seed ?? 'genos') } });
  for (const field of GENOME_FIELDS) {
    if (mode === 'rival-invert') {
      child[field] = [...a[field], ...invertGenes(b[field])].slice(0, MAX_GENES);
    } else if (mode === 'inherit') {
      const kept = a[field].filter(() => rand() < 0.8);
      const grafted = b[field].filter(() => rand() < 0.5);
      child[field] = [...kept, ...grafted].slice(0, MAX_GENES);
    } else {
      child[field] = crossoverGenes(a[field] || [], b[field] || [], rand, mode);
    }
  }
  return child;
}

function mutate(genome, options) {
  const settings = options || {};
  const rand = mulberry32(hashSeed(settings.seed));
  const rate = Math.max(0, Math.min(1, Number(settings.rate) || 0.2));
  const child = createGenome({ ...genome, origin: { ...(genome.origin || {}), mutated: true, seed: String(settings.seed ?? 'genos') } });
  for (const field of GENOME_FIELDS) {
    const genes = [];
    for (const gene of genome[field] || []) {
      const roll = rand();
      if (roll < rate / 2) continue;
      genes.push(gene);
      if (roll > 1 - rate / 2) genes.push(pick(rand, [gene, `not:${gene}`]));
    }
    child[field] = genes.slice(0, MAX_GENES);
  }
  return child;
}

function graft(genome, donor, property) {
  if (!donor || typeof property !== 'string' || !GENOME_FIELDS.includes(property)) {
    throw new Error('graft requires donor and a valid genome property');
  }
  const child = createGenome({ ...genome, origin: { ...(genome.origin || {}), graft: property } });
  child[property] = [...genome[property], ...cleanGenes(donor[property])].slice(0, MAX_GENES);
  return child;
}

function twinSplit(genome, seedA, seedB) {
  return [
    mutate(genome, { seed: seedA ?? 'twin-a', rate: 0.3 }),
    mutate(genome, { seed: seedB ?? 'twin-b', rate: 0.3 })
  ];
}

function chimeraCross(a, b) {
  const chimera = require('./chimeraService');
  const shared = (a.ontology || []).filter((gene) => (b.ontology || []).includes(gene));
  return chimera.weaveChimera(
    [...(a.causalAssumptions || []), ...(a.ontology || [])],
    [...(b.causalAssumptions || []), ...(b.ontology || [])],
    shared
  );
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_) {
    return [];
  }
}

async function fossilToHypothesis(db, fossilId) {
  if (!db || !fossilId) return null;
  try {
    const row = await db.get('SELECT fossil_id, extinct_lineage_id, reason, hard_parts_json, mineral_payload_json FROM fossils WHERE fossil_id = ?', fossilId);
    if (!row) return null;
    return createGenome({
      id: `hypo-fossil-${row.fossil_id}`,
      ontology: parseJsonArray(row.mineral_payload_json).map(String),
      causalAssumptions: [],
      abstractions: parseJsonArray(row.hard_parts_json).map(String),
      invariants: [],
      strategy: [],
      operators: [],
      evidenceRequirements: ['revalidate in current environment'],
      predictionModel: [],
      origin: { fossilId: row.fossil_id, lineage: row.extinct_lineage_id, reason: row.reason || 'unknown' }
    });
  } catch (_) {
    return null;
  }
}

async function resurrectCandidate(db, agentId) {
  if (!db || !agentId) return null;
  try {
    const row = await db.get('SELECT fossil_id FROM fossils ORDER BY recorded_at DESC LIMIT 1');
    if (!row) return null;
    return fossilToHypothesis(db, row.fossil_id);
  } catch (_) {
    return null;
  }
}

module.exports = { createGenome, crossover, mutate, graft, twinSplit, chimeraCross, fossilToHypothesis, resurrectCandidate, GENOME_FIELDS };
