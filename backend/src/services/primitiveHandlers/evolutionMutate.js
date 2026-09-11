/**
 * Lot 3 : mutation primitives (mutate, mutateSingle) — split of evolution.js.
 */
const crypto = require('crypto');
const telemetry = require('../telemetryObserver');
const { getDatabase, withTransaction } = require('../../db');
const agentEvolutionService = require('../agentEvolutionService');
const { MUTABLE_GENES } = require('./evolutionShared');

function parseMutationDescriptor(descriptor) {
  if (typeof descriptor === 'object' && descriptor !== null) {
    return { gene: descriptor.gene, rawValue: descriptor.value ?? descriptor.newValue };
  }
  const match = String(descriptor).match(/^([A-Za-z][\w]*)\s*=\s*(.+)$/);
  if (!match) return null;
  return { gene: match[1], rawValue: match[2] };
}

function normalizeToolsValue(rawValue) {
  const tools = Array.isArray(rawValue)
    ? rawValue.map(String)
    : String(rawValue).split(',').map((tool) => tool.trim()).filter(Boolean);
  return tools.length > 0 ? tools : null;
}

function normalizeScalarGene(gene, rawValue) {
  if (gene === 'temp' || gene === 'topP') {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > 1) return null;
    return value;
  }
  const text = String(rawValue).trim();
  if (!text) return null;
  return text;
}

function applyDescriptor(state, descriptor) {
  const parsed = parseMutationDescriptor(descriptor);
  if (!parsed || !MUTABLE_GENES.has(parsed.gene) || parsed.rawValue === undefined) {
    state.rejected.push(String(descriptor));
    return;
  }
  const previousValue = state.nextGenes[parsed.gene];
  const nextValue = parsed.gene === 'tools'
    ? normalizeToolsValue(parsed.rawValue)
    : normalizeScalarGene(parsed.gene, parsed.rawValue);
  if (nextValue === null || JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
    state.rejected.push(String(descriptor));
    return;
  }
  state.nextGenes[parsed.gene] = nextValue;
  state.applied.push({ gene: parsed.gene, value: nextValue });
}

function applyMutationDescriptors(genes, descriptors) {
  const state = { nextGenes: { ...genes, tools: [...(genes.tools || [])] }, applied: [], rejected: [] };
  for (const descriptor of descriptors) {
    applyDescriptor(state, descriptor);
  }
  return { genes: state.nextGenes, applied: state.applied, rejected: state.rejected };
}

async function loadMutationParent(db, agentId) {
  if (!agentId) return { error: 'agentId required for mutation.' };
  const parent = await db.get('SELECT id, name, name_meaning, role, current_task, workspace_id, model_tier FROM agents WHERE id = ?', agentId);
  if (!parent) return { error: 'Parent agent not found: ' + agentId };
  const lineage = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ? AND workspace_id = ?', agentId, parent.workspace_id);
  if (!lineage || !lineage.metadata) return { parent };
  let genes = null;
  try {
    genes = JSON.parse(lineage.metadata).genes;
  } catch (_) {
    return { error: `Parent genome metadata is invalid: ${agentId}` };
  }
  if (genes && typeof genes === 'object') parent.genes = genes;
  return { parent };
}

function defaultTemp(raw) {
  const value = Number(raw ?? 0.4);
  if (!Number.isFinite(value)) return 0.4;
  if (value > 0.6) return value - 0.2;
  return value + 0.25;
}

function defaultTopP(raw) {
  const value = Number(raw ?? 0.9);
  if (!Number.isFinite(value)) return 0.9;
  if (value > 0.85) return value - 0.1;
  return value + 0.05;
}

function clampGene(value, min, max) {
  return Number(Math.min(max, Math.max(min, value)).toFixed(2));
}

function pushHypermutationTools(mutations, parent) {
  const rawTools = parent.genes ? parent.genes.tools : null;
  const tools = Array.isArray(rawTools) ? [...rawTools] : ['genos_inspect'];
  if (!tools.includes('genos_test')) tools.push('genos_test');
  else if (!tools.includes('genos_patch')) tools.push('genos_patch');
  mutations.push(`tools=${tools.join(',')}`);
}

function pushExploratoryMutation(mutations, parent, context) {
  const genes = parent.genes ? parent.genes : {};
  mutations.push(`temp=${clampGene(defaultTemp(genes.temp), 0.15, 0.85)}`);
  mutations.push(`topP=${clampGene(defaultTopP(genes.topP), 0.6, 0.98)}`);
  if (context.hypermutation || context.reheat) {
    pushHypermutationTools(mutations, parent);
  }
}

