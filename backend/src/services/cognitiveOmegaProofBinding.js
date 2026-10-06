'use strict';

const { createHash } = require('node:crypto');

function digest(value) { return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex'); }

function verified(result) {
  if (!result || result.valid === false) return false;
  if (result.status !== undefined) return ['verified', 'formally_proved'].includes(result.status);
  return result.valid === true;
}

function emission(operation, state) {
  const ids = operation.dependsOn;
  if (!ids.length || !ids.every((id) => verified(state.receipts[id]))) return null;
  const value = operation.input === undefined ? state.values[ids[0]] : operation.input;
  const candidate = digest(value);
  if (!ids.every((id) => state.proofDigests[id] === candidate)) return null;
  return { value, receipt: state.receipts[ids[0]], receipts: ids.map((id) => state.receipts[id]) };
}

module.exports = { digest, verified, emission };
