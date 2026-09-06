/**
 * GenOS Agent Evolution Service
 * Bridges genetics, crossover synthesis, and phylogenetic DAG tracking
 * to real autonomous worker fleets.
 */

const genetics = require('./geneticsService');
const { getDatabase } = require('../db');

function resolveArchetypeGenes(role = 'worker') {
  if (/security|vulnerability|threat/i.test(role)) {
    return { role, strategy: 'adversarial-falsification', tools: ['genos_inspect', 'genos_test', 'genos_ais_prr_scan'], temp: 0.3, topP: 0.85 };
  }
  if (/author|creative|literary/i.test(role)) {
    return { role, strategy: 'dialectic-exploration', tools: ['genos_inspect', 'genos_patch'], temp: 0.7, topP: 0.95 };
  }
  if (/data|database|sql/i.test(role)) {
    return { role, strategy: 'invariant-verification', tools: ['genos_inspect', 'genos_test', 'genos_storage'], temp: 0.35, topP: 0.9 };
  }
  return { role, strategy: 'tree-search', tools: ['genos_inspect', 'genos_patch', 'genos_test'], temp: 0.45, topP: 0.9 };
}

function evolveWorkerGenome(parentAgent, assignment, options = {}) {
  const inheritedGenes = parentAgent?.genes && typeof parentAgent.genes === 'object' ? parentAgent.genes : {};
  const parentA = {
    id: parentAgent?.id || 'root-orchestrator',
    name: parentAgent?.name || 'Orchestrator',
    genes: {
      role: parentAgent?.role || 'orchestrator',
      strategy: options.strategy || inheritedGenes.strategy || 'chain-of-thought',
      tools: ['genos_snapshot', 'genos_capsule_create', 'genos_orchestrate'],
      temp: 0.4,
      topP: 0.9,
      ...inheritedGenes,
      role: inheritedGenes.role || parentAgent?.role || 'orchestrator',
      strategy: options.strategy || inheritedGenes.strategy || 'chain-of-thought',
      tools: Array.isArray(inheritedGenes.tools) && inheritedGenes.tools.length
        ? inheritedGenes.tools
        : ['genos_snapshot', 'genos_capsule_create', 'genos_orchestrate']
    }
  };

  const parentB = {
    id: `archetype-${assignment?.role || 'specialist'}`,
    name: `Archetype ${assignment?.role || 'Specialist'}`,
    genes: resolveArchetypeGenes(assignment?.role)
  };

  const crossover = genetics.crossoverGenome(parentA, parentB, {
    strategy: options.crossoverStrategy || 'uniform',
    mutationRate: options.mutationRate === undefined ? 0.08 : options.mutationRate
  });

  return {
    crossoverId: crossover.childId,
    genes: crossover.childGenes,
    predictedFitness: crossover.predictedFitnessScore,
    mutations: crossover.mutations,
    parents: { parentA: parentA.id, parentB: parentB.id }
  };
}

async function recordWorkerLineage(db, workerInfo, options = {}) {
  if (!db || !workerInfo?.agentId) return { success: false, error: 'Database and agentId are required.' };
  const workspaceId = workerInfo.workspaceId || 'workspace-default';
  const metadata = JSON.stringify({
    genes: options.genes || {},
    parents: options.parents || {},
    mutations: options.mutations || [],
    reproduction: options.reproduction || null,
    predictedFitness: Number.isFinite(Number(options.predictedFitness)) ? Number(options.predictedFitness) : null,
    fitnessStatus: Number.isFinite(Number(options.validatedFitness)) ? 'validated' : 'unvalidated'
  });
  const validatedScore = Number.isFinite(Number(options.validatedFitness))
    ? Number((Number(options.validatedFitness) / 100).toFixed(2))
    : null;

  try {
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, state_summary, metadata)
       VALUES (?, ?, ?, 'agent', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET score = excluded.score, metadata = excluded.metadata`,
      workerInfo.agentId,
      workspaceId,
      workerInfo.name || workerInfo.agentId,
      validatedScore,
      `Evolved worker: ${workerInfo.role || 'specialist'}`,
      metadata
    );

    const parentIds = [...new Set(options.parentIds || (options.parentId ? [options.parentId] : []))].filter(Boolean);
    for (const parentId of parentIds) {
      const parentExists = await db.get('SELECT id FROM lineage_nodes WHERE id = ?', parentId);
      if (!parentExists) {
        await db.run(
          `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, state_summary)
           VALUES (?, ?, ?, 'core', 1.0, 'Parent orchestrator')
           ON CONFLICT(id) DO NOTHING`,
          parentId,
          workspaceId,
          parentId
        );
      }
      const edgeId = `edge_${parentId}_${workerInfo.agentId}`;
      await db.run(
        `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
         VALUES (?, ?, ?, ?, 'crossover_lineage')
         ON CONFLICT(id) DO NOTHING`,
        edgeId,
        workspaceId,
        parentId,
        workerInfo.agentId
      );
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to record worker lineage:', err.message);
    return { success: false, error: err.message };
  }
}

async function recordGenomicOutcome(agentId, outcome, score = 0, scope = {}) {
  const db = await getDatabase();
  try {
    const result = scope.organizationId && scope.projectId
      ? await db.run(
        `UPDATE lineage_nodes SET score = ?, state_summary = ? WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ? AND project_id = ?)`,
        Number((score / 100).toFixed(2)), `Completed mission outcome: ${outcome}`, agentId, scope.organizationId, scope.projectId
      )
      : await db.run(
        `UPDATE lineage_nodes SET score = ?, state_summary = ? WHERE id = ?`,
        Number((score / 100).toFixed(2)), `Completed mission outcome: ${outcome}`, agentId
      );
    return { updated: result.changes === 1 };
  } catch (err) {
    console.error('Failed to record genomic outcome:', err.message);
    return { updated: false, error: err.message };
  }
}

module.exports = {
  evolveWorkerGenome,
  recordWorkerLineage,
  recordGenomicOutcome
};
