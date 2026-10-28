'use strict';

const path = require('path');

const LOCAL_SUBCOMMANDS = new Set([
  'add', 'cat-file', 'commit', 'diff', 'log', 'ls-files', 'merge-base', 'restore', 'rev-parse', 'status'
]);
const EXTERNAL_SUBCOMMANDS = new Set(['merge', 'push']);
const VERIFIER_READ_ONLY_SUBCOMMANDS = new Set([
  'diff', 'log', 'ls-files', 'merge-base', 'rev-parse', 'status'
]);
const OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--exec-path', '--git-dir', '--namespace', '--work-tree']);

function gitSubcommand(args) {
  const tokens = Array.isArray(args) ? args : [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index]);
    if (OPTIONS_WITH_VALUE.has(token)) {
      index += 1;
      continue;
    }
    if (token === '--' || token.startsWith('-')) continue;
    return token.toLowerCase();
  }
  return null;
}

function isGitProgram(program) {
  return path.win32.basename(String(program || '')).toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '') === 'git';
}

function verifierCheckReason(check) {
  if (!isGitProgram(check?.program)) return null;
  const subcommand = gitSubcommand(check.args);
  if (VERIFIER_READ_ONLY_SUBCOMMANDS.has(subcommand)) return null;
  return `verification-git-${subcommand || 'inconnue'}-hors-autorite`;
}

function assertLocalGitCommand(args) {
  const subcommand = gitSubcommand(args);
  if (!LOCAL_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`operation-git-hors-autorite:${subcommand || 'inconnue'}`);
  }
  return subcommand;
}

module.exports = { LOCAL_SUBCOMMANDS, EXTERNAL_SUBCOMMANDS, VERIFIER_READ_ONLY_SUBCOMMANDS,
  gitSubcommand, isGitProgram, verifierCheckReason, assertLocalGitCommand };
