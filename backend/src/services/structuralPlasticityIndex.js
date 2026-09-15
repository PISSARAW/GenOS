'use strict';

/**
 * @file structuralPlasticityIndex.js
 * @description Métrique Structural Plasticity Index (SPI) — mesure la capacité
 * du système à se réorganiser en réponse aux stimuli.
 */

const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const { firstTruthy, firstNonNull } = require('./primitiveHandlers/searchHelpers');

const WEIGHTS = Object.freeze({
  diversité_synaptique: 0.20,
  mobilité_topologique: 0.20,
  richesse_morphologies: 0.15,
  force_traces_forts: 0.25,
  capacité_reorganisation: 0.20
});

async function computeStructuralPlasticityIndex(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'spi_calculator');

  const [entropyIndex, mobilityIndex, morphIndex, strongIndex, reorganizeIndex, totalSynapses, recent, morphTypes] = await Promise.all([
    computeEntropyIndex(db),
    computeMobilityIndex(db),
    computeMorphologyIndex(db),
    computeStrongIndex(db),
    computeReorganizeIndex(db),
    db.get('SELECT COUNT(*) as cnt FROM memory_synapses'),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE last_updated_at > ?`, new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    getMorphTypes(db)
  ]);

  const spi = computeCombinedIndex({ entropy: entropyIndex, mobility: mobilityIndex, morph: morphIndex, strong: strongIndex, reorganize: reorganizeIndex });
  const grade = classifyGrade(spi);

  telemetry.emitEvent({
    eventType: 'STRUCTURAL_PLASTICITY_INDEX_COMPUTED', agentId, action: 'SPI_CALCULATE',
    detail: `Indice de plasticité structurelle calculé: ${spi} (${grade}).`,
    severity: 'info',
    payload: { spi, grade, entropyIndex, mobilityIndex, morphIndex, strongIndex, reorganizeIndex }
  });

  return {
    success: true,
    structural_plasticity_index: Number(spi),
    grade,
    sous_indices: {
      diversité_synaptique: Number(entropyIndex.toFixed(3)),
      mobilité_topologique: Number(mobilityIndex.toFixed(3)),
      richesse_des_morphologies: Number(morphIndex.toFixed(3)),
      force_des_traces_forts: Number(strongIndex.toFixed(3)),
      capacité_de_reorganisation: Number(reorganizeIndex.toFixed(3))
    },
    pondérations: WEIGHTS,
    total_synapses: totalSynapses.cnt,
    recent_synapses_24h: recent.cnt || 0,
    morphologies_detectees: [...new Set(morphTypes)],
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    reason: `Indice de plasticité structurelle: ${spi} (${grade}).`
  };
}

async function computeEntropyIndex(db) {
  const weightDist = await db.all(`SELECT weight FROM memory_synapses`);
  if (!weightDist || weightDist.length <= 1) return 0.5;
  const bins = 10;
  const histogram = new Array(bins).fill(0);
  const total = weightDist.length;
  for (const row of weightDist) {
    const w = Number(row.weight) || 0;
    const bin = Math.min(bins - 1, Math.floor(w / 2.0 * bins));
    histogram[bin]++;
  }
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(bins);
  return maxEntropy > 0 ? Math.min(1, entropy / maxEntropy) : 0;
}

async function computeMobilityIndex(db) {
  const recent = await db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE last_updated_at > ?`, new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const total = await db.get(`SELECT COUNT(*) as cnt FROM memory_synapses`);
  if (total.cnt === 0) return 0.5;
  return Math.min(1, (recent.cnt || 0) / Math.max(1, total.cnt));
}

async function computeMorphologyIndex(db) {
  const morphCounts = await db.all(`SELECT spine_morphology, COUNT(*) as cnt FROM memory_synapses WHERE spine_morphology IS NOT NULL GROUP BY spine_morphology`);
  const morphTypes = morphCounts.map(r => r.spine_morphology).filter(Boolean);
  const uniqueMorphs = new Set(morphTypes).size;
  const totalMorphs = morphCounts.reduce((s, r) => s + r.cnt, 0);
  if (totalMorphs === 0) return 0.3;
  return Math.min(1, (uniqueMorphs / 3) * (totalMorphs > 5 ? 1 : totalMorphs / 5));
}

async function computeStrongIndex(db) {
  const strong = await db.get(`SELECT AVG(weight) as avg FROM memory_synapses WHERE weight >= 0.5`);
  if (!strong || !Number.isFinite(strong.avg)) return 0.3;
  return Math.min(1, Number(strong.avg) / 2.0);
}

async function computeReorganizeIndex(db) {
  const reorganized = await db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE causal_weight != 1.0 AND causal_weight IS NOT NULL`);
  const totalWithCausal = await db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE causal_weight IS NOT NULL`);
  if (totalWithCausal.cnt === 0) return 0.2;
  return Math.min(1, (reorganized.cnt || 0) / Math.max(1, totalWithCausal.cnt));
}

function getMorphTypes(db) {
  return db.all(`SELECT DISTINCT spine_morphology as m FROM memory_synapses WHERE spine_morphology IS NOT NULL`).then(rows => rows.map(r => r.m));
}

function computeCombinedIndex({ entropy, mobility, morph, strong, reorganize }) {
  return Number(
    entropy * WEIGHTS.diversité_synaptique +
    mobility * WEIGHTS.mobilité_topologique +
    morph * WEIGHTS.richesse_morphologies +
    strong * WEIGHTS.force_traces_forts +
    reorganize * WEIGHTS.capacité_reorganisation
  ).toFixed(4);
}

function classifyGrade(spi) {
  const s = Number(spi);
  if (s >= 0.7) return 'élevée';
  if (s >= 0.4) return 'modérée';
  return 'faible';
}

async function getOrCreateStructuralPlasticityIndex(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'spi_calculator');
  const forceRefresh = context.forceRefresh === true;

  if (!forceRefresh) {
    const cached = await db.get(`SELECT payload_json, computed_at FROM structural_plasticity_cache ORDER BY computed_at DESC LIMIT 1`);
    if (cached) {
      const payload = JSON.parse(cached.payload_json);
      return { success: true, ...payload, from_cache: true, cached_at: cached.computed_at, reason: 'Indice récupéré depuis le cache.' };
    }
  }

  const result = await computeStructuralPlasticityIndex(context);

  try {
    await db.run(`INSERT OR REPLACE INTO structural_plasticity_cache (id, payload_json, computed_at) VALUES ('latest', ?, CURRENT_TIMESTAMP)`, JSON.stringify(result));
  } catch (_) { /* table peut ne pas exister */ }

  return { ...result, from_cache: false };
}

module.exports = { computeStructuralPlasticityIndex, getOrCreateStructuralPlasticityIndex, structuralPlasticityIndex: computeStructuralPlasticityIndex };
