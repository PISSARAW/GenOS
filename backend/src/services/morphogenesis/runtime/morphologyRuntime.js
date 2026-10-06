'use strict';

const { ExecutorRegistry } = require('./operators/registry');
const { createExecutionContext, intersectBudgets } = require('./operators/executionContext');
const { defaultRegistry } = require('../variants/variantRegistry');

function mergeChildEvidence(parent, child) {
  if (!child) return;
  if (Array.isArray(child.receipts)) parent.receipts.push(...child.receipts);
  if (Array.isArray(child.evidence)) parent.evidence.push(...child.evidence);
}

async function recordExperience(input) {
  const { store, graph, rootNode, result, seenOutcomes } = input;
  if (!hasExperienceStore(store)) return;
  const output = result && result.output;
  const sample = measuredSample(output);
  if (!sample) return;
  const receiptId = output.outcomeEvidence.receiptId;
  if (seenOutcomes.has(receiptId)) return;
  try {
    await store.add(experienceRecord({ graph, rootNode, output, sample }));
    seenOutcomes.add(receiptId);
  } catch (_) { /* learning must never break execution */ }
}

function hasExperienceStore(store) {
  return Boolean(store && typeof store.add === 'function');
}

function experienceRecord(input) {
  const { graph, rootNode, output, sample } = input;
  return {
    missionSignature: output.outcomeEvidence.learningContext.problemSignature,
    problemProfile: {},
    initialMorphology: { topology: rootNode.topology, variant: rootNode.variant, operator: rootNode.operator },
    morphologyHistory: [{ version: graph.version, rootKind: rootNode.operator || rootNode.kind }],
    budget: graph.globalBudget || {},
    verificationStrength: { receiptId: output.outcomeEvidence.receiptId,
      evidenceDigest: output.outcomeEvidence.receipt.evidenceDigest },
    quality: sample.quality,
    evidenceQuality: sample.evidenceQuality,
    finalOutcome: output.outcomeEvidence.success ? 'success' : 'failure',
    failures: output.failures || 0
  };
}

function measuredSample(output) {
  const { validateLearningEvidence } = require('../learning/outcomeEvidenceValidation');
  if (!validateLearningEvidence(output?.outcomeEvidence)) return null;
  const quality = Number(output.outcomeEvidence.value);
  const evidenceQuality = 1;
  return {
    quality: Math.max(0, Math.min(1, quality)),
    evidenceQuality: Math.max(0, Math.min(1, evidenceQuality))
  };
}

function variantPatch(input) {
  const { createMorphologyPatch, createOperation } = require('../transitions/morphologyPatch');
  const { transition, context } = input;
  return createMorphologyPatch({
    baseGraphVersion: input.graph.version,
    operations: [createOperation('CHANGE_VARIANT', { nodeId: input.nodeId, newVariant: input.newVariant })],
    reason: input.reason || `Variant change to ${input.newVariant}`,
    evidence: input.evidence || [],
    expectedGain: transition.gain || {},
    expectedCost: { tokens: transition.cost || 0 },
    rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] },
    authority: context.authority,
    lease: context.lease
  });
}

class MorphologyRuntime {
  constructor(options = {}) {
    this.topologyRegistry = options.topologyRegistry || {};
    this.topologyExecutors = options.topologyExecutors || {};
    this.nodeExecutors = options.nodeExecutors || {};
    this.executorRegistry = new ExecutorRegistry(this);
    this.globalBudget = options.globalBudget || {};
    this.globalInvariants = options.globalInvariants || [];
    this.experienceStore = options.experienceStore;
    this.seenOutcomes = new Set();
    this.counterfactual = options.counterfactual;
    this.eventHandlers = options.eventHandlers || {};
    this.variantRegistry = options.variantRegistry || defaultRegistry;
    if (options.installTopologyPlugins !== false) {
      require('./topologyPlugins').installTopologyPlugins(this);
    }
  }

  async execute(graph, input = {}) {
    require('./runtimeGraphValidation').assertExecutableGraph(graph);
    await this.assertGlobalInvariants(graph);
    if (input.statisticalRisk) await require('../capabilities/graphCapabilityRuntime')
      .bindGraph(input.db, graph, input.statisticalRisk);
    await require('../capabilities/graphCapabilityRuntime').assertBindings(input.db, graph);
    const rootNode = graph.nodes.find(n => n.nodeId === graph.rootNodeId);
    if (!rootNode) throw new Error('Graph has no root node');

    const context = createExecutionContext({
      missionId: graph.missionId,
      graphId: graph.graphId,
      nodeId: rootNode.nodeId,
      budget: intersectBudgets(this.globalBudget, graph.globalBudget || {}),
      authority: input.authority || ['*'],
      state: structuredClone(input.initialState || {}),
      input: input
    });

    context.capabilityDb = input.db;
    context.statisticalContracts = input.statisticalContracts;
    context.status = 'running';
    return this.executeRoot(graph, rootNode, context);
  }

