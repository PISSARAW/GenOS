'use strict';

const { loopIsDue } = require('./morphogenesisControlLoopService');
const { PatchExecutor } = require('../transitions/patchExecutor');
const { createMorphologyPatch, createOperation } = require('../transitions/morphologyPatch');

const DEFAULT_INTERVAL_MS = 10000;
const HYSTERESIS_WINDOW_MS = 30000;

class StructuralControlLoop {
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
    this.hysteresisMs = opts.hysteresisMs || HYSTERESIS_WINDOW_MS;
    this.actions = opts.actions || ['nest', 'split', 'merge', 'topology_change', 'variant_change'];
    this.lastRunAt = 0;
    this.runCount = 0;
    this.pendingProposals = new Map();
    this.executedHistory = [];
    this.flapDetector = new FlapDetector(this.hysteresisMs);
    this.patchExecutor = opts.patchExecutor || new PatchExecutor();
  }

  async run(context) {
    if (!this.shouldRun(Date.now(), context.structuralLoopRequested === true)) return { executed: false, reason: 'not_due' };

    this.lastRunAt = Date.now();
    this.runCount++;

    const proposals = await this.collectProposals(context);
    const filtered = this.filterWithHysteresis(proposals, context);

    const results = [];
    for (const proposal of filtered) {
      const result = await this.executeProposal(proposal, context);
      results.push({ proposal, ...result });

      if (result.success) {
        this.flapDetector.record(proposal.nodeId, proposal.type);
        this.executedHistory.push({ proposal, result, timestamp: new Date().toISOString() });
      }
    }

    return { executed: true, runCount: this.runCount, proposals: filtered.length, results, timestamp: new Date().toISOString() };
  }

  shouldRun(now = Date.now(), force = false) {
    return force || loopIsDue('structural', { intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, now });
  }

  async collectProposals(context) {
    const proposals = [];

    if (Array.isArray(context.structuralProposals)) proposals.push(...context.structuralProposals);
    for (const node of context.graph?.nodes || context.nodes || []) {
      const controller = context.controllerRegistry?.getController(node.topology, node);
      if (controller) {
        const adaptation = await controller.proposeAdaptation();
        if (adaptation) {
          for (const a of Array.isArray(adaptation) ? adaptation : [adaptation]) {
            proposals.push({ nodeId: node.nodeId, ...a, source: 'controller', timestamp: new Date().toISOString() });
          }
        }
      }
    }

    return proposals;
  }

  filterWithHysteresis(proposals, context) {
    return proposals.filter(p => {
      if (this.flapDetector.isFlapping(p.nodeId, p.type)) {
        return false;
      }

      const recentSame = this.executedHistory.filter(h =>
        h.proposal.nodeId === p.nodeId &&
        h.proposal.type === p.type &&
        Date.now() - new Date(h.timestamp).getTime() < this.hysteresisMs
      );
      if (recentSame.length > 0) return false;

      const budget = context.budget || {};
      if (p.estimatedCost && budget.tokens && p.estimatedCost.tokens > budget.tokens * 0.5) {
        return false;
      }

      return true;
    });
  }

  async executeProposal(proposal, context) {
    try {
      const patch = this.createPatchFromProposal(proposal, context);
      const result = await this.patchExecutor.execute(patch, context.graph, context);
      if (result.success) {
        context.graph = result.execution.commitResult.graph;
        context.nodes = context.graph.nodes;
        context.structuralProposals = (context.structuralProposals || []).filter(item => item !== proposal);
      }
      return { success: result.success, execution: result.execution, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  createPatchFromProposal(proposal, context) {
    const payload = normalizeProposal(proposal);
    const ops = [createOperation(payload.type, payload)];
    return createMorphologyPatch({
      baseGraphVersion: context.graph.version,
      operations: ops,
      reason: proposal.reason || 'structural adaptation',
      evidence: proposal.evidence || [],
      expectedGain: proposal.expectedGain || {},
      expectedCost: proposal.estimatedCost || {},
      authority: proposal.authority,
      lease: proposal.lease,
      rollbackPlan: proposal.rollbackPlan || context.rollbackPlan,
      stateMigrationPlan: proposal.stateMigrationPlan || context.stateMigrationPlan
    });
  }

  getStatus() {
    return { loop: 'structural', intervalMs: this.intervalMs, hysteresisMs: this.hysteresisMs, lastRunAt: this.lastRunAt, runCount: this.runCount, pendingProposals: this.pendingProposals.size, executedCount: this.executedHistory.length };
  }
}

function normalizeProposal(proposal) {
  const type = ({ TOPOLOGY_CHANGE: 'CHANGE_TOPOLOGY', VARIANT_CHANGE: 'CHANGE_VARIANT' })[String(proposal.type).toUpperCase()]
    || String(proposal.type).toUpperCase();
  const payload = { ...proposal, type };
  if (type === 'CHANGE_VARIANT') payload.newVariant = proposal.newVariant || proposal.to;
  if (type === 'CHANGE_TOPOLOGY') payload.newTopology = proposal.newTopology || proposal.to;
  return payload;
}

class FlapDetector {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.events = new Map();
  }

  record(nodeId, actionType) {
    const key = `${nodeId}:${actionType}`;
    const now = Date.now();
    if (!this.events.has(key)) this.events.set(key, []);
    const events = this.events.get(key);
    events.push(now);
    while (events.length > 0 && now - events[0] > this.windowMs) events.shift();
  }

  isFlapping(nodeId, actionType) {
    const key = `${nodeId}:${actionType}`;
    const events = (this.events.get(key) || []).filter(time => Date.now() - time < this.windowMs);
    this.events.set(key, events);
    return events.length >= 3;
  }

  clear(nodeId, actionType) {
    const key = `${nodeId}:${actionType}`;
    this.events.delete(key);
  }
}

module.exports = { StructuralControlLoop, FlapDetector };