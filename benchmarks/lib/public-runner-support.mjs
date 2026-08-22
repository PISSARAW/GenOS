import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadApproval(file) {
  if (!file) return null;
  const approval = readJson(path.resolve(file));
  if (typeof approval.approval_id !== 'string' || approval.approval_id.length === 0) {
    throw new Error('Approval manifest requires approval_id');
  }
  if (typeof approval.approved_by !== 'string' || approval.approved_by.length === 0) {
    throw new Error('Approval manifest requires approved_by');
  }
  if (typeof approval.approved_at !== 'string' || Number.isNaN(Date.parse(approval.approved_at))) {
    throw new Error('Approval manifest requires an ISO-8601 approved_at timestamp');
  }
  if (!approval.tasks || typeof approval.tasks !== 'object' || Array.isArray(approval.tasks)) {
    throw new Error('Approval manifest requires a tasks object');
  }
  return approval;
}

export function approvalState(approval, taskId) {
  const task = approval?.tasks?.[taskId] ?? {};
  return {
    approval_id: approval?.approval_id ?? null,
    approved_by: approval?.approved_by ?? null,
    approved_at: approval?.approved_at ?? null,
    dataset_approved: task.dataset_approved === true,
    runtime_approved: task.runtime_approved === true,
    comparison_approved: task.comparison_approved === true,
    dataset_checksums: task.dataset_checksums ?? {},
    runtime_identities: task.runtime_identities ?? {},
    comparison_conditions_sha256: /^[a-f0-9]{64}$/i.test(task.comparison_conditions_sha256 ?? '')
      ? task.comparison_conditions_sha256 : null,
  };
}

function parseCommand(environment, variable) {
  const raw = environment[variable];
  if (!raw) return { command: null, error: null };
  try {
    const command = JSON.parse(raw);
    if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string')) {
      return { command: null, error: variable + ' must be a non-empty JSON array of strings' };
    }
    if (command[0].length === 0) return { command: null, error: variable + ' executable must not be empty' };
    return { command, error: null };
  } catch (error) {
    return { command: null, error: variable + ' contains invalid JSON: ' + error.message };
  }
}

function datasetState(environment, variable, checksumVariable) {
  const locator = environment[variable];
  const checksum = environment[checksumVariable] ?? null;
  const checksumValid = typeof checksum === 'string' && /^[a-f0-9]{64}$/i.test(checksum);
  if (!locator) return { configured: false, available: false, locator_sha256: null, checksum, checksum_valid: checksumValid, error: null };
  const looksLikeUri = /^[a-z][a-z0-9+.-]*:\/\//i.test(locator);
  const available = looksLikeUri || fs.existsSync(path.resolve(locator));
  return {
    configured: true,
    available,
    locator_sha256: sha256(locator),
    checksum,
    checksum_valid: checksumValid,
    error: available ? null : variable + ' points to a local path that does not exist',
  };
}

export function componentPreflight(component, approvals, environment) {
  const dataset = datasetState(environment, component.dataset_env, component.dataset_checksum_env);
  const parsedCommand = parseCommand(environment, component.command_env);
  const rawIdentity = environment[component.runtime_identity_env];
  const runtimeIdentity = typeof rawIdentity === 'string' && rawIdentity.trim() ? rawIdentity.trim() : null;
  const approvedChecksum = approvals.dataset_checksums[component.id] ?? null;
  const approvedIdentity = approvals.runtime_identities[component.id] ?? null;
  const checksumApproved = dataset.checksum_valid && dataset.checksum === approvedChecksum;
  const identityApproved = runtimeIdentity !== null && runtimeIdentity === approvedIdentity;
  const blockers = [];
  if (!approvals.dataset_approved) blockers.push('dataset approval is missing');
  if (!dataset.configured) blockers.push(component.dataset_env + ' is not configured');
  if (dataset.error) blockers.push(dataset.error);
  if (!dataset.checksum_valid) blockers.push(component.dataset_checksum_env + ' must contain a SHA-256 checksum');
  if (approvals.dataset_approved && !checksumApproved) blockers.push(component.id + ' checksum does not match the approval receipt');
  if (!approvals.runtime_approved) blockers.push('runtime approval is missing');
  if (!approvals.comparison_approved) blockers.push('comparison conditions are not approved');
  if (approvals.comparison_approved && !approvals.comparison_conditions_sha256) blockers.push('comparison conditions require a SHA-256 identity in the approval receipt');
  if (!parsedCommand.command) blockers.push(parsedCommand.error ?? component.command_env + ' is not configured');
  if (!runtimeIdentity) blockers.push(component.runtime_identity_env + ' is not configured');
  if (approvals.runtime_approved && !identityApproved) blockers.push(component.id + ' runtime identity does not match the approval receipt');
  return {
    id: component.id,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    score: null,
    metrics: null,
    dataset: { environment_variable: component.dataset_env, checksum_environment_variable: component.dataset_checksum_env, ...dataset, approved_checksum: approvedChecksum, approval_match: checksumApproved },
    runtime: {
      environment_variable: component.command_env,
      identity_environment_variable: component.runtime_identity_env,
      configured: parsedCommand.command !== null && runtimeIdentity !== null,
      identity: runtimeIdentity,
      approved_identity: approvedIdentity,
      approval_match: identityApproved,
      command: parsedCommand.command,
      command_sha256: parsedCommand.command ? sha256(JSON.stringify(parsedCommand.command)) : null,
    },
    blockers,
  };
}

