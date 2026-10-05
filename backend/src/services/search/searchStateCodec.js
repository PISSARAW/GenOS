'use strict';

function requireState(condition, name) {
  if (!condition) throw new Error(`Invalid Natural Search state: ${name}`);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapEntries(value) {
  return Array.isArray(value) && value.every(entry => Array.isArray(entry) && entry.length === 2 && entry[1] !== null);
}

function genome(value) {
  return object(value) && typeof value.id === 'string' && typeof value.hypothesisFamily === 'string'
    && typeof value.strategy === 'string' && Array.isArray(value.operators)
    && object(value.exploration) && Number.isFinite(value.exploration.radius)
    && value.exploration.radius >= 0 && value.exploration.radius <= 1 && value.operators.every(string);
}

function string(value) { return typeof value === 'string'; }
function nonnegative(value) { return Number.isFinite(value) && value >= 0; }
function integer(value) { return Number.isInteger(value) && value >= 0; }

function fields(value, checks) {
  return object(value) && Object.entries(checks).every(([key, check]) => check(value[key]));
}

function entries(value, check) {
  return mapEntries(value) && value.every(([key, item]) => string(key) && check(item));
}

function patch(value) {
  return fields(value, { id: string, metadata: object, visits: integer, createdAt: nonnegative,
    history: history => Array.isArray(history) && history.every(step => fields(step,
      { infoGain: Number.isFinite, cost: nonnegative, ts: nonnegative })) });
}

function negative(value) {
  return fields(value, { id: string, agentId: string, hypothesisId: string, statement: string,
    confidence: nonnegative, ttl: nonnegative, createdAt: nonnegative, conditions: Array.isArray,
    active: active => typeof active === 'boolean' });
}

function replayHistory(value) {
  return Array.isArray(value) && value.every(item => fields(item, { failedHypothesis: string,
    checkpoint: checkpoint => fields(checkpoint, { start: integer, events: Array.isArray }),
    checkpointCount: integer, recordedAt: nonnegative }));
}

function plasmid(value) {
  return fields(value, { id: string, trait: trait => fields(trait, { strategy: string, hypothesisFamily: string,
    operators: Array.isArray }), validation: object, createdAt: nonnegative, transmissions: integer });
}

function transmission(value) {
  return fields(value, { id: string, plasmidId: string, targetAgentId: string, transmittedAt: nonnegative });
}

function received(value) {
  return fields(value, { sourceAgentId: string, plasmid, transmission });
}

function validateModule(name, value) {
  if (name === 'genome') requireState(genome(value.genome), name);
  if (name === 'variants') requireState(Array.isArray(value) && value.every(genome), name);
  if (name === 'patches') requireState(entries(value, patch), name);
  if (name === 'replay') requireState(entries(value, replayHistory), name);
  if (name === 'negative') requireState(entries(value, negative), name);
  if (name === 'population') validatePopulation(value);
  if (name === 'culture') validateCulture(value);
}

function validatePopulation(value) {
  requireState(object(value) && Array.isArray(value.population) && value.population.every(genome), 'population');
  requireState(Number.isInteger(value.generation) && value.generation >= 0 && Array.isArray(value.generationHistory), 'generation');
}

function validateCulture(value) {
  requireState(object(value) && entries(value.plasmids, plasmid), 'culture plasmids');
  requireState(Array.isArray(value.transmissions) && value.transmissions.every(transmission), 'culture transmissions');
  requireState(value.received === undefined || entries(value.received, received), 'culture received');
}

function validateCheckpoint(value) {
  requireState(object(value) && object(value.modules) && object(value.ledger), 'checkpoint');
  requireState(Array.isArray(value.ledger.hypotheses) && Array.isArray(value.ledger.proofs), 'ledger');
  requireState(Number.isInteger(value.stepCount) && Number.isInteger(value.lastProgressStep), 'counters');
  for (const name of ['genome', 'variants', 'patches', 'replay', 'negative', 'population', 'culture']) {
    requireState(value.modules[name] !== undefined, name);
    validateModule(name, value.modules[name]);
  }
  requireState(object(value.control) && object(value.sensor) && Array.isArray(value.causalEvents), 'control/sensor');
  validateControl(value.control);
  validateSensor(value.sensor);
  validateLedger(value);
}

function numericRecord(value, keys) {
  requireState(object(value), 'numeric record');
  for (const key of keys) requireState(Number.isFinite(value[key]), key);
}

function validateControl(value) {
  const processes = Object.values(require('./searchProcessTypes').SEARCH_PROCESS);
  requireState(value.lastProcess === null || processes.includes(value.lastProcess), 'last process');
  numericRecord(value, ['stepsSinceChange', 'stepsInCurrentProcess', 'lastEvolutionLineageCount']);
  requireState(Array.isArray(value.history), 'controller history');
  numericRecord(value.pressureModel, ['pressure', 'confidence', 'lowYieldThreshold', 'stagnationWindow', 'inertia', 'maxPressure', 'minPressure']);
  requireState(Array.isArray(value.pressureModel.causes), 'pressure causes');
}

function validateSensor(value) {
  numericRecord(value.totals, ['globalEvidence', 'globalUncertainty', 'globalConstraints', 'globalArtifacts',
    'globalObjective', 'globalHypothesisInfo', 'globalTokens', 'globalTime', 'globalCost']);
  numericRecord(value.budgets, ['tokenBudget', 'costBudget', 'timeBudget']);
  requireState(Array.isArray(value.steps), 'sensor steps');
  for (const step of value.steps) numericRecord(step, ['ts', 'evidenceGain', 'uncertaintyReduction',
    'constraintsResolved', 'verifiedArtifactDelta', 'objectiveDelta', 'hypothesisInformationGain',
    'tokensConsumed', 'timeConsumed', 'costConsumed']);
}

function validateLedger(value) {
  const hypotheses = new Map(value.ledger.hypotheses.map(h => [h.id, h]));
  const proofs = new Map(value.ledger.proofs.map(p => [p.id, p]));
  requireState(hypotheses.size === value.ledger.hypotheses.length && proofs.size === value.ledger.proofs.length, 'duplicate ledger IDs');
  for (const h of hypotheses.values()) validateHypothesis(h, { agentId: value.agentId, proofs });
  for (const p of proofs.values()) {
    requireState(hypotheses.has(p.hypothesisId), 'proof hypothesis');
    numericRecord(p, ['strength', 'reliability']);
  }
}

function validateHypothesis(h, context) {
  requireState(h.agentId === context.agentId && typeof h.id === 'string' && typeof h.statement === 'string', 'hypothesis identity');
  numericRecord(h, ['confidence', 'uncertainty']);
  requireState(Array.isArray(h.proofIds), 'hypothesis proof IDs');
  requireState(new Set(h.proofIds).size === h.proofIds.length, 'duplicate hypothesis proof links');
  for (const id of h.proofIds) requireState(context.proofs.get(id)?.hypothesisId === h.id, 'hypothesis proof link');
}

function decodeState(raw, name) {
  let decoded;
  try { decoded = JSON.parse(raw); } catch (_) { throw new Error(`Corrupt Natural Search state: ${name}`); }
  requireState(decoded !== null && typeof decoded === 'object', name);
  if (decoded.version !== undefined) {
    requireState(decoded.version === 1 && decoded.payload !== undefined, `${name} version`);
    decoded = decoded.payload;
  }
  if (name === 'checkpoint') validateCheckpoint(decoded);
  else validateModule(name, decoded);
  return decoded;
}

module.exports = { decodeState, validateCheckpoint };
