'use strict';

const fs = require('node:fs');
const path = require('node:path');

function clone(source, destination) {
  if (!/^D:[/\\]/i.test(source) || !/^D:[/\\]/i.test(destination)) throw Error('RUNTIME_CLONES_MUST_BE_ON_D');
  fs.mkdirSync(destination, {recursive: false});
  const manifest = JSON.parse(fs.readFileSync(source + '/runtime-source-manifest.json', 'utf8'));
  const names = [...Object.keys(manifest.sources), ...Object.keys(manifest.binaries || {}), 'runtime-source-manifest.json'];
  for (const name of names) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.linkSync(path.join(source, name), target);
  }
  for (const relative of ['node_modules', 'backend/node_modules', 'mcp/node_modules']) {
    fs.symlinkSync(path.join(source, relative), path.join(destination, relative), 'junction');
  }
  return {sourceHash: manifest.sourcesHash, storageIsolation: 'fresh runtime root without storage pointer',
    sources: 'shared immutable source inodes', dependencies: 'junctions to frozen D dependency copies'};
}

module.exports = {clone};
