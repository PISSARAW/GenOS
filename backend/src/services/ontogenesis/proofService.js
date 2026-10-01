'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { assertContainedFiles } = require('./pathAuthority');
const { maxOutputBytes } = require('../boundedOutput');

const SOURCE = 'ontogenesis-verifier';
const HASH = /^[a-f0-9]{64}$/;

function validProof(proof, treeHash) {
  if (!proof || proof.source !== SOURCE || proof.exitCode !== 0) return false;
  if (!proof.command || !proof.completedAt || !HASH.test(proof.treeHash || '')) return false;
  return proof.treeHash === treeHash;
}

function validateProofs(candidate) {
  if (!HASH.test(candidate.treeHash || '')) return ['empreinte-contenu-requise'];
  if (!Array.isArray(candidate.proofs) || !candidate.proofs.length) return ['preuves-requises'];
  return candidate.proofs.every((proof) => validProof(proof, candidate.treeHash)) ? [] : ['preuve-invalide'];
}

async function fileHash(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function sourceFile(file) {
  return !/(^|\/)(node_modules|target|dist|\.genos(?:-[^/]+)?|\.git)(\/|$)/.test(file);
}

async function treeHash(worktree) {
  const listed = await runCommand('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: worktree });
  if (Buffer.byteLength(listed.stdout) >= maxOutputBytes() - 4096) throw new Error('inventaire-contenu-trop-grand');
  const files = [...new Set(listed.stdout.split('\0').filter(Boolean))].filter(sourceFile).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const [absolute] = assertContainedFiles(worktree, [file]);
    if (!fs.existsSync(absolute)) continue;
    const digest = await fileHash(absolute);
    hash.update(`${file}\0${digest}\0`);
  }
  return hash.digest('hex');
}

function checkSpec(check) {
  if (!check || typeof check.program !== 'string' || !Array.isArray(check.args)) throw new Error('verification-structuree-requise');
  if (!check.args.every((arg) => typeof arg === 'string')) throw new Error('verification-arguments-invalides');
}

async function verifyChecks(worktree, checks, options = {}) {
  if (!Array.isArray(checks) || !checks.length) throw new Error('verifications-requises');
  const digest = await treeHash(worktree);
  const proofs = [];
  const deadline = Date.now() + (options.timeoutMs || 60000);
  for (const check of checks) {
    checkSpec(check);
    const invocation = check.program === 'npm' ? npmInvocation(check.args) : { program: check.program, args: check.args };
    const run = options.run || runCommand;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('budget-verification-epuise');
    await run(invocation.program, invocation.args, { cwd: worktree, timeoutMs: remaining });
    proofs.push({ source: SOURCE, exitCode: 0, command: [check.program, ...check.args].join(' '), treeHash: digest, completedAt: new Date().toISOString() });
  }
  if (await treeHash(worktree) !== digest) throw new Error('contenu-modifie-par-verification');
  return { treeHash: digest, proofs };
}

function npmInvocation(args) {
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(cli)) throw new Error('npm-cli-introuvable');
  return { program: process.execPath, args: [cli, ...args] };
}

module.exports = { SOURCE, validateProofs, treeHash, verifyChecks, sourceFile };
