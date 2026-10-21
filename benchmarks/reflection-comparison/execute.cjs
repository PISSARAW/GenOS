'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { scoreCampaign } = require('./score.cjs');

const ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const values = { retryFailed: false };
  for (const token of argv) {
    if (token === '--retry-failed') { values.retryFailed = true; continue; }
    const match = /^--(campaign|model)=(.+)$/.exec(token);
    if (!match) throw new Error(`Argument inconnu: ${token}`);
    values[match[1]] = match[2];
  }
  if (!values.campaign) throw new Error('--campaign est obligatoire.');
  return { campaignPath: path.resolve(values.campaign), model: values.model || 'qwen2.5-coder:7b',
    retryFailed: values.retryFailed };
}

function runProcess(command, args, options) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd, env: options.env || process.env, encoding: 'utf8',
    timeout: options.timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  return {
    exitCode: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '',
    elapsedMs: Date.now() - started, error: result.error ? result.error.message : null
  };
}

function seedWorkspace(record, workspace) {
  fs.mkdirSync(workspace, { recursive: true });
  if (!record.fixture) return;
  const source = path.resolve(__dirname, record.fixture);
  fs.cpSync(source, workspace, { recursive: true });
}

function buildPrompt(record) {
  const workflow = record.workflow.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const artifact = record.missionId === 'branches'
    ? 'Corrige les fichiers de la fixture dans le workspace et écris answer.md avec les hypothèses, commandes, résultats et décision.'
    : 'Écris la réponse finale dans answer.md. N’invente aucune mesure ou preuve.';
  return [
    `Benchmark ${record.runId}. Mode expérimental: ${record.mode}.`, record.prompt,
    'Workflow obligatoire:', workflow, artifact,
    `Budget déclaré: ${record.budget.tokens} jetons et ${record.budget.wallTimeMs} ms.`,
    record.expectedPromotion ? `Décision attendue si la preuve manque: ${record.expectedPromotion}. Termine par PROMOTION: <statut>.` : '',
    'Ne modifie rien hors du workspace courant. Une terminaison de transport ne constitue pas une preuve.'
  ].filter(Boolean).join('\n\n');
}

function runAlone(context) {
  const answerPath = path.join(context.workspace, 'answer.md');
  const args = [
    'exec', '--oss', '--local-provider', 'ollama', '-m', context.model,
    '-c', 'model_reasoning_effort="none"', '--ephemeral', '--json', '--ignore-user-config',
    '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-C', context.workspace, '-o', answerPath, context.prompt
  ];
  return runProcess('codex', args, { cwd: context.workspace, timeoutMs: context.timeoutMs });
}

function runGenos(context, record) {
  const payload = {
    action: 'orchestrate', mission: context.prompt, background: false, executor: 'local',
    modelId: `ollama://${context.model}`, provider: 'ollama', workspaceRoot: context.workspace,
    preflightSnapshotAgent: 'agents/securite/snapshot_integrity_guardian.agent.json',
    tokens: record.budget.tokens, budget_steps: 12, timeoutMs: record.budget.wallTimeMs,
    allow_file_edits: true, allowed_commands: record.oracleCommand ? [record.oracleCommand] : [],
    local_code_worker: record.missionId === 'branches',
    completionContract: { policyVersion: 1, invariants: [], requiredEvidence: ['evidence_report'] }
  };
  const environment = {
    ...process.env, GENOS_DEFAULT_MODEL: `ollama://${context.model}`,
    GENOS_LOCAL_MODEL: `ollama://${context.model}`, OLLAMA_MODEL: context.model,
    GENOS_WORKSPACE_ROOT: context.workspace
  };
  return runProcess(process.execPath, [path.join(ROOT, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(payload)], {
    cwd: ROOT, env: environment, timeoutMs: context.timeoutMs
  });
}

function parseLastJson(text) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) { /* continue */ }
  }
  return null;
}

function parseJsonLines(text) {
  const values = [];
  for (const line of String(text).split(/\r?\n/)) {
    try { values.push(JSON.parse(line)); } catch (_) { /* diagnostic text */ }
  }
  return values;
}

function usageFromAlone(stdout) {
  const completed = parseJsonLines(stdout).filter((item) => item.type === 'turn.completed').at(-1);
  const usage = completed?.usage;
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  return Math.max(0, usage.input_tokens - (usage.cached_input_tokens || 0)) + usage.output_tokens;
}

