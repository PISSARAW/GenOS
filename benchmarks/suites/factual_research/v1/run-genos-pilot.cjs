const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { scorePredictions, verifySources } = require('./oracle/score.cjs');

const suite = __dirname;
const model = process.argv[2] || 'qwen2.5-coder:7b';
const taskId = process.argv[3] || 'http-safe-methods-fr-01';
const results = path.join(suite, 'results');

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sourceCards(lock, sourceIds) {
  if (!Array.isArray(sourceIds) || !sourceIds.length || new Set(sourceIds).size !== sourceIds.length) throw new Error('Question sourceIds must list unique locked sources.');
  const files = lock.files.filter((file) => sourceIds.includes(file.sourceId));
  if (files.length !== sourceIds.length) throw new Error('Question sourceIds do not match the locked source cards.');
  return files.map((file) => {
    const card = fs.readFileSync(path.join(suite, 'public', 'sources', file.path), 'utf8');
    return `===== ${file.sourceId} | ${file.url} | ${file.version} =====\n${card}`;
  }).join('\n\n');
}

function missionPrompt(item, cards) {
  return `Question ${item.taskId}: ${item.prompt}\n\nOnly these frozen sources are allowed:\n${cards}\n\nAnswer in French. Return one JSON object with taskId, claims and citations. Claims must contain exactly these keys: ${item.requiredClaimKeys.join(', ')}. Each citation must have sourceId, section and factId copied from a source card. If worker dossiers are provided, also include dossierInfluence with one entry per worker: workerId, non-empty influence, and usedClaims copied exactly from that worker's claims. Do not use external knowledge or other files.`;
}

function launch(request, outputFile) {
  const payloadFile = path.join(results, `payload-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(request));
  const output = fs.createWriteStream(outputFile);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(suite, '../../../../backend/bin/genos-orchestrate.cjs'), '--payload-file', payloadFile], {
      cwd: path.resolve(suite, '../../../..'),
      env: {
        ...process.env,
        GENOS_RUNNER_LOG_DIR: results,
        GENOS_CAPSULE_ROOT: process.env.GENOS_CAPSULE_ROOT || path.resolve(suite, '../../../../.genos-agent-worlds')
      },
      windowsHide: true
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
    const payload = JSON.parse(report.payload_json || '{}');
    const raw = payload.claims?.[0]?.statement;
    if (typeof raw !== 'string') continue;
    try {
      const prediction = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').replace(/^json\s*\n/i, ''));
      if (prediction.taskId === item.taskId) return prediction;
    } catch (_) { /* retain the raw report for diagnosis */ }
  }
  return null;
}

function buildReceipt(input) {
  const { runId, item, questions, sourceState, startedAt, execution, outcome, prediction, score } = input;
  return {
    schemaVersion: 1, mode: 'genos-pilot', runId, taskId: item.taskId,
    requestedModel: model, questionSetDigest: hash(questions), sourceLock: sourceState.lock,
    oracleDigest: hash(fs.readFileSync(path.join(suite, 'oracle', 'answer-key.json'))),
    startedAt, finishedAt: new Date().toISOString(), processExitCode: execution.code,
    missionId: outcome.missionId || null, orchestratorId: outcome.orchestratorId || null,
    missionSuccess: outcome.success === true, verdict: outcome.verdict || null,
    coverage: outcome.coverage?.verdict || null, missingRequiredTools: outcome.coverage?.orchestration?.missingRequiredTools || [],
    prediction, score, comparisonEligible: false,
    stderr: execution.stderr.slice(-4000)
  };
}

async function main() {
  const sourceState = verifySources();
  const questions = fs.readFileSync(path.join(suite, 'public', 'questions.json'));
  const item = JSON.parse(questions).items.find((entry) => entry.taskId === taskId);
  if (!item) throw new Error(`Unknown taskId: ${taskId}`);
  fs.mkdirSync(results, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-genos-pilot`;
  const runDir = path.join(results, runId);
  fs.mkdirSync(runDir);
  const request = {
    mission: missionPrompt(item, sourceCards(sourceState.lock, item.sourceIds)),
    executor: 'local', provider: 'ollama', modelId: model,
    evaluationMode: 'factual_read_only',
    workspaceRoot: suite,
    completionContract: {
      invariants: [{ id: 'mission_outcome_success', kind: 'functional', verifier: { type: 'mission.outcome_success' } }],
      requiredEvidence: ['evidence_report']
    },
    executionBudget: { tokens: 12000, latencyMs: 240000, events: 1000 },
    timeoutMs: 300000
  };
  const startedAt = new Date().toISOString();
  const rawFile = path.join(runDir, 'genos-outcome.json');
  const execution = await launch(request, rawFile);
  const raw = fs.readFileSync(rawFile, 'utf8');
  let outcome;
  try { outcome = JSON.parse(raw); } catch (_) { outcome = { parseError: raw.slice(-1000) }; }
  const prediction = extractPrediction(outcome, item);
  const score = prediction ? scorePredictions([prediction]) : null;
  const receipt = buildReceipt({ runId, item, questions, sourceState, startedAt, execution, outcome, prediction, score });
  fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ runDir, ...receipt }, null, 2));
  if (!prediction || !outcome.success || execution.code !== 0) process.exitCode = 2;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
