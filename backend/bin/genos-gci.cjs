'use strict';

const fs = require('node:fs/promises');
const { getDatabase, closeDatabase } = require('../src/db');
const { getAllConcepts } = require('../src/services/capabilityGraphService');
const { accessFor } = require('../src/services/capabilityAccessMatrix');
const { loadExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');
const { parseProjectManifest } = require('../src/services/capabilityInheritance/binding/projectManifestService');

async function main(args) {
  const [command, ...options] = args;
  if (command === 'validate') return validateManifest(options);
  if (!['discover', 'inspect'].includes(command)) throw new Error('Usage: genos-gci.cjs <discover|inspect <capability-id> --version <semver>|validate --manifest <path>>');
  const db = await getDatabase();
  try {
    const registry = await loadExportRegistry({ db, capabilityGraph: getAllConcepts(), accessFor });
    if (command === 'discover') process.stdout.write(`${JSON.stringify(registry.listExports(), null, 2)}\n`);
    else await inspectCapability(registry, options);
  } finally {
    await closeDatabase();
  }
}

async function validateManifest(options) {
  const manifestPath = optionValue(options, '--manifest');
  if (!manifestPath) throw new Error('validate requires --manifest <path>');
  const source = await fs.readFile(manifestPath, 'utf8');
  process.stdout.write(`${JSON.stringify(parseProjectManifest(source), null, 2)}\n`);
}

async function inspectCapability(registry, options) {
  const capabilityId = options[0];
  const version = optionValue(options, '--version');
  if (!capabilityId || !version) throw new Error('inspect requires <capability-id> --version <semver>');
  const result = registry.inspect(capabilityId, version);
  if (!result) throw Object.assign(new Error(`No export for ${capabilityId}@${version}`), { code: 'GCI_EXPORT_NOT_FOUND' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function optionValue(options, name) {
  const index = options.indexOf(name);
  return index >= 0 ? options[index + 1] : null;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.code || 'GCI_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