function toolCallsFromAlone(stdout) {
  return parseJsonLines(stdout).filter((item) => item.type === 'item.completed'
    && ['command_execution', 'mcp_tool_call', 'file_change'].includes(item.item?.type)).length;
}

function genosEvidenceText(parsed) {
  if (!parsed || !Array.isArray(parsed.telemetry)) return '';
  const reports = parsed.telemetry.filter((event) => ['EVIDENCE_REPORT', 'AGENT_COMPLETED']
    .includes(event.event_type)).map((event) => {
      try {
        const payload = JSON.parse(event.payload_json || '{}');
        const report = payload.evidenceReport || payload.evidence_report;
        if (report?.fullText) return report.fullText;
        return (report?.claims || []).map((claim) => claim.statement).filter(Boolean).join('\n');
      } catch (_) { return ''; }
    }).filter(Boolean);
  return reports.at(-1) || '';
}

function readAnswer(workspace, parsed) {
  const answerPath = path.join(workspace, 'answer.md');
  if (fs.existsSync(answerPath)) return fs.readFileSync(answerPath, 'utf8');
  return genosEvidenceText(parsed);
}

function verifyBranch(record, workspace) {
  const result = runProcess(process.execPath, ['test.js'], { cwd: workspace, timeoutMs: 30000 });
  return { passed: result.exitCode === 0, checks: [{ id: 'fixture-tests', passed: result.exitCode === 0 }],
    oracleOutput: `${result.stdout}${result.stderr}` };
}

function verifyBudget(record, answer) {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const contentPresent = words >= 40;
  const bounded = record.variantId === 'runtime-note' ? words <= 700 : numberedItems(answer) <= 18;
  return { passed: contentPresent && bounded, checks: [
    { id: 'content-present', passed: contentPresent, observed: words },
    { id: 'declared-output-bound', passed: bounded }
  ], oracleOutput: '' };
}

function numberedItems(text) {
  return String(text).split(/\r?\n/).filter((line) => /^\s*\d+[.)]\s/.test(line)).length;
}

function promotionStatus(answer) {
  const explicit = /PROMOTION\s*:\s*(PROMOTE|REJECT|REVISE|ESCALATE)/i.exec(answer);
  if (explicit) return explicit[1].toUpperCase();
  const any = /\b(PROMOTE|REJECT|REVISE|ESCALATE)\b/i.exec(answer);
  return any ? any[1].toUpperCase() : 'ESCALATE';
}

function verifyEvidenceGate(record, answer) {
  const decision = promotionStatus(answer);
  const passed = answer.trim().length >= 80 && decision === record.expectedPromotion;
  return { passed, decision, checks: [
    { id: 'reasoned-decision-present', passed: answer.trim().length >= 80 },
    { id: 'missing-proof-blocks-promotion', passed: decision === record.expectedPromotion, observed: decision }
  ], oracleOutput: '' };
}

