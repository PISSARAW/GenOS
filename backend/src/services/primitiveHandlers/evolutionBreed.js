/**
 * Lot 3 : breeding primitive (breed) — split of evolution.js.
 *
 * The child INSERT and the lineage write run inside a single transaction
 * (withTransaction): a lineage failure rolls everything back instead of
 * relying on manual DELETE compensation.
 */
const crypto = require('crypto');
const telemetry = require('../telemetryObserver');
const { getDatabase, withTransaction } = require('../../db');
const geneticsService = require('../geneticsService');
const agentEvolutionService = require('../agentEvolutionService');
const genosCli = require('../genosCli');

async function loadBreedingParents(db, context) {
  const parentA = context.parentA || context.agentId;
  const parentB = context.parentB;
  if (!parentA || !parentB) return { error: 'parentA and parentB required for breeding.' };
  const rowA = await db.get('SELECT id, name, name_meaning, role, current_task, model_tier, workspace_id FROM agents WHERE id = ?', parentA);
  const rowB = await db.get('SELECT id, name, name_meaning, role, current_task, model_tier, workspace_id FROM agents WHERE id = ?', parentB);
  if (!rowA || !rowB) return { error: 'One or both parents not found.' };
  if (rowA.workspace_id !== rowB.workspace_id) return { error: 'Parents must belong to the same workspace.' };
  if (context.workspaceId && rowA.workspace_id !== context.workspaceId) {
    return { error: 'Parent workspace does not match the requested workspace.' };
  }
  return { parentA, parentB, rowA, rowB };
}

async function loadPersistedGenes(db, agentId) {
  const lineage = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ?', agentId);
  try {
    const genes = lineage && lineage.metadata ? JSON.parse(lineage.metadata).genes : null;
    return genes && typeof genes === 'object' ? genes : {};
  } catch (_) {
    return {};
  }
}

function buildAgentGenome(row, genes) {
  return {
    id: row.id,
    name: row.name,
    genes: {
      role: row.role || 'worker',
      strategy: row.role || 'adaptive-hybrid',
      tools: ['genos_inspect'],
      temp: 0.5,
      topP: 0.9,
      ...genes,
      tools: Array.isArray(genes.tools) ? genes.tools : ['genos_inspect']
    }
  };
}

function resolveCrossoverParams(context, parentA, parentB) {
  const crossoverStrategy = context.strategy || 'uniform';
  const mutationRate = context.mutationRate ?? 0.05;
  const swapProb = context.swapProb ?? 0.5;
  const crossoverPoint = context.crossoverPoint;
  const crossoverSeed = context.seed === undefined
    ? `${parentA}:${parentB}:${crossoverStrategy}:${mutationRate}:${swapProb}:${crossoverPoint ?? 'uniform'}`
    : String(context.seed);
  return { crossoverStrategy, mutationRate, swapProb, crossoverPoint, crossoverSeed };
}

function recombineChildGenomes(genomeA, genomeB, params) {
  return geneticsService.crossoverGenome(genomeA, genomeB, {
    strategy: params.crossoverStrategy,
    mutationRate: params.mutationRate,
    swapProb: params.swapProb,
    crossoverPoint: params.crossoverPoint,
    seed: params.crossoverSeed
  });
}

async function runNativeCrossover(options) {
  const { rowA, rowB, genomeA, genomeB, params, speciationThreshold } = options;
  try {
    const cliRun = await genosCli.runCrossover({
      parentA: rowA.id,
      parentB: rowB.id,
      swapProb: params.swapProb,
      crossoverPoint: params.crossoverPoint,
      speciationThreshold,
      genesA: genomeA.genes,
      genesB: genomeB.genes,
      seed: params.crossoverSeed
    });
    if (cliRun.json && cliRun.json.success === false) {
      return { error: cliRun.json.error || 'Speciation barrier exceeded: parents cannot interbreed.' };
    }
    if (cliRun.ok && cliRun.json) return { nativeRecomb: cliRun.json };
    return { error: 'Native crossover returned no result.' };
  } catch (error) {
    return { error: `Native crossover failed: ${error.message}` };
  }
}

