'use strict';

function validateSchema(schema, path = '$') {
  if (!isRecord(schema)) return [`${path}: schema must be an object.`];
  return [...validateSchemaType(schema, path), ...validateSchemaShape(schema, path), ...validateSchemaChildren(schema, path)];
}

function validateSchemaType(schema, path) {
  const supported = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  return supported.includes(schema.type) ? [] : [`${path}.type is required or unsupported.`];
}

function validateSchemaShape(schema, path) {
  const errors = [];
  if (schema.type === 'object' && schema.properties !== undefined && !isRecord(schema.properties)) errors.push(`${path}.properties must be an object.`);
  if (schema.type === 'object' && schema.required !== undefined && invalidRequired(schema.required)) errors.push(`${path}.required must be a string list.`);
  if (schema.pattern !== undefined && !validPattern(schema.pattern)) errors.push(`${path}.pattern must be a valid regular expression.`);
  return errors;
}

function validateSchemaChildren(schema, path) {
  if (schema.type === 'array' && schema.items) return validateSchema(schema.items, `${path}.items`);
  if (isRecord(schema.properties)) return Object.entries(schema.properties).flatMap(([key, child]) => validateSchema(child, `${path}.properties.${key}`));
  return [];
}

function validateArtifact(value, schema, path = '$') {
  if (!matchesType(value, schema?.type)) return [`${path} must be ${schema?.type}.`];
  return [...validateObject(value, schema, path), ...validateArray(value, schema, path), ...validateScalar(value, schema, path)];
}

function validateObject(value, schema, path) {
  if (schema.type !== 'object') return [];
  return [...requiredErrors(value, schema.required || [], path), ...propertyErrors(value, schema.properties || {}, path), ...additionalErrors(value, schema, path)];
}

function requiredErrors(value, required, path) {
  return required.filter((key) => !Object.hasOwn(value, key)).map((key) => `${path}.${key} is required.`);
}

function propertyErrors(value, properties, path) {
  return Object.entries(properties).flatMap(([key, child]) => Object.hasOwn(value, key) ? validateArtifact(value[key], child, `${path}.${key}`) : []);
}

function additionalErrors(value, schema, path) {
  if (schema.additionalProperties !== false) return [];
  return Object.keys(value).filter((key) => !Object.hasOwn(schema.properties || {}, key)).map((key) => `${path}.${key} is not allowed.`);
}

function validateArray(value, schema, path) {
  if (schema.type !== 'array') return [];
  const errors = [];
  if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push(`${path} has too few items.`);
  if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) errors.push(`${path} has too many items.`);
  return errors.concat(schema.items ? value.flatMap((item, index) => validateArtifact(item, schema.items, `${path}[${index}]`)) : []);
}

function validateScalar(value, schema, path) {
  const errors = [];
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) errors.push(`${path} is outside the allowed enum.`);
  if (typeof value === 'string') errors.push(...validateString(value, schema, path));
  if (typeof value === 'number') errors.push(...validateNumber(value, schema, path));
  return errors;
}

function validateString(value, schema, path) {
  const errors = [];
  if (Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${path} is shorter than minLength.`);
  if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) errors.push(`${path} exceeds maxLength.`);
  if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path} does not match pattern.`);
  return errors;
}

function validateNumber(value, schema, path) {
  const errors = [];
  if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path} is below minimum.`);
  if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path} is above maximum.`);
  return errors;
}

function matchesType(value, type) {
  return ({ object: isRecord(value), array: Array.isArray(value), string: typeof value === 'string', number: typeof value === 'number' && Number.isFinite(value), integer: Number.isInteger(value), boolean: typeof value === 'boolean', null: value === null })[type] === true;
}

function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function invalidRequired(value) { return !Array.isArray(value) || value.some((item) => typeof item !== 'string'); }
function validPattern(value) { try { new RegExp(value); return true; } catch (_) { return false; } }

module.exports = { validateSchema, validateArtifact };
