'use strict';

const fs = require('node:fs');
const path = require('node:path');

function listWorkspaceFiles(root, maxFiles) {
  const pending = [path.resolve(root)];
  const files = [];
  while (pending.length && files.length < maxFiles) {
    const directory = pending.shift();
    for (const entry of readDirectory(directory)) {
      if (skipEntry(entry)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      if (entry.isFile()) files.push(path.relative(root, target));
    }
  }
  return files.slice(0, maxFiles);
}

function readDirectory(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    return [];
  }
}

function skipEntry(entry) {
  return entry.name.startsWith('.')
    || ['node_modules', 'dist', 'target'].includes(entry.name)
    || entry.isSymbolicLink();
}

module.exports = listWorkspaceFiles;
