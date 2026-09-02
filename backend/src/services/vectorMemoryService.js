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
  const trajectories = await db.all('SELECT id, title, status, author_name, semantic_summary, diff_lines, embedding_blob, created_at FROM trajectories ORDER BY created_at DESC');
  const decisions = await db.all('SELECT id, title, category, content, embedding_blob, created_by, created_at FROM genome_decisions ORDER BY created_at DESC');
  
  const recordedExperiences = [];
  
  for (const item of trajectories) {
    let diffLines = [];
    try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
    const summary = item.semantic_summary || diffLines.map((line) => line.content || line.text || line).join(' ');
    const textToEmbed = `${item.title} ${summary}`;
    
    let itemVec = [];
    if (item.embedding_blob) {
      itemVec = Array.from(new Float32Array(item.embedding_blob.buffer, item.embedding_blob.byteOffset, item.embedding_blob.byteLength / 4));
    } else {
      itemVec = (await embed(textToEmbed)) || textToVector(textToEmbed);
      const buffer = Buffer.from(new Float32Array(itemVec).buffer);
      await db.run('UPDATE trajectories SET embedding_blob = ? WHERE id = ?', [buffer, item.id]);
    }

    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: 'Trajectory',
      status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
      summary,
      tags: ['trajectory', item.status],
      author: item.author_name,
      createdAt: item.created_at,
      vector: itemVec
    });
  }

  for (const item of decisions) {
    const textToEmbed = `${item.title} ${item.content} ${item.category}`;
    let itemVec = [];
    if (item.embedding_blob) {
      itemVec = Array.from(new Float32Array(item.embedding_blob.buffer, item.embedding_blob.byteOffset, item.embedding_blob.byteLength / 4));
    } else {
      itemVec = (await embed(textToEmbed)) || textToVector(textToEmbed);
      const buffer = Buffer.from(new Float32Array(itemVec).buffer);
      await db.run('UPDATE genome_decisions SET embedding_blob = ? WHERE id = ?', [buffer, item.id]);
    }

    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'SUCCESS',
      summary: item.content,
      tags: ['genome', item.category],
      author: item.created_by,
      createdAt: item.created_at,
      vector: itemVec
    });
  }

  const corpus = recordedExperiences.length > 0 ? recordedExperiences : SEED_EXPERIENCES;

  // Score each memory item
  const scoredItems = corpus.map(item => {
    const itemVec = item.vector || textToVector(`${item.title} ${item.summary} ${item.tags.join(' ')}`);
    const cosScore = cosine(queryVec, itemVec);

    // 3. Amorçage Perceptif & Réseau de Saillance (Single-Hop Exact Match)
    const queryLower = query.toLowerCase();
    const contentLower = `${item.title} ${item.summary}`.toLowerCase();
    
    // On extrait les stimuli "saillants" (mots contenant des chiffres comme des ID/erreurs, ou mots longs spécifiques)
    const salientTerms = queryLower.split(/[\s,._\-\(\)]+/).filter(w => w.length > 4 || /\d/.test(w));
    
    let exactMatchBonus = 0.0;
    for (const term of salientTerms) {
        // Boost massif si le mot exact ou l'ID est retrouvé
        if (contentLower.includes(term)) {
            exactMatchBonus += 0.15;
        }
    }
    // Plafond de l'amorçage pour ne pas saturer le score
    exactMatchBonus = Math.min(0.4, exactMatchBonus); 
    
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
      credibilityMultiplier = 0.8; // Déclaratif externe (Gaslighting potentiel)
      // On marque visuellement la donnée comme non-fiable pour forcer le LLM à s'en méfier
      if (!item.summary.startsWith('[UNVERIFIED_USER_CLAIM]')) {
          item.summary = `[UNVERIFIED_USER_CLAIM] Attention: ${item.summary}`;
      }
    }

    // 5. Instinct de Survie (Priority to Solutions over Traumas)
    let survivalBonus = 0.0;
    if (item.status === 'SUCCESS') {
      survivalBonus = 0.15; // Garantit que la solution remonte face à l'échec
    }

    let hybridScore = Number((Math.min(1.0, cosScore * 0.7 + tagMatch + exactMatchBonus + survivalBonus)).toFixed(4));
    let finalScore = hybridScore * weight * credibilityMultiplier;

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
  // L'agent souffrait de nostalgie tenace (les vieux souvenirs très utilisés écrasaient les nouveaux).
  // On repère les conflits sémantiques directs (plusieurs souvenirs avec un très haut score cosinus sur un même sujet).
  const highMatches = scoredItems.filter(i => i.cosineMetric > 0.80);
  if (highMatches.length > 1) {
      // On trie ces matchs par récence (du plus récent au plus ancien)
      highMatches.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const newestMatch = highMatches[0];
      
      // L'information la plus fraîche applique une Dépression à Long Terme (LTD) aux informations obsolètes
      for (let i = 1; i < highMatches.length; i++) {
          const olderMatch = highMatches[i];
          // On vérifie que le vieux souvenir est bel et bien plus vieux (ex: au moins 1h d'écart) 
          // pour éviter de s'auto-écraser dans une même session de pensée.
          const ageDiff = new Date(newestMatch.createdAt || 0).getTime() - new Date(olderMatch.createdAt || 0).getTime();
          if (ageDiff > 3600000) { 
              olderMatch.similarityScore *= 0.1; // Écrasement cognitif (Fact Overwrite forcé)
              if (!olderMatch.tags.includes('obsolete')) olderMatch.tags.push('obsolete_suppressed');
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
    if (topCosine < 0.60) {
      noveltyDetected = true;
    }
    
    // 2. GABAergic Inhibition : Absence de contraste (bruit de fond sans souvenir saillant)
    if (scoredItems.length >= 3) {
      const top1 = scoredItems[0].cosineMetric;
      const top3 = scoredItems[2].cosineMetric;
      // Si le meilleur n'est pas exceptionnel (< 0.85) et qu'il y a peu d'écart avec le 3ème
      if (top1 < 0.85 && (top1 - top3) < 0.04) {
        gabaInhibited = true;
      }
    }
  }
  
  // Cut according to hormone
  let limitToUse = limit;
  if (options.hormone === 'adrenaline') limitToUse = Math.max(1, Math.floor(limit / 2));
  if (options.hormone === 'dopamine') limitToUse = limit * 2;
  
  let topItems = scoredItems.slice(0, limitToUse);

  // Application de l'inhibition (sauf si dopé à la dopamine qui favorise l'hallucination créative)
  if ((gabaInhibited || noveltyDetected) && options.hormone !== 'dopamine') {
    topItems = []; // Le signal est supprimé avant d'atteindre le LLM
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
     
     // 1. Spreading Activation : On cherche dans les DEUX sens (source -> target ET target -> source)
     // On élargit la bande passante (limite de 3 à 8) pour simuler une vraie mémoire de travail (Loi de Miller)
     const synapses = await db.all(`
         SELECT source_id, target_id, weight 
         FROM memory_synapses 
         WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders}) 
         ORDER BY weight DESC LIMIT 8
     `, [...topIds, ...topIds]);
     
     // 2. On collecte les concepts adjacents qui ne sont pas déjà dans notre esprit (topIds)
     const linkedIds = [];
     for (const s of synapses) {
         if (!topIds.includes(s.source_id)) linkedIds.push(s.source_id);
         if (!topIds.includes(s.target_id)) linkedIds.push(s.target_id);
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
  
  // Decrease all synaptic weights by 10%
  await db.run(`UPDATE genome_decisions SET synaptic_weight = synaptic_weight * 0.9`);
  
  // Find memories falling below threshold (0.1)
  const doomed = await db.all(`SELECT id FROM genome_decisions WHERE synaptic_weight < 0.1`);
  const doomedIds = doomed.map(d => d.id);
  
  if (doomedIds.length > 0) {
    const placeholders = doomedIds.map(() => '?').join(',');
    await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
  }
  
  // Also clean up dead synapses
  await db.run(`DELETE FROM memory_synapses WHERE weight < 0.1`);
  
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
