'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function moduleName(receipt) {
  return `GenosDependency_${receipt.receiptDigest.slice(7)}`;
}

function dependencyModule(receipt, source, prerequisites) {
  return Object.freeze({ moduleName: moduleName(receipt), source, sourceDigest: receipt.sourceDigest,
    imports: Object.freeze(prerequisites.map(moduleName)) });
}

function materializedSource(source, imports) {
  const prelude = imports.map((name) => `import ${name}`).join('\n');
  return prelude ? `${prelude}\n${source}` : source;
}

function validateModule(entry, available) {
  if (!entry || !/^GenosDependency_[a-f0-9]{64}$/u.test(entry.moduleName)) throw new Error('Invalid dependency module.');
  if (typeof entry.source !== 'string' || Buffer.byteLength(entry.source) > 4 * 1024 * 1024) throw new Error('Invalid dependency source.');
  const digest = `sha256:${createHash('sha256').update(entry.source).digest('hex')}`;
  if (digest !== entry.sourceDigest || !Array.isArray(entry.imports)) throw new Error('Dependency source binding mismatch.');
  if (entry.imports.some((name) => !available.has(name))) throw new Error('Dependency imports must be materialized first.');
}

async function materializeDependencies(entries, directory, compile) {
  if (!Array.isArray(entries) || entries.length > 128) throw new Error('Invalid dependency module list.');
  const available = new Set();
  for (const entry of entries) {
    validateModule(entry, available);
    if (available.has(entry.moduleName)) throw new Error('Duplicate dependency module.');
    const filename = path.join(directory, `${entry.moduleName}.lean`);
    await fs.writeFile(filename, materializedSource(entry.source, entry.imports), 'utf8');
    const result = await compile(entry.moduleName);
    if (result.exitCode !== 0) throw new Error('Dependency compilation failed.');
    available.add(entry.moduleName);
  }
  return [...available];
}

module.exports = { dependencyModule, materializedSource, materializeDependencies };
