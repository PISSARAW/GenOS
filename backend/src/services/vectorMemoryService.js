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

const SEED_EXPERIENCES = [
  { id: 'exp-001', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency'], author: 'memory_seed', createdAt: '2026-09-01T08:00:00.000Z' },
  { id: 'seed-exp-bisect', title: 'Causal bisection isolated timeout culprit', category: 'Resilience', status: 'SUCCESS', summary: 'Ran bisection over workspace snapshots to isolate the commit that introduced the recursion timeout.', tags: ['bisection', 'timeout', 'tree'], author: 'memory_seed', createdAt: '2026-09-02T10:30:00.000Z' },
  { id: 'seed-exp-rbac', title: 'Hardened RBAC with CSRF double submit', category: 'Security', status: 'SUCCESS', summary: 'Enforced per-route permissions and backend-minted csrf tokens across the control plane.', tags: ['security', 'rbac', 'csrf'], author: 'memory_seed', createdAt: '2026-09-03T14:15:00.000Z' },
  { id: 'seed-exp-entropy', title: 'Detected swarm cognitive drift via Shannon entropy', category: 'Swarm', status: 'SUCCESS', summary: 'Watched shannon entropy of agent action distributions and throttled runaway diversity.', tags: ['entropy', 'shannon', 'pareto'], author: 'memory_seed', createdAt: '2026-09-04T09:00:00.000Z' },
  { id: 'seed-pitfall-lock', title: 'Write lock contention under deferred transactions', category: 'Database', status: 'FAILURE', summary: 'Opening parallel write transactions caused immediate busy errors; serialize writers instead.', tags: ['sqlite', 'wal', 'timeout'], author: 'memory_seed', createdAt: '2026-09-05T16:45:00.000Z' }
];

function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      return Array.from(float32);
    }
  } catch (_) {}
  return [];
}

class VectorMemoryService {
  async initDb() {
    return getDatabase();
  }

  async storeMemory(agentId, content, embedding = null, optionsOrTenant = {}) {
    const db = await this.initDb();
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent) throw new Error('Memory content is required.');
    const id = optionsOrTenant.id || `mem_${crypto.createHash('sha256').update(`${agentId}\0${normalizedContent}`).digest('hex').slice(0, 32)}`;
    const existing = await db.get('SELECT id FROM genome_decisions WHERE id = ?', id);
    if (existing) return existing.id;

    const title = optionsOrTenant.title || 'Agent Experience';
    const category = optionsOrTenant.category || 'Experience';
    const synapticWeight = Number.isFinite(Number(optionsOrTenant.synapticWeight)) ? Number(optionsOrTenant.synapticWeight) : 1.0;
    const orgId = optionsOrTenant.organizationId || optionsOrTenant.organization_id || null;
    const projId = optionsOrTenant.projectId || optionsOrTenant.project_id || null;

    const vec = (embedding && embedding.length === 768)
      ? embedding
      : ((await embed(normalizedContent)) || textToVector(normalizedContent));
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
    if (!db) return [];
    const ownerId = String(options.ownerId || '').trim();
    const orgId = String(options.organizationId || '').trim();
    const orgFilter = orgId ? ' AND (t.organization_id = ? OR t.organization_id IS NULL)' : '';
    const ownerFilter = ownerId ? ' AND t.created_by = ?' : '';
    const trajParams = [];
    if (ownerId) trajParams.push(ownerId);
    if (orgId) trajParams.push(orgId);
    const decParams = [];
    if (ownerId) decParams.push(ownerId);
    if (orgId) decParams.push(orgId);
    const validVec = Array.isArray(queryVec) && queryVec.length === 768 ? queryVec : null;
    const queryVecJson = validVec ? JSON.stringify(Array.from(validVec)) : null;
    const cleanQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    const rawTokens = cleanQuery.split(/\s+/).filter(w => w.length > 0);
    // Preserve French and multilingual terms while stripping isolated elisions (l', d')
    const tokens = rawTokens.length > 1
      ? rawTokens.filter(w => w.length > 1 || /\d/.test(w))
      : rawTokens;
    const ftsMatch = tokens.length > 0
      ? tokens.map(w => `"${w.replace(/"/g, '""')}"`).join(' OR ')
      : null;

    // 1. Decoupled Vector Matches
    const trajVectorMap = new Map();
    const decVectorMap = new Map();
    if (queryVecJson) {
      try {
        const vRows = await db.all(
          `SELECT rowid, distance 
           FROM trajectories_vec WHERE embedding MATCH ? AND k = 50`,
          [queryVecJson]
        );
        vRows.forEach((r, idx) => {
          trajVectorMap.set(r.rowid, { distance: r.distance, rank: idx + 1 });
        });
      } catch (err) {
        console.warn('[VectorMemory] trajectories_vec query failed:', err.message);
      }

      try {
        const vRows = await db.all(
          `SELECT rowid, distance 
           FROM genome_decisions_vec WHERE embedding MATCH ? AND k = 50`,
          [queryVecJson]
        );
        vRows.forEach((r, idx) => {
          decVectorMap.set(r.rowid, { distance: r.distance, rank: idx + 1 });
        });
      } catch (err) {
        console.warn('[VectorMemory] genome_decisions_vec query failed:', err.message);
      }
    }

