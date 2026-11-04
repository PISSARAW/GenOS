'use strict';

const fs = require('node:fs');
const path = require('node:path');
const legacy = require('../competence-five-arms/evidence.cjs');
const { hash } = require('../competence-five-arms/corpus.cjs');
const normalizedHash = text => hash(text.replace(/\r\n/g, '\n'));

function sourceNames() {
  const local = fs.readdirSync(__dirname).filter(name => /\.(cjs|json|py)$/.test(name))
    .map(name => 'benchmarks/competence-five-arms-v2/' + name);
  const queue = [...Object.keys(legacy.sourceHashes()), ...local];
  const seen = new Set();
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const text = fs.readFileSync(path.join(legacy.ROOT, name), 'utf8');
    for (const match of text.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      addDependency(queue, { name, dependency: match[1] });
    }
  }
  return [...seen].sort();
}

function addDependency(queue, input) {
  if (!input.dependency.startsWith('.')) return;
  const target = require.resolve(path.resolve(legacy.ROOT, path.dirname(input.name), input.dependency));
  const relative = path.relative(legacy.ROOT, target).replace(/\\/g, '/');
  if (!relative.includes('node_modules') && !relative.startsWith('..')) queue.push(relative);
}

function sourceHashes() {
  return Object.fromEntries(sourceNames().map(name => [name,
    normalizedHash(fs.readFileSync(path.join(legacy.ROOT, name), 'utf8'))]));
}

function provenance() {
  return { ...legacy.provenance(), sources: sourceHashes(), sourceEncoding: 'UTF8 with CRLF normalized to LF before JSON-string SHA256' };
}

module.exports = { ...legacy, sourceNames, sourceHashes, provenance, normalizedHash };
