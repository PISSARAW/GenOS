/**
 * GenOS Agent Evolution Service
 * Bridges genetics, crossover synthesis, and phylogenetic DAG tracking
 * to real autonomous worker fleets.
 */

const genetics = require('./geneticsService');
const { getDatabase } = require('../db');
const genomeEventLog = require('./genomeEventLog');

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

function valueOf(source, key) {
  if (!source) return undefined;
  return source[key];
}

function fallback(value, replacement) {
  if (value) return value;
  return replacement;
}

function getGenes(source) {
  const genes = valueOf(source, 'genes');
  if (genes && typeof genes === 'object') return genes;
  return {};
}

function orchestratorTools() {
  return ['genos_snapshot', 'genos_capsule_create', 'genos_orchestrate'];
}

function validTools(candidate) {
  if (Array.isArray(candidate) && candidate.length) return candidate;
  return orchestratorTools();
}

function buildParentA(parentAgent, options) {
  const inheritedGenes = getGenes(parentAgent);
  const role = fallback(inheritedGenes.role, fallback(valueOf(parentAgent, 'role'), 'orchestrator'));
  const strategy = fallback(options.strategy, fallback(inheritedGenes.strategy, 'chain-of-thought'));
  const tools = validTools(inheritedGenes.tools);
  return {
    id: fallback(valueOf(parentAgent, 'id'), 'root-orchestrator'),
    name: fallback(valueOf(parentAgent, 'name'), 'Orchestrator'),
    genes: {
      role,
      strategy,
      tools: orchestratorTools(),
      temp: 0.4,
      topP: 0.9,
      ...inheritedGenes,
      role,
      strategy,
      tools
    }
  };
}

function buildParentB(assignment) {
  const role = valueOf(assignment, 'role');
  return {
    id: `archetype-${fallback(role, 'specialist')}`,
    name: `Archetype ${fallback(role, 'Specialist')}`,
    genes: resolveArchetypeGenes(role)
  };
}

async function evolveWorkerGenome(parentAgent, assignment, options = {}) {
  const parentA = buildParentA(parentAgent, options);
  const parentB = buildParentB(assignment);
  const crossover = genetics.crossoverGenome(parentA, parentB, {
    strategy: fallback(options.crossoverStrategy, 'uniform'),
    mutationRate: options.mutationRate === undefined ? 0.08 : options.mutationRate
  });

  // B2: Récupérer la DB et enregistrer l'événement CROSSOVER
  const db = options.db || (await getDatabase());

  // B1: Enregistrer l'événement de crossover
  const scope = options.scope || {};
  await genomeEventLog.recordCrossover(db, crossover.childId, [parentA.id, parentB.id], {
    operation: 'cross',
    contentHash: crossover.genomeHash,
    source: 'agentEvolutionService.evolveWorkerGenome',
    crossoverStrategy: crossover.crossoverStrategy,
    mutationRateApplied: crossover.mutationRateApplied,
    predictedFitness: crossover.predictedFitnessScore,
    parentFingerprint: crossover.parentFingerprint,
    reproducibilitySeed: crossover.reproducibilitySeed,
  }, scope);

  return {
    genomeRef: crossover.childId,
    crossoverId: crossover.childId,
    genes: crossover.childGenes,
    predictedFitness: crossover.predictedFitnessScore,
    mutations: crossover.mutations,
    parents: { parentA: parentA.id, parentB: parentB.id }
  };
}

function collectParentIds(options) {
  const raw = options.parentIds || (options.parentId ? [options.parentId] : []);
  return [...new Set(raw)].filter(Boolean);
}

function toFiniteNumber(value) {
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return null;
}

function resolveFitnessStatus(value) {
  if (Number.isFinite(Number(value))) return 'validated';
  return 'unvalidated';
}

function toValidatedScore(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Number((Number(value) / 100).toFixed(2));
}

function buildLineageMetadata(options) {
  return JSON.stringify({
    genes: options.genes || {},
    parents: options.parents || {},
    mutations: options.mutations || [],
    reproduction: options.reproduction || null,
    predictedFitness: toFiniteNumber(options.predictedFitness),
    fitnessStatus: resolveFitnessStatus(options.validatedFitness)
  });
}

async function provisionLineageParent(db, parentId) {
  const agentParent = await db.get('SELECT id, name, role, workspace_id, execution_mode FROM agents WHERE id = ?', parentId);
  if (!agentParent) return { parent: null };
  if (!agentParent.workspace_id) return { error: `Lineage parent '${parentId}' has no workspace assignment.` };
  const parentWorkspaceId = agentParent.workspace_id;
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    agentParent.id,
    parentWorkspaceId,
    agentParent.id,
    agentParent.name || agentParent.id,
    agentParent.execution_mode === 'orchestrator' ? 'core' : 'agent',
    `Auto-provisioned parent: ${agentParent.role || 'agent'}`
  );
  return { parent: { id: agentParent.id, workspace_id: parentWorkspaceId } };
}

async function validateLineageParent(db, parentId, workerInfo) {
  if (parentId === workerInfo.agentId) {
    return { success: false, error: 'A lineage node cannot be its own parent.' };
  }
  let parent = await db.get('SELECT id, workspace_id FROM lineage_nodes WHERE id = ?', parentId);
  if (!parent) {
    const provisioned = await provisionLineageParent(db, parentId);
    if (provisioned.error) return { success: false, error: provisioned.error };
    parent = provisioned.parent;
  }
  if (!parent) return { success: false, error: `Lineage parent '${parentId}' does not exist.` };
  if (parent.workspace_id !== workerInfo.workspaceId) {
    return { success: false, error: `Lineage parent '${parentId}' belongs to another workspace.` };
  }
  const cycle = await db.get(`WITH RECURSIVE ancestors(id) AS (
    SELECT source_node_id FROM lineage_edges WHERE target_node_id = ?
    UNION
    SELECT e.source_node_id FROM lineage_edges e JOIN ancestors a ON e.target_node_id = a.id
  ) SELECT id FROM ancestors WHERE id = ? LIMIT 1`, parentId, workerInfo.agentId);
  if (cycle) return { success: false, error: `Lineage cycle detected through parent '${parentId}'.` };
  return { success: true };
}

async function insertLineageEdges(db, params) {
  const edgeType = params.edgeType || 'crossover_lineage';
  for (const parentId of params.parentIds) {
    const edgeId = `edge_${parentId}_${params.agentId}`;
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      edgeId,
      params.workspaceId,
      parentId,
      params.agentId,
      edgeType
    );
  }
}

async function recordWorkerLineage(db, workerInfo, options = {}) {
  if (!db || !workerInfo?.agentId) return { success: false, error: 'Database and agentId are required.' };
  const workspaceId = workerInfo.workspaceId;
  if (!workspaceId) return { success: false, error: 'workspaceId is required for lineage persistence.' };
  const parentIds = collectParentIds(options);
  for (const parentId of parentIds) {
    const check = await validateLineageParent(db, parentId, workerInfo);
    if (!check.success) return { success: false, error: check.error };
  }
  const metadata = buildLineageMetadata(options);
  const validatedScore = toValidatedScore(options.validatedFitness);
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
    await insertLineageEdges(db, {
      workspaceId,
      parentIds,
      agentId: workerInfo.agentId,
      edgeType: options.edgeType
    });
    return { success: true };
  } catch (err) {
    console.error('Failed to record worker lineage:', err.message);
    return { success: false, error: err.message };
  }
}

async function recordGenomicOutcome(options = {}) {
  const { agentId, outcome, score = 0, scope = {} } = options;
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
