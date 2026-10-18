'use strict';

const registry = require('../src/services/foundationalTrustRegistry');

function main(args) {
  if (args.length !== 3) {
    throw new Error('Usage: activate-foundational-trust-package.cjs <candidate> <active> <recovery>');
  }
  const rootTrust = JSON.parse(requiredEnv('GENOS_FOUNDATIONAL_TRUST_ROOT_JSON'));
  const installed = registry.install({ candidatePath: args[0], activePath: args[1],
    recoveryPath: args[2], rootTrust, now: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify({ installed: true,
    generation: installed.body.generation, packageHash: installed.packageHash })}\n`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.code || error.message}\n`);
  process.exitCode = 1;
}

module.exports = { main };
