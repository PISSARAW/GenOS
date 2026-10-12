'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CLAIM = /^\s*\d+(?:\s*[+*%]\s*\d+)*\s*(?:=|<=|>=|≤|<|≥|>)\s*\d+(?:\s*[+*%]\s*\d+)*\s*$/u;
const STRATEGIES = new Set(['formal_lean_receipt', 'formal_lean_source']);

function checkFormal(subject, strategy) {
  if (!STRATEGIES.has(strategy) || !validSubject(subject)) return result('inconclusive', 'formal_subject_invalid', strategy);
  const source = `theorem genos_worker_claim : ${subject.method.parameters.claim.trim()} := by decide\n`;
  const digest = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  if (!receiptMatches(subject, { digest, strategy })) return result('refuted', 'formal_receipt_mismatch', strategy);
  return compileLean(subject, source, strategy);
}

function validSubject(subject) {
  const method = subject.method;
  return method?.version === 1 && method.methodId === 'formal_proof'
    && typeof method.parameters?.claim === 'string' && CLAIM.test(method.parameters.claim)
    && typeof method.parameters.toolchainVersion === 'string' && method.parameters.toolchainVersion.trim()
    && typeof subject.leanExecutable === 'string' && subject.leanExecutable.length > 0;
}

function receiptMatches(subject, evidence) {
  const receipt = subject.result.solverReceipt;
  const expectedClaim = subject.method.parameters.claim.trim();
  if (receipt.toolchainVersion !== subject.method.parameters.toolchainVersion) return false;
  if (evidence.strategy === 'formal_lean_source') return receipt.sourceDigest === evidence.digest
    && receipt.id === `solver://${evidence.digest}` && receipt.claim === expectedClaim;
  return receipt.solver === 'Lean' && receipt.result === 'proved'
    && receipt.evidence?.includes(`solver://${evidence.digest}`) && receipt.axioms?.length === 0;
}

function compileLean(subject, source, strategy) {
  const filename = path.join(process.cwd(), 'GenosOracle.lean');
  fs.writeFileSync(filename, source);
  try {
    const version = execFileSync(subject.leanExecutable, ['--version'], { encoding: 'utf8', timeout: 10000,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (version !== subject.method.parameters.toolchainVersion) return result('refuted', 'lean_toolchain_mismatch', strategy);
    execFileSync(subject.leanExecutable, [filename], { cwd: process.cwd(), encoding: 'utf8',
      timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return result('verified', 'lean_kernel_replay_passed', strategy);
  } catch (_) { return result('refuted', 'lean_kernel_replay_failed', strategy); }
}

function result(status, reason, strategy) { return { status, reason, strategy }; }

module.exports = { STRATEGIES, checkFormal };
