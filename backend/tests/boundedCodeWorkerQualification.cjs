'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCE = 'a % b';
const EXPECTED = '((a % b) + b) % b';

function enabled(kind) {
  return kind === 'bounded_worker' && process.env.GENOS_COMPLIANCE_BOUNDED_CODE === '1';
}

function prepare(root) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'answer.gexpr'), SOURCE);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true,
    scripts: { test: 'node tests/bounded-code.cjs' } }));
  fs.writeFileSync(path.join(root, 'tests', 'bounded-code.cjs'),
    "'use strict';\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nassert.equal(fs.readFileSync('src/answer.gexpr', 'utf8').trim(), '((a % b) + b) % b');\n");
}

function prompt(sourceRef) {
  return `Repair src/answer.gexpr in this isolated workspace. Current expression: ${SOURCE}. It must return the Euclidean remainder for every integer a from -16 through 16 and b from 1 through 8. JavaScript remainder can be negative when a is negative. Use exactly ((a % b) + b) % b. The immutable npm test checks this expression. Change only src/answer.gexpr, run npm test, and cite ${sourceRef}.`;
}

function workerRole(kind) { return enabled(kind) ? 'implementation' : kind; }

function executionPolicy(kind) {
  const code = enabled(kind);
  return { allowFileEdits: code, explicitWriteLease: code, silentUpdates: true };
}

function verificationContract() {
  return { artifactPath: 'src/answer.gexpr', contractId: 'euclidean_modulo_v1' };
}

async function bindModelBudget(input) {
  const workspace = await input.db.get('SELECT organization_id,project_id FROM workspaces WHERE id = ?', input.workspaceId);
  const scope = { id: `worker-compliance:${input.runId}`, costUsd: 0.2, tokens: 5000,
    organizationId: workspace.organization_id, projectId: workspace.project_id };
  await input.db.run(`INSERT OR REPLACE INTO mission_model_budget_scopes
    (scope_id,parent_run_id,parent_agent_id,organization_id,project_id,cost_ceiling_usd,token_ceiling)
    VALUES (?,?,?,?,?,?,?)`, scope.id, `compliance-parent-run-${input.runId}`, input.parentId,
  scope.organizationId, scope.projectId, scope.costUsd, scope.tokens);
  return scope;
}

function validEvidence(content) {
  return content?.claims?.length > 0 && content.claims.every((claim) =>
    claim.evidence?.some((reference) => reference.startsWith('genos://code-file/'))
      && claim.evidence.some((reference) => reference.startsWith('genos://code-test/')))
    && content.tests?.length > 0 && content.tests.every((test) => test.exitCode === 0);
}

async function attachCompletion(input) {
  input.missionResult.codeCompletion = await verify(input);
  input.missionResult.passed = input.missionResult.codeCompletion.verified;
  return input.missionResult;
}

async function verify(input) {
  const artifactPath = path.join(input.workspaceRoot, 'src', 'answer.gexpr');
  const artifactHash = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
  const method = { version: 1, methodId: 'verify_code_postconditions', parameters: {
    artifactPath: 'src/answer.gexpr', contractId: 'euclidean_modulo_v1', expectedContentHash: artifactHash
  } };
  const source = await require('../src/services/epistemic/codeArtifactSource').load({
    method, workspaceRoot: input.workspaceRoot
  });
  const checks = [...require('../src/services/epistemic/oracleCodeChecks').STRATEGIES]
    .map((strategy) => require('../src/services/epistemic/oracleCodeChecks').checkCode(source, strategy));
  const verifier = await require('../src/services/agents/workerCodeVerification').runCode(method,
    { mission: { workspaceRoot: input.workspaceRoot } });
  const runtime = await input.db.get(`SELECT payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type = 'LOCAL_WORKER_STARTED' ORDER BY id DESC LIMIT 1`, input.workerId);
  const start = runtime ? JSON.parse(runtime.payload_json) : {};
  const tests = input.workerReport?.tests || input.missionResult?.proposalTests || [];
  const persisted = await persistedProof(input);
  return { verified: completionVerified(input.missionResult, { tests, start, verifier, checks, persisted }),
    model: start.model || null, artifact: source.artifact, tests,
    verifier: verifier.output, independentChecks: checks,
    biologicalReceipt: persisted.receipt, nativeOracle: persisted.nativeOracle };
}