async function persistMutant(db, options) {
  const { parent, mutatedTask, mutantId, mutations, evolved, descriptorResult } = options;
  try {
    await withTransaction(db, async () => {
      await db.run(
        "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, ?, 'mutant', 'idle', 'GenOS', 'worker', ?, ?, ?, 'mutation', ?)",
        mutantId, 'Mutant of ' + options.agentId, parent.name_meaning || `Descendant identity of ${parent.name || options.agentId}`, parent.workspace_id, parent.model_tier || 'standard', options.agentId, mutatedTask
      );
      const lineageResult = await agentEvolutionService.recordWorkerLineage(
        db,
        { agentId: mutantId, workspaceId: parent.workspace_id, name: 'Mutant of ' + options.agentId, role: 'mutant' },
        { parentId: options.agentId, genes: descriptorResult.genes, mutations: [...mutations, ...evolved.mutations, ...descriptorResult.applied], predictedFitness: evolved.predictedFitness }
      );
      if (!lineageResult.success) throw new Error(`Mutation lineage persistence failed: ${lineageResult.error}`);
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function mutate(context) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId;
  const loaded = await loadMutationParent(db, agentId);
  if (loaded.error) return { success: false, error: loaded.error };
  const parent = loaded.parent;
  const mutations = Array.isArray(context.mutations) ? [...context.mutations] : [];
  if (mutations.length === 0) pushExploratoryMutation(mutations, parent, context);
  const evolved = agentEvolutionService.evolveWorkerGenome(parent, { role: context.role || 'mutant' }, {
    strategy: context.strategy,
    crossoverStrategy: context.crossoverStrategy,
    mutationRate: context.mutationRate
  });
  const descriptorResult = applyMutationDescriptors(evolved.genes, mutations);
  if (descriptorResult.rejected.length > 0 || descriptorResult.applied.length === 0) {
    return {
      success: false,
      error: 'Mutation descriptors were invalid or produced no change.',
      rejectedMutations: descriptorResult.rejected
    };
  }
  const mutatedTask = (parent.current_task || 'task') + ' [MUTATION: ' + mutations.join('; ') + ']';
  const mutantId = 'mutant_' + crypto.randomUUID();
  const persisted = await persistMutant(db, { agentId, parent, mutatedTask, mutantId, mutations, evolved, descriptorResult });
  if (!persisted.success) return persisted;
  telemetry.emitEvent({
    eventType: 'EVOLUTION_MUTATION',
    agentId: agentId,
    action: 'MUTATE',
    detail: 'Created mutant ' + mutantId + ' with perturbation: ' + mutations.join('; '),
    severity: 'info',
    payload: { mutantId, mutations, appliedMutations: descriptorResult.applied, genes: descriptorResult.genes, predictedFitness: evolved.predictedFitness }
  });
  return { success: true, mutantId, mutatedTask, genes: descriptorResult.genes, appliedMutations: descriptorResult.applied, predictedFitness: evolved.predictedFitness };
}

async function loadCurrentGeneValue(db, agentId, targetGene) {
  if (!agentId) return 0.5;
  const parent = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ?', agentId);
  try {
    const meta = JSON.parse(parent?.metadata || '{}');
    if (meta.genes && meta.genes[targetGene] !== undefined) return meta.genes[targetGene];
  } catch (_) {}
  return 0.5;
}

function buildSingleMutationDescriptor(targetGene, currentVal, context) {
  if (targetGene === 'temp') {
    const nextVal = Number((Math.min(0.85, Math.max(0.15, Number(currentVal) + 0.1))).toFixed(2));
    return `temp=${nextVal}`;
  }
  if (targetGene === 'topP') {
    const nextVal = Number((Math.min(1.0, Math.max(0.5, Number(currentVal) - 0.1))).toFixed(2));
    return `topP=${nextVal}`;
  }
  if (targetGene === 'strategy') return `strategy=${context.strategy || 'invariant-verification'}`;
  if (targetGene === 'tools') {
    const tools = Array.isArray(context.tools) ? context.tools.join(',') : (context.tool ? context.tool : 'genos_inspect,genos_test');
    return `tools=${tools}`;
  }
  return 'temp=0.7';
}

async function mutateSingle(context = {}) {
  const targetGene = context.targetGene || context.gene || 'temp';
  const db = await getDatabase();
  const currentVal = await loadCurrentGeneValue(db, context.agentId || context.orchestratorId, targetGene);
  return mutate({
    ...context,
    mutations: [buildSingleMutationDescriptor(targetGene, currentVal, context)],
    singleFactor: targetGene
  });
}

module.exports = {
  applyMutationDescriptors,
  mutate,
  mutateSingle
};
