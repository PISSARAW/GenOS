'use strict';

const { TopologyController } = require('./topologyController');

class RhizomeController extends TopologyController {
  constructor(node, runtime) {
    super(node, runtime);
    this.explorationFrontier = [];
    this.discoveredPaths = [];
    this.growthBudget = 0;
  }

  async compose(config = {}) {
    this.growthBudget = config.growthBudget ?? config.budget?.maxTicks ?? 1000;
    this.explorationStrategy = config.strategy || 'breadth-first';
    return { growthBudget: this.growthBudget, strategy: this.explorationStrategy };
  }

  async execute(input) {
    if (input.db && input.sessionId) {
      return require('../../rhizome/runtime/rhizomeController').run({
        ...input, options: { ...(input.options || {}), db: input.db }
      });
    }
    const { problemSpace = [], seed = null } = input;
    this.graph = input.graph || {};
    this.explorationFrontier = seed ? [seed] : problemSpace;

    while (this.explorationFrontier.length > 0 && this.growthBudget > 0) {
      const node = this.explorationFrontier.shift();
      const discovered = await this.explore(node);
      this.discoveredPaths.push(...discovered);
      this.growthBudget--;
    }

    return {
      explored_paths: this.discoveredPaths,
      frontier_size: this.explorationFrontier.length,
      budget_remaining: this.growthBudget,
      executionMode: 'simulated_controller'
    };
  }

  async explore(node) {
    const neighbours = Array.isArray(this.graph[node]) ? this.graph[node] : [];
    const visited = new Set(this.discoveredPaths.flatMap((path) => [path.from, path.to]));
    const discovered = neighbours.filter((target) => !visited.has(target))
      .map((target) => ({ from: node, to: target, depth: 1 }));
    this.explorationFrontier.push(...discovered.map((path) => path.to));
    return discovered;
  }

  async observe() {
    const base = await super.observe();
    return {
      ...base,
      frontier: this.explorationFrontier.length,
      discovered: this.discoveredPaths.length,
      budget: this.growthBudget
    };
  }

  async proposeAdaptation() {
    if (this.growthBudget <= 0) {
      return [{ type: 'CHANGE_TOPOLOGY', to: 'trinity', reason: 'Exploration budget exhausted, switch to verification' }];
    }
    if (this.discoveredPaths.length > 100) {
      return [{ type: 'SPLIT', reason: 'Too many paths, need structured exploration' }];
    }
    return null;
  }
}

module.exports = { RhizomeController };
