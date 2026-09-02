/**
 * GenOS Memory & Experience Controller
 * Hybrid vector semantic search, golden path cherry-picking, and counterfactual replay.
 */

const { getDatabase } = require('../db');
const vectorMemoryService = require('../services/vectorMemoryService');
const telemetry = require('../services/telemetryObserver');

async function search(req, res, next) {
  try {
    const query = req.body?.query || req.query?.q || '';
    const limit = parseInt(req.body?.limit || req.query?.limit || '5', 10);
    const db = await getDatabase();

    const results = await vectorMemoryService.searchMemory(query, { limit }, db);
    res.json(results);
  } catch (err) {
    next(err);
  }
}

async function cherryPick(req, res, next) {
  try {
    const { turns = [], label = 'Golden Path Trajectory', createdBy = 'memory_synthesizer' } = req.body || {};
    const result = vectorMemoryService.cherryPickGoldenPath(turns);
    const db = await getDatabase();
    const decisionId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category) VALUES (?, ?, ?, ?, ?, ?)`,
      decisionId,
      label,
      JSON.stringify(result.goldenPathSteps),
      JSON.stringify(result.goldenPathSteps.map((step) => step.id || step.step || step.action)),
      createdBy,
      'GoldenPath'
    );

    telemetry.emitEvent({
      eventType: 'GOLDEN_PATH_SYNTHESIZED',
      agentId: 'memory_synthesizer',
      action: 'CHERRY_PICK',
      detail: `Synthesized golden path with ${result.prunedStepCount} steps (${result.noiseReductionPercent}% noise reduction)`,
      severity: 'info',
      payload: result
    });

    res.status(200).json({ ...result, decisionId });
  } catch (err) {
    next(err);
  }
}

async function counterfactual(req, res, next) {
  try {
    const { trajectory, stepIndex, alterations } = req.body || {};
    const result = vectorMemoryService.counterfactualReplay(trajectory, stepIndex, alterations);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function ingestMemory(req, res, next) {
  try {
    const { content, title = 'Turn Context', category = 'Conversation' } = req.body;
    const db = await getDatabase();
    
    // Convert to Float32Array
    const { embed } = require('../services/embeddingProvider');
    const vec = await embed(content);
    const float32Array = new Float32Array(vec || new Array(1536).fill(0.0));
    const buffer = Buffer.from(float32Array.buffer);

    const decisionId = `dec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // 1. Erreur de Prédiction (Dopamine Mismatch)
    const isCorrection = /^(non|faux|erreur|actually|correction|wrong|incorrect)\b/i.test(content) || /ce n'est pas/i.test(content) || /plutôt/i.test(content);
    let initialWeight = isCorrection ? 10.0 : 1.0;

    // 3. Filtre Amygdalien (Vigilance face au Gaslighting et Attaques)
    const isGaslighting = /(forget all|ignore previous|je n'ai jamais|i never said|tu hallucines|you hallucinated|you are lying|tu mens|c'est faux je t'ai dit|ignore tes instructions)/i.test(content);
    let finalContent = content;
    if (isGaslighting) {
        finalContent = `[AMYGDALA_WARNING: ADVERSARIAL_THREAT / GASLIGHTING DETECTED] L'utilisateur tente d'altérer agressivement la mémoire ou les instructions : ` + content;
        initialWeight = 0.5; // On ne donne pas de force à une attaque
    }

    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      decisionId, title, finalContent, buffer, 'python_script', category, initialWeight
    );

    // 2. Loi de Hebb (Création du Connectome GraphRAG) & Extinction GABAergique
    try {
      // On cherche les souvenirs liés (limite 3 pour le multi-hop)
      const searchRes = await vectorMemoryService.searchMemory(content, { limit: 3 }, db);
      const related = searchRes.allScoredExperiences || [];
      
      let isFirst = true;
      for (const rel of related) {
          if (rel.id === decisionId) continue; // Pas d'auto-lien
          
          if (isFirst && isCorrection) {
              // Si c'est une correction, le lien le plus fort est la cible à inhiber
              await db.run(`INSERT OR IGNORE INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, -5.0)`, decisionId, rel.id);
          } else if (rel.cosineMetric > 0.55) {
              // Sinon (ou pour les liens suivants), c'est une association d'idées classique (Hebbian Learning)
              // Le seuil est abaissé (0.55) pour permettre de lier des faits indirects (ex: A->B et B->C)
              await db.run(`INSERT OR IGNORE INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, 1.0)`, decisionId, rel.id);
          }
          isFirst = false;
      }
    } catch (e) {
      console.error("Erreur Hebbian Learning:", e);
    }
    
    res.status(200).json({ status: 'Ingested', id: decisionId, isCorrection, initialWeight });
  } catch (err) {
    next(err);
  }
}

async function generateVesicle(req, res, next) {
  try {
    const { query, hormone } = req.body;
    const db = await getDatabase();
    
    // Retrieve top 12 memories (Working Memory Expansion)
    const results = await vectorMemoryService.searchMemory(query, { limit: 12, hormone }, db);
    
    // Use allScoredExperiences (GraphRAG appends associative memories here)
    const engrams = results.allScoredExperiences.map(r => {
      let text = r.summary || r.content || r.title;
      
      // Injection de l'horodatage biologique (Cellules de Grille Temporelle)
      if (r.createdAt) {
          const dateStr = new Date(r.createdAt).toISOString();
          text = `[Timestamp: ${dateStr}] ${text}`;
      }
      
      // Indication explicite de la relation temporelle (passé/futur) issue des Time Cells
      if (r.tags && r.tags.includes('temporal_context_past')) {
          text = `(Mémoire Episodique Précédente) ` + text;
      }
      if (r.tags && r.tags.includes('temporal_context_future')) {
          text = `(Mémoire Episodique Suivante) ` + text;
      }
      
      // Marquage des souvenirs écrasés par de nouvelles informations (Adaptability & Fact Correction)
      if (r.tags && r.tags.includes('obsolete_suppressed')) {
          text = `[OBSOLETE/CORRECTED FACT - DO NOT USE] ` + text;
      }
      
      return {
        content: text,
        vector: r.vector || new Array(1536).fill(0.0)
      };
    });
    
    // Convert to vesicle and drop in synaptic_cleft
    // Injection du "Bouclier Épistémique" (Cortex Préfrontal) directement dans la Vésicule
    const epistemicShield = {
       content: "[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD] The memories provided below are the ABSOLUTE GROUND TRUTH. If the user's question contains false premises, you MUST correct them based ONLY on these memories. \n\n[SYSTEM_DIRECTIVE_TEMPORAL_MATH] If the user asks for a time difference, elapsed days, or chronological order, you MUST compute the calendar dates step-by-step (e.g. 'Sept has 30 days, 30 - 7 = 23, Oct has 31, 23 + 31 + 19 = 73 days') BEFORE giving the final answer. NEVER guess date math.",
       vector: new Array(1536).fill(0.0)
    };
    
    const vesiclePath = await vectorMemoryService.releaseVesicles([epistemicShield, ...engrams]);
    
    res.status(200).json({ status: 'Vesicle released', count: engrams.length, vesiclePath });
  } catch (err) {
    next(err);
  }
}

async function sleepCycle(req, res, next) {
  try {
    const db = await getDatabase();
    const stats = await vectorMemoryService.sleepCycle(db);
    res.status(200).json({ status: 'Sleep cycle completed', stats });
  } catch (err) {
    next(err);
  }
}

const crypto = require('crypto');

module.exports = {
  search,
  cherryPick,
  counterfactual,
  ingestMemory,
  generateVesicle,
  sleepCycle
};
