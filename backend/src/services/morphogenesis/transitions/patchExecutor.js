'use strict';

const { randomUUID } = require('crypto');
const { validateMorphologyPatch } = require('./morphologyPatch');
const { MorphologyRuntime } = require('../runtime/morphologyRuntime');
const { applyOperation } = require('./patchOperations');

class PatchExecutor {
  constructor(opts = {}) {
    this.runtime = opts.runtime || new MorphologyRuntime();
    this.typeChecker = opts.typeChecker;
    this.budgetValidator = opts.budgetValidator;
    this.authorityValidator = opts.authorityValidator;
    this.adjudicator = opts.adjudicator;
    this.verifier = opts.verifier;
    this.snapshotter = opts.snapshotter;
  }

  async execute(patch, graph, context = {}) {
    const execContext = this.createExecContext(patch, graph, context);
    try {
      await this.runValidation(execContext);
      await this.runCounterfactual(execContext);
      await this.runAdjudication(execContext);
      await this.runTransaction(execContext);
      await this.runVerification(execContext);
      await this.runCommit(execContext);
      execContext.status = 'committed'; execContext.completedAt = new Date().toISOString();
      return { success: true, execution: execContext };
    } catch (error) {
      execContext.status = 'failed'; execContext.error = error.message; execContext.completedAt = new Date().toISOString();
      await this.rollback(execContext);
      return { success: false, execution: execContext, error: error.message };
    }
  }

  createExecContext(patch, graph, context) {
    return { executionId: randomUUID(), patch, graph, context, snapshot: null, shadowGraph: null, counterfactualResult: null, adjudication: null, appliedGraph: null, verification: null, commitResult: null, status: 'started', error: null, startedAt: new Date().toISOString() };
  }

  async runValidation(exec) {
    exec.phase = 'validation';
    const { patch, graph, context } = exec;
    const validation = validateMorphologyPatch(patch);
    if (!validation.valid) throw new Error(`Patch validation failed: ${validation.errors.join('; ')}`);
    if (patch.baseGraphVersion !== graph.version) throw new Error(`Patch baseGraphVersion ${patch.baseGraphVersion} != graph version ${graph.version}`);
    if (typeof this.adjudicator?.adjudicate !== 'function') throw new Error('Patch adjudicator is required');
    if (typeof this.verifier?.verify !== 'function') throw new Error('Patch verifier is required');
    if (this.typeChecker) { const tc = await this.typeChecker.check(patch, graph); if (!tc.valid) throw new Error(`Type check failed: ${tc.errors.join('; ')}`); }
    if (this.budgetValidator) { const bc = await this.budgetValidator.check(patch, graph, context); if (!bc.valid) throw new Error(`Budget validation failed: ${bc.errors.join('; ')}`); }
    if (this.authorityValidator) { const ac = await this.authorityValidator.check(patch, context); if (!ac.valid) throw new Error(`Authority validation failed: ${ac.errors.join('; ')}`); }
    if (this.snapshotter) exec.snapshot = await this.snapshotter.snapshot(graph, context);
    exec.status = 'validated';
  }

  async runCounterfactual(exec) {
    exec.phase = 'counterfactual';
    const { patch, graph } = exec;
    exec.shadowGraph = this.applyPatch(patch, graph);
    exec.counterfactualResult = await this.runtime.execute(exec.shadowGraph, exec.context.input);
    exec.status = 'counterfactual_complete';
  }

  async runAdjudication(exec) {
    exec.phase = 'adjudication';
    exec.adjudication = await this.adjudicator.adjudicate({ patch: exec.patch, counterfactualResult: exec.counterfactualResult, expectedGain: exec.patch.expectedGain, expectedCost: exec.patch.expectedCost, context: exec.context });
    if (exec.adjudication?.approved !== true) throw new Error(`Adjudication rejected: ${exec.adjudication?.reason || 'approval missing'}`);
    exec.status = 'adjudicated';
  }

  async runTransaction(exec) {
    exec.phase = 'transaction';
    exec.appliedGraph = this.applyPatch(exec.patch, exec.graph);
    exec.appliedGraph.version = exec.graph.version + 1;
    exec.appliedGraph.parentVersion = exec.graph.version;
    exec.status = 'transaction_applied';
  }

  async runVerification(exec) {
    exec.phase = 'verification';
    exec.verification = await this.verifier.verify({ graph: exec.appliedGraph, patch: exec.patch, context: exec.context });
    if (exec.verification?.valid !== true) throw new Error(`Verification failed: ${(exec.verification?.errors || ['valid receipt missing']).join('; ')}`);
    exec.status = 'verified';
  }

  async runCommit(exec) {
    exec.phase = 'commit';
    exec.commitResult = { graph: exec.appliedGraph, patch: exec.patch };
    exec.status = 'committed';
  }

  async rollback(exec) { if (exec.snapshot && this.snapshotter) await this.snapshotter.restore(exec.snapshot); exec.rolledBack = true; }

  applyPatch(patch, graph) {
    const newGraph = JSON.parse(JSON.stringify(graph));
    newGraph.nodes = newGraph.nodes.map(n => ({ ...n }));
    newGraph.edges = newGraph.edges.map(e => ({ ...e }));
    for (const op of patch.operations) applyOperation(newGraph, op);
    return newGraph;
  }
}

module.exports = { PatchExecutor };
