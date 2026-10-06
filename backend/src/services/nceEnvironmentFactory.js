'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { digest } = require('./nceProcedureProgram');
const FAMILIES = ['ascending', 'unique-ascending', 'absolute-ascending'];

const VERIFIER = [
  "'use strict';",
  "const fs = require('node:fs');",
  "const assert = require('node:assert/strict');",
  "const task = JSON.parse(fs.readFileSync('task.json', 'utf8'));",
  "let expected = JSON.parse(fs.readFileSync('input.json', 'utf8'));",
  "if (task.family === 'absolute-ascending') expected = expected.map((n) => n < 0 ? -n : n);",
  "if (task.family === 'unique-ascending') expected = expected.filter((n, i, a) => a.indexOf(n) === i);",
  "expected.sort((a, b) => a - b);",
  "assert.deepEqual(JSON.parse(fs.readFileSync('solution.json', 'utf8')), expected);",
  "console.log('NCE solution verified');",
].join('\n');

function generatedInput(seed) {
  const bytes = Buffer.from(digest(seed), 'hex');
  // Distinct positive and negative magnitudes, duplicate and unsorted witnesses.
  const magnitude = bytes.readUInt32BE(0) % 10000000 + 10;
  return [magnitude, -magnitude - 2, 3, magnitude, 0, -1];
}

async function createEnvironment(root, request, db) {
  const workspacePath = await fs.mkdtemp(path.join(root, 'nce-env-'));
  const id = `nce-${digest({ ...request, workspacePath }).slice(0, 24)}`;
  await fs.writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({ scripts: { test: 'node verify.cjs' } }));
  await fs.writeFile(path.join(workspacePath, 'verify.cjs'), VERIFIER);
  await fs.writeFile(path.join(workspacePath, 'task.json'), JSON.stringify({ family: request.family }));
  await fs.writeFile(path.join(workspacePath, 'input.json'), JSON.stringify(generatedInput(request.seed)));
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)',
    id, `NCE ${request.family} ${id}`, workspacePath);
  return { id, workspaceId: id, workspacePath, db, artifactPath: 'solution.json',
    verifierCommand: 'npm test', protectedPaths: ['package.json', 'verify.cjs', 'input.json', 'task.json'],
    goals: [`Produce ${request.family} numbers from input.json`], difficulty: 0.3,
    stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 } };
}

async function generateSplit(options) {
  if (!FAMILIES.includes(options.family)) throw new Error('Unsupported NCE task family');
  if (!Number.isSafeInteger(options.seed)) throw new Error('Integer NCE seed required');
  const count = options.count ?? 2;
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('NCE split count must be 1..20');
  const split = { training: [], heldOut: [] };
  for (const partition of Object.keys(split)) {
    for (let index = 0; index < count; index += 1) {
      split[partition].push(await createEnvironment(options.root, {
        family: options.family, seed: `${options.seed}:${partition}:${index}`,
      }, options.db));
    }
  }
  return split;
}

module.exports = { generateSplit, FAMILIES };
