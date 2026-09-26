'use strict';

const { MorphologyPriorService } = require('./morphologyPriorService');

const EXPLORATION_RATE = 0.1;
const MIN_SAMPLES_FOR_BANDIT = 50;

function ucbScore(opts) {
  const { mean, count, totalCount, exploration = EXPLORATION_RATE } = opts;
  return count === 0
    ? Infinity
    : mean + exploration * Math.sqrt(Math.log(totalCount) / count);
}

function thompsonSample(prior) {
  const a = prior.mean * prior.count + 1;
  const b = (1 - prior.mean) * prior.count + 1;
  return Math.random() * (a / (a + b));
}

function epsilonGreedy(actions, epsilon = EXPLORATION_RATE) {
  if (Math.random() < epsilon)
    return Math.floor(Math.random() * actions.length);
  let best = 0;
  for (let i = 1; i < actions.length; i++)
    if (actions[i].mean > actions[best].mean) best = i;
  return best;
}

class PolicyLearner {
  constructor(opts = {}) {
    this.priorService = new MorphologyPriorService(opts.prior);
    this.useBandit = opts.useBandit !== false;
    this.banditAlgorithm = opts.banditAlgorithm || 'ucb';
    this.explorationRate = opts.explorationRate || EXPLORATION_RATE;
    this.minSamplesForBandit = opts.minSamplesForBandit || MIN_SAMPLES_FOR_BANDIT;
    this.actionSpace = opts.actionSpace || [
      'trinity', 'rhizome', 'a_team', 'syncytium',
      'biocenose', 'nest', 'split', 'merge'
    ];
    this.history = [];
  }

  selectAction(context) {
    const available = this.filterApplicable(this.actionSpace, context);
    if (!available.length) return this.actionSpace[0];
    const totalSamples = this.totalSamples(context);
    return (!this.useBandit || totalSamples < this.minSamplesForBandit)
      ? this.empiricalSelect(available, context)
      : this.banditSelect(available, context, totalSamples);
  }

  filterApplicable(actions, context) {
    return actions.filter(a => !context?.constraints?.blocked?.includes(a));
  }

  empiricalSelect(actions, context) {
    let best = actions[0], bestScore = -Infinity;
    for (const action of actions) {
      const prior = this.priorService.getContextualPrior({ ...context, topology: action }, 'outcome');
      const costPrior = this.priorService.getContextualPrior({ ...context, topology: action }, 'cost');
      const score = prior.mean - (costPrior.mean || 0) * 0.001;
      if (score > bestScore) { bestScore = score; best = action; }
    }
    return best;
  }

  banditSelect(actions, context, totalCount) {
    let best = actions[0], bestScore = -Infinity;
    for (const action of actions) {
      const prior = this.priorService.getContextualPrior({ ...context, topology: action }, 'outcome');
      const score = this.banditScore(prior, totalCount);
      if (score > bestScore) { bestScore = score; best = action; }
    }
    return best;
  }

  banditScore(prior, totalCount) {
    switch (this.banditAlgorithm) {
      case 'ucb':
        return ucbScore({ mean: prior.mean, count: prior.count, totalCount, exploration: this.explorationRate });
      case 'thompson':
        return thompsonSample(prior);
      case 'epsilon-greedy':
        return prior.mean;
      default:
        return prior.mean;
    }
  }

  totalSamples(context) {
    let total = 0;
    for (const action of this.actionSpace)
      total += this.priorService.getContextualPrior({ ...context, topology: action }, 'outcome').count;
    return total;
  }

  recordOutcome(action, context, reward, cost = 0, latency = 0) {
    const key = `${action}:${this.contextKey(context)}`;
    this.priorService.update(key, reward, 'outcome');
    this.priorService.update(key, cost, 'cost');
    this.priorService.update(key, latency, 'latency');
    this.history.push({ action, context: this.contextKey(context), reward, cost, latency, timestamp: new Date().toISOString() });
    if (this.history.length > 10000) this.history.shift();
  }

  recordTransition(from, to, context, benefit, cost = 0) {
    const key = `${from}->${to}:${this.contextKey(context)}`;
    this.priorService.update(key, benefit, 'transition');
    this.priorService.update(key, cost, 'cost');
    this.history.push({ action: 'transition', from, to, context: this.contextKey(context), benefit, cost, timestamp: new Date().toISOString() });
  }

  getActionValues(context) {
    return this.actionSpace.map(action => {
      const prior = this.priorService.getContextualPrior({ ...context, topology: action }, 'outcome');
      const costPrior = this.priorService.getContextualPrior({ ...context, topology: action }, 'cost');
      return { action, expectedOutcome: prior.mean, expectedCost: costPrior.mean, samples: prior.count };
    }).sort((a, b) => b.expectedOutcome - a.expectedOutcome);
  }

  getTransitionValues(from, context) {
    const transitions = {};
    for (const to of this.actionSpace) {
      if (from === to) continue;
      const prior = this.priorService.getContextualPrior({ ...context, transition: `${from}->${to}` }, 'transition');
      transitions[to] = { benefit: prior.mean, cost: 0, samples: prior.count };
    }
    return transitions;
  }

  contextKey(context) {
    if (!context) return 'default';
    const parts = [];
    if (context.topology) parts.push(`topology:${context.topology}`);
    if (context.variant) parts.push(`variant:${context.variant}`);
    if (context.problemType) parts.push(`problem:${context.problemType}`);
    if (context.complexity) parts.push(`complexity:${context.complexity}`);
    return parts.join('|') || 'default';
  }

  getStats() {
    return {
      historyLength: this.history.length,
      actionSpace: this.actionSpace,
      useBandit: this.useBandit,
      banditAlgorithm: this.banditAlgorithm,
      minSamplesForBandit: this.minSamplesForBandit
    };
  }

  enableBandit() { this.useBandit = true; }
  disableBandit() { this.useBandit = false; }
  setAlgorithm(algo) { this.banditAlgorithm = algo; }
}

module.exports = {
  PolicyLearner, ucbScore, thompsonSample, epsilonGreedy,
  EXPLORATION_RATE, MIN_SAMPLES_FOR_BANDIT
};
