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

  if ('const' in schema && value !== schema.const) {
    errors.push(`${pathSoFar || '(root)'} must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.type) {
    if (Array.isArray(schema.type)) {
      const matched = schema.type.some((t) => {
        const check = TYPE_CHECKS[t];
        return check && check(value);
      });
      if (!matched) {
        errors.push(`${pathSoFar || '(root)'} must be one of types: ${schema.type.join(', ')}`);
        return;
      }
    } else {
      const check = TYPE_CHECKS[schema.type];
      if (check && !check(value)) {
        errors.push(`${pathSoFar || '(root)'} must be of type ${schema.type}`);
        return;
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${pathSoFar || '(root)'} must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${pathSoFar || '(root)'} must be <= ${schema.maximum}`);
    }
  }

  if (typeof value === 'string' && schema.format === 'date-time') {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      errors.push(`${pathSoFar || '(root)'} must be a valid ISO 8601 date-time`);
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pathSoFar || '(root)'} must be one of ${schema.enum.join(', ')}`);
  }

  if (TYPE_CHECKS.object(value)) {
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          errors.push(`${pathSoFar ? `${pathSoFar}.` : ''}${key} is not an allowed property`);
        }
      }
    }

    if (schema.properties) {
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