function completionVerified(result, evidence) {
  return missionAccepted(result) && testsPassed(evidence.tests) && ollamaModel(evidence.start)
    && verifierAccepted(evidence.verifier) && independentChecksAccepted(evidence.checks)
    && biologicalReceiptAccepted(evidence.persisted);
}

function independentChecksAccepted(checks) { return checks.length === 2 && checksAccepted(checks); }

async function persistedProof(input) {
  const runId = input.missionResult.executionRunId;
  if (!runId) return { receipt: null, nativeOracle: null };
  const store = require('../src/services/biologicalWorkerStore');
  const receipt = await store.receipt(input.db, runId);
  const observations = await store.observations(input.db, runId);
  const terminal = observations.filter((item) => item.applied
    && item.event.eventType === 'AGENT_COMPLETED').at(-1)?.event;
  if (!terminal) return { receipt, nativeOracle: null };
  const oracle = await require('../src/services/epistemic/nativeOracleGate').historical(input.db, {
    runId, agentId: input.workerId, event: terminal
  });
  if (!oracle) return { receipt, nativeOracle: null };
  const request = { runId, agentId: input.workerId };
  await require('../src/services/epistemic/nativeOracleProof').assertCurrent(input.db, {
    proof: oracle.proof, request, report: terminal.payload.evidenceReport
  });
  return { receipt, nativeOracle: oracleSummary(oracle) };
}

function oracleSummary(oracle) {
  const { proof, acceptance } = oracle;
  const record = proof.attestation.value;
  return { eventId: proof.attestation.eventId, hash: proof.attestation.hash,
    acceptanceHash: acceptance.hash, accepted: record.accepted,
    domain: record.domain, costs: record.costs,
    strategies: proof.saved.evaluation.assembly.verifications.map((receipt) =>
      receipt.executionEvidence[0].postconditions.strategy).sort(),
    nonceCount: proof.saved.evaluation.assembly.verifications.length };
}

function biologicalReceiptAccepted(persisted) {
  const receipt = persisted.receipt;
  const oracle = persisted.nativeOracle;
  return receiptReferenceAccepted(receipt, oracle) && nativeOracleAccepted(oracle);
}

function receiptReferenceAccepted(receipt, oracle) {
  return receipt?.schema === 'genos.worker-biological-execution-receipt/v1'
    && receipt.result?.verified === true && receipt.result.status === 'completed'
    && receipt.semanticVerification?.schema === 'genos.native-oracle-receipt-reference/v1'
    && receipt.semanticVerification.hash === oracle?.hash
    && receipt.semanticVerification.acceptanceHash === oracle?.acceptanceHash;
}

function nativeOracleAccepted(oracle) {
  return oracle.accepted === true && oracle.domain === 'code_postconditions'
    && oracle.costs.complete === true && oracle.costs.processes === 2
    && oracle.nonceCount === 2 && new Set(oracle.strategies).size === 2;
}

function missionAccepted(result) {
  const required = ['persistedContract', 'parentBound', 'runtimeStarted', 'executionRunBound', 'artifactValidated'];
  return required.every((field) => result[field] === true)
    && result.status === 'completed' && result.terminalEvent === 'AGENT_COMPLETED';
}

function testsPassed(tests) { return tests.length > 0 && tests.every((test) => test.exitCode === 0); }
function ollamaModel(start) { return /^ollama:\/\//.test(start.model || ''); }
function verifierAccepted(verifier) { return verifier.output.verdict === 'accept'; }

function checksAccepted(checks) {
  return checks.every((check) => check.status === 'verified' && check.coverage.complete
    && check.coverage.checkedCases === 264);
}

module.exports = { EXPECTED, enabled, prepare, prompt, workerRole, executionPolicy,
  verificationContract, bindModelBudget, validEvidence, attachCompletion, verify };
