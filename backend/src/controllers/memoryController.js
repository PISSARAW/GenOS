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
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category) VALUES (?, ?, ?, ?, ?, ?)`,
      decisionId, title, content, buffer, 'python_script', category
    );
    
    res.status(200).json({ status: 'Ingested', id: decisionId });
  } catch (err) {
    next(err);
  }
}

async function generateVesicle(req, res, next) {
  try {
    const { query } = req.body;
    const db = await getDatabase();
    
    // Retrieve top 5 memories
    const results = await vectorMemoryService.searchMemory(query, { limit: 5 }, db);
    
    const engrams = results.map(r => ({
      content: r.summary || r.content || r.title,
      vector: r.vector || new Array(1536).fill(0.0)
    }));
    
    // Convert to vesicle and drop in synaptic_cleft
    const vesiclePath = await vectorMemoryService.releaseVesicles(engrams);
    
    res.status(200).json({ status: 'Vesicle released with top 5 engrams', count: engrams.length, vesiclePath });
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
  generateVesicle
};
