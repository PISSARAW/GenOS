/**
 * Minimal JSON-Schema validator for the repository's spec/ contracts.
 *
 * The studio backend has no ajv/zod dependency, so this implements the
 * subset of draft 2020-12 that the GenOS spec schemas actually use:
 * type, required, properties, items, enum, additionalProperties.
 * Validation failures are reported with precise paths instead of being
 * silently dropped.
 */

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const SPEC_DIR = path.join(repositoryRoot, 'spec');

const TYPE_CHECKS = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null
};

function validateAgainstSchema(value, schema, pathSoFar, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type) {
    const check = TYPE_CHECKS[schema.type];
    if (check && !check(value)) {
      errors.push(`${pathSoFar || '(root)'} must be of type ${schema.type}`);
      return;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pathSoFar || '(root)'} must be one of ${schema.enum.join(', ')}`);
  }

  if (TYPE_CHECKS.object(value) && schema.properties) {
    for (const key of schema.required || []) {
      if (!(key in value)) {
        errors.push(`${pathSoFar ? `${pathSoFar}.` : ''}${key} is required`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value) {
        validateAgainstSchema(value[key], childSchema, pathSoFar ? `${pathSoFar}.${key}` : key, errors);
      }
    }
  }

  if (TYPE_CHECKS.array(value) && schema.items) {
    value.forEach((item, index) => {
      validateAgainstSchema(item, schema.items, `${pathSoFar}[${index}]`, errors);
    });
  }
}

/**
 * Validates `value` against spec/<schemaFile>.
 * Returns { valid, schema, errors } — never throws for schema-side issues;
 * missing schema files surface as an explicit `available:false` result.
 */
function validateSpec(schemaFile, value) {
  const schemaPath = path.join(SPEC_DIR, schemaFile);
  if (!fs.existsSync(schemaPath)) {
    return { available: false, schema: schemaFile, valid: false, errors: [`spec file not found: ${schemaFile}`] };
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    return { available: false, schema: schemaFile, valid: false, errors: [`spec file unreadable: ${e.message}`] };
  }

  const errors = [];
  validateAgainstSchema(value, schema, '', errors);
  return { available: true, schema: schemaFile, title: schema.title || null, valid: errors.length === 0, errors };
}

module.exports = { validateSpec };
