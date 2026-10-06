'use strict';

const { FastControlLoop } = require('./fastControlLoop');
const { StructuralControlLoop } = require('./structuralControlLoop');
const { EvolutionaryControlLoop } = require('./evolutionaryControlLoop');
const { decideEventAction, classifyAction } = require('./morphogenesisControlLoopService');

class ControlLoopOrchestrator {
  constructor(opts = {}) {
    this.fastLoop = new FastControlLoop(opts.fast);
    this.structuralLoop = new StructuralControlLoop(opts.structural);
    this.evolutionaryLoop = new EvolutionaryControlLoop(opts.evolutionary);
    this.context = opts.context || {};
    this.running = false;
    this.intervalHandle = null;
    this.tickCount = 0;
    this.pendingTick = null;
    this.lastError = null;
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
    if (this.structuralLoop.patchExecutor) {
      this.structuralLoop.patchExecutor.runtime = this.context.runtime;
    }
  }

  async consumeEvent(event, evidenceContext = {}) {
    const decision = decideEventAction(event, evidenceContext);
    const pending = this.context.pendingMorphogenesisDecisions || [];
    this.context.pendingMorphogenesisDecisions = [...pending, decision].slice(-100);
    this.routeStructuralDecision(decision);
    if (classifyAction(decision.action) === 'evolutionary') this.context.evolutionaryLoopRequested = true;
    const fastContext = { ...this.context, latestEvent: event, latestDecision: decision };
    const fast = await this.executeEventDecision(decision, fastContext);
    if (fast.executed) this.context.lastFastResult = fast;
    return { ...decision, fastLoop: fast };
  }

  async executeEventDecision(decision, context) {
    if (decision.status === 'BLOCKED' || decision.action === 'NO_CHANGE') {
      return { executed: false, reason: decision.status === 'BLOCKED' ? 'decision-blocked' : 'no-change' };
    }
    if (classifyAction(decision.action) !== 'fast') {
      return { executed: false, reason: 'action-routed-to-another-loop' };
    }
    try {
      const result = await this.fastLoop.executeAction(decision.action, context);
      return { executed: true, action: decision.action, result };
    } catch (error) {
      return { executed: false, action: decision.action, reason: 'handler-unavailable', error: error.message };
    }
  }

  routeStructuralDecision(decision) {
    if (classifyAction(decision.action) === 'structural') {
      this.context.structuralLoopRequested = true;
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => {
      this.tick().catch(error => { this.lastError = error.message; });
    }, 1000);
  }

  async stop() {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async tick() {
    if (this.pendingTick) return this.pendingTick;
    this.pendingTick = this.performTick();
    try { return await this.pendingTick; } finally { this.pendingTick = null; }
  }

  async performTick() {
    this.tickCount++;

    const fastResult = await this.fastLoop.run(this.context);
    if (fastResult.executed) this.context.lastFastResult = fastResult;

    if (this.structuralLoop.shouldRun() || this.context.structuralLoopRequested) {
      const structuralResult = await this.structuralLoop.run(this.context);
      if (structuralResult.executed) {
        this.context.lastStructuralResult = structuralResult;
        this.context.structuralLoopRequested = false;
      }
    }

    if (this.evolutionaryLoop.shouldRun(Date.now(), this.context)) {
      const evolutionaryResult = await this.evolutionaryLoop.run(this.context);
      if (evolutionaryResult.executed) this.context.lastEvolutionaryResult = evolutionaryResult;
    }
  }

  async runOnce() {
    await this.tick();
  }

  getStatus() {
    return {
      running: this.running,
      tickCount: this.tickCount,
      fast: this.fastLoop.getStatus(),
      structural: this.structuralLoop.getStatus(),
      evolutionary: this.evolutionaryLoop.getStatus(),
      context: { nodes: this.context.nodes?.length || 0, graph: !!this.context.graph }
    };
  }

  registerFastHandler(action, handler) {
    this.fastLoop.registerHandler(action, handler);
  }

  setFastInterval(ms) { this.fastLoop.setInterval(ms); }
  setStructuralInterval(ms) { this.structuralLoop.intervalMs = ms; }
  setEvolutionaryInterval(ms) { this.evolutionaryLoop.intervalMs = ms; }
}

module.exports = { ControlLoopOrchestrator };
