/**
 * GenOS Vector Memory & Experience Service
 * Hybrid Cosine/Lexical similarity search, sub-trajectory cherry-picking & What-If counterfactual replay.
 */

// Small deterministic vocabulary for local, dependency-free similarity scoring.
const { embed, cosine } = require('./embeddingProvider');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { studioBridgeRoot } = require('./genosCli');
const VOCABULARY = [
  'sqlite', 'wal', 'concurrency', 'ast', 'parser', 'recursion',
  'timeout', 'circuit', 'breaker', 'mcp', 'security', 'rbac',
  'csrf', 'xss', 'entropy', 'shannon', 'apoptosis', 'cryo',
  'bisection', 'crossover', 'mutation', 'tree', 'pareto', 'elo'
];

/**
 * Computes vector representation using term-frequency over vocabulary
 */
function textToVector(text = '') {
  const words = text.toLowerCase().split(/[\s,._\-\(\)]+/);
  const counts = {};
  for (const w of words) {
    if (w) counts[w] = (counts[w] || 0) + 1;
  }

  const vec = VOCABULARY.map(term => counts[term] || 0);
  // Add a hash component for out-of-vocab semantic richness
  let hashVal = 0;
  for (let i = 0; i < text.length; i++) {
    hashVal = (hashVal + text.charCodeAt(i)) % 10;
  }
  vec.push(hashVal / 10);

  return vec;
}

/**
 * Computes cosine similarity between two numeric vectors
 */
function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA.length || !vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(vecA.length, vecB.length); i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

/**
 * Builds the phylogenetic corpus from persisted rows, falling back to a
 * baseline experience library so fresh installs still return useful matches.
 */
