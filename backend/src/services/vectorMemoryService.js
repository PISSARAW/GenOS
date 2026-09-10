/**
 * GenOS Vector Memory & Cognitive Experience Service
 * Hybrid Lexical/Vector Search, Epistemic Shield, Hebbian Plasticity, GraphRAG, and Synaptic Vesicles
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDatabase } = require('../db');
const { withTransaction } = require('../db');
const { embed } = require('./embeddingProvider');
const synapticTransmission = require('./synapticTransmissionService');
const {
  textToVector,
  cosineSimilarity,
  scoreCorpusItem,
  evaluateMetacognition
} = require('./memoryScoring');
const { expandGraphRag } = require('./graphRagService');
const {
  cherryPickGoldenPath,
  counterfactualReplay
} = require('./trajectoryService');
const sleepCycleService = require('./sleepCycle');

const {
  SEED_EXPERIENCES,
  decodeEmbeddingBlob,
  fetchCorpus
} = require('./vectorMemoryCorpus');

class VectorMemoryService {
  async initDb() {
    return getDatabase();
  }

  async storeMemory(agentId, content, embedding = null, optionsOrTenant = {}) {
    const db = await this.initDb();
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent) throw new Error('Memory content is required.');
    const orgId = optionsOrTenant.organizationId || optionsOrTenant.organization_id || null;
    const projId = optionsOrTenant.projectId || optionsOrTenant.project_id || null;
    const id = optionsOrTenant.id || `mem_${crypto.createHash('sha256').update(`${orgId || ''}\0${projId || ''}\0${agentId}\0${normalizedContent}`).digest('hex').slice(0, 32)}`;
    const existing = await db.get('SELECT id FROM genome_decisions WHERE id = ?', id);
    if (existing) return existing.id;

    const title = optionsOrTenant.title || 'Agent Experience';
    const category = optionsOrTenant.category || 'Experience';
    const synapticWeight = Number.isFinite(Number(optionsOrTenant.synapticWeight)) ? Number(optionsOrTenant.synapticWeight) : 1.0;
    const vec = (embedding && embedding.length === 768)
      ? embedding
      : ((await embed(normalizedContent)) || textToVector(normalizedContent));
    if (!Array.isArray(vec) && !ArrayBuffer.isView(vec)) throw new Error('Memory embedding must be an array or typed array.');
    if (vec.length !== 768 || Array.from(vec).some((value) => !Number.isFinite(Number(value)))) {
      throw new Error('Memory embedding must contain exactly 768 finite numeric values.');
    }
    const float32 = new Float32Array(vec);
    const buffer = Buffer.from(float32.buffer);
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, title, normalizedContent, buffer, agentId, category, synapticWeight,
      orgId, projId
    );
    return id;
  }

  async deleteMemory(memoryId) {
    const db = await this.initDb();
    await db.run('DELETE FROM genome_decisions WHERE id = ?', memoryId);
  }

  async fetchCorpus(db, query, queryVec, options = {}) {
    return fetchCorpus(db, query, queryVec, options);
  }

  async searchMemory(queryOrAgent = '', optionsOrVec = {}, maybeDb = null) {
    let query = '';
    let options = {};
    let db = maybeDb;

    if (typeof queryOrAgent === 'string') {
      query = queryOrAgent;
    }
    if (optionsOrVec && typeof optionsOrVec === 'object' && !Array.isArray(optionsOrVec)) {
      options = optionsOrVec;
    } else if (Array.isArray(optionsOrVec)) {
      options = { vector: optionsOrVec, limit: typeof maybeDb === 'number' ? maybeDb : 5 };
      db = null;
    }

    if (!db) {
      try { db = await this.initDb(); } catch {}
    }

    const limit = options.limit || 5;
    const queryVec = options.vector || (await embed(query)) || textToVector(query);

    const fetchedCorpus = await this.fetchCorpus(db, query, queryVec, options);
    const existingIds = new Set(fetchedCorpus.map(i => i.id));
    const mergedSeed = SEED_EXPERIENCES.filter(s => !existingIds.has(s.id));
    const corpus = [...mergedSeed, ...fetchedCorpus];

    const scoredItems = corpus.map(item =>
      scoreCorpusItem(item, { query, queryVec }, options)
    );

    scoredItems.sort((a, b) => b.similarityScore - a.similarityScore);

    let limitToUse = limit;
    if (options.hormone === 'adrenaline') limitToUse = Math.max(1, Math.floor(limit / 2));
    if (options.hormone === 'dopamine') limitToUse = limit * 2;

    let topItems = scoredItems.slice(0, limitToUse);

    // GABAergic Synaptic Inhibition: filter out memories with active negative synapses
    const candidateIds = scoredItems.map(i => i.id).filter(Boolean);
    if (candidateIds.length > 0 && db) {
      try {
        const placeholders = candidateIds.map(() => '?').join(',');
        const inhibitions = await db.all(
          `SELECT s.target_id FROM memory_synapses s
             JOIN genome_decisions source_node ON source_node.id = s.source_id
            WHERE s.target_id IN (${placeholders}) AND (s.weight < 0 OR s.transmitter_type = 'gaba')
              ${options.organizationId ? 'AND (s.organization_id = ? OR s.organization_id IS NULL)' : ''}
            GROUP BY s.target_id
            HAVING SUM(CASE WHEN s.transmitter_type = 'gaba' THEN -ABS(s.weight) ELSE s.weight END) < 0`,
          options.organizationId ? [...candidateIds, options.organizationId] : candidateIds
        );
        const inhibitedIds = new Set(inhibitions.map(i => i.target_id));
        for (const item of scoredItems) {
          if (inhibitedIds.has(item.id)) item.inhibitorySignal = 'active';
        }
        topItems = topItems.map(item => inhibitedIds.has(item.id)
          ? { ...item, inhibitorySignal: 'active' }
          : item);
        const selectedIds = new Set(topItems.map(item => item.id));
        topItems.push(...scoredItems.filter(item => inhibitedIds.has(item.id) && !selectedIds.has(item.id)));
      } catch {}
    }

    // Epistemic Ignorance Signal if memory empty
    if (topItems.length === 0) {
      topItems.push({
        id: 'signal_ignorance',
        title: 'Cognitive State: Ignorance',
        category: 'SystemSignal',
        status: 'SUCCESS',
        summary: '[SYSTEM_SIGNAL_CRITICAL] Absence of memory. You do not know the answer. Refuse to speculate.',
        tags: ['system', 'ignorance_signal'],
        author: 'ACC_Monitor',
        createdAt: new Date().toISOString(),
        vector: [],
        synaptic_weight: 10.0,
        similarityScore: 0.0,
        cosineMetric: 0.0
      });
    }

    // GraphRAG: Spreading activation and time cells
    const connectedItems = await expandGraphRag(topItems, db, {
      hormone: options.hormone,
      corpus: scoredItems,
      ownerId: options.ownerId,
      organizationId: options.organizationId,
      projectId: options.projectId
    });
    const allScored = [...new Map([...scoredItems, ...connectedItems].map((item) => [item.id, item])).values()];

    // Reconsolidation par le rappel (Active Retrieval Potentiation)
    if (db && topItems.length > 0) {
      const recalledIds = topItems
        .filter(i => i.id && !String(i.id).startsWith('seed-') && i.id !== 'signal_ignorance' && i.category !== 'Trajectory')
        .map(i => i.id);
      if (recalledIds.length > 0) {
        try {
          const placeholders = recalledIds.map(() => '?').join(',');
          await db.run(
            `UPDATE genome_decisions 
             SET synaptic_weight = MIN(20.0, COALESCE(synaptic_weight, 1.0) + 0.05)
             WHERE id IN (${placeholders})`,
            ...recalledIds
          );
        } catch {}
      }
    }

    // Explicit Golden Path matching: prioritize records categorized or tagged as GoldenPath/Trajectory
    const isExplicitGolden = (item) => Boolean(
      item && (
        item.category === 'GoldenPath' ||
        item.category === 'Trajectory' ||
        (Array.isArray(item.tags) && (item.tags.includes('golden_path') || item.tags.includes('trajectory')))
      )
    );
    const explicitCandidates = allScored.filter(i => (i.status === 'SUCCESS' || !i.status || i.status === 'approved') && i.inhibitorySignal !== 'active' && isExplicitGolden(i));

    let topSuccessful;
    if (explicitCandidates.length > 0) {
      const seen = new Set();
      topSuccessful = explicitCandidates.filter(i => {
        if (!i.id || seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      }).slice(0, 3);
    } else {
      topSuccessful = [];
    }
    const topPitfalls = (scoredItems.filter(i => (i.status === 'FAILURE' || i.category === 'Failure') && i.id !== 'signal_ignorance')).slice(0, 2);

    return {
      query,
      resultsCount: allScored.length,
      metacognition: evaluateMetacognition(scoredItems),
      topSuccessfulGoldenPaths: topSuccessful,
      pitfallsToAvoid: topPitfalls,
      allScoredExperiences: allScored
    };
  }

  async sleepCycle(db = null) {
    return sleepCycleService.runSleepCycle(db || (await this.initDb()));
  }

  async releaseVesicles(engrams = [], options = {}) {
    return synapticTransmission.releaseVesicles(engrams, options);
  }

  async uptakeVesicles(targetAgentId = null, options = {}) {
    return synapticTransmission.uptakeVesicles(targetAgentId, options);
  }

  async depositExosome(params = {}) {
    return synapticTransmission.depositExosome(params);
  }

  async absorbExosomes(db = null) {
    return synapticTransmission.absorbExosomes(db);
  }

  cherryPickGoldenPath(turns) {
    return cherryPickGoldenPath(turns);
  }

  counterfactualReplay(trajectory, stepIndex, alterations) {
    return counterfactualReplay(trajectory, stepIndex, alterations);
  }
}

const serviceInstance = new VectorMemoryService();

// Export class instance with bound methods + module-level helpers for full backward compatibility
module.exports = Object.assign(serviceInstance, {
  VectorMemoryService,
  textToVector,
  cosineSimilarity,
  cherryPickGoldenPath,
  counterfactualReplay,
  searchMemory: serviceInstance.searchMemory.bind(serviceInstance),
  sleepCycle: serviceInstance.sleepCycle.bind(serviceInstance),
  storeMemory: serviceInstance.storeMemory.bind(serviceInstance),
  deleteMemory: serviceInstance.deleteMemory.bind(serviceInstance),
  releaseVesicles: serviceInstance.releaseVesicles.bind(serviceInstance),
  uptakeVesicles: serviceInstance.uptakeVesicles.bind(serviceInstance),
  depositExosome: serviceInstance.depositExosome.bind(serviceInstance),
  absorbExosomes: serviceInstance.absorbExosomes.bind(serviceInstance)
});
