'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateSpec, validateWithSchema } = require('../services/specValidator');
const { executionErrors } = require('./contractOperationalization');

const TARGETS = ['agent', 'relations', 'topology', 'world', 'reflection', 'response'];
const MATURITY = ['registered', 'defined', 'mechanism-linked', 'observable', 'tested', 'integrated', 'validated'];
const TOPOLOGIES = ['isolated_critics', 'centralized', 'federated', 'peer_to_peer'];
const ARRAY_FIELDS = ['targets', 'observables', 'falsificationTests', 'limits', 'obligations', 'prohibitions', 'violationCriteria'];

function scalarErrors(value) {
  const errors = [];
  for (const field of ['id', 'type', 'interpretation', 'invariant', 'mechanism', 'responsibility', 'status']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) errors.push(`${field} must be a non-empty string`);
  }
  if (!['state', 'transformation', 'constraint', 'organization', 'evaluation'].includes(value.category)) errors.push('category is invalid');
  if (!MATURITY.includes(value.maturity)) errors.push('maturity is invalid');
  return errors;
}

function scenarioErrors(value) {
  const errors = [];
  if (value.scenario?.contractId !== value.id) errors.push('scenario must identify its contract');
  if (!value.scenario?.stimulus || !value.scenario?.observation) errors.push('scenario must define stimulus and observation');
  if (value.experiment?.status !== 'planned') errors.push('experiment must be planned');
  if (!TOPOLOGIES.every((topology) => value.experiment?.topologies?.includes(topology))) errors.push('experiment must compare all topology variants');
  const required = ['scenario-input', 'scenario-output', 'comparison-receipt'];
  if (!required.every((item) => value.experiment?.evidenceRequired?.includes(item))) errors.push('experiment must define the comparison evidence set');
  return errors;
}

function arrayErrors(value) {
  const errors = [];
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(value[field]) || !value[field].length) errors.push(`${field} must be a non-empty array`);
  }
  if (!Array.isArray(value.targets)) return errors;
  if (!value.targets.every((target) => TARGETS.includes(target))) errors.push('targets contains an unknown target');
  return errors;
}

function validateContractSchema(value) {
  return validateSpec('implementation-contract.schema.json', value);
}

function validateContract(value, validateSchema = validateContractSchema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['contract must be an object'];
  const schema = validateSchema(value);
  return [...schema.errors, ...scalarErrors(value), ...scenarioErrors(value), ...arrayErrors(value), ...executionErrors(value)];
}

function createContractValidator() {
  const file = path.resolve(__dirname, '../../../spec/implementation-contract.schema.json');
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('invalid schema object');
  } catch (error) {
    return (value) => validateContract(value, () => ({ errors: [`spec file unreadable: ${error.message}`] }));
  }
  return (value) => validateContract(value, (contract) => validateWithSchema(contract, schema));
}

module.exports = { validateContract, createContractValidator };