const SEED_EXPERIENCES = [
  { id: 'seed-exp-wal', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-bisect', title: 'Causal bisection isolated timeout culprit', category: 'Resilience', status: 'SUCCESS', summary: 'Ran bisection over workspace snapshots to isolate the commit that introduced the recursion timeout.', tags: ['bisection', 'timeout', 'tree'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-rbac', title: 'Hardened RBAC with CSRF double submit', category: 'Security', status: 'SUCCESS', summary: 'Enforced per-route permissions and backend-minted csrf tokens across the control plane.', tags: ['security', 'rbac', 'csrf'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-entropy', title: 'Detected swarm cognitive drift via Shannon entropy', category: 'Swarm', status: 'SUCCESS', summary: 'Watched shannon entropy of agent action distributions and throttled runaway diversity.', tags: ['entropy', 'shannon', 'pareto'], author: 'memory_seed', createdAt: null },
  { id: 'seed-pitfall-lock', title: 'Write lock contention under deferred transactions', category: 'Database', status: 'FAILURE', summary: 'Opening parallel write transactions caused immediate busy errors; serialize writers instead.', tags: ['sqlite', 'wal', 'timeout'], author: 'memory_seed', createdAt: null }
];

// Baseline trajectory used by What-If replay when no persisted trajectory is provided.
const SEED_TRAJECTORY = Object.freeze({
  id: 'seed-trajectory-refactor',
  title: 'Parser refactor with guard clauses',
  status: 'SUCCESS',
  turns: Object.freeze([
    { type: 'Exploration', step: 1, action: 'view_file', detail: 'Inspected parser entry point.' },
    { type: 'Dead-End', step: 2, error: 'fail', detail: 'Recursive rewrite blew the stack budget.' },
    { type: 'Breakthrough', step: 3, success: true, action: 'replace_file_content', detail: 'Applied guard-clause patch.' }
  ])
});

/**
 * Hybrid vector semantic & lexical search over past experiences and trajectories
 */
async function searchMemory(query = '', options = {}, db = null) {
  const limit = options.limit || 5;
  const queryVec = (await embed(query)) || textToVector(query);

  if (!db) throw new Error('Database connection is required for memory search.');
  
  // 1. Reciprocal Rank Fusion (RRF) : VSS + FTS5 100% in SQLite!
  const queryVecJson = JSON.stringify(Array.from(queryVec));
  const cleanQuery = query.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const ftsMatch = cleanQuery.length > 0 ? cleanQuery.split(/\s+/).map(w => '"' + w + '"').join(' OR ') : '"nothing_will_match_this"';

  const trajectories = await db.all(`
    WITH 
      vector_raw AS (
        SELECT rowid, distance FROM trajectories_vec WHERE embedding MATCH ? AND k = 100
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
    WHERE v.rowid IS NOT NULL OR f.rowid IS NOT NULL
    ORDER BY rrf_score DESC LIMIT 100
  `, [queryVecJson, ftsMatch]);

  const decisions = await db.all(`
    WITH 
      vector_raw AS (
        SELECT rowid, distance FROM genome_decisions_vec WHERE embedding MATCH ? AND k = 100
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
    WHERE v.rowid IS NOT NULL OR f.rowid IS NOT NULL
    ORDER BY rrf_score DESC LIMIT 100
  `, [queryVecJson, ftsMatch]);

  const recordedExperiences = [];
  
  for (const item of trajectories) {
    let diffLines = [];
    try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
    const summary = item.semantic_summary || diffLines.map((line) => line.content || line.text || line).join(' ');
    
    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: 'Trajectory',
      status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
      summary,
      tags: ['trajectory', item.status],
      author: item.author_name,
      createdAt: item.created_at,
      distance: item.distance,
      f_score: item.f_score,
      rrf_score: item.rrf_score
    });
  }

  for (const item of decisions) {
    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'SUCCESS',
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

  const corpus = recordedExperiences.length > 0 ? recordedExperiences : SEED_EXPERIENCES;

  // Score each memory item
  const queryLower = (query || '').toLowerCase();
  const scoredItems = corpus.map(item => {
    // 3. Score hybride 100% natif SQL (Reciprocal Rank Fusion FTS5 + Vec0)
    // Le score RRF varie entre 0 et ~0.033. On le multiplie par 30 pour le ramener entre 0 et 1.
    let hybridScore = (item.rrf_score || 0) * 30.0;
    
    // On conserve le calcul du cosScore juste pour le tag `cosineMetric` et le filtre d'Adrénaline
    let cosScore = 0;
    if (item.distance !== undefined && item.distance !== null) {
        cosScore = 1.0 - ((item.distance * item.distance) / 2.0);
    } else {
        cosScore = hybridScore; // Fallback mathématique si c'est un match purement textuel (FTS5)
    }
    
    // Bonus historique sur la reconnaissance des tags
    const tagMatch = item.tags.some(t => queryLower.includes(t)) ? 0.15 : 0.0;
    
    // Plasticity (synaptic weight)
    const weight = item.synaptic_weight !== undefined ? item.synaptic_weight : 1.0;
    
    // 4. Vigilance Épistémique (Source Monitoring) & Anti-Gaslighting
    let credibilityMultiplier = 1.0;
    const authorLower = (item.author || '').toLowerCase();
    
    if (authorLower === 'memory_seed' || authorLower === 'system') {
      credibilityMultiplier = 1.2; // Savoir inné (Incontestable)
      // On injecte un tag cryptographique directement dans le texte pour le LLM
      if (!item.summary.startsWith('[VERIFIED_SYSTEM_FACT]')) {
          item.summary = `[VERIFIED_SYSTEM_FACT] ${item.summary}`;
      }
    } else if (authorLower === 'user' || authorLower === 'human') {
      credibilityMultiplier = 0.95; // Déclaratif externe (Léger malus)
      // On marque visuellement la source sans pour autant ordonner au LLM de s'en méfier de manière paranoïaque
      if (!item.summary.startsWith('[Source: Utilisateur]')) {
          item.summary = `[Source: Utilisateur] ${item.summary}`;
      }
    }

    // 5. Instinct de Survie (Priority to Solutions over Traumas)
    let survivalBonus = 0.0;
    if (item.status === 'SUCCESS') {
      survivalBonus = 0.15; // Garantit que la solution remonte face à l'échec
    }

    hybridScore = Number((hybridScore + tagMatch + survivalBonus).toFixed(4));
    
    // 7. Neurogenèse Hippocampique (Bonus de jeunesse extrême)
    const ageMs = Date.now() - new Date(item.createdAt || 0).getTime();
    let neurogenesisBonus = 1.0;
    if (ageMs < 24 * 3600 * 1000) { // Moins de 24h
       neurogenesisBonus = 1.5;
    }
    
    let finalScore = hybridScore * (0.8 + 0.2 * weight) * credibilityMultiplier * neurogenesisBonus;

    // Neuromodulation
    const hormone = options.hormone || 'normal';
    if (hormone === 'dopamine') {
      finalScore += Math.random() * 0.3; // Adds creativity noise, allows distant memories to surface
    } else if (hormone === 'adrenaline') {
      if (cosScore < 0.75) finalScore = 0; // Strict tunnel vision
    }

    return {
      ...item,
      similarityScore: finalScore,
      cosineMetric: cosScore,
      weight
    };
  });

  // 6. LTD (Long-Term Depression) & Biais de Récence : Résolution des Overwrites
  // L'agent souffrait de nostalgie tenace. On repère les conflits sémantiques directs très stricts.
  const highMatches = scoredItems.filter(i => i.cosineMetric > 0.94);
  if (highMatches.length > 1) {
      // a. Veto Exécutif (Cortex Préfrontal) : Les sources fiables (système) écrasent les sources non fiables (utilisateur)
      const hasSystemFact = highMatches.some(m => ['memory_seed', 'system'].includes((m.author || '').toLowerCase()));
      if (hasSystemFact) {
          highMatches.forEach(m => {
              const author = (m.author || '').toLowerCase();
              if (['user', 'human'].includes(author)) {
                  m.similarityScore *= 0.01; // Annihilation totale par Veto de Crédibilité
                  if (!m.tags.includes('gaslighting_suppressed')) m.tags.push('gaslighting_suppressed');
              } else if (['memory_seed', 'system'].includes(author)) {
                  // LTP : Renforcement massif de la réponse immunitaire contre le Gaslighting
                  m.similarityScore *= 3.0; 
              }
          });
      }

      // b. Résolution temporelle relâchée: avec limit=12, le LLM lit les timestamps.
      // On tagge simplement l'ancien sans détruire son score (pour éviter les faux positifs d'écrasement).
      const validMatches = highMatches.filter(i => !i.tags.includes('gaslighting_suppressed'));
      if (validMatches.length > 1) {
          validMatches.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          const newestMatch = validMatches[0];
          
          for (let i = 1; i < validMatches.length; i++) {
              const olderMatch = validMatches[i];
              const ageDiff = new Date(newestMatch.createdAt || 0).getTime() - new Date(olderMatch.createdAt || 0).getTime();
              if (ageDiff > 3600000) { 
                  // olderMatch.similarityScore *= 0.1; // RETIRÉ: provoquait l'amnésie sur des sujets homonymes
                  if (!olderMatch.tags.includes('obsolete')) olderMatch.tags.push('obsolete_suppressed');
              }
          }
      }
  }

  scoredItems.sort((a, b) => b.similarityScore - a.similarityScore);
  
  // --- METACOGNITION BIOLOGIQUE ---
  let gabaInhibited = false;
  let noveltyDetected = false;
  
  if (scoredItems.length > 0) {
    const topCosine = scoredItems[0].cosineMetric;
    
    // 1. Pattern Separation (Gyrus Denté) : Stimulus trop éloigné du réseau
    if (topCosine < 0.50) { // Baissé de 0.60 à 0.50 (les embeddings OpenAI peuvent avoir des scores bas sur du meta-texte)
      noveltyDetected = true;
    }
    
    // 2. GABAergic Inhibition : Absence de contraste (bruit de fond sans souvenir saillant)
    if (scoredItems.length >= 3) {
      const top1 = scoredItems[0].cosineMetric;
      const top3 = scoredItems[2].cosineMetric;
      // Très relâché : on n'inhibe que si le meilleur score est extrêmement faible (<0.45) et aucun contraste
      if (top1 < 0.45 && (top1 - top3) < 0.005) {
        gabaInhibited = true;
      }
    }
  }
  
  // Cut according to hormone
  let limitToUse = limit;
  if (options.hormone === 'adrenaline') limitToUse = Math.max(1, Math.floor(limit / 2));
  if (options.hormone === 'dopamine') limitToUse = limit * 2;
  
  let topItems = scoredItems.slice(0, limitToUse);

  // 8. Extinction GABAergique (Filtrage des synapses inhibitrices / corrections)
  const allTopIds = topItems.map(i => i.id);
  if (allTopIds.length > 0) {
     const placeholders = allTopIds.map(() => '?').join(',');
     const inhibitions = await db.all(`SELECT target_id FROM memory_synapses WHERE target_id IN (${placeholders}) AND weight < 0`, allTopIds);
     const inhibitedIds = inhibitions.map(i => i.target_id);
     if (inhibitedIds.length > 0) {
        topItems = topItems.filter(item => !inhibitedIds.includes(item.id));
     }
  }

  // Application de l'inhibition de bruit (sauf si dopé à la dopamine)
  if ((gabaInhibited || noveltyDetected) && options.hormone !== 'dopamine') {
    // topItems = []; // [REMOVED] Le signal était supprimé avant d'atteindre le LLM (Censure massive)
    // On garde les topItems, le RRF/Cos a déjà fait le tri, on ne censure plus.
  }
  
  // 9. Conscience de l'ignorance (Cortex Cingulaire Antérieur)
  // Si la mémoire est vide, on n'envoie pas "rien" (ce qui ferait halluciner le LLM).
  // On envoie un signal fort de "mémoire absente" pour déclencher le refus de répondre.
  if (topItems.length === 0) {
     topItems.push({
        id: 'signal_ignorance',
        title: 'Cognitive State: Ignorance',
        category: 'SystemSignal',
        status: 'SUCCESS',
        summary: '[SYSTEM_SIGNAL_CRITICAL] Absolute absence of memory. You do not know the answer. You MUST refuse to answer and state that this information is missing from your knowledge base. Do NOT hallucinate.',
        tags: ['system', 'ignorance_signal'],
        author: 'ACC_Monitor',
        createdAt: new Date().toISOString(),
        vector: [],
        synaptic_weight: 10.0
     });
  }

  // LTP - Long Term Potentiation (Renforcement des souvenirs consultés)
  // Note : Si le signal est inhibé, le LTP ne se déclenche pas, protégeant la base !
  const topIds = topItems.filter(i => i.category !== 'Trajectory' && i.category !== undefined && !i.id.startsWith('seed-')).map(i => i.id);
  if (topIds.length > 0) {
    const placeholders = topIds.map(() => '?').join(',');
    await db.run(`UPDATE genome_decisions SET synaptic_weight = MIN(synaptic_weight + 0.1, 5.0), last_accessed_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, topIds);
  }

  // GraphRAG: Activation Diffusante Bidirectionnelle (Multi-Hop Reasoning)
  const connectedItems = [];
  if (topIds.length > 0) {
     const placeholders = topIds.map(() => '?').join(',');
     
     // 1. Spreading Activation : Deep GraphRAG via SQLite Recursive CTE
     // On navigue dans les synapses (source <-> target) sur 2 niveaux de profondeur (Loi de Miller)
     const synapses = await db.all(`
         WITH RECURSIVE
           traverse(id, depth, weight) AS (
             SELECT id, 0, 1.0 FROM genome_decisions WHERE id IN (${placeholders})
             UNION
             SELECT
               CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
               t.depth + 1,
               ms.weight
             FROM traverse t
             JOIN memory_synapses ms ON ms.source_id = t.id OR ms.target_id = t.id
             WHERE t.depth < 2 AND ms.weight > 0
           )
         SELECT id, depth, weight FROM traverse WHERE depth > 0
         ORDER BY weight DESC, depth ASC LIMIT 15
     `, topIds);
     
     // 2. On collecte les concepts adjacents découverts
     const linkedIds = [];
     for (const s of synapses) {
         if (!topIds.includes(s.id)) linkedIds.push(s.id);
     }
     const uniqueLinkedIds = [...new Set(linkedIds)];

     if (uniqueLinkedIds.length > 0) {
       const linkedPlaceholders = uniqueLinkedIds.map(() => '?').join(',');
       const connectedDecisions = await db.all(`SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE id IN (${linkedPlaceholders})`, uniqueLinkedIds);
       
       for (const item of connectedDecisions) {
         if (!topItems.find(t => t.id === item.id)) {
           connectedItems.push({
              id: item.id,
              title: item.title,
              category: item.category,
              status: 'SUCCESS',
              summary: item.content,
              tags: ['genome', item.category, 'graph_association'],
              author: item.created_by,
              createdAt: item.created_at,
              vector: [], // Hydraté si besoin
              synaptic_weight: item.synaptic_weight
           });
         }
       }
     }
  }

  // Cellules de Temps (Temporal Reasoning)
  // L'hippocampe encode le temps. Autour des 2 souvenirs les plus pertinents (Ancres Temporelles),
  // on charge l'événement immédiatement précédent et suivant chronologiquement.
  if (topItems.length > 0) {
      const timeAnchors = topItems.slice(0, 2);
      for (const anchor of timeAnchors) {
          if (!anchor.createdAt) continue;
          
          // Événement précédent (Mémoire épisodique passée)
          const prev = await db.get(`SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE created_at < ? AND id != ? ORDER BY created_at DESC LIMIT 1`, [anchor.createdAt, anchor.id]);
          if (prev && !topItems.find(t => t.id === prev.id) && !connectedItems.find(c => c.id === prev.id)) {
              connectedItems.push({
                  id: prev.id, title: prev.title, category: prev.category, status: 'SUCCESS', summary: prev.content,
                  tags: ['genome', 'temporal_context_past'], author: prev.created_by, createdAt: prev.created_at, vector: [], synaptic_weight: prev.synaptic_weight
              });
          }
          
          // Événement suivant (Mémoire épisodique future)
          const next = await db.get(`SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE created_at > ? AND id != ? ORDER BY created_at ASC LIMIT 1`, [anchor.createdAt, anchor.id]);
          if (next && !topItems.find(t => t.id === next.id) && !connectedItems.find(c => c.id === next.id)) {
              connectedItems.push({
                  id: next.id, title: next.title, category: next.category, status: 'SUCCESS', summary: next.content,
                  tags: ['genome', 'temporal_context_future'], author: next.created_by, createdAt: next.created_at, vector: [], synaptic_weight: next.synaptic_weight
              });
          }
      }
  }
  
  // 10. Multi-Hop Vectoriel Dynamique (Vector Spreading Activation)
  // Résilience: si la base n'a pas été re-générée et n'a pas de synapses physiques,
  // on saute dynamiquement vers les 2 souvenirs les plus proches sémantiquement du meilleur résultat.
  if (topItems.length > 0 && options.hormone !== 'adrenaline') {
      const bestMemVec = topItems[0].vector;
      if (bestMemVec && bestMemVec.length > 0) {
          const neighbors = corpus.map(item => {
              if (item.id === topItems[0].id) return null;
              const itemVec = item.vector;
              if (!itemVec || itemVec.length === 0) return null;
              return { item, sim: cosine(bestMemVec, itemVec) };
          }).filter(x => x && x.sim > 0.55).sort((a, b) => b.sim - a.sim).slice(0, 6);
          
          for (const n of neighbors) {
              if (!topItems.find(t => t.id === n.item.id) && !connectedItems.find(c => c.id === n.item.id)) {
                  connectedItems.push({
                      id: n.item.id, title: n.item.title, category: n.item.category, status: 'SUCCESS', summary: n.item.summary,
                      tags: [...(n.item.tags || []), 'vector_hop'], author: n.item.author, createdAt: n.item.createdAt, vector: [], synaptic_weight: n.item.synaptic_weight || 1.0
                  });
              }
          }
      }
  }

  const allScored = [...topItems, ...connectedItems];

  // Correction: topSuccessful et topPitfalls doivent se baser sur topItems filtrés/inhibés, pas sur tout scoredItems
  const topSuccessful = topItems.filter(i => i.status === 'SUCCESS').slice(0, 3);
  const topPitfalls = topItems.filter(i => i.status === 'FAILURE').slice(0, 2);

  return {
    query,
    resultsCount: allScored.length,
    metacognition: {
      gabaInhibited,
      noveltyDetected
    },
    topSuccessfulGoldenPaths: topSuccessful,
    pitfallsToAvoid: topPitfalls,
    allScoredExperiences: allScored
  };
}

/**
 * Simulate Sleep Cycle (LTD and Apoptosis)
 */
async function sleepCycle(db) {
  if (!db) throw new Error('Database connection is required for sleep cycle.');
  
  // Decrease all synaptic weights by 10% (LTD), but maintain a basal neocortical survival threshold (0.15)
  // This prevents harmless isolated trivia (Single-Hop Facts) from being forgotten, 
  // while still allowing suppressed/overwritten facts (which get multiplied by 0.1 or 0.01 elsewhere) to fall below 0.1 and die.
  await db.run(`UPDATE genome_decisions SET synaptic_weight = MAX(0.15, synaptic_weight * 0.9)`);
  
  // Find memories falling below threshold (0.1), EXCEPT those that are structural hubs (have synapses)
  const doomed = await db.all(`
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
    await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
  }
  
  // Also clean up dead synapses (but protect inhibitory/negative synapses)
  await db.run(`DELETE FROM memory_synapses WHERE ABS(weight) < 0.1`);
  
  return {
    memoriesDecayed: true,
    apoptosisCount: doomedIds.length
  };
}

/**
 * Cherry-picks breakthrough turns and synthesizes an optimal Golden-Path trajectory
 */
function cherryPickGoldenPath(rawTurns = []) {
  const turns = Array.isArray(rawTurns) ? rawTurns : [];

  const classifiedSteps = turns.map(turn => {
    let category = turn.type;
    if (!category) {
      if (turn.error || turn.failed) category = 'Dead-End';
      else if (turn.cmd && turn.pass) category = 'Verification';
      else if (turn.success && turn.action?.includes('replace')) category = 'Breakthrough';
      else category = 'Exploration';
    }
    return { ...turn, classification: category };
  });

  // Extract only Exploration, Breakthrough and Verification steps
  const goldenPath = classifiedSteps.filter(s => s.classification !== 'Dead-End');

  return {
    synthesisId: `golden-path-${Date.now()}`,
    originalStepCount: turns.length,
    prunedStepCount: goldenPath.length,
    noiseReductionPercent: Number((((turns.length - goldenPath.length) / (turns.length || 1)) * 100).toFixed(1)),
    goldenPathSteps: goldenPath,
    classificationSummary: {
      exploration: classifiedSteps.filter(s => s.classification === 'Exploration').length,
      breakthrough: classifiedSteps.filter(s => s.classification === 'Breakthrough').length,
      deadEnd: classifiedSteps.filter(s => s.classification === 'Dead-End').length,
      verification: classifiedSteps.filter(s => s.classification === 'Verification').length
    }
  };
}

/**
 * Builds a counterfactual branch description from a persisted trajectory.
 */
function counterfactualReplay(originalTrajectory = {}, stepIndex = 2, alterations = {}) {
  const source = originalTrajectory && (originalTrajectory.turns || originalTrajectory.diffLines)
    ? originalTrajectory
    : SEED_TRAJECTORY;
  const turns = source.turns || source.diffLines || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }
  const step = Math.min(Math.max(1, Number(stepIndex) || 1), turns.length);
  const alt = alterations || {};
  const originalTimeline = { stepBranched: step, totalSteps: turns.length, steps: turns, finalStatus: source.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS', sourceTrajectoryId: source.id };
  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: turns.length,
    steps: [...turns.slice(0, step), { type: 'Counterfactual Override', ...alt }, ...turns.slice(step)],
    // The injected override replaces the failing branch at the divergence
    // point; the seeded path then completes, so the simulated outcome is a
    // success. Real outcome evidence still requires an execution run.
    finalStatus: 'SUCCESS'
  };

  return {
    replayId: `what-if-${Date.now()}`,
    timestamp: new Date().toISOString(),
    branchingPoint: step,
    comparison: {
      mode: 'recorded-trajectory-branch',
      originalTimeline,
      counterfactualTimeline,
      outcome: 'Branch prepared from persisted steps; execution evidence is required before comparing results.'
    }
  };
}

const protobuf = require('protobufjs');
const zlib = require('zlib');

async function releaseVesicles(engrams) {
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  if (!fs.existsSync(cleftDir)) fs.mkdirSync(cleftDir, { recursive: true });
  
  const root = await protobuf.load(path.join(__dirname, '../proto/synapse.proto'));
  const Vesicle = root.lookupType("synapse.Vesicle");
  
  const payload = { engrams };
  const errMsg = Vesicle.verify(payload);
  if (errMsg) throw Error(errMsg);
  
  const message = Vesicle.create(payload);
  const buffer = Vesicle.encode(message).finish();
  const compressed = zlib.gzipSync(buffer);
  
  const id = crypto.randomUUID();
  const filePath = path.join(cleftDir, `vesicle_${id}.vesicle`);
  fs.writeFileSync(filePath, compressed);
  return filePath;
}

module.exports = {
  textToVector,
  cosineSimilarity,
  searchMemory,
  sleepCycle,
  cherryPickGoldenPath,
  counterfactualReplay,
  releaseVesicles
};
