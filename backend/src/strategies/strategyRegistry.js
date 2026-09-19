const core = require('./families/coreStrategies');
const temporalCollective = require('./families/temporalCollectiveStrategies');
const knowledgeResilience = require('./families/knowledgeResilienceStrategies');
const animalControl = require('./families/animalControlStrategies');
const crypto = require('crypto');

const STRATEGIES = Object.freeze([...core, ...temporalCollective, ...knowledgeResilience, ...animalControl]);
const byId = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));
if (STRATEGIES.length === 0) throw new Error('Strategy registry must contain at least one strategy');
if (byId.size !== STRATEGIES.length) throw new Error('Strategy registry contains duplicate ids');

function listStrategies() {
  return STRATEGIES.map(toPublicStrategy);
}

function getStrategy(id) {
  const strategy = byId.get(id);
  return strategy ? toPublicStrategy(strategy) : null;
}

function registryHealth() {
  const strategies = listStrategies();
  const missingPrimitives = [...new Set(strategies.flatMap((strategy) => strategy.missingPrimitives))].sort();
  const invalidMaturity = strategies.filter((strategy) => !['ready', 'partial', 'experimental', 'prototype'].includes(strategy.maturity));
  const promotionBlocked = strategies.filter((strategy) => strategy.maturity !== 'ready' || strategy.missingPrimitives.length > 0);
  return {
    total: strategies.length,
    ready: strategies.filter((strategy) => strategy.maturity === 'ready').length,
    partial: strategies.filter((strategy) => strategy.executionStatus === 'partial').length,
    experimental: strategies.filter((strategy) => strategy.maturity === 'experimental').length,
    prototype: strategies.filter((strategy) => strategy.maturity === 'prototype').length,
    missingPrimitives,
    invalidMaturity: invalidMaturity.map((strategy) => strategy.id),
    promotionBlocked: promotionBlocked.map((strategy) => strategy.id),
    registryHash: hashRegistry(strategies),
    complete: missingPrimitives.length === 0 && invalidMaturity.length === 0 && promotionBlocked.length === 0
  };
}

function hashRegistry(strategies = listStrategies()) {
  const canonical = strategies.map((strategy) => ({
    id: strategy.id,
    maturity: strategy.maturity,
    problemTypes: [...strategy.problemTypes].sort(),
    traits: [...strategy.traits].sort(),
    primitives: [...strategy.primitives].sort(),
    executionStatus: strategy.executionStatus,
    missingPrimitives: [...strategy.missingPrimitives].sort()
  })).sort((left, right) => left.id.localeCompare(right.id));
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

function toPublicStrategy(strategy) {
  const handlers = require('../services/strategyExecutionAdapter').getHandlers();
  const missingPrimitives = strategy.primitives.filter((primitive) => !handlers[primitive]);
  const declared = strategy.maturity === 'implemented' ? 'ready' : strategy.maturity;
  const executionStatus = missingPrimitives.length ? 'partial' : declared;
  const maturity = missingPrimitives.length ? 'partial' : declared;
  return {
    ...strategy,
    maturity,
    problemTypes: [...strategy.problemTypes],
    traits: [...strategy.traits],
    primitives: [...strategy.primitives],
    executionStatus,
    effectiveMaturity: maturity,
    missingPrimitives
  };
}

module.exports = { listStrategies, getStrategy, registryHealth, hashRegistry };