    // 2. Decoupled FTS5 Matches
    const trajFtsMap = new Map();
    const decFtsMap = new Map();
    if (ftsMatch) {
      try {
        const fRows = await db.all(
          `SELECT rowid, -bm25(trajectories_fts) as f_score 
           FROM trajectories_fts WHERE trajectories_fts MATCH ? 
           ORDER BY f_score DESC LIMIT 50`,
          [ftsMatch]
        );
        fRows.forEach((r, idx) => {
          trajFtsMap.set(r.rowid, { f_score: r.f_score, rank: idx + 1 });
        });
      } catch (err) {
        console.warn('[VectorMemory] trajectories_fts query failed:', err.message);
      }

      try {
        const fRows = await db.all(
          `SELECT rowid, -bm25(genome_decisions_fts) as f_score 
           FROM genome_decisions_fts WHERE genome_decisions_fts MATCH ? 
           ORDER BY f_score DESC LIMIT 50`,
          [ftsMatch]
        );
        fRows.forEach((r, idx) => {
          decFtsMap.set(r.rowid, { f_score: r.f_score, rank: idx + 1 });
        });
      } catch (err) {
        console.warn('[VectorMemory] genome_decisions_fts query failed:', err.message);
      }
    }

    // 3. Hydrate matching rows and compute RRF
    const trajRowIds = Array.from(new Set([...trajVectorMap.keys(), ...trajFtsMap.keys()]));
    const decRowIds = Array.from(new Set([...decVectorMap.keys(), ...decFtsMap.keys()]));
    const items = [];

