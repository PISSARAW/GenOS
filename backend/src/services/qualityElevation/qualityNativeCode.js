'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { digest, fail } = require('./qualityContract');
const SCHEMA = 'genos.quality-code-bundle/v1';

async function sourceFile(root, entry) {
  if (!require('../localCodeWorkerService').safePath(entry.path)) throw fail('GQEL_CODE_PATH_INVALID', 'Code quality path is outside the worker policy.');
  const realRoot = await fs.realpath(root), file = await fs.realpath(path.resolve(realRoot, entry.path));
  const relative = path.relative(realRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw fail('GQEL_CODE_PATH_INVALID', 'Code quality path escapes the workspace.');
  const content = await fs.readFile(file, 'utf8');
  if (digest(content) !== entry.hash) throw fail('GQEL_CODE_CHANGED', 'Reviewed source differs from the executed candidate.');
  return { path: entry.path, hash: entry.hash, content };
}

async function capture(ctx) {
  const entries = ctx.evidence.proposal?.changedFileHashes;
  if (!Array.isArray(entries) || !entries.length) throw fail('GQEL_CODE_PROOF_MISSING', 'Native quality needs changed source files and executed tests.');
  const files = [];
  for (const entry of entries) files.push(await sourceFile(ctx.mission.workspaceRoot, entry));
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { text: JSON.stringify({ schema: SCHEMA, files }), sourceFiles: files,
    testExecutionReceipt: ctx.evidence.proposal.testExecutionReceipt };
}

async function verify(ctx, request) {
  const current = await capture(ctx), proposal = ctx.evidence.proposal;
  const tests = proposal.tests || [];
  const passed = digest(current.text) === request.artifactDigest && proposal.testStatus === 'passed'
    && tests.length > 0 && tests.every(test => test.exitCode === 0 && !test.timedOut && !test.signal);
  const ref = proposal.testExecutionReceipt?.receiptHash;
  return { content: { executed: true, passed: passed && Boolean(ref), artifactDigest: request.artifactDigest,
    evidenceRefs: ref ? [`genos://code-test-execution/${ref}`] : [] },
    usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
}

function restoration(candidate) {
  return JSON.stringify({ format: 'genos.file-replacement/v1',
    patches: candidate.code.sourceFiles.map(({ path: file, content }) => ({ path: file, content })),
    tests: candidate.evidence.proposal.tests.map(test => test.command),
    evidence: 'Restore the exact previously reviewed candidate, then execute the protected tests again.' });
}

function assertScope(initial, candidate) {
  if (!initial.code) return;
  if (!candidate.code) throw fail('GQEL_CODE_SCOPE_CHANGED', 'Code quality cannot change its artifact type.');
  const paths = value => value.code.sourceFiles.map(file => file.path).sort();
  if (digest(paths(initial)) !== digest(paths(candidate))) {
    throw fail('GQEL_CODE_SCOPE_CHANGED', 'Code revisions must preserve the complete initially reviewed source set.');
  }
}

module.exports = { SCHEMA, capture, verify, restoration, assertScope };