function verify(record, workspace, answer) {
  if (record.missionId === 'branches') return verifyBranch(record, workspace);
  if (record.missionId === 'budget') return verifyBudget(record, answer);
  return verifyEvidenceGate(record, answer);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function evidenceEntry(campaignDir, filePath, kind) {
  return { path: path.relative(campaignDir, filePath).replaceAll('\\', '/'), sha256: sha256(filePath), kind };
}

function observedHypotheses(answer) {
  const groups = [/(seuil|threshold|inclusif)/i, /(arrondi|rounding|mon[eé]taire)/i, /(validation|montant|amount)/i];
  return groups.filter((pattern) => pattern.test(answer)).length;
}

function observedTokens(record, result, parsed) {
  if (record.mode === 'alone') return usageFromAlone(result.stdout);
  if (parsed?.token_usage?.allRunsCompleted === true) return parsed.token_usage.totalTokens ?? null;
  const metered = (parsed?.telemetry || []).map((event) => {
    try { return Number(JSON.parse(event.payload_json || '{}').usage?.tokens); } catch (_) { return NaN; }
  }).filter(Number.isFinite);
  return metered.length ? Math.max(...metered) : null;
}

function observedToolCalls(record, result, parsed) {
  if (record.mode === 'alone') return toolCallsFromAlone(result.stdout);
  return parsed?.telemetry?.length ?? 0;
}

function buildMetrics(job) {
  const tokens = observedTokens(job.record, job.result, job.parsed);
  const branch = job.record.missionId === 'branches';
  const budget = job.record.missionId === 'budget';
  const gate = job.record.missionId === 'evidence-gate';
  return {
    tokens, cost: null, wallTimeMs: job.result.elapsedMs,
    resolutionTimeMs: branch && job.verification.passed ? job.result.elapsedMs : null,
    budgetOverrunTokens: budget && tokens !== null ? Math.max(0, tokens - job.record.budget.tokens) : null,
    iterations: branch ? observedHypotheses(job.answer) : null,
    toolCalls: observedToolCalls(job.record, job.result, job.parsed), retries: 0,
    humanInterventions: 0, monitoringTimeMs: 0,
    unsupportedPromotions: gate ? Number(job.decision === 'PROMOTE') : null
  };
}

function evaluateRunOutcome(record, metrics, verification) {
  const budgetCompliant = record.missionId !== 'budget'
    || (Number.isFinite(metrics.tokens) && metrics.tokens <= record.budget.tokens);
  if (record.missionId === 'budget') verification.checks.push({
    id: 'runtime-token-budget', passed: budgetCompliant,
    observed: metrics.tokens, expectedMaximum: record.budget.tokens
  });
  return { budgetCompliant, succeeded: verification.passed && budgetCompliant };
}

function finalizeRecord(job) {
  const { record, result, parsed, answer, verification, paths } = job;
  const decision = record.missionId === 'evidence-gate' ? verification.decision : null;
  const metrics = buildMetrics({ record, result, parsed, answer, verification, decision });
  const { budgetCompliant, succeeded } = evaluateRunOutcome(record, metrics, verification);
  record.status = 'completed';
  record.startedAt = new Date(job.startedAt).toISOString();
  record.endedAt = new Date(job.endedAt).toISOString();
  record.outcome = {
    taskSucceeded: succeeded, evidenceValid: verification.passed && budgetCompliant,
    finalOutcome: succeeded ? 'success' : 'failure'
  };
  record.metrics = metrics;
  record.promotionDecision = decision ? { status: decision, decisionRule: 'missing-proof-blocks-promotion', llmWasJudge: false } : null;
  record.evidence = paths.map((entry) => evidenceEntry(job.campaignDir, entry.path, entry.kind));
  record.verifierReceipts = [{ id: `harness-${record.runId}`, status: succeeded ? 'verified' : 'refuted',
    verifierId: 'reflection-campaign-harness', independentOfExecutor: true, checks: verification.checks }];
  record.notes = result.error || (result.exitCode ? `executor exit ${result.exitCode}` : '');
}

function reconcileAccounting(record, recordPath, campaignDir) {
  if (record.mode !== 'genos' || record.status !== 'completed') return;
  const stdout = record.evidence.find((entry) => entry.kind === 'executor-stdout');
  if (!stdout) return;
  const stdoutPath = path.resolve(campaignDir, stdout.path);
  if (!fs.existsSync(stdoutPath)) return;
  const parsed = parseLastJson(fs.readFileSync(stdoutPath, 'utf8'));
  if (parsed?.token_usage?.allRunsCompleted === true) return;
  const recovered = observedTokens(record, { stdout: '' }, parsed);
  record.metrics.tokens = recovered;
  record.metrics.budgetOverrunTokens = record.missionId === 'budget' && recovered !== null
    ? Math.max(0, recovered - record.budget.tokens) : null;
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
}

function executeRecord(job) {
  const recordPath = path.join(job.campaignDir, 'run-records', `${job.planned.runId}.json`);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  reconcileAccounting(record, recordPath, job.campaignDir);
  if (record.status === 'completed' && !(job.retryFailed && record.mode === 'alone' && !record.outcome.taskSucceeded)) return record;
  const workspace = path.join(job.campaignDir, 'workspaces', record.runId);
  const attempt = Number(record.attemptCount || 0) + 1;
  const evidenceDir = path.join(job.campaignDir, 'evidence', record.runId, `attempt-${attempt}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  seedWorkspace(record, workspace);
  const prompt = buildPrompt(record);
  const context = { workspace, model: job.model, prompt, timeoutMs: record.budget.wallTimeMs + 60000 };
  const startedAt = Date.now();
  const result = record.mode === 'alone' ? runAlone(context) : runGenos(context, record);
  const endedAt = Date.now();
  const stdoutPath = path.join(evidenceDir, 'stdout.txt');
  const stderrPath = path.join(evidenceDir, 'stderr.txt');
  fs.writeFileSync(stdoutPath, result.stdout);
  fs.writeFileSync(stderrPath, result.stderr);
  const parsed = record.mode === 'genos' ? parseLastJson(result.stdout) : null;
  const answer = readAnswer(workspace, parsed);
  const answerPath = path.join(evidenceDir, 'answer.md');
  fs.writeFileSync(answerPath, answer);
  const verification = verify(record, workspace, answer);
  const verificationPath = path.join(evidenceDir, 'verification.json');
  fs.writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  const paths = [{ path: stdoutPath, kind: 'executor-stdout' }, { path: stderrPath, kind: 'executor-stderr' },
    { path: answerPath, kind: 'agent-answer' }, { path: verificationPath, kind: 'verifier-receipt' }];
  if (verification.oracleOutput) {
    const oraclePath = path.join(evidenceDir, 'oracle.txt');
    fs.writeFileSync(oraclePath, verification.oracleOutput);
    paths.push({ path: oraclePath, kind: 'oracle-output' });
  }
  finalizeRecord({ record, result, parsed, answer, verification, paths, campaignDir: job.campaignDir, startedAt, endedAt });
  record.attemptCount = attempt;
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function executeCampaign(options) {
  const campaign = JSON.parse(fs.readFileSync(options.campaignPath, 'utf8'));
  const campaignDir = path.dirname(options.campaignPath);
  campaign.execution = campaign.execution || {
    provider: 'ollama', model: options.model, modelProvenance: 'observed-local-list',
    runner: 'benchmarks/reflection-comparison/execute.cjs', startedAt: new Date().toISOString()
  };
  fs.writeFileSync(options.campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  for (const planned of [...campaign.runs].sort((a, b) => a.sequence - b.sequence)) {
    console.log(`[${planned.sequence}/${campaign.runs.length}] ${planned.runId}`);
    const record = executeRecord({ campaignDir, planned, model: options.model, retryFailed: options.retryFailed });
    console.log(`  ${record.outcome.finalOutcome} tokens=${record.metrics.tokens} wall=${record.metrics.wallTimeMs}ms`);
  }
  const bounds = executionBounds(campaign, campaignDir);
  campaign.execution.startedAt = bounds.startedAt;
  campaign.execution.finishedAt = bounds.finishedAt;
  fs.writeFileSync(options.campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  return writeCampaignVerdict({ campaign, campaignDir, campaignPath: options.campaignPath });
}

function executionBounds(campaign, campaignDir) {
  const records = campaign.runs.map((planned) => JSON.parse(fs.readFileSync(
    path.join(campaignDir, 'run-records', `${planned.runId}.json`), 'utf8')));
  const starts = records.map((record) => record.startedAt).filter(Boolean).sort();
  const ends = records.map((record) => record.endedAt).filter(Boolean).sort();
  return { startedAt: starts[0] || null, finishedAt: ends.at(-1) || null };
}

function writeCampaignVerdict(job) {
  try {
    const report = scoreCampaign(job.campaignPath);
    const reportPath = path.join(job.campaignDir, 'report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return reportPath;
  } catch (error) {
    const statusPath = path.join(job.campaignDir, 'campaign-status.json');
    const status = buildUnscorableStatus(job.campaign, job.campaignDir, error);
    fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
    return statusPath;
  }
}

function buildUnscorableStatus(campaign, campaignDir, error) {
  const records = campaign.runs.map((planned) => JSON.parse(fs.readFileSync(
    path.join(campaignDir, 'run-records', `${planned.runId}.json`), 'utf8')));
  return {
    schemaVersion: 1, protocolId: campaign.protocolId, status: 'completed-unscorable',
    reason: error.message, confirmatoryEligible: false, completedRuns: records.length,
    verifiedSuccesses: records.filter((record) => record.outcome.taskSucceeded && record.outcome.evidenceValid).length,
    missingTokenRuns: records.filter((record) => record.metrics.tokens === null).map((record) => record.runId),
    byMode: Object.fromEntries(['alone', 'genos'].map((mode) => [mode, {
      runs: records.filter((record) => record.mode === mode).length,
      verifiedSuccesses: records.filter((record) => record.mode === mode
        && record.outcome.taskSucceeded && record.outcome.evidenceValid).length
    }])),
    winner: null,
    limitations: ['Le scoreur fail-closed refuse toute comparaison avec une comptabilité obligatoire absente.']
  };
}

function main() {
  const reportPath = executeCampaign(parseArgs(process.argv.slice(2)));
  console.log(`Rapport: ${reportPath}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`REFLECTION_EXECUTE_FAILED: ${error.stack || error.message}`); process.exit(1); }
}

module.exports = { buildPrompt, buildUnscorableStatus, parseLastJson, promotionStatus, usageFromAlone };
