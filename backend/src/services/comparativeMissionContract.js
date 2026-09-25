'use strict';

const DIRECTIONS = Object.freeze(['minimize', 'maximize']);

function validateComparativeMission(input) {
  const mission = object(input, 'COMPARATIVE_MISSION_INVALID');
  requireString(mission.schemaVersion, 'schemaVersion');
  requireString(mission.missionId, 'missionId');
  validateProblem(mission.problem);
  validatePopulations(mission.populations);
  validateMigration(mission.migration);
  validateReproducibility(mission.reproducibility);
  return mission;
}

function validateProblem(value) {
  const problem = object(value, 'COMPARATIVE_PROBLEM_INVALID');
  requireString(problem.domain, 'problem.domain');
  requireString(problem.statement, 'problem.statement');
  object(problem.inputs, 'COMPARATIVE_PROBLEM_INVALID');
  stringList(problem.constraints, 'problem.constraints');
  validateFitness(problem.objective, 'problem.objective');
}

function validatePopulations(value) {
  if (!Array.isArray(value) || value.length < 2) fail('At least two populations are required.');
  const ids = new Set();
  value.forEach((population) => {
    const item = object(population, 'COMPARATIVE_POPULATION_INVALID');
    requireString(item.id, 'population.id');
    requireString(item.method, 'population.method');
    if (ids.has(item.id)) fail(`Population id '${item.id}' is duplicated.`);
    ids.add(item.id);
    stringList(item.localObjectives, 'population.localObjectives');
    stringList(item.evidenceRequirements, 'population.evidenceRequirements');
    validateFitness(item.fitness, 'population.fitness');
  });
}

function validateFitness(value, field) {
  const fitness = object(value, 'COMPARATIVE_FITNESS_INVALID');
  requireString(fitness.metric, `${field}.metric`);
  if (!DIRECTIONS.includes(fitness.direction)) fail(`${field}.direction must be minimize or maximize.`);
  if (fitness.unit !== undefined) requireString(fitness.unit, `${field}.unit`);
}

function validateMigration(value) {
  const migration = object(value, 'COMPARATIVE_MIGRATION_INVALID');
  for (const field of ['enabled', 'requireLocalValidation', 'prohibitWholeSolutionCopy']) {
    if (typeof migration[field] !== 'boolean') fail(`migration.${field} must be boolean.`);
  }
  if (migration.enabled && !migration.requireLocalValidation) fail('Enabled migration requires local validation.');
}

function validateReproducibility(value) {
  const config = object(value, 'COMPARATIVE_REPRODUCIBILITY_INVALID');
  requireString(config.seed, 'reproducibility.seed');
  positiveInteger(config.maxRuntimeMs, 'reproducibility.maxRuntimeMs');
  positiveInteger(config.maxTokens, 'reproducibility.maxTokens');
}

function validateComparativeResult(input) {
  const result = object(input, 'COMPARATIVE_RESULT_INVALID');
  for (const field of ['missionId', 'populationId', 'method']) requireString(result[field], field);
  stringList(result.evidence, 'result.evidence');
  if (typeof result.fitness !== 'number' || !Number.isFinite(result.fitness)) fail('result.fitness must be finite.');
  if (!Array.isArray(result.migrations)) fail('result.migrations must be an array.');
  result.migrations.forEach(validateMigrationDecision);
  stringList(result.unresolvedRisks, 'result.unresolvedRisks');
  return result;
}

function validateMigrationDecision(value) {
  const decision = object(value, 'COMPARATIVE_MIGRATION_DECISION_INVALID');
  requireString(decision.ideaId, 'migration.ideaId');
  requireString(decision.decision, 'migration.decision');
  requireString(decision.reason, 'migration.reason');
  if (!['accepted', 'rejected'].includes(decision.decision)) fail('migration.decision must be accepted or rejected.');
  if (decision.decision === 'accepted' && decision.localValidation !== true) fail('Accepted migration needs local validation.');
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.', code);
  return value;
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(`${field} must be a list of non-empty strings.`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`);
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) fail(`${field} must be a positive integer.`);
}

function fail(message, code = 'COMPARATIVE_MISSION_INVALID') {
  throw Object.assign(new Error(message), { code });
}

module.exports = { validateComparativeMission, validateComparativeResult };
