'use strict';

const NOOP_COMMANDS = new Set([
  'true',
  ':',
  'exit 0',
  'return 0',
  'node -e ""',
  'node -e "process.exit(0)"',
  'node -e process.exit(0)',
  'python -c ""',
  'python -c "pass"',
  'python3 -c ""',
  'python3 -c "pass"'
]);

function isNoopCommand(cmd) {
  if (typeof cmd !== 'string') return true;
  return NOOP_COMMANDS.has(cmd.trim().toLowerCase());
}

function canonicalStatement(test) {
  if (!test || typeof test.command !== 'string') return null;
  const command = test.command.trim();
  if (!command) return null;
  if (test.expectOutput !== undefined) {
    return `${command} outputs ${JSON.stringify(String(test.expectOutput).trim())}`;
  }
  return `${command} exits with code 0`;
}

function validReplica(item, test) {
  if (!item || typeof item.cwd !== 'string') return false;
  if (item.command && item.command !== test.command) return false;
  if (item.expectOutput !== undefined && item.expectOutput !== test.expectOutput) return false;
  return true;
}

function validReplicas(test) {
  const replicas = test.replicas;
  if (replicas === undefined) return true;
  if (!replicas || typeof replicas !== 'object' || Array.isArray(replicas)) return false;
  return Object.values(replicas).every((item) => validReplica(item, test));
}

function validateClaimContract(claim) {
  const test = claim?.test;
  const expected = canonicalStatement(test);
  if (!expected) return { valid: false, reason: 'A test command and a typed output or exit predicate are required.' };
  if (isNoopCommand(test.command)) {
    return { valid: false, reason: 'No-op and tautological test commands are rejected.' };
  }
  if (claim.statement !== expected) {
    return { valid: false, reason: `The claim must state the checked predicate exactly: ${expected}` };
  }
  if (!validReplicas(test)) {
    return { valid: false, reason: 'Verifier replicas must use the same command and predicate.' };
  }
  return { valid: true, statement: expected };
}

module.exports = { canonicalStatement, validateClaimContract };
