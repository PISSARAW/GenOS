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
    this.growthBudget = config.growthBudget || 1000;
    this.explorationStrategy = config.strategy || 'breadth-first';
    return { growthBudget: this.growthBudget, strategy: this.explorationStrategy };
  }

  async execute(input) {
    const { problemSpace = [], seed = null } = input;
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
      budget_remaining: this.growthBudget
    };
  }

  async explore(node) {
    return [{ from: node, to: `path_${Date.now()}`, depth: 1 }];
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