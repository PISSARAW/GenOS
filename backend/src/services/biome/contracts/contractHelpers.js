'use strict';

function requiredId(value, field) {
  const id = String(value || '').trim();
  if (!id) throw invalid(`${field} is required.`);
  return id;
}

function enumValue({ value, choices, field, fallback }) {
  const candidate = value || fallback;
  if (!choices.includes(candidate)) throw invalid(`${field} must be one of: ${choices.join(', ')}.`);
  return candidate;
}

function nonNegative(value, field, fallback = 0) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < 0) throw invalid(`${field} must be a non-negative finite number.`);
  return number;
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'BIOME_CONTRACT_INVALID' });
}

module.exports = { requiredId, enumValue, nonNegative, invalid };