async function persistBredChild(db, options) {
  const { childId, childTitle, childMeaning, workspaceId, parentA, crossoverTask, lineagePayload } = options;
  const modelTier = options.modelTier || 'standard';
  try {
    await withTransaction(db, async () => {
      await db.run(
        "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, ?, 'offspring', 'idle', 'GenOS', 'worker', ?, ?, ?, 'crossover', ?)",
        childId, childTitle, childMeaning, workspaceId, modelTier, parentA, crossoverTask
      );
      const lineageResult = await agentEvolutionService.recordWorkerLineage(
        db,
        { agentId: childId, workspaceId, name: childTitle, role: 'offspring' },
        lineagePayload
      );
      if (!lineageResult.success) throw new Error(`Breeding lineage persistence failed: ${lineageResult.error}`);
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function buildChildNaming(options) {
  const { rowA, rowB, parentA, parentB } = options;
  const childTitle = 'Offspring of ' + (rowA.name || parentA) + ' x ' + (rowB.name || parentB);
  const childMeaning = `Combined identity of ${rowA.name || parentA} and ${rowB.name || parentB}`;
  return { childTitle, childMeaning };
}

function buildCrossoverTask(options) {
  const { rowA, rowB, parentA, parentB, strategy, tools } = options;
  return `${rowA.name || parentA} (${rowA.role || 'worker'}) x ${rowB.name || parentB} (${rowB.role || 'worker'}) -> Strategy: ${strategy}. Tools: [${tools.join(', ')}]. Mission: ${rowA.current_task || 'collaborative mission'}`;
}

function buildLineagePayload(options) {
  const { params, childRecomb, nativeRecomb, rowA, rowB, parentA, parentB } = options;
  return {
    parentIds: [parentA, parentB],
    parents: { parentA: rowA.id, parentB: rowB.id },
    genes: childRecomb.childGenes,
    mutations: childRecomb.mutations,
    predictedFitness: childRecomb.predictedFitnessScore,
    reproduction: {
      engine: 'javascript_genome_authority',
      strategy: params.crossoverStrategy,
      mutationRate: params.mutationRate,
      swapProb: params.swapProb,
      crossoverPoint: params.crossoverPoint ?? null,
      seed: params.crossoverSeed,
      parentFingerprint: childRecomb.parentFingerprint,
      genomeHash: childRecomb.genomeHash,
      nativeRecombination: nativeRecomb
    }
  };
}

async function breed(context) {
  const db = await getDatabase();
  const parents = await loadBreedingParents(db, context);
  if (parents.error) return { success: false, error: parents.error };
  const { parentA, parentB, rowA, rowB } = parents;
  const genomeA = buildAgentGenome(rowA, await loadPersistedGenes(db, rowA.id));
  const genomeB = buildAgentGenome(rowB, await loadPersistedGenes(db, rowB.id));
  const params = resolveCrossoverParams(context, parentA, parentB);
  // 1. Recombinaison méiotique des gènes cognitifs (stratégie, outils, hyperparamètres)
  const childRecomb = recombineChildGenomes(genomeA, genomeB, params);
  // 2. Recombinaison native méiotique Rust via crates/genos-reproduction
  const native = await runNativeCrossover({ rowA, rowB, genomeA, genomeB, params, speciationThreshold: context.speciationThreshold });
  if (native.error) return { success: false, error: native.error };
  const nativeRecomb = native.nativeRecomb;

  const strategy = childRecomb.childGenes?.strategy || 'adaptive-hybrid';
  const tools = childRecomb.childGenes?.tools || ['genos_inspect'];
  const childId = childRecomb.childId || `child_${crypto.randomUUID()}`;
  const childNaming = buildChildNaming({ rowA, rowB, parentA, parentB });
  const crossoverTask = buildCrossoverTask({ rowA, rowB, parentA, parentB, strategy, tools });
  const persisted = await persistBredChild(db, {
    childId,
    childTitle: childNaming.childTitle,
    childMeaning: childNaming.childMeaning,
    workspaceId: rowA.workspace_id,
    modelTier: rowA.model_tier,
    parentA,
    crossoverTask,
    lineagePayload: buildLineagePayload({ params, childRecomb, nativeRecomb, rowA, rowB, parentA, parentB })
  });
  if (!persisted.success) return persisted;

  telemetry.emitEvent({
    eventType: 'EVOLUTION_BREED',
    agentId: parentA,
    action: 'BREED',
    detail: 'Bred child ' + childId + ' via Meiotic Crossover: predicted fitness ' + childRecomb.predictedFitnessScore,
    severity: 'info',
    payload: {
      childId, parentA, parentB,
      childGenes: childRecomb.childGenes,
      predictedFitnessScore: childRecomb.predictedFitnessScore,
      fitnessStatus: 'unvalidated',
      nativeRecombination: nativeRecomb
    }
  });

  return {
    success: true,
    childId,
    parentA,
    parentB,
    crossoverTask,
    childGenes: childRecomb.childGenes,
    predictedFitnessScore: childRecomb.predictedFitnessScore,
    fitnessStatus: 'unvalidated',
    nativeRecombination: nativeRecomb,
    reproducibility: {
      seed: params.crossoverSeed,
      parentFingerprint: childRecomb.parentFingerprint,
      genomeHash: childRecomb.genomeHash,
      engine: 'javascript_genome_authority'
    },
  };
}

module.exports = {
  breed
};
