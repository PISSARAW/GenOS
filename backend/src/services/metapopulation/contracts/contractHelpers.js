'use strict';

function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, 'Expected an object.');
  return value;
}

function string(value, field, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code, `${field} must be a non-empty string.`);
}

function enumValue(value, field, options) {
  if (!options.allowed.includes(value)) fail(options.code, `${field} has an unsupported value.`);
}

function array(value, field, code) {
  if (!Array.isArray(value)) fail(code, `${field} must be an array.`);
}

function boundedNumber(value, field, options) {
  if (!Number.isFinite(value) || value < options.minimum || value > options.maximum) fail(options.code, `${field} is outside its allowed range.`);
}

function integer(value, field, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, `${field} must be a non-negative safe integer.`);
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

module.exports = { record, string, enumValue, array, boundedNumber, integer, fail };
