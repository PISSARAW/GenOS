/**
 * GenOS Memory & Experience Controller
 * Hybrid vector semantic search, golden path cherry-picking, and counterfactual replay.
 */

const { getDatabase } = require('../db');
const crypto = require('node:crypto');
const vectorMemoryService = require('../services/vectorMemoryService');
const telemetry = require('../services/telemetryObserver');
const { boundedInteger } = require('./argumentBounds');
const {
  resolveTenantIds,
  firstDefined,
  embedOrFallback,
  toVectorBuffer,
  stepIdentifier,
  goldenSummary,
  detectCorrection,
  detectThreat,
  initialWeightFor,
  sortChronologically,
  buildEngram,
  applyHebbianLearning
} = require('./memoryControllerHelpers');

async function search(req, res, next) {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const searchQuery = body.query || query.q || '';
    const limit = boundedInteger(firstDefined(body.limit, query.limit), 5, 1, 100);
    const organizationId = req.tenant.organizationId;
    const projectId = req.tenant.projectId;
    const db = await getDatabase();

    const results = await vectorMemoryService.searchMemory(searchQuery, { limit, organizationId, projectId }, db);
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
    const summaryText = goldenSummary(label, result.goldenPathSteps);
    const vec = await embedOrFallback(summaryText);
    const buffer = toVectorBuffer(vec);
    const { orgId, projId } = resolveTenantIds(req);

    await db.run(
      `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      decisionId,
      label,
      JSON.stringify(result.goldenPathSteps),
      JSON.stringify(result.goldenPathSteps.map(stepIdentifier)),
      createdBy,
      'GoldenPath',
      buffer,
      orgId,
      projId
    );

    if (result.deadEndSteps && result.deadEndSteps.length > 0) {
      const { persistDeadEndDecisions } = require('../services/primitiveHandlers/memoryDeadEnds');
      await persistDeadEndDecisions(db, result.deadEndSteps, {
        createdBy,
        organizationId: orgId,
        projectId: projId
      });
    }

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
    let targetTrajectory = trajectory;
    if (!targetTrajectory) {
      const db = await getDatabase();
      const row = await db.get('SELECT * FROM trajectories ORDER BY created_at DESC LIMIT 1');
      if (row) {
        targetTrajectory = row;
      } else {
        targetTrajectory = {
          id: 'traj-live-session',
          turns: [
            { step: 1, action: 'init', success: true },
            { step: 2, action: 'process', error: 'fail' },
            { step: 3, action: 'finish', success: true }
          ],
          status: 'FAILURE'
        };
      }
    }
    const result = await vectorMemoryService.counterfactualReplay(targetTrajectory, stepIndex, alterations);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function ingestMemory(req, res, next) {
  try {
    const { content, title = 'Turn Context', category = 'Conversation' } = req.body;
    const { orgId, projId } = resolveTenantIds(req);
    const db = await getDatabase();
    const vec = await embedOrFallback(content);
    const buffer = toVectorBuffer(vec);
    const decisionId = `dec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const isCorrection = detectCorrection(content, category);
    const initialWeight = initialWeightFor(isCorrection);
    const isThreat = detectThreat(content, isCorrection);

    if (isThreat) {
      telemetry.emitEvent({
        eventType: 'AMYGDALA_THREAT_BLOCKED',
        agentId: 'amygdala_filter',
        action: 'REJECT_INGESTION',
        detail: `Blocked adversarial injection: ${content.slice(0, 100)}`,
        severity: 'warning',
        payload: { content: content.slice(0, 100) }
      });
      return res.status(400).json({
        error: {
          code: 'ADVERSARIAL_INPUT_REJECTED',
          message: 'Contenu rejeté par le filtre amygdalien : tentative d\'injection ou d\'altération hostile de la mémoire détectée.'
        }
      });
    }

    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      decisionId, title, content, buffer, 'python_script', category, initialWeight, orgId, projId
    );

    await applyHebbianLearning(db, content, { decisionId, orgId, projId, isCorrection });

    res.status(200).json({ status: 'Ingested', id: decisionId, isCorrection, initialWeight });
  } catch (err) {
    next(err);
  }
}

async function generateVesicle(req, res, next) {
  try {
    const { query, hormone } = req.body;
    const db = await getDatabase();
    const results = await vectorMemoryService.searchMemory(query, { limit: 12, hormone }, db);
    const chronoSortedExperiences = sortChronologically(results.allScoredExperiences);
    const engrams = chronoSortedExperiences.map(buildEngram);

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

const { pruneSynapses } = require('./memoryControllerPrune');

module.exports = {
  search,
  cherryPick,
  counterfactual,
  ingestMemory,
  generateVesicle,
  sleepCycle,
  pruneSynapses
};
