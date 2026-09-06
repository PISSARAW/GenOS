/**
 * GenOS Vector Memory & Cognitive Experience Service
 * Hybrid Lexical/Vector Search, Epistemic Shield, Hebbian Plasticity, GraphRAG, and Synaptic Vesicles
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDatabase } = require('../db');
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

const SEED_EXPERIENCES = [
  { id: 'exp-001', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-bisect', title: 'Causal bisection isolated timeout culprit', category: 'Resilience', status: 'SUCCESS', summary: 'Ran bisection over workspace snapshots to isolate the commit that introduced the recursion timeout.', tags: ['bisection', 'timeout', 'tree'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-rbac', title: 'Hardened RBAC with CSRF double submit', category: 'Security', status: 'SUCCESS', summary: 'Enforced per-route permissions and backend-minted csrf tokens across the control plane.', tags: ['security', 'rbac', 'csrf'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-entropy', title: 'Detected swarm cognitive drift via Shannon entropy', category: 'Swarm', status: 'SUCCESS', summary: 'Watched shannon entropy of agent action distributions and throttled runaway diversity.', tags: ['entropy', 'shannon', 'pareto'], author: 'memory_seed', createdAt: null },
  { id: 'seed-pitfall-lock', title: 'Write lock contention under deferred transactions', category: 'Database', status: 'FAILURE', summary: 'Opening parallel write transactions caused immediate busy errors; serialize writers instead.', tags: ['sqlite', 'wal', 'timeout'], author: 'memory_seed', createdAt: null }
];

class VectorMemoryService {
  async initDb() {
    return getDatabase();
  }

  async storeMemory(agentId, content, embedding = null) {
    const db = await this.initDb();
    await db.exec('CREATE TABLE IF NOT EXISTS memory_entries (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT)');
    const id = `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.run('INSERT INTO memory_entries (id, agent_id, content) VALUES (?, ?, ?)', id, agentId, content);

    const vec = (embedding && embedding.length === 768)
      ? embedding
      : ((await embed(content)) || textToVector(content));
    const float32 = new Float32Array(vec);
    const buffer = Buffer.from(float32.buffer);
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, 'Agent Experience', content, buffer, agentId, 'Experience', 1.0
    );
    return id;
  }

  async deleteMemory(memoryId) {
    const db = await this.initDb();
    await db.run('DELETE FROM memory_entries WHERE id = ?', memoryId);
    await db.run('DELETE FROM genome_decisions WHERE id = ?', memoryId);
  }

  async fetchCorpus(db, query, queryVec, options = {}) {
    if (!db) return [];
    const ownerId = String(options.ownerId || '').trim();
    const ownerFilter = ownerId ? ' AND t.created_by = ?' : '';
    const ownerParams = ownerId ? [ownerId] : [];
    const queryVecJson = JSON.stringify(Array.from(queryVec));
    const cleanQuery = query.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const ftsMatch = cleanQuery.length > 0
      ? cleanQuery.split(/\s+/).map(w => `"${w}"`).join(' OR ')
      : '"nothing_will_match_this"';

    try {
      const trajectories = await db.all(`
        WITH 
          vector_raw AS (
            SELECT rowid, distance FROM trajectories_vec WHERE embedding MATCH ? AND k = 50
          ),
          vector_matches AS (
            SELECT rowid, distance, row_number() OVER (ORDER BY distance ASC) as v_rank FROM vector_raw
          ),
          fts_raw AS (
            SELECT rowid, -bm25(trajectories_fts) as f_score FROM trajectories_fts WHERE trajectories_fts MATCH ?
          ),
          fts_matches AS (
            SELECT rowid, f_score, row_number() OVER (ORDER BY f_score DESC) as f_rank FROM fts_raw
          )
        SELECT t.id, t.title, t.status, t.author_name, t.semantic_summary, t.diff_lines, t.created_at, 
               v.distance, f.f_score,
               (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + f.f_rank), 0.0)) as rrf_score
        FROM trajectories t
        LEFT JOIN vector_matches v ON t.rowid = v.rowid
        LEFT JOIN fts_matches f ON t.rowid = f.rowid
        WHERE (v.rowid IS NOT NULL OR f.rowid IS NOT NULL)
          ${ownerId ? 'AND t.author_id = ?' : ''}
        ORDER BY rrf_score DESC LIMIT 50
      `, [queryVecJson, ftsMatch, ...ownerParams]);

      const decisions = await db.all(`
        WITH 
          vector_raw AS (
            SELECT rowid, distance FROM genome_decisions_vec WHERE embedding MATCH ? AND k = 50
          ),
          vector_matches AS (
            SELECT rowid, distance, row_number() OVER (ORDER BY distance ASC) as v_rank FROM vector_raw
          ),
          fts_raw AS (
            SELECT rowid, -bm25(genome_decisions_fts) as f_score FROM genome_decisions_fts WHERE genome_decisions_fts MATCH ?
          ),
          fts_matches AS (
            SELECT rowid, f_score, row_number() OVER (ORDER BY f_score DESC) as f_rank FROM fts_raw
          )
        SELECT t.id, t.title, t.category, t.content, t.created_by, t.created_at, t.synaptic_weight,
               v.distance, f.f_score,
               (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + f.f_rank), 0.0)) as rrf_score
        FROM genome_decisions t
        LEFT JOIN vector_matches v ON t.rowid = v.rowid
        LEFT JOIN fts_matches f ON t.rowid = f.rowid
        WHERE (v.rowid IS NOT NULL OR f.rowid IS NOT NULL)${ownerFilter}
        ORDER BY rrf_score DESC LIMIT 50
      `, [queryVecJson, ftsMatch, ...ownerParams]);

      const items = [];
      for (const item of trajectories) {
        let diffLines = [];
        try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
        items.push({
          id: item.id,
          title: item.title,
          category: 'Trajectory',
          status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
          summary: item.semantic_summary || diffLines.map(l => l.content || l.text || l).join(' '),
          tags: ['trajectory', item.status],
          author: item.author_name,
          createdAt: item.created_at,
          distance: item.distance,
          f_score: item.f_score,
          rrf_score: item.rrf_score
        });
      }

      for (const item of decisions) {
        items.push({
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: item.content,
          tags: ['genome', item.category],
          author: item.created_by,
          createdAt: item.created_at,
          synaptic_weight: item.synaptic_weight,
          distance: item.distance,
          f_score: item.f_score,
          rrf_score: item.rrf_score
        });
      }
      if (items.length > 0) return items;
    } catch {}

    // Fallback: standard SQL table scan
    try {
      const trajectories = await db.all(`SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at FROM trajectories${ownerId ? ' WHERE author_id = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
      const decisions = await db.all(`SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions${ownerFilter ? ' WHERE created_by = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
      return [
        ...trajectories.map(item => {
          let diffLines = [];
          try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
          return {
            id: item.id,
            title: item.title,
            category: 'Trajectory',
            status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
            summary: item.semantic_summary || diffLines.map(l => l.content || l.text || l).join(' '),
            tags: ['trajectory', item.status],
            author: item.author_name,
            createdAt: item.created_at
          };
        }),
        ...decisions.map(item => ({
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: item.content,
          tags: ['genome', item.category],
          author: item.created_by,
          createdAt: item.created_at,
          synaptic_weight: item.synaptic_weight
        }))
      ];
    } catch {
      return [];
    }
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
    const topIds = topItems.map(i => i.id);
    if (topIds.length > 0 && db) {
      try {
        const placeholders = topIds.map(() => '?').join(',');
        const inhibitions = await db.all(
          `SELECT s.target_id FROM memory_synapses s
             JOIN genome_decisions source_node ON source_node.id = s.source_id
            WHERE s.target_id IN (${placeholders}) AND s.weight < 0
              ${options.ownerId ? 'AND source_node.created_by = ?' : ''}
            GROUP BY s.target_id
            HAVING SUM(s.weight) < 0`,
          options.ownerId ? [...topIds, options.ownerId] : topIds
        );
        const inhibitedIds = new Set(inhibitions.map(i => i.target_id));
        topItems = topItems.map(item => inhibitedIds.has(item.id)
          ? { ...item, inhibitorySignal: 'active' }
          : item);
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
    const connectedItems = await expandGraphRag(topItems, db, { hormone: options.hormone, corpus: scoredItems });
    const allScored = [...topItems, ...connectedItems];
    const isGolden = (item) => item.category !== 'Conversation' && item.category !== 'SystemSignal';
    const candidateGolden = topItems.filter(i => i.status === 'SUCCESS' && isGolden(i));
    const fallbackGolden = topItems.filter(i => i.status === 'SUCCESS');
    const topSuccessful = (candidateGolden.length > 0 ? candidateGolden : fallbackGolden).slice(0, 3);
    const topPitfalls = topItems.filter(i => i.status === 'FAILURE').slice(0, 2);

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
    const database = db || (await this.initDb());
    if (!database) return { success: false, consolidated: false, memoriesDecayed: false, apoptosisCount: 0, error: 'Database unavailable.' };

    try {
      await database.run(
        'UPDATE genome_decisions SET synaptic_weight = CASE WHEN synaptic_weight >= 0.15 THEN MAX(0.15, synaptic_weight * 0.9) ELSE synaptic_weight * 0.9 END'
      );

      const doomed = await database.all(`
        SELECT g.id 
        FROM genome_decisions g
        LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
        WHERE g.synaptic_weight < 0.1 
        GROUP BY g.id
        HAVING COUNT(s.source_id) = 0
      `);
      const doomedIds = doomed.map(d => d.id);

      if (doomedIds.length > 0) {
        const placeholders = doomedIds.map(() => '?').join(',');
        await database.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
      }

      await database.run('DELETE FROM memory_synapses WHERE ABS(weight) < 0.1');

      const exosomeStats = await synapticTransmission.absorbExosomes(database);

      return {
        success: exosomeStats.success !== false,
        consolidated: true,
        memoriesDecayed: true,
        apoptosisCount: doomedIds.length,
        exosomesAbsorbed: exosomeStats.absorbedCount,
        engramsStored: exosomeStats.engramsStored,
        plasmidsAssimilated: exosomeStats.plasmidsAssimilated,
        errors: exosomeStats.errors || []
      };
    } catch (error) {
      return { success: false, consolidated: false, memoriesDecayed: false, apoptosisCount: 0, error: error.message };
    }
  }

  async releaseVesicles(engrams = []) {
    return synapticTransmission.releaseVesicles(engrams);
  }

  async uptakeVesicles() {
    return synapticTransmission.uptakeVesicles();
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
