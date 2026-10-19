const Ajv = require('ajv');
const schema = require('../../../../shared/actionGenome.v1.schema.json');

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function validationResult(genome) {
  const valid = validate(genome);
  return {
    valid,
    errors: valid ? [] : validate.errors.map((error) => ({
      path: error.instancePath || '/',
      keyword: error.keyword,
      message: error.message
    }))
  };
}

function assertActionGenome(genome) {
  const result = validationResult(genome);
  if (result.valid) return genome;
  const error = new Error('ActionGenome validation failed.');
  error.code = 'ACTION_GENOME_INVALID';
  error.status = 400;
  error.details = result.errors;
  throw error;
}

module.exports = { assertActionGenome, validationResult };
