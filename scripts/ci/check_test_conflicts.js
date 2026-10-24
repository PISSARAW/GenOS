'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TEXT_EXTENSIONS = new Set(['.c', '.cc', '.cjs', '.cmd', '.conf', '.cpp', '.css',
  '.csv', '.go', '.h', '.hpp', '.html', '.java', '.js', '.json', '.kt', '.lock', '.md',
  '.mdx', '.mjs', '.proto', '.ps1', '.py', '.rs', '.sh', '.sql', '.svelte', '.toml',
  '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml']);

function gitOutput(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function listedPaths(root, args) {
  return gitOutput(root, args).split('\0').filter(Boolean);
}

function unmergedPaths(root) {
  return listedPaths(root, ['ls-files', '-u', '-z']).map((entry) => entry.slice(entry.indexOf('\t') + 1));
}

function changedPaths(root) {
  return [...new Set([...listedPaths(root, ['diff', '--name-only', '-z', '--']),
    ...listedPaths(root, ['diff', '--cached', '--name-only', '-z', '--']),
    ...listedPaths(root, ['ls-files', '--others', '--exclude-standard', '-z'])])];
}

function hasConflictMarkers(filename) {
  const content = fs.readFileSync(filename);
  if (content.includes(0)) return false;
  const lines = content.toString('utf8').split(/\r?\n/);
  const hasStart = lines.some((line) => /^<<<<<<<\s+(?!SEARCH\s*$|REPLACE\s*$).+/.test(line));
  return hasStart && lines.some((line) => /^>>>>>>>\s+\S+/.test(line));
}

function findConflictFiles(root) {
  const conflicts = new Set(unmergedPaths(root));
  for (const relativePath of changedPaths(root)) {
    if (!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue;
    const absolutePath = path.join(root, relativePath);
    if (fs.existsSync(absolutePath) && hasConflictMarkers(absolutePath)) conflicts.add(relativePath);
  }
  return [...conflicts].sort();
}

function main() {
  const root = gitOutput(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const conflicts = findConflictFiles(root);
  if (conflicts.length === 0) {
    console.log('Test preflight: no unmerged paths or Git conflict markers.');
    return;
  }
  console.error('Test preflight refused to run because Git conflicts remain:');
  for (const conflict of conflicts) console.error(`  ${conflict}`);
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { findConflictFiles };
