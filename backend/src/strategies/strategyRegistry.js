const core = require('./families/coreStrategies');
const temporalCollective = require('./families/temporalCollectiveStrategies');
const knowledgeResilience = require('./families/knowledgeResilienceStrategies');

const STRATEGIES = Object.freeze([...core, ...temporalCollective, ...knowledgeResilience]);
const byId = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

if (STRATEGIES.length !== 78) throw new Error(`Strategy registry must contain exactly 78 strategies, found ${STRATEGIES.length}`);
if (byId.size !== STRATEGIES.length) throw new Error('Strategy registry contains duplicate ids');

function listStrategies() {
  return STRATEGIES.map(toPublicStrategy);
}

function getStrategy(id) {
  const strategy = byId.get(id);
  return strategy ? toPublicStrategy(strategy) : null;
}

function toPublicStrategy(strategy) {
  const handlers = require('../services/strategyExecutionAdapter').getHandlers();
  const missingPrimitives = strategy.primitives.filter((primitive) => !handlers[primitive]);
  return {
    ...strategy,
    problemTypes: [...strategy.problemTypes],
    traits: [...strategy.traits],
    primitives: [...strategy.primitives],
    executionStatus: missingPrimitives.length ? 'partial' : 'ready',
    missingPrimitives
  };
}

module.exports = { listStrategies, getStrategy };
