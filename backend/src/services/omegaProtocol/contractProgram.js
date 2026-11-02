'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/omegaExecutionProtocol.v1.schema.json');
const interop = require('../cognitiveOmegaInteropService');
const { canonicalize } = require('../evidenceProtocol/canonical');
const { OmegaProtocolError } = require('./contractError');

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const definition = (name) => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const programSchema = definition('program');
const capabilitiesSchema = definition('capabilities');
const submissionSchema = definition('submission');
const requests = new Map(['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT'].map((kind) => [kind, definition(`request${kind}`)]));

function checked(value, validator) {
  let copy;
  try { copy = JSON.parse(canonicalize(value)); }
  catch (error) { throw new OmegaProtocolError('OMEGA_JSON_INVALID', error.message); }
  if (!validator(copy)) throw new OmegaProtocolError('OMEGA_SCHEMA_INVALID', `OMEGA contract: ${ajv.errorsText(validator.errors)}`);
  return copy;
}

function validateProgram(input) {
  const copy = checked(input, programSchema);
  const native = interop.validate(copy);
  if (!native.valid) throw new OmegaProtocolError('OMEGA_PROGRAM_INVALID', native.errors.join(', '));
  const program = interop.read(copy);
  if (canonicalize(program) !== canonicalize(copy)) throw new OmegaProtocolError('OMEGA_PROGRAM_INVALID', 'OMEGA noncanonical program.');
  const keys = Object.keys(program.payload.requests);
  const ids = new Set(program.operations.map((item) => item.id));
  if (keys.length !== ids.size || keys.some((key) => !ids.has(key))) {
    throw new OmegaProtocolError('OMEGA_PROGRAM_INVALID', 'OMEGA requests must cover every operation exactly.');
  }
  for (const operation of program.operations) checked(program.payload.requests[operation.id], requests.get(operation.kind));
  return program;
}

function validateCapabilities(input) {
  const capabilities = checked(input, capabilitiesSchema);
  const kinds = capabilities.operations.map((item) => item.kind);
  if (new Set(kinds).size !== kinds.length) throw new OmegaProtocolError('OMEGA_CAPABILITIES_INVALID', 'OMEGA duplicate operation capability.');
  return capabilities;
}

function validateSubmission(input) {
  const copy = checked(input, submissionSchema);
  validateProgram(copy.program);
  const { limit, spent, reserved } = copy.budget;
  if (reserved > limit || spent > limit - reserved) throw new OmegaProtocolError('OMEGA_BUDGET_INVALID', 'OMEGA budget exceeds its limit.');
  return copy;
}

module.exports = { validateProgram, validateCapabilities, validateSubmission };
