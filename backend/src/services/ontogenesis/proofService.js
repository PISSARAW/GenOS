'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { buildIsolatedEnv } = require('../sandboxExecutor');
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
  const normalized = String(file || '').replace(/\\/g, '/');
  // The local runner may materialize this root-level control-plane config in
  // a capsule. It is execution metadata, never candidate source or deliverable.
  if (normalized === 'onto-config.json') return false;
  return !/(^|\/)(node_modules|target|dist|\.genos(?:-[^/]+)?|\.git)(\/|$)/.test(normalized);
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
  const verifierEnvironment = isolatedVerificationEnvironment();
  try {
    for (const check of checks) {
      checkSpec(check);
      const invocation = check.program === 'npm' ? npmInvocation(check.args) : { program: check.program, args: check.args };
      const run = options.run || runCommand;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('budget-verification-epuise');
      await run(invocation.program, invocation.args, { cwd: worktree, timeoutMs: remaining, env: verifierEnvironment.env });
      proofs.push({ source: SOURCE, exitCode: 0, command: [check.program, ...check.args].join(' '), treeHash: digest, completedAt: new Date().toISOString() });
    }
    if (await treeHash(worktree) !== digest) throw new Error('contenu-modifie-par-verification');
    return { treeHash: digest, proofs };
  } finally {
    fs.rmSync(verifierEnvironment.root, { recursive: true, force: true });
  }
}

function isolatedVerificationEnvironment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ontogenesis-verifier-'));
  const npmConfig = path.join(root, 'empty.npmrc');
  fs.writeFileSync(npmConfig, '', { flag: 'wx' });
  const env = buildIsolatedEnv({
    NPM_CONFIG_USERCONFIG: npmConfig,
    NPM_CONFIG_GLOBALCONFIG: npmConfig,
    NPM_CONFIG_CACHE: path.join(root, 'npm-cache')
  });
  return { root, env };
}

function npmInvocation(args) {
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(cli)) throw new Error('npm-cli-introuvable');
  return { program: process.execPath, args: [cli, ...args] };
}

module.exports = { SOURCE, validateProofs, treeHash, verifyChecks, sourceFile };
