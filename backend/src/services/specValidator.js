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

function schemaFilename(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.schema\.json$/.test(name) || path.basename(name) !== name) {
    throw new Error('Schema name must be a simple .schema.json filename.');
  }
  return name;
}

const TYPE_CHECKS = {
  object: (v) => { return v !== null && typeof v === 'object' && !Array.isArray(v); },
  array: (v) => { return Array.isArray(v); },
  string: (v) => { return typeof v === 'string'; },
  number: (v) => { return typeof v === 'number'; },
  integer: (v) => { return Number.isInteger(v); },
  boolean: (v) => { return typeof v === 'boolean'; },
  null: (v) => { return v === null; }
};

function typeMatches(value, type) {
  const check = TYPE_CHECKS[type];
  return Boolean(check) && check(value);
}

function describePath(pathSoFar) {
  return pathSoFar || '(root)';
}

function childPath(pathSoFar, key) {
  return pathSoFar ? `${pathSoFar}.${key}` : key;
}

function checkConst(options) {
  const { value, schema, pathSoFar, errors } = options;
  if ('const' in schema && value !== schema.const) {
    errors.push(`${describePath(pathSoFar)} must equal ${JSON.stringify(schema.const)}`);
  }
}

function checkType(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (!schema.type) return true;
  if (Array.isArray(schema.type)) {
    const matched = schema.type.some((t) => { return typeMatches(value, t); });
    if (!matched) {
      errors.push(`${describePath(pathSoFar)} must be one of types: ${schema.type.join(', ')}`);
      return false;
    }
    return true;
  }
  const check = TYPE_CHECKS[schema.type];
  if (check && !check(value)) {
    errors.push(`${describePath(pathSoFar)} must be of type ${schema.type}`);
    return false;
  }
  return true;
}

function checkBounds(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (typeof value !== 'number') return;
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${describePath(pathSoFar)} must be >= ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push(`${describePath(pathSoFar)} must be <= ${schema.maximum}`);
  }
}

function checkDateTime(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (typeof value !== 'string' || schema.format !== 'date-time') return;
  if (Number.isNaN(Date.parse(value))) {
    errors.push(`${describePath(pathSoFar)} must be a valid ISO 8601 date-time`);
  }
}

function checkEnum(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${describePath(pathSoFar)} must be one of ${schema.enum.join(', ')}`);
  }
}

function checkAdditionalProperties(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (schema.additionalProperties !== false || !schema.properties) return;
  const allowed = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${childPath(pathSoFar, key)} is not an allowed property`);
    }
  }
}

function checkRequired(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (!schema.properties) return;
  for (const key of schema.required || []) {
    if (!(key in value)) {
      errors.push(`${childPath(pathSoFar, key)} is required`);
    }
  }
}

function checkProperties(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (!schema.properties) return;
  for (const [key, childSchema] of Object.entries(schema.properties)) {
    if (key in value) {
      validateAgainstSchema({ value: value[key], schema: childSchema, pathSoFar: childPath(pathSoFar, key), errors });
    }
  }
}

function checkItems(options) {
  const { value, schema, pathSoFar, errors } = options;
  if (!TYPE_CHECKS.array(value) || !schema.items) return;
  value.forEach((item, index) => {
    validateAgainstSchema({ value: item, schema: schema.items, pathSoFar: `${pathSoFar}[${index}]`, errors });
  });
}

function validateAgainstSchema(options) {
  const { value, schema } = options;
  if (!schema || typeof schema !== 'object') return;
  checkConst(options);
  if (!checkType(options)) return;
  checkBounds(options);
  checkDateTime(options);
  checkEnum(options);
  if (TYPE_CHECKS.object(value)) {
    checkAdditionalProperties(options);
    checkRequired(options);
    checkProperties(options);
  }
  checkItems(options);
}

/**
 * Validates `value` against spec/<schemaFile>.
 * Returns { valid, schema, errors } — never throws for schema-side issues;
 * missing schema files surface as an explicit `available:false` result.
 */
function validateSpec(schemaFile, value) {
  schemaFile = schemaFilename(schemaFile);
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
  validateAgainstSchema({ value, schema, pathSoFar: '', errors });
  return { available: true, schema: schemaFile, title: schema.title || null, valid: errors.length === 0, errors };
}

function validateWithSchema(value, schema) {
  const errors = [];
  validateAgainstSchema({ value, schema, pathSoFar: '', errors });
  return { valid: errors.length === 0, errors };
}

module.exports = { validateSpec, validateWithSchema, validateAgainstSchema };
