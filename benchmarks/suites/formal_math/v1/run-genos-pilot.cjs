'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadItems, leanIdentity, checkProof } = require('./oracle/check.cjs');

const suite = __dirname;
const model = process.argv[2] || 'qwen2.5:14b';
const taskId = process.argv[3] || 'nat-add-zero-01';
const results = path.join(suite, 'results');

function missionPrompt(item) {
  return `Formal mathematics task ${item.taskId}. Natural statement: ${item.naturalStatement}\nFixed Lean 4 goal: ${item.formalStatement}\nReturn one JSON object with taskId and proofBody. Supply only Lean 4 tactics after := by. Do not include a theorem header, imports, axioms, sorry or admit. An independent Lean checker will construct the theorem header from the fixed goal. If worker dossiers are supplied, include dossierInfluence with workerId, non-empty influence and usedClaims copied from each worker's claims.`;
}

function launch(request, outputFile) {
  const payloadFile = path.join(results, `payload-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(request));
  const output = fs.createWriteStream(outputFile);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(suite, '../../../../backend/bin/genos-orchestrate.cjs'), '--payload-file', payloadFile], {
      cwd: path.resolve(suite, '../../../..'), windowsHide: true,
      env: { ...process.env, GENOS_RUNNER_LOG_DIR: results,
        GENOS_CAPSULE_ROOT: process.env.GENOS_CAPSULE_ROOT || path.resolve(suite, '../../../../.genos-agent-worlds') }
    });
    let stderr = '';
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr }));
  });
}

function extractPrediction(outcome, item) {
  const reports = (outcome.telemetry || []).filter((event) => event.event_type === 'EVIDENCE_REPORT');
  for (const report of reports.reverse()) {
    const raw = JSON.parse(report.payload_json || '{}').claims?.[0]?.statement;
    if (typeof raw !== 'string') continue;
    try {
      const prediction = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').replace(/^json\s*\n/i, ''));
      if (prediction.taskId === item.taskId) return prediction;
    } catch (_) { /* Keep the raw GenOS report for diagnosis. */ }
  }
  return null;
}

function observedModels(outcome) {
  const models = [];
  for (const event of outcome.telemetry || []) {
    if (!['LOCAL_MODEL_ROUTING', 'EVIDENCE_REPORT'].includes(event.event_type)) continue;
    const payload = JSON.parse(event.payload_json || '{}');
    const selected = event.event_type === 'LOCAL_MODEL_ROUTING'
      ? payload.selectedModel : payload.workerArtifact?.provenance?.model;
    if (selected) models.push(selected);
  }
  return [...new Set(models)];
}

async function executeMission(request, runDir) {
  const rawFile = path.join(runDir, 'genos-outcome.json');
  const execution = await launch(request, rawFile);
  const raw = fs.readFileSync(rawFile, 'utf8');
  let outcome;
  try { outcome = JSON.parse(raw); } catch (_) { outcome = { parseError: raw.slice(-1000) }; }
  return { execution, outcome };
}

function makeReceipt(input) {
  const { item, corpusDigest, lean, startedAt, execution, outcome, prediction, oracle } = input;
  const servedModels = observedModels(outcome);
  const expectedModel = model.startsWith('ollama://') ? model : `ollama://${model}`;
  return { schemaVersion: 1, mode: 'genos-pilot', taskId: item.taskId, corpusDigest, requestedModel: model,
    servedModels, modelIdentityVerified: servedModels.length > 0 && servedModels.every((served) => served === expectedModel),
    leanVersion: lean.raw, startedAt, finishedAt: new Date().toISOString(), processExitCode: execution.code,
    missionId: outcome.missionId || null, orchestratorId: outcome.orchestratorId || null,
    missionSuccess: outcome.success === true, verdict: outcome.verdict || null, coverage: outcome.coverage?.verdict || null,
    prediction, oracle, comparisonEligible: false, stderr: execution.stderr.slice(-4000) };
}

async function main() {
  const { corpus, corpusDigest } = loadItems();
  const item = corpus.items.find((entry) => entry.taskId === taskId);
  if (!item) throw new Error(`Unknown taskId: ${taskId}`);
  const lean = leanIdentity(process.env.GENOS_LEAN_EXECUTABLE || 'lean');
  if (lean.version !== corpus.toolchain) throw new Error(`Lean mismatch: ${lean.raw}`);
  fs.mkdirSync(results, { recursive: true });
  const startedAt = new Date().toISOString();
  const runDir = path.join(results, `${startedAt.replace(/[:.]/g, '-')}-genos-pilot-${taskId}`);
  fs.mkdirSync(runDir);
  const request = {
    mission: missionPrompt(item), executor: 'local', provider: 'ollama', modelId: model,
    evaluationMode: 'formal_read_only', workspaceRoot: path.join(suite, 'public'),
    completionContract: {
      invariants: [{ id: 'mission_outcome_success', kind: 'functional', verifier: { type: 'mission.outcome_success' } }],
      requiredEvidence: ['evidence_report']
    },
    executionBudget: { tokens: 12000, latencyMs: 240000, events: 1000 }, timeoutMs: 300000
  };
  const { execution, outcome } = await executeMission(request, runDir);
  const prediction = extractPrediction(outcome, item);
  const oracle = prediction ? await checkProof(item, prediction.proofBody, lean) : null;
  const receipt = makeReceipt({ item, corpusDigest, lean, startedAt, execution, outcome, prediction, oracle });
  fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ runDir, ...receipt }, null, 2));
  if (!receipt.modelIdentityVerified || !outcome.success || execution.code !== 0 || !oracle?.passed) process.exitCode = 2;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
