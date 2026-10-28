'use strict';

const path = require('path');
const { resolveWorkspaceRoot } = require('../pathSafety');
const { runCommand } = require('../agentWorkspaceLifecycle/git');

function samePath(left, right) {
  const normalize = (value) => path.resolve(value).replace(/[\\/]+$/, '');
  const first = normalize(left);
  const second = normalize(right);
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function gitRoot(root) {
  try {
    const result = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: root });
    return resolveWorkspaceRoot(result.stdout.trim(), 'racine du dépôt Git');
  } catch (error) {
    throw new Error(`--root doit être un dépôt Git valide: ${error.message}`);
  }
}

async function validateProjectRoot(input) {
  let root;
  try {
    root = resolveWorkspaceRoot(input.root, '--root');
  } catch (error) {
    throw new Error(`--root invalide: ${error.message}`);
  }
  const topLevel = await gitRoot(root);
  if (!samePath(root, topLevel)) {
    throw new Error('--root doit désigner exactement la racine du dépôt Git.');
  }
  try {
    await runCommand('git', ['check-ref-format', '--branch', input.branch], { cwd: root });
  } catch (error) {
    throw new Error(`branche Git invalide pour --root: ${error.message}`);
  }
  return root;
}

module.exports = { validateProjectRoot };
