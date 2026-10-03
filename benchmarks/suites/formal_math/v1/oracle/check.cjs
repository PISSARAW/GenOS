'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createFormalizationArtifact } = require('../../../../../backend/src/services/mathematical/formalizationArtifact');
const { MathematicalDependencyGraph } = require('../../../../../backend/src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../../../../../backend/src/services/epistemicScheduler/leanIncrementalGate');
const { executeLeanCheck } = require('../../../../../backend/src/services/epistemicScheduler/leanProcessExecutor');

const itemsPath = path.join(__dirname, '..', 'public', 'items.json');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function loadItems() {
  const bytes = fs.readFileSync(itemsPath);
  const corpus = JSON.parse(bytes);
  if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.items) || !corpus.items.length) throw new Error('Invalid formal corpus.');
  return { corpus, corpusDigest: digest(bytes) };
}

function leanIdentity(executable) {
  const raw = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
  const version = raw.match(/version\s+(\d+\.\d+\.\d+)/i)?.[1];
  if (!version) throw new Error(`Unrecognized Lean version: ${raw}`);
  return { raw, version, executable };
}

function boundSource(item, proofBody) {
  if (typeof proofBody !== 'string' || !proofBody.trim() || proofBody.length > 8000) throw new Error('Invalid proof body.');
  if (/\b(?:sorry|admit|axiom|unsafe|opaque|set_option|theorem|lemma|def|example|run_tac|elab|macro|initialize|import)\b|#/u.test(proofBody)) throw new Error('Forbidden proof command.');
  const artifact = createFormalizationArtifact({
    naturalStatement: item.naturalStatement,
    formalStatement: item.formalStatement,
    imports: item.imports,
    formalLanguage: 'lean4',
    formalizer: 'fixed-benchmark-v1'
  });
  return artifact.generateLeanSource({ name: item.theoremName, proofBody });
}

async function checkProof(item, proofBody, lean) {
  let source;
  try { source = boundSource(item, proofBody); }
  catch (error) { return { passed: false, reason: error.message, sourceDigest: null }; }
  const graph = new MathematicalDependencyGraph();
  const nodeId = `benchmark-${item.taskId}`;
  graph.addNode({ nodeId, type: 'theorem', canonicalStatement: item.formalStatement, status: 'formalized' });
  const gate = new LeanIncrementalGate({
    graph, executor: executeLeanCheck, toolchainVersion: lean.version,
    environmentDigest: digest(`${lean.raw}\n${digest(fs.readFileSync(itemsPath))}`),
    allowedAxioms: new Set()
  });
  const receipt = await gate.verifyNode({ nodeId, source, leanExecutable: lean.executable, timeoutMs: 30000 });
  const audit = receipt.status === 'passed' ? await executeLeanCheck({ source: `${source}\n#print axioms ${item.theoremName}`,
    leanExecutable: lean.executable, toolchainVersion: lean.version, timeoutMs: 30000 }) : null;
  const listed = audit?.stdout.match(/depends on axioms: \[([^\]]*)\]/u);
  const noAxioms = audit?.stdout.includes(`'${item.theoremName}' does not depend on any axioms`);
  const kernelAxioms = listed ? listed[1].split(',').map((value) => value.trim()).filter(Boolean) : [];
  const allowed = new Set(['propext', 'Quot.sound', 'Classical.choice']);
  const axiomAuditPassed = audit?.exitCode === 0 && (Boolean(listed) || noAxioms) && kernelAxioms.every((name) => allowed.has(name));
  return { passed: receipt.status === 'passed' && axiomAuditPassed, reason: receipt.reason || (axiomAuditPassed ? null : 'kernel_axiom_audit_failed'), sourceDigest: receipt.sourceDigest,
    receiptDigest: receipt.receiptDigest, toolchainVersion: receipt.toolchainVersion,
    environmentDigest: receipt.environmentDigest, axioms: receipt.axioms, kernelAxioms };
}

module.exports = { loadItems, leanIdentity, boundSource, checkProof };
