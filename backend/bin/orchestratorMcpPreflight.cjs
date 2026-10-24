'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFLIGHT_TOOLS = new Set(['genos_snapshot', 'genos_search_failures', 'genos_diagnose', 'genos_record_decision']);

function safeSegment(value) {
  return crypto.createHash('sha256').update(String(value || 'mission')).digest('hex').slice(0, 24);
}

function resultText(result) {
  return (result?.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
}

function parseResult(result) {
  const text = resultText(result);
  if (!text) return { text, value: null };
  try { return { text, value: JSON.parse(text) }; } catch (_) { return { text, value: text }; }
}

function assertSuccessfulTool(tool, result, extra = {}) {
  if (!result || result.isError === true) {
    throw Object.assign(new Error(`GenOS preflight tool '${tool}' failed: ${resultText(result) || 'empty MCP result'}`),
      { code: 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED', tool });
  }
  const parsed = parseResult(result);
  if (!parsed.value || typeof parsed.value !== 'object' || parsed.value.success !== true) {
    throw Object.assign(new Error(`GenOS preflight tool '${tool}' did not attest success=true.`),
      { code: 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED', tool });
  }
  return { text: parsed.text, value: parsed.value, ...extra };
}

function snapshotAgentPath(root, requested) {
  const candidates = [requested,
    'agents/securite/snapshot_integrity_guardian.agent.json',
    'arch_agent.json'];
  for (const candidate of candidates) {
    if (!candidate || path.isAbsolute(candidate)) continue;
    const resolved = path.resolve(root, candidate);
    const relative = path.relative(path.resolve(root), resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return { absolute: resolved, relative: relative.replaceAll(path.sep, '/') };
    }
  }
  throw Object.assign(new Error('The workspace has no GenOS agent file for the required baseline snapshot.'),
    { code: 'ORCHESTRATOR_PREFLIGHT_SNAPSHOT_AGENT_MISSING' });
}

async function runOrchestratorMcpPreflight(input) {
  assertPreflightContext(input);
  const tools = [...new Set(input.tools || [])].filter(tool => PREFLIGHT_TOOLS.has(tool));
  if (!tools.length) return { observedTools: [], receipts: [] };
  const client = await connectPreflightClient(input, tools);
  const receipts = [];
  try {
    for (const tool of tools) receipts.push(await runPreflightTool(client, input, tool, receipts));
  } finally {
    await client.close().catch(() => {});
  }
  return { observedTools: receipts.map(receipt => receipt.tool), receipts };
}

function buildOrchestratorPreflightInput(input) {
  const request = input.request || {};
  return { db: input.db, orchestratorId: input.orchestratorId, missionId: input.missionId,
    task: input.task, repoRoot: input.repoRoot,
    workspaceRoot: request.workspaceRoot || request.workspace_root || input.workspaceRoot,
    snapshotAgent: request.preflightSnapshotAgent || request.preflight_snapshot_agent || input.snapshotAgent,
    hypotheses: request.diagnosticHypotheses || request.hypotheses, tools: input.tools };
}
function assertPreflightContext(input) {
  const { db, orchestratorId, missionId, repoRoot, workspaceRoot } = input || {};
  if (!db || !orchestratorId || !missionId || !repoRoot || !workspaceRoot) {
    throw Object.assign(new Error('Orchestrator MCP preflight context is incomplete.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_CONTEXT_INVALID' });
  }
}

function preflightEnvironment(input, tools) {
  return { ...process.env, GENOS_REPO_ROOT: input.repoRoot, GENOS_WORKSPACE_ROOT: input.workspaceRoot,
    GENOS_MCP_LEASE: tools.join(','), GENOS_DISABLE_DOTENV: '1' };
}

async function connectPreflightClient(input, tools) {
  const { repoRoot } = input;
  const sdkRoot = path.join(repoRoot, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk');
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'index.js'))),
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'stdio.js')))
  ]);
  const cli = path.join(repoRoot, 'target', 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
  const env = preflightEnvironment(input, tools);
  if (fs.existsSync(cli)) env.GENOS_BIN = cli;
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(repoRoot, 'mcp', 'index.js')], cwd: repoRoot, stderr: 'pipe', env });
  const stderrPath = path.join(repoRoot, '.genos', 'runner-logs', 'mcp-preflight-' + safeSegment(input.missionId) + '.stderr.log');
  fs.mkdirSync(path.dirname(stderrPath), { recursive: true });
  transport.stderr.on('data', chunk => fs.appendFileSync(stderrPath, chunk));
  const client = new Client({ name: 'genos-orchestrator-preflight', version: '1' });
  await client.connect(transport);
  return client;
}

