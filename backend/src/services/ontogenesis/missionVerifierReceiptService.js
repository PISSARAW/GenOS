'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const proofService = require('./proofService');

const SOURCE = 'ontogenesis-independent-verifier';
const SCHEMA = 'genos.ontogenesis-verifier-receipt/v1';

function checksDigest(checks) {
  return crypto.createHash('sha256').update(JSON.stringify(checks)).digest('hex');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function validIdentity(receipt, expected) {
  return receipt?.schema === SCHEMA && receipt.source === SOURCE && receipt.missionId === expected?.missionId
    && Boolean(expected?.workspaceRoot) && Array.isArray(expected.checks) && expected.checks.length > 0;
}

function canonicalWorkspace(receipt, expected) {
  try {
    const actualRoot = fs.realpathSync(expected.workspaceRoot);
    return samePath(receipt.workspaceRoot, actualRoot) ? actualRoot : null;
  } catch (_) {
    return null;
  }
}

function validConfiguredChecks(receipt, checks) {
  if (receipt.checksDigest !== checksDigest(checks) || proofService.validateProofs(receipt).length) return false;
  const commands = checks.map((check) => [check.program, ...check.args].join(' '));
  return receipt.proofs.length === commands.length
    && receipt.proofs.every((proof, index) => proof.command === commands[index]);
}

async function createReceipt(input) {
  if (!input?.missionId || !input.workspaceRoot || input.allowExecution !== true) return null;
  if (!Array.isArray(input.checks) || !input.checks.length) return null;
  const workspaceRoot = fs.realpathSync(input.workspaceRoot);
  const proof = await proofService.verifyChecks(workspaceRoot, input.checks, { timeoutMs: input.timeoutMs });
  return { schema: SCHEMA, source: SOURCE, missionId: input.missionId, workspaceRoot,
    checksDigest: checksDigest(input.checks), ...proof };
}

async function validateReceipt(receipt, expected) {
  if (!validIdentity(receipt, expected)) return false;
  const actualRoot = canonicalWorkspace(receipt, expected);
  if (!actualRoot || !validConfiguredChecks(receipt, expected.checks)) return false;
  try {
    return await proofService.treeHash(actualRoot) === receipt.treeHash;
  } catch (_) {
    return false;
  }
}

module.exports = { SOURCE, createReceipt, validateReceipt };
