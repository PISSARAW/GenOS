'use strict';

/**
 * @file teachingWorkerService.js
 * @description Teaching worker : transmet une procédure exécutée et vérifiée,
 * puis contrôle que l'apprenant reproduit le transfert sur une instance donnée.
 * Le verdict porte uniquement sur l'instance fournie (pas de généralisation).
 */

function validateIndices(input, indices) {
  if (!Array.isArray(input) || !Array.isArray(indices)) return false;
  const seen = new Set();
  for (const index of indices) {
    if (typeof index !== 'number' || !Number.isInteger(index)) return false;
    if (index < 0 || index >= input.length) return false;
    if (seen.has(index)) return false;
    seen.add(index);
  }
  return true;
}

function sumIndices(input, indices) {
  let total = 0;
  for (const index of indices) total += input[index];
  return total;
}

function verifyTransfer(input, indices, target) {
  if (!validateIndices(input, indices)) return false;
  return sumIndices(input, indices) === target;
}

function teach(context = {}) {
  const { procedureId, demonstration, learnerIndices, input, target } = context;
  if (!procedureId || !Array.isArray(input) || typeof target !== 'number') {
    return { transferVerified: false, verdict: 'invalid_inputs', receipt: null };
  }
  const verified = verifyTransfer(input, learnerIndices || [], target);
  const receipt = {
    procedureId,
    demonstration: demonstration || null,
    input,
    target,
    learnerIndices: learnerIndices || [],
    verified,
    assessedAt: new Date().toISOString()
  };
  return {
    transferVerified: verified,
    verdict: verified ? 'transfer_ok' : 'transfer_failed',
    receipt
  };
}

module.exports = { teach, verifyTransfer, validateIndices };
