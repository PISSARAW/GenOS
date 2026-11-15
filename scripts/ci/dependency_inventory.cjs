'use strict';

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../../shared/dependencyProfiles.json');

const root = path.resolve(__dirname, '../..');

function directoryMetrics(directory) {
  if (!fs.existsSync(directory)) return { installed: false, bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const metrics = entry.isDirectory()
      ? directoryMetrics(path.join(directory, entry.name))
      : { bytes: fs.statSync(path.join(directory, entry.name)).size, files: 1 };
    bytes += metrics.bytes;
    files += metrics.files;
  }
  return { installed: true, bytes, files };
}

function packageDirectory(location, packageName) {
  const base = location === 'backend' ? path.join(root, 'backend') : root;
  return path.join(base, 'node_modules', ...packageName.split('/'));
}

function inspectCapability(name, definition) {
  const packages = definition.packages.map(packageName => {
    const metrics = directoryMetrics(packageDirectory(definition.location, packageName));
    return { name: packageName, ...metrics };
  });
  return { name, location: definition.location, fallback: definition.fallback, packages,
    available: packages.every(item => item.installed) };
}

function optionalDirectBytes(capabilities) {
  const packages = new Map();
  for (const capability of capabilities) {
    for (const item of capability.packages) {
      const key = `${capability.location}:${item.name}`;
      packages.set(key, item.bytes);
    }
  }
  return [...packages.values()].reduce((sum, bytes) => sum + bytes, 0);
}

function main() {
  const capabilities = Object.entries(catalog.capabilities)
    .map(([name, definition]) => inspectCapability(name, definition));
  const totals = optionalDirectBytes(capabilities);
  const report = { generatedAt: new Date().toISOString(), profiles: catalog.profiles,
    optionalDirectBytes: totals, capabilities };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
