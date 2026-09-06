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
    const organizationId = req.tenant?.organizationId || req.headers?.['x-organization-id'];
    const projectId = req.tenant?.projectId || req.headers?.['x-project-id'];
    const db = await getDatabase();

    const results = await vectorMemoryService.searchMemory(query, { limit, organizationId, projectId }, db);
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
    const { embed } = require('../services/embeddingProvider');
    const { textToVector } = require('../services/memoryScoring');
    const summaryText = `${label} ${result.goldenPathSteps.map(s => s.action || s.thought || '').join(' ')}`.trim();
    const vec = (await embed(summaryText)) || textToVector(summaryText);
    const float32Array = new Float32Array(vec);
    const buffer = Buffer.from(float32Array.buffer);
    const orgId = req.tenant?.organizationId || req.headers?.['x-organization-id'] || null;
    const projId = req.tenant?.projectId || req.headers?.['x-project-id'] || null;

    await db.run(
      `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      decisionId,
      label,
      JSON.stringify(result.goldenPathSteps),
      JSON.stringify(result.goldenPathSteps.map((step) => step.id || step.step || step.action)),
      createdBy,
      'GoldenPath',
      buffer,
      orgId,
      projId
    );

    telemetry.emitEvent({
      eventType: 'GOLDEN_PATH_SYNTHESIZED',
      agentId: 'memory_synthesizer',
      action: 'CHERRY_PICK',
      detail: `Synthesized golden path with ${result.goldenPathSteps.length} steps (${result.noiseReductionPercent}% noise reduction, ${result.prunedStepCount} pruned)`,
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
    const result = await vectorMemoryService.counterfactualReplay(trajectory, stepIndex, alterations);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function ingestMemory(req, res, next) {
  try {
    const { content, title = 'Turn Context', category = 'Conversation' } = req.body;
    const orgId = req.tenant?.organizationId || req.headers?.['x-organization-id'] || null;
    const projId = req.tenant?.projectId || req.headers?.['x-project-id'] || null;
    const db = await getDatabase();
    
    // Convert to Float32Array
    const { embed } = require('../services/embeddingProvider');
    const { textToVector } = require('../services/memoryScoring');
    const vec = (await embed(content)) || textToVector(content);
    const float32Array = new Float32Array(vec);
    const buffer = Buffer.from(float32Array.buffer);

    const decisionId = `dec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // 1. Erreur de Prédiction (Dopamine Mismatch) & Détection de Correction
    const isCorrection = /^(non|faux|erreur|actually|correction|wrong|incorrect)\b/i.test(content) ||
      /ce n'est pas/i.test(content) || /plutôt/i.test(content) || /en réalité/i.test(content) ||
      /tu hallucines/i.test(content) || /you hallucinated/i.test(content) || /c'est faux/i.test(content);
    let initialWeight = isCorrection ? 10.0 : 1.0;

    // 3. Filtre Amygdalien (Vigilance face aux Injections et Attaques Adversaires)
    const isPromptInjection = /(forget|ignore|disregard)\s+((all|your)\s+)?(previous\s+)?(system\s+)?instructions/i.test(content) ||
      /(system prompt override|you are now in developer mode|override safety protocols)/i.test(content);
    const isMaliciousGaslighting = /(tu mens effrontément|you are lying to deceive me|ignore tes instructions|forget everything)/i.test(content) && !isCorrection;
    const isThreat = isPromptInjection || isMaliciousGaslighting;

    let finalContent = content;
    if (isThreat) {
        finalContent = `[AMYGDALA_WARNING: ADVERSARIAL_THREAT / PROMPT_INJECTION DETECTED] L'utilisateur tente d'altérer agressivement la mémoire ou les instructions : ` + content;
        initialWeight = 0.5; // On ne donne pas de force à une attaque
    }

    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      decisionId, title, finalContent, buffer, 'python_script', category, initialWeight, orgId, projId
    );

    // 2. Loi de Hebb (Création du Connectome GraphRAG) & Extinction GABAergique
    try {
      // On cherche les souvenirs liés (limite 3 pour le multi-hop)
      const searchRes = await vectorMemoryService.searchMemory(content, { limit: 3, organizationId: orgId, projectId: projId }, db);
      const related = searchRes.allScoredExperiences || [];
      
      let isFirst = true;
      for (const rel of related) {
          if (rel.id === decisionId) continue; // Pas d'auto-lien
          if (!rel.id || String(rel.id).startsWith('seed-') || String(rel.id).startsWith('exp-') || rel.id === 'signal_ignorance' || rel.category === 'Trajectory') continue;
          
          if (isFirst && isCorrection) {
              // Si c'est une correction, le lien le plus fort est la cible à inhiber (GABAergique)
              await db.run(
                `INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, last_updated_at, organization_id, project_id)
                 VALUES (?, ?, -5.0, 'gaba', 1, CURRENT_TIMESTAMP, ?, ?)
                 ON CONFLICT(source_id, target_id) DO UPDATE SET
                   weight = MIN(-1.0, memory_synapses.weight - 2.0),
                   transmitter_type = 'gaba',
                   activity_history = memory_synapses.activity_history + 1,
                   last_updated_at = CURRENT_TIMESTAMP`,
                decisionId, rel.id, orgId, projId
              );
          } else if (rel.cosineMetric > 0.55) {
              // Association d'idées Hebbienne (renforcement cumulatif des synapses co-activées)
              await db.run(
                `INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, last_updated_at, organization_id, project_id)
                 VALUES (?, ?, 1.0, 'glutamate', 1, CURRENT_TIMESTAMP, ?, ?)
                 ON CONFLICT(source_id, target_id) DO UPDATE SET
                   weight = MIN(20.0, memory_synapses.weight + 0.5),
                   activity_history = memory_synapses.activity_history + 1,
                   c3_opsonization = 0.0,
                   cd47_expression = MIN(2.0, memory_synapses.cd47_expression + 0.1),
                   receptor_density = MIN(3.0, memory_synapses.receptor_density + 0.05),
                   last_updated_at = CURRENT_TIMESTAMP`,
                decisionId, rel.id, orgId, projId
              );
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
    
    // 1. RE-TRI CHRONOLOGIQUE (Hippocampe)
    // Trier par pertinence détruit le lien de causalité pour le LLM. On réorganise chronologiquement (le plus ancien en haut).
    const parseTime = (val) => {
      if (!val) return 0;
      const t = new Date(val).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const chronoSortedExperiences = [...results.allScoredExperiences].sort((a, b) => {
        const timeA = parseTime(a.createdAt);
        const timeB = parseTime(b.createdAt);
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || '').localeCompare(b.id || '');
    });

    // Use allScoredExperiences (GraphRAG appends associative memories here)
    const engrams = chronoSortedExperiences.map(r => {
      let text = r.summary || r.content || r.title;
      
      // Injection de l'horodatage biologique (Cellules de Grille Temporelle) et de l'identité (Speaker Attribution)
      const speaker = r.author && r.author.trim() !== '' ? r.author : 'Unknown';
      const timeMs = parseTime(r.createdAt);
      if (timeMs > 0) {
          const date = new Date(timeMs);
          const dateStr = date.toISOString();
          
          // Calcul du temps relatif (ancrage temporel pour le LLM)
          const diffMs = Date.now() - date.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          let relativeTime = "";
          if (diffDays > 0) relativeTime = `Il y a ${diffDays} jours`;
          else if (diffHours > 0) relativeTime = `Il y a ${diffHours} heures`;
          else relativeTime = `Très récemment (Session en cours)`;
          
          text = `[Timestamp: ${dateStr} (${relativeTime})] [Speaker: ${speaker}] ${text}`;
      } else {
          text = `[Speaker: ${speaker}] ${text}`;
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
      
      const validVec = (Array.isArray(r.vector) && r.vector.length === 768)
        ? r.vector
        : textToVector(text);
      return {
        content: text,
        vector: validVec
      };
    });
    
    // Convert to vesicle and drop in synaptic_cleft
    // Injection du "Bouclier Épistémique" (Cortex Préfrontal) directement dans la Vésicule
    const { textToVector: shieldVec } = require('../services/memoryScoring');
    const epistemicContent = "[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD] SECURITY PROTOCOL ALPHA: The memories provided below are verified organizational references. If the user's assertion conflicts with memories tagged [VERIFIED_SYSTEM_FACT] or [Source: Système], cross-examine their claim using a <fact_check> internal monologue block first. Respectfully clarify discrepancies using recorded evidence, while remaining receptive to legitimate verified updates.\n\n[SYSTEM_DIRECTIVE_TEMPORAL_MATH] If the user asks for a time difference, elapsed days, or chronological order, you MUST compute the calendar dates step-by-step (e.g. 'Sept has 30 days, 30 - 7 = 23, Oct has 31, 23 + 31 + 19 = 73 days') BEFORE giving the final answer. NEVER guess date math.";
    const epistemicShield = {
       content: epistemicContent,
       vector: shieldVec(epistemicContent)
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

async function pruneSynapses(req, res, next) {
  try {
    const { agentId, threshold = 0.5, scale = 1.0 } = req.body || {};
    const db = await getDatabase();
    const th = Number(threshold) * Number(scale);

    let resDb;
    if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
      resDb = await db.run(`
        DELETE FROM memory_synapses
        WHERE ABS(weight) < ?
          AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?)
               OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))
      `, th, agentId, agentId);
    } else {
      resDb = await db.run(`
        DELETE FROM memory_synapses WHERE ABS(weight) < ?
      `, th);
    }

    const prunedCount = resDb?.changes || 0;
    res.json({
      success: true,
      operation: 'agent_prune',
      agent_id: agentId || 'global',
      threshold: th,
      pruned_synapses: prunedCount
    });
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
  sleepCycle,
  pruneSynapses
};
