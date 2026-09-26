'use strict';

const { FastControlLoop } = require('./fastControlLoop');
const { StructuralControlLoop } = require('./structuralControlLoop');
const { EvolutionaryControlLoop } = require('./evolutionaryControlLoop');

class ControlLoopOrchestrator {
  constructor(opts = {}) {
    this.fastLoop = new FastControlLoop(opts.fast);
    this.structuralLoop = new StructuralControlLoop(opts.structural);
    this.evolutionaryLoop = new EvolutionaryControlLoop(opts.evolutionary);
    this.context = opts.context || {};
    this.running = false;
    this.intervalHandle = null;
    this.tickCount = 0;
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
    if (this.structuralLoop.patchExecutor) {
      this.structuralLoop.patchExecutor.runtime = this.context.runtime;
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => this.tick(), 1000);
  }

  async stop() {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async tick() {
    this.tickCount++;
    const now = Date.now();

    const fastResult = await this.fastLoop.run(this.context);
    if (fastResult.executed) this.context.lastFastResult = fastResult;

    if (this.tickCount % 10 === 0) {
      const structuralResult = await this.structuralLoop.run(this.context);
      if (structuralResult.executed) this.context.lastStructuralResult = structuralResult;
    }

    if (this.tickCount % 3600 === 0) {
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