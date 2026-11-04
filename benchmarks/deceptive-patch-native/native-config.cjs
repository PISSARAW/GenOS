'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const protocol = require('./protocol.json');

function environment(options) {
  const directory = path.resolve(options.directory);
  return { GENOS_REPO_ROOT: options.runtimeRoot, GENOS_WORKSPACE_ROOT: options.workspace,
    GENOS_DB_PATH: directory + '/runtime.sqlite', GENOS_DATA_ROOT: directory + '/data',
    GENOS_STUDIO_ROOT: directory + '/studio', GENOS_CAPSULE_ROOT: directory + '/capsules',
    GENOS_SNAPSHOT_ROOT: directory + '/snapshots', GENOS_WORKSPACES_ROOT: directory,
    GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1', GENOS_IN_PROCESS_WORKERS: '1',
    GENOS_ALLOW_LOCAL_CODE_WORKERS: '1', GENOS_ALLOW_FILE_EDITS: '1',
    GENOS_LOCAL_MODEL: protocol.model, GENOS_DEFAULT_MODEL: 'ollama://' + protocol.model,
    GENOS_OLLAMA_ENDPOINT: options.endpoint + '/api/chat',
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(32).toString('hex'),
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_TOOL_MEMBRANE_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_KEY_ID: 'dpb-native-v1',
    GENOS_BIN: options.runtimeRoot + '/target/debug/genos.exe',
    GENOS_MCP_BIN: options.runtimeRoot + '/target/debug/genos-mcp.exe',
    GENOS_MCP_LEASE: 'genos_orchestrate,genos_diagnose,genos_snapshot,genos_search_failures,genos_record_decision,genos_record_experience,genos_compile_memory,genos_report_progress,genos_replay,genos_execute_primitive,genos_execute_strategy_pipeline,genos_analyze_trajectory,genos_audit,genos_capsule_create',
    GENOS_MCP_TOOL_TIMEOUT_MS: String(protocol.trialTimeoutMs + 60000),
    TEMP: directory + '/tmp', TMP: directory + '/tmp', GENOS_TEST_TEMP_ROOT: directory + '/tmp' };
}

function quality() {
  return { domain: 'software_engineering', policy: 'balanced', maxIterations: 3,
    critiques: 2, requireDoubleBlind: true, requireCalibration: true, minDependencyGroups: 1,
    budgetMaxTokens: protocol.maxTokens, maxCalls: protocol.maxCalls,
    maxOutputTokens: protocol.maxOutputTokens, maxDurationMs: protocol.trialTimeoutMs,
    callTimeoutMs: protocol.requestTimeoutMs, maxPromptChars: 60000 };
}

function request(options) {
  const model = 'ollama://' + protocol.model;
  const input = { mission: options.prompt, orchestratorId: options.identity.orchestratorId,
    workspaceRoot: options.workspace, workspaceId: options.identity.workspace.id,
    executor: 'local', provider: 'ollama', modelId: protocol.model, localModel: model,
    localContextTokens: protocol.contextTokens, background: false,
    localRoutingPolicy: { primary: model, fallbacks: [], parallelReview: [], preferLocal: true },
    timeoutMs: protocol.trialTimeoutMs, workerBarrierTimeoutMs: protocol.trialTimeoutMs - 20000,
    localCodeWorker: true, allow_file_edits: true, explicit_write_lease: true,
    allowed_write_paths: options.production, gqwfV2: true, gqwfMaterializer: 'portable-copy-v1',
    allowed_commands: ['node smoke.test.cjs', 'node invariants.test.cjs', 'node regression.test.cjs'],
    executionPolicy: { allowFileEdits: true, gqwfV2: true,
      inferenceLimits: { attempts: 3, outputTokens: protocol.maxOutputTokens } },
    readOnlyWorkspaceEvidence: true, useMemoryContext: false,
    completionContract: {policyVersion: 'genos.homeostasis-policy/v2', invariants: [
      {id: 'mission_outcome_success', kind: 'functional', verifier: {type: 'mission.outcome_success'}},
      {id: 'tests_pass', kind: 'structural', verifier: {type: 'context.flag', flag: 'testsPassed'}},
      {id: 'completion_contract_configured', kind: 'epistemic', verifier: {type: 'context.flag', flag: 'completionContractConfigured'}},
      {id: 'no_failed_agents', kind: 'safety', verifier: {type: 'context.flag', flag: 'noFailedAgents'}}],
      requiredEvidence: ['test_suite_passed', 'worker_evidence_barrier_satisfied', 'execution_run_complete', 'evidence_report']},
    executionBudget: { tokens: protocol.maxTokens,
      workerShare: 0.25, orchestratorReserve: 0.75, costUsd: 2,
      latencyMs: protocol.trialTimeoutMs, events: 800 },
    hypotheses: [{ statement: 'A local patch fixes the specified defect without regressing public invariants. A failing public test refutes the candidate.' }],
    problemProfile: { type: 'software_engineering', risk: 'low', reversibility: 'high',
      evaluability: 'deterministic_tests', requires_reproducibility: true } };
  if (options.arm === 'C') return { ...input,
    worker_roster: { agent_count: 1, types: { mode: 'explicit', kinds: ['adaptive_worker'] } },
    worker_assignments: {implementation: {workerKind: 'adaptive_worker', workspaceVerificationContract: options.verificationContract,
      methodContract: {version: 1, methodId: 'prompt_defined', parameters: {task: 'Repair code using executed public tests'}}}},
    qualityElevation: quality(), qualityRuntime: { generatorModel: model,
      reviewers: [{ id: 'correctness', model, focus: 'Correctness and regression risk' },
        { id: 'maintainability', model, focus: 'Simplicity and maintainability' }] } };
  return { ...input, worker_roster: { agent_count: 1, types: { mode: 'explicit', kinds: ['bounded_worker'] } } };
}
module.exports = { environment, request, quality };
