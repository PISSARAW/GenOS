const core = require('./families/coreStrategies');
const temporalCollective = require('./families/temporalCollectiveStrategies');
const knowledgeResilience = require('./families/knowledgeResilienceStrategies');

const STRATEGIES = Object.freeze([...core, ...temporalCollective, ...knowledgeResilience]);
const byId = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

if (STRATEGIES.length !== 77) throw new Error(`Strategy registry must contain exactly 77 strategies, found ${STRATEGIES.length}`);
if (byId.size !== STRATEGIES.length) throw new Error('Strategy registry contains duplicate ids');

function listStrategies() {
  return STRATEGIES.map((strategy) => ({ ...strategy, problemTypes: [...strategy.problemTypes], traits: [...strategy.traits], primitives: [...strategy.primitives] }));
}

function getStrategy(id) {
  const strategy = byId.get(id);
  return strategy ? { ...strategy, problemTypes: [...strategy.problemTypes], traits: [...strategy.traits], primitives: [...strategy.primitives] } : null;
}

module.exports = { listStrategies, getStrategy };