async function runPreflightTool(client, input, tool, receipts = []) {
  const prepared = prepareToolArguments(input, tool, receipts);
  const result = await client.callTool({ name: tool, arguments: prepared.args });
  const success = assertSuccessfulTool(tool, result, { outputPath: prepared.outputPath });
  assertSnapshotExists(tool, prepared.outputPath);
  const receipt = createReceipt({ input, tool, prepared, resultTextValue: success.text });
  await recordPreflightSuccess(input.db, receipt, prepared.args);
  return receipt;
}

function prepareToolArguments(input, tool, receipts = []) {
  if (tool === 'genos_diagnose') {
    const task = String(input.task || 'GenOS orchestration preflight').slice(0, 2000);
    const supplied = Array.isArray(input.hypotheses) ? input.hypotheses
      .filter(hypothesis => typeof hypothesis?.statement === 'string' && hypothesis.statement.trim()) : [];
    const hypotheses = supplied.length ? supplied : [{
      statement: `The authorized workspace contains at least one change relevant to this objective, and its effect can be independently verified: ${task}`
    }];
    return { args: { task, hypotheses }, outputPath: null };
  }
  if (tool === 'genos_record_decision') {
    const evidence = receipts.filter(receipt => receipt.status === 'completed')
      .map(receipt => `mcp:${receipt.tool}:${receipt.resultDigest}`);
    if (!evidence.length) throw Object.assign(new Error('A baseline decision requires completed preflight evidence.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_DECISION_EVIDENCE_MISSING' });
    return { args: { agentId: input.orchestratorId,
      title: `Baseline decision: ${String(input.task || 'GenOS mission').slice(0, 80)}`,
      decision: 'Proceed with the bounded mission using the completed failure search, falsifiable diagnosis, and baseline snapshot. Reassess if new evidence contradicts this plan.',
      evidence }, outputPath: null };
  }
  if (tool !== 'genos_snapshot') return {
    args: { query: String(input.task || 'GenOS orchestration preflight').slice(0, 2000), limit: 10 },
    outputPath: null
  };
  const agent = snapshotAgentPath(input.repoRoot, input.snapshotAgent);
  const relativeOutput = `.genos-agent-worlds/orchestrator-preflight/${safeSegment(input.missionId)}.snapshot.json`;
  const outputPath = path.join(input.repoRoot, ...relativeOutput.split('/'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  return { args: { agent: agent.relative, out: relativeOutput }, outputPath };
}

function assertSnapshotExists(tool, outputPath) {
  if (tool === 'genos_snapshot' && (!outputPath || !fs.existsSync(outputPath))) {
    throw Object.assign(new Error('genos_snapshot returned without creating its requested baseline file.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_SNAPSHOT_MISSING', tool });
  }
}

function createReceipt({ input, tool, prepared, resultTextValue }) {
  return { tool, status: 'completed',
    resultDigest: crypto.createHash('sha256').update(resultTextValue).digest('hex'), args: prepared.args,
    outputPath: prepared.outputPath, missionId: input.missionId, orchestratorId: input.orchestratorId };
}

async function recordPreflightSuccess(db, receipt, args) {
  await require('../src/services/primitiveExecutionJournal').recordPrimitiveExecution(db, {
    orchestratorId: receipt.orchestratorId, agentId: receipt.orchestratorId,
    stageKey: `preflight:${receipt.missionId}`, primitive: receipt.tool, args,
    result: { success: true, resultDigest: receipt.resultDigest, outputPath: receipt.outputPath }
  });
  require('../src/services/telemetryObserver').emitEvent({ eventType: 'ORCHESTRATOR_PREFLIGHT_TOOL_COMPLETED',
    agentId: receipt.orchestratorId, action: receipt.tool,
    detail: `Required MCP preflight tool ${receipt.tool} completed before worker dispatch.`,
    severity: 'info', payload: receipt });
}

function pathToFileURL(filePath) {
  return require('node:url').pathToFileURL(filePath).href;
}

module.exports = { runOrchestratorMcpPreflight, snapshotAgentPath, assertSuccessfulTool,
  assertPreflightContext, preflightEnvironment, buildOrchestratorPreflightInput, prepareToolArguments };