  async executeRoot(graph, rootNode, context) {
    try {
      const executor = this.executorRegistry.getExecutorForNode(rootNode);
      if (!executor) throw new Error(`No executor for root kind: ${rootNode.kind}`);

      const result = await executor.execute(rootNode, graph, context);

      await require('../capabilities/graphCapabilityRuntime').verifyOutput(context.input.db, {
        nodeId: rootNode.nodeId, contract: context.input.statisticalContracts?.[rootNode.nodeId]
      });
      context.status = 'completed';
      context.output = result.output;
      context.completedAt = new Date().toISOString();
      mergeChildEvidence(context, result.context);

      this.emit('complete', { graph, result, context });
      await recordExperience({ store: this.experienceStore, seenOutcomes: this.seenOutcomes, graph, rootNode, result });

      return { output: result.output, receipts: context.receipts, evidence: context.evidence, state: result.context.state || context.state };
    } catch (error) {
      context.status = 'failed';
      context.error = error.message;
      context.completedAt = new Date().toISOString();

      this.emit('error', { graph, error, context });
      throw error;
    }
  }

  async executeNode(nodeId, graph, parentContext) {
    const node = graph.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const executor = this.executorRegistry.getExecutorForNode(node);
    if (!executor) throw new Error(`No executor for kind: ${node.kind}`);

    return executor.execute(node, graph, parentContext);
  }

  getExecutor(kind, operator = null) {
    return this.executorRegistry.getExecutor(kind, operator);
  }

  getExecutorForNode(node) {
    return this.executorRegistry.getExecutorForNode(node);
  }

  registerTopology(topology, impl) {
    this.executorRegistry.registerTopology(topology, impl);
  }

  async assertGlobalInvariants(graph) {
    for (const invariant of this.globalInvariants) {
      if (typeof invariant !== 'function') throw new Error('Global invariant must be an explicit verifier');
      const result = await invariant(graph);
      if (result !== true && result?.valid !== true) throw new Error('Global morphology invariant rejected the graph');
    }
  }

  registerNodeExecutor(kind, executor) {
    this.nodeExecutors[kind] = executor;
  }

  registerTopologyExecutor(topology, executor) {
    this.executorRegistry.registerTopologyExecutor(topology, executor);
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  emit(event, data) {
    const handlers = this.eventHandlers[event] || [];
    for (const handler of handlers) {
      try { handler(data); } catch (e) { console.error(`Event handler error for ${event}:`, e); }
    }
  }

  getExecutorRegistry() {
    return this.executorRegistry;
  }

  async applyPatch(patch, graph, execContext = {}) {
    const { PatchExecutor } = require('../transitions/patchExecutor');
    const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
    const { checkGraph } = require('../graph/morphologyTypeChecker');
    const { checkBudgets } = require('../graph/morphologyBudgetChecker');
    const executor = new PatchExecutor({
      runtime: this,
      adjudicator: execContext.adjudicator,
      counterfactual: execContext.counterfactual || this.counterfactual,
      committer: execContext.committer,
      snapshotter: execContext.snapshotter,
      verifier: { verify: verifyPatched.bind(this) }
    });
    return executor.execute(patch, graph, execContext);

    async function verifyPatched(input) {
      const errors = [];
      pushErrors(errors, validateMorphologyGraph(input.graph));
      pushErrors(errors, checkGraph({ graph: input.graph }));
      pushErrors(errors, checkBudgets({ graph: input.graph }));
      await this.assertGlobalInvariants(input.graph);
      return { valid: errors.length === 0, errors };
    }

    function pushErrors(errors, result) {
      if (!result.valid) errors.push(...result.errors);
    }
  }

  async changeVariant(input = {}) {
    const { nodeId, graph, newVariant, execContext = {} } = input;
    const node = graph.nodes.find((entry) => entry.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.variant === newVariant) return { success: true, changed: false };

    const transition = this.variantRegistry.getTransition(
      node.topology, node.variant, node.topology, newVariant
    );
    if (!transition) {
      return { success: false, changed: false, reason: `No transition rule from ${node.variant} to ${newVariant}` };
    }
    const decision = this.variantRegistry.canTransition(
      node.topology, node.variant, node.topology, newVariant, execContext
    );
    if (!decision.allowed) return { success: false, changed: false, reason: decision.reason };

    const patch = variantPatch({
      graph, nodeId, newVariant, transition, context: execContext,
      evidence: execContext.evidence || []
    });
    const result = await this.applyPatch(patch, graph, execContext);
    return { success: result.success, changed: result.success,
      graph: result.execution?.commitResult?.graph || graph, execution: result.execution };
  }
}

module.exports = { MorphologyRuntime };
