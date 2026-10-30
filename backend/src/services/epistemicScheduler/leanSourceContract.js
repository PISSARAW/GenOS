'use strict';

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const PLACEHOLDER_PROOF = /\b(?:sorry|admit|sorryAx)\b/u;

function leadingLine(line) {
  return /^\s*$/u.test(line) || /^\s*import\s+[\w.]+(?:\s+[\w.]+)*\s*$/u.test(line);
}

function sourceTarget(source) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > MAX_SOURCE_BYTES) return null;
  const lines = source.trim().split('\n');
  while (lines.length && leadingLine(lines[0])) lines.shift();
  const match = lines.join('\n').trim().match(/^theorem\s+([A-Za-z_][\w']*)\s*:\s*([\s\S]*?)\s*:=/u);
  return match ? { name: match[1], statement: match[2].trim() } : null;
}

function forbiddenAxioms(axioms, allowed = []) {
  if (!Array.isArray(axioms) || axioms.some((item) => typeof item !== 'string')) return ['axiom_audit_missing'];
  const accepted = new Set(allowed);
  return axioms.filter((item) => item === 'sorryAx' || !accepted.has(item));
}

function passingExecution(execution, options) {
  return execution?.exitCode === 0 && execution.toolchainVersion === options.toolchainVersion
    && (execution.status === undefined || execution.status === 'checked')
    && (!options.environmentDigest || execution.environmentDigest === undefined || execution.environmentDigest === options.environmentDigest)
    && forbiddenAxioms(execution.axioms, options.allowedAxioms).length === 0;
}

module.exports = { MAX_SOURCE_BYTES, PLACEHOLDER_PROOF, sourceTarget, forbiddenAxioms, passingExecution };
