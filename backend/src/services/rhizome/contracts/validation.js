'use strict';

const ERROR_CODE = 'RHIZOME_CONTRACT_INVALID';

function invalid(field, message) {
  throw Object.assign(new Error(`Invalid Rhizome ${field}: ${message}`), { code: ERROR_CODE, field });
}

function objectValue(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field, 'expected an object');
  return value;
}

function textValue(value, field) {
  if (typeof value !== 'string' || !value.trim()) invalid(field, 'expected a non-empty string');
  return value.trim();
}

function listValue(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid(field, 'expected an array');
  return value.map((entry, index) => textValue(entry, `${field}[${index}]`));
}

function enumValue(value, definition) {
  const { allowed, field, fallback } = definition;
  const actual = value === undefined ? fallback : value;
  if (!allowed.includes(actual)) invalid(field, `expected one of ${allowed.join(', ')}`);
  return actual;
}

function numberValue(value, field, bounds) {
  const { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, fallback = 0, integer = false } = bounds || {};
  const actual = value === undefined ? fallback : value;
  if (!Number.isFinite(actual) || actual < minimum || actual > maximum || (integer && !Number.isInteger(actual))) {
    invalid(field, `expected a finite number in [${minimum}, ${maximum}]`);
  }
  return actual;
}

function objectOrEmpty(value, field) {
  return objectValue(value === undefined ? {} : value, field);
}

function isoDateOrNull(value, field) {
  if (value === undefined || value === null) return null;
  const actual = textValue(value, field);
  if (!Number.isFinite(Date.parse(actual))) invalid(field, 'expected an ISO date or null');
  return new Date(actual).toISOString();
}

module.exports = { invalid, objectValue, textValue, listValue, enumValue, numberValue, objectOrEmpty, isoDateOrNull };