export function blockedStatus(components, approvals) {
  const datasetBlocked = !approvals.dataset_approved || components.some((component) => (
    !component.dataset.configured || !component.dataset.available || !component.dataset.checksum_valid
      || !component.dataset.approval_match
  ));
  return datasetBlocked ? 'blocked_external_dataset' : 'blocked_external_runtime';
}

function validateResult(result, requiredFields, component) {
  const missing = requiredFields.filter((field) => !(field in result));
  if (missing.length) throw new Error('result is missing required fields: ' + missing.join(', '));
  if (typeof result.score !== 'number' || !Number.isFinite(result.score)) throw new Error('result.score must be a finite number');
  if (!result.metrics || typeof result.metrics !== 'object' || Array.isArray(result.metrics)) throw new Error('result.metrics must be an object');
  if (!Number.isInteger(result.sample_count) || result.sample_count < 0) throw new Error('result.sample_count must be a non-negative integer');
  if (typeof result.dataset_revision !== 'string' || !result.dataset_revision) throw new Error('result.dataset_revision must be a non-empty string');
  if (result.dataset_checksum !== component.dataset.checksum) throw new Error('result.dataset_checksum does not match the approved snapshot checksum');
  if (!result.runtime || typeof result.runtime !== 'object' || Array.isArray(result.runtime)) throw new Error('result.runtime must be an object');
  if (result.runtime.identity !== component.runtime.identity) throw new Error('result.runtime.identity does not match the approved runtime identity');
}

function executionError(message, evidence) {
  const error = new Error(message);
  error.evidence = evidence;
  return error;
}

export function executeComponent(component, context) {
  const { taskId, outputDir, requiredFields, environment, timeoutMs } = context;
  const resultFile = path.join(outputDir, taskId + '-' + component.id + '-result.json');
  const stdoutFile = path.join(outputDir, taskId + '-' + component.id + '.stdout.log');
  const stderrFile = path.join(outputDir, taskId + '-' + component.id + '.stderr.log');
  const [executable, ...args] = component.runtime.command;
  fs.rmSync(resultFile, { force: true });
  const startedAt = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const execution = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...environment, GENOS_BENCHMARK_TASK_ID: taskId, GENOS_BENCHMARK_COMPONENT_ID: component.id, GENOS_BENCHMARK_RESULT_FILE: resultFile },
  });
  const evidence = {
    command: component.runtime.command,
    working_directory: repositoryRoot,
    started_at: startedAt,
    duration_ms: Number((Number(process.hrtime.bigint() - startedNs) / 1_000_000).toFixed(3)),
    exit_code: execution.status,
    signal: execution.signal,
    stdout_file: path.basename(stdoutFile),
    stderr_file: path.basename(stderrFile),
    result_file: path.basename(resultFile),
    passed: false,
  };
  fs.writeFileSync(stdoutFile, execution.stdout ?? '');
  fs.writeFileSync(stderrFile, execution.stderr ?? '');
  if (execution.error) throw executionError('could not complete command: ' + execution.error.message, evidence);
  if (execution.status !== 0) throw executionError('command exited with status ' + execution.status, evidence);
  if (!fs.existsSync(resultFile)) throw executionError('command did not write ' + resultFile, evidence);
  let result;
  try {
    result = readJson(resultFile);
    validateResult(result, requiredFields, component);
  } catch (error) {
    throw executionError('invalid component result: ' + error.message, evidence);
  }
  return {
    ...component,
    status: 'executed_pending_audit',
    score: result.score,
    metrics: result.metrics,
    sample_count: result.sample_count,
    dataset_revision: result.dataset_revision,
    dataset_checksum: result.dataset_checksum,
    reported_runtime: result.runtime,
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
    evidence: { ...evidence, passed: true },
    blockers: [],
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
