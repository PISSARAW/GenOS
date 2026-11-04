import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mcpRequire = createRequire(root + '/mcp/package.json');
const require = createRequire(import.meta.url);
const {Client} = mcpRequire('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = mcpRequire('@modelcontextprotocol/sdk/client/stdio.js');
const protocol = require('./protocol.json');
const LEASE = ['genos_orchestrate', 'genos_blame', 'genos_organization_state', 'genos_snapshot',
  'genos_search_failures', 'genos_diagnose', 'genos_record_decision', 'genos_record_experience',
  'genos_compile_memory', 'genos_execute_primitive', 'genos_execute_strategy_pipeline',
  'genos_analyze_trajectory', 'genos_audit', 'genos_replay', 'genos_capsule_create', 'genos_report_progress'];

export function script(name, options) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(options.log, 'a');
    const runtimeRoot = options.runtimeRoot || root;
    const child = spawn(process.execPath, [runtimeRoot + '/benchmarks/competence-full-runtime/' + name, options.config],
      {cwd: runtimeRoot, env: options.env, windowsHide: true, stdio: ['ignore', fd, fd]});
    fs.closeSync(fd);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`${name} exited ${code}; see ${options.log}`)));
  });
}

function environment(options) {
  const env = {GENOS_REPO_ROOT: options.runtimeRoot, GENOS_WORKSPACE_ROOT: options.workspace,
    GENOS_DB_PATH: options.directory + '/runtime.sqlite', GENOS_CAPSULE_ROOT: options.workspace + '/.genos-agent-worlds',
    GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1',
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(32).toString('hex'),
    GENOS_DATA_ROOT: options.directory + '/data',
    GENOS_ORCHESTRATOR_BRIDGE: options.runtimeRoot + '/backend/bin/genos-orchestrate.cjs',
    GENOS_BIN: options.runtimeRoot + '/target/debug/genos.exe',
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_KEY_ID: 'competence-v3',
    GENOS_MCP_LEASE: LEASE.join(','), GENOS_MCP_TOOL_TIMEOUT_MS: '900000', GENOS_IN_PROCESS_WORKERS: '1',
    GENOS_ALLOW_LOCAL_CODE_WORKERS: '0', GENOS_LOCAL_MODEL: protocol.model,
    GENOS_OLLAMA_ENDPOINT: protocol.endpoint + '/api/chat',
    GENOS_DEFAULT_MODEL: 'ollama://' + protocol.model, TEMP: 'D:/gv3/tmp', TMP: 'D:/gv3/tmp'};
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_EXECUTION_MODE', 'GENOS_DB_BOOTSTRAP_SKIP']) delete env[key];
  return env;
}

export async function open(directory, runtimeRoot = root) {
  if (!/^D:[/\\]/i.test(directory)) throw Error('STUDY_RUNTIME_MUST_BE_ON_D');
  fs.mkdirSync(directory, {recursive: false});
  const options = {directory, workspace: directory + '/w', runtimeRoot};
  fs.mkdirSync(options.workspace); fs.mkdirSync('D:/gv3/tmp', {recursive: true});
  const configured = environment(options);
  const env = {...process.env, ...configured};
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_EXECUTION_MODE', 'GENOS_DB_BOOTSTRAP_SKIP']) delete env[key];
  const config = directory + '/private-runtime.json';
  fs.writeFileSync(config, JSON.stringify({...options, env: configured}));
  await script('bootstrap.cjs', {config, env, runtimeRoot, log: directory + '/bootstrap.log'});
  env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  const identity = JSON.parse(fs.readFileSync(directory + '/identity.json', 'utf8'));
  const client = new Client({name: 'genos-full-runtime-competence', version: '3.0.0'}, {capabilities: {}});
  const transport = new StdioClientTransport({command: process.execPath, args: [runtimeRoot + '/mcp/index.js'], cwd: runtimeRoot, env, stderr: 'pipe'});
  const log = fs.createWriteStream(directory + '/mcp.log');
  transport.stderr?.on('data', buffer => log.write(buffer));
  await client.connect(transport);
  return {directory, workspace: options.workspace, env, config, identity, client, runtimeRoot,
    close: async () => {await client.close(); log.end();}};
}

export async function mission(session, input) {
  const directory = session.directory + '/' + input.id;
  fs.mkdirSync(directory);
  const method = {version: 1, methodId: 'prompt_defined', requiredEvidence: ['functionPrograms'],
    evaluator: {domain: 'bounded_function_induction', version: 1},
    parameters: {task: 'function-program-candidate', context: input.context}};
  const request = {mission: input.prompt, orchestratorId: session.identity.orchestratorId,
    workspaceRoot: session.workspace, workspaceId: session.identity.workspace.id,
    executor: 'local', provider: 'ollama', modelId: protocol.model, localModel: 'ollama://' + protocol.model,
    localContextTokens: protocol.contextTokens,
    localRoutingPolicy: {primary: 'ollama://' + protocol.model, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true},
    topologyId: 'trinity', evaluationMode: 'factual_read_only', background: false, timeoutMs: protocol.perMissionBudget.latencyMs,
    problemProfile: {type: 'scientific_research', risk: 'low', reversibility: 'high',
      evaluability: 'deterministic_tests', requires_reproducibility: true},
    hypotheses: [
      {statement: 'Proposed coefficients reproduce every sealed public sample. A mismatching pair refutes the proposal.'},
      {statement: 'An answerable declaration has one mathematical continuation in the finite class. Two distinct continuations refute certainty.'},
      {statement: 'Workers explicitly distinguish missing observations from ambiguous continuations before deterministic guards.'}],
    workerBarrierTimeoutMs: protocol.perMissionBudget.latencyMs - 10000,
    readOnlyWorkspaceEvidence: true, allow_file_edits: false, allowed_commands: [],
    useMemoryContext: input.useMemoryContext,
    executionPolicy: {inferenceLimits: {attempts: 1, outputTokens: 8192, reasoningEffort: 'none'}}, executionBudget: protocol.perMissionBudget,
    worker_roster: {agent_count: 3, types: {mode: 'auto'}},
    worker_assignments: Object.fromEntries(require('../../backend/src/services/trinityService')
      .analyzeMission(input.prompt).members.map(member => [member.role, {methodContract: method}]))};
  fs.writeFileSync(directory + '/request.json', JSON.stringify(request, null, 2));
  const result = await session.client.callTool({name: 'genos_orchestrate', arguments: request}, undefined,
    {timeout: 900000, maxTotalTimeout: 900000});
  fs.writeFileSync(directory + '/mcp-result.json', JSON.stringify(result, null, 2));
  await script('collect.cjs', {config: session.config, env: session.env, runtimeRoot: session.runtimeRoot, log: directory + '/collect.log'});
  fs.copyFileSync(session.directory + '/latest-receipts.json', directory + '/receipts.json');
  const receipts = JSON.parse(fs.readFileSync(directory + '/receipts.json', 'utf8'));
  return {directory, result, receipts};
}
