'use strict';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringList(value) {
  return Array.isArray(value) && value.every(isNonEmpty);
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

module.exports = { isRecord, isNonEmpty, isStringList, result };