    if (trajRowIds.length > 0) {
      try {
        const placeholders = trajRowIds.map(() => '?').join(',');
        const queryParams = [...trajRowIds];
        let sql = `SELECT rowid, id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob 
                   FROM trajectories t WHERE rowid IN (${placeholders})`;
        if (ownerId) {
          sql += ' AND t.author_id = ?';
          queryParams.push(ownerId);
        }
        if (orgId) {
          sql += orgFilter;
          queryParams.push(orgId);
        }
        const rows = await db.all(sql, queryParams);
        for (const item of rows) {
          const v = trajVectorMap.get(item.rowid);
          const f = trajFtsMap.get(item.rowid);
          const vRankScore = v ? 1.0 / (60 + v.rank) : 0.0;
          const fRankScore = f ? 1.0 / (60 + f.rank) : 0.0;
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
            vector: decodeEmbeddingBlob(item.embedding_blob),
            distance: v ? v.distance : null,
            f_score: f ? f.f_score : null,
            rrf_score: vRankScore + fRankScore
          });
        }
      } catch (err) {
        console.warn('[VectorMemory] Failed to hydrate trajectory rows:', err.message);
      }
    }

    if (decRowIds.length > 0) {
      try {
        const placeholders = decRowIds.map(() => '?').join(',');
        const queryParams = [...decRowIds];
        let sql = `SELECT rowid, id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob 
                   FROM genome_decisions t WHERE rowid IN (${placeholders})`;
        if (ownerId) {
          sql += ownerFilter;
          queryParams.push(ownerId);
        }
        if (orgId) {
          sql += orgFilter;
          queryParams.push(orgId);
        }
        const rows = await db.all(sql, queryParams);
        for (const item of rows) {
          const v = decVectorMap.get(item.rowid);
          const f = decFtsMap.get(item.rowid);
          const vRankScore = v ? 1.0 / (60 + v.rank) : 0.0;
          const fRankScore = f ? 1.0 / (60 + f.rank) : 0.0;
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
            vector: decodeEmbeddingBlob(item.embedding_blob),
            distance: v ? v.distance : null,
            f_score: f ? f.f_score : null,
            rrf_score: vRankScore + fRankScore
          });
        }
      } catch (err) {
        console.warn('[VectorMemory] Failed to hydrate decision rows:', err.message);
      }
    }

    if (items.length > 0) {
      items.sort((a, b) => (b.rrf_score || 0) - (a.rrf_score || 0));
      return items.slice(0, 50);
    }

    // Fallback: standard SQL table scan
    try {
      const ownerParams = ownerId ? [ownerId] : [];
      const trajectories = await db.all(`SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob FROM trajectories${ownerId ? ' WHERE author_id = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
      const decisions = await db.all(`SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions${ownerFilter ? ' WHERE created_by = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
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
            createdAt: item.created_at,
            vector: decodeEmbeddingBlob(item.embedding_blob)
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
          synaptic_weight: item.synaptic_weight,
          vector: decodeEmbeddingBlob(item.embedding_blob)
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
            WHERE s.target_id IN (${placeholders}) AND (s.weight < 0 OR s.transmitter_type = 'gaba')
              ${options.ownerId ? 'AND source_node.created_by = ?' : ''}
            GROUP BY s.target_id
            HAVING SUM(CASE WHEN s.transmitter_type = 'gaba' THEN -ABS(s.weight) ELSE s.weight END) < 0`,
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
    const connectedItems = await expandGraphRag(topItems, db, {
      hormone: options.hormone,
      corpus: scoredItems,
      ownerId: options.ownerId,
      organizationId: options.organizationId,
      projectId: options.projectId
    });
    const allScored = [...topItems, ...connectedItems];

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
    const explicitCandidates = allScored.filter(i => (i.status === 'SUCCESS' || !i.status || i.status === 'approved') && isExplicitGolden(i));

    let topSuccessful;
    if (explicitCandidates.length > 0) {
      const seen = new Set();
      topSuccessful = explicitCandidates.filter(i => {
        if (!i.id || seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      }).slice(0, 3);
    } else {
      const isExecution = (i) => i.category !== 'Conversation' && i.category !== 'SystemSignal' && i.category !== 'Fact' && i.category !== 'Preference';
      const candidateGolden = topItems.filter(i => i.status === 'SUCCESS' && isExecution(i));
      const fallbackGolden = topItems.filter(i => i.status === 'SUCCESS' && i.category !== 'Conversation' && i.category !== 'SystemSignal');
      topSuccessful = (candidateGolden.length > 0 ? candidateGolden : fallbackGolden).slice(0, 3);
    }
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
      let doomedIds = [];
      let exosomeStats;
      await withTransaction(database, async (tx) => {
        // 1. Natural asymptotic decay on decisions without artificial 0.15 clamp
        await tx.run(
          'UPDATE genome_decisions SET synaptic_weight = ROUND(synaptic_weight * 0.9, 4)'
        );

        // 2. Synaptic connection decay: unused connections attenuate over time, receptors retract, C3 marks increase
        await tx.run(
          'UPDATE memory_synapses SET weight = ROUND(weight * 0.95, 4), receptor_density = MAX(0.0, receptor_density - 0.05), c3_opsonization = MIN(2.0, c3_opsonization + 0.05), cd47_expression = MAX(0.0, cd47_expression - 0.05)'
        );

        // 3. Prune dead synapses below transmission threshold OR tagged for microglial elimination (C3 > 0.5 & CD47 < 0.5)
        await tx.run('DELETE FROM memory_synapses WHERE ABS(weight) < 0.05 OR (c3_opsonization > 0.5 AND cd47_expression < 0.5)');

        // 4. Select orphaned weak memories (< 0.1) with no remaining active synapses
        const doomed = await tx.all(`
          SELECT g.id 
          FROM genome_decisions g
          LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
          WHERE g.synaptic_weight < 0.1 
          GROUP BY g.id
          HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
        `);
        doomedIds = doomed.map(d => d.id);

        if (doomedIds.length > 0) {
          const placeholders = doomedIds.map(() => '?').join(',');
          await tx.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
        }

        // 5. Trajectory retention & pruning: remove stale rejected non-exceptional trajectories
        let prunedTrajectories = 0;
        try {
          const res = await tx.run(`
            DELETE FROM trajectories 
            WHERE is_exceptional = 0 
              AND status = 'rejected' 
              AND datetime(created_at) < datetime('now', '-7 days')
          `);
          prunedTrajectories = res?.changes || 0;
        } catch (_) {}

        exosomeStats = await synapticTransmission.absorbExosomes(tx);
        exosomeStats.prunedTrajectories = prunedTrajectories;
      });

      return {
        success: exosomeStats.success !== false,
        consolidated: true,
        memoriesDecayed: true,
        apoptosisCount: doomedIds.length,
        prunedTrajectories: exosomeStats.prunedTrajectories || 0,
        exosomesAbsorbed: exosomeStats.absorbedCount,
        engramsStored: exosomeStats.engramsStored,
        plasmidsAssimilated: exosomeStats.plasmidsAssimilated,
        errors: exosomeStats.errors || []
      };
    } catch (error) {
      return { success: false, consolidated: false, memoriesDecayed: false, apoptosisCount: 0, error: error.message };
    }
  }

  async releaseVesicles(engrams = [], options = {}) {
    return synapticTransmission.releaseVesicles(engrams, options);
  }

  async uptakeVesicles(targetAgentId = null) {
    return synapticTransmission.uptakeVesicles(targetAgentId);
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
