const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const snapshotStore = require('./workspaceSnapshotStore');
const { terminateChild } = require('./processTermination');
const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('./sandboxCommandPolicy');
const { normalizeRelativePath } = require('./pathSafety');

const FORBIDDEN_PARTS = new Set(['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage', 'tests', 'test']);
const FORBIDDEN_NAMES = /(^|\/)(Cargo\.toml|Cargo\.lock|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.env[^/]*|.*\.config\.[^/]+|.*(?:^|[._-])(test|spec)(?:[._-]|$).*|.*secret.*|.*credential.*)$/i;
const PROPOSAL_RESPONSE_FORMAT = Object.freeze({ name: 'genos_file_replacement_v1', schema: Object.freeze({
  type: 'object', additionalProperties: false,
  properties: {
    format: { type: 'string', enum: ['genos.file-replacement/v1', 'genos.file-edits/v1'] },
    patches: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object',
      additionalProperties: false, properties: { path: { type: 'string' }, content: { type: 'string' },
        edits: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false,
          properties: { find: { type: 'string', minLength: 1 }, replace: { type: 'string' } }, required: ['find', 'replace'] } } },
      oneOf: [{ required: ['path', 'content'] }, { required: ['path', 'edits'] }] } },
    tests: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } },
    evidence: { type: 'string' }
  }, required: ['format', 'patches', 'tests', 'evidence']
}) });
function safePath(relative) {
  if (typeof relative !== 'string' || relative.length >= 240 || FORBIDDEN_NAMES.test(relative)) return false;
  try {
    const normalized = normalizeRelativePath(relative, 'patch path');
    return !normalized.split('/').some((part) => FORBIDDEN_PARTS.has(part.toLowerCase()));
  } catch (_) {
    return false;
  }
}
function parseProposal(text, usage = {}, options = {}) {
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Local worker did not return a JSON patch proposal.');
    const proposal = JSON.parse(match[0]);
    assertProposalSchema(proposal, options);
    if (proposal.patches.length > 12 || proposal.tests.length < 1 || proposal.tests.length > 2) throw new Error('Patch proposal must contain one or two capsule tests.');
    assertProposalPatches(proposal);
    return proposal;
  } catch (error) {
    const inputTokens = Number(usage.inputTokens || 0);
    const outputTokens = Number(usage.outputTokens || 0);
    throw Object.assign(new Error(`Local code proposal rejected: ${error.message}`), {
      code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
      workerArtifactDiagnostics: { error: error.message, violations: [error.message],
        outputExcerpt: String(text || '').slice(0, 2048) },
      usage: { inputTokens, outputTokens, tokens: inputTokens + outputTokens }
    });
  }
}
function allowedTest(command, allowedCommands) {
  const normalized = normalizeSandboxCommand(command);
  const missionAllowlist = (allowedCommands || []).map(normalizeSandboxCommand);
  return isAllowedSandboxTestCommand(command) && missionAllowlist.includes(normalized);
}
async function resolveTestTempRoot(environment = process.env) {
  const requested = String(environment.GENOS_TEST_TEMP_ROOT || '').trim();
  if (requested && !path.isAbsolute(requested)) {
    throw Object.assign(new Error('GENOS_TEST_TEMP_ROOT must be an absolute writable path.'), {
      code: 'WORKER_TEST_ENVIRONMENT_FAILED', testEnvironment: { kind: 'invalid_temp_root' }
    });
  }
  const root = requested ? path.resolve(requested) : os.tmpdir();
  let probe;
  try {
    await fs.mkdir(root, { recursive: true });
    probe = await fs.mkdtemp(path.join(root, 'genos-test-write-probe-'));
    await fs.rm(probe, { recursive: true, force: true });
    return root;
  } catch (error) {
    if (probe) await fs.rm(probe, { recursive: true, force: true }).catch(() => {});
    throw Object.assign(new Error(`Local test temporary directory is unavailable: ${root}: ${error.message}`), {
      code: 'WORKER_TEST_ENVIRONMENT_FAILED',
      testEnvironment: { kind: 'temp_root_unavailable', root, osCode: error.code || null }
    });
  }
}
async function assertNoSymlinkPath(root, destination) {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, destination);
  let current = resolvedRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Patch path crosses a symlink: ${part}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
async function capturePatchState(workspaceRoot, patches) {
  const state = new Map();
  for (const patch of patches) {
    const normalized = normalizeRelativePath(patch.path, 'patch path');
    if (state.has(normalized)) throw new Error(`Duplicate patch path: ${normalized}`);
    const destination = path.resolve(workspaceRoot, normalized);
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isFile()) throw new Error(`Patch target is not a regular file: ${normalized}`);
      state.set(normalized, { exists: true, content: await fs.readFile(destination), mode: stat.mode & 0o777 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state.set(normalized, { exists: false });
    }
  }
  return state;
}
async function restorePatchState(workspaceRoot, state) {
  for (const [relative, original] of state) {
    const destination = path.resolve(workspaceRoot, relative);
    if (!original.exists) {
      await fs.rm(destination, { force: true });
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, original.content);
    await fs.chmod(destination, original.mode).catch(() => {});
  }
}
async function runTest(command, root) {
  const [program, ...args] = normalizeSandboxCommand(command).split(' ');
  const testTempRoot = await resolveTestTempRoot();
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd: root,
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      env: require('./localCodeTestEnvironment').build(testTempRoot),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = ''; const timer = setTimeout(() => terminateChild(child), 120000);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(0, 20000); }); child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(0, 20000); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ command, exitCode: code, signal, stdout, stderr }); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ command, exitCode: -1, stderr: error.message }); });
  });
}
async function executeProposal({ workspaceRoot, text, usage, allowedCommands, requiredPatchPaths,
  allowedPatchPaths, requiredPatchMarkers, requiredPatchMinimumBytes, db, mission, executionRun }) {
  const proposal = parseProposal(text, usage, { forceFullFileReplacement: mission?.forceFullFileReplacement === true });
  assertAllowedPatchPaths(proposal, allowedPatchPaths);
  try { await materializePatchEdits(workspaceRoot, proposal); }
  catch (error) { throw proposalShapeError(error, text, usage); }
  assertRequiredPatchContract(proposal, requiredPatchPaths, {
    markers: requiredPatchMarkers, minimumBytes: requiredPatchMinimumBytes });
  for (const command of proposal.tests) {
    if (!allowedTest(command, allowedCommands)) throw new Error(`Test command is not allow-listed: ${command}`);
  }
  const beforeFiles = await snapshotStore.collectFiles(workspaceRoot);
  const before = new Map(beforeFiles.map((file) => [file.path, file.hash]));
  const patchState = await capturePatchState(workspaceRoot, proposal.patches);
  let tests;
  try {
    for (const patch of proposal.patches) {
      const destination = path.resolve(workspaceRoot, normalizeRelativePath(patch.path, 'patch path'));
      if (!destination.startsWith(`${path.resolve(workspaceRoot)}${path.sep}`)) throw new Error('Patch escaped its isolated capsule.');
      await assertNoSymlinkPath(workspaceRoot, destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await assertNoSymlinkPath(workspaceRoot, destination);
      await fs.writeFile(destination, patch.content, 'utf8');
    }
    tests = [];
    for (const command of proposal.tests) tests.push(await runTest(command, workspaceRoot));
  } catch (error) {
    await restorePatchState(workspaceRoot, patchState).catch(() => {});
    throw error;
  }
  const after = await snapshotStore.collectFiles(workspaceRoot);
  const changedFileHashes = after.filter((file) => before.get(file.path) !== file.hash)
    .map(({ path: filePath, hash }) => ({ path: filePath, hash }));
  const testExecutionReceipt = db && mission && executionRun?.id
    ? await require('./localCodeTestExecutionReceiptService').recordExecutedBatch(db, {
      missionId: mission.missionId || mission.mission_id || mission.id,
      agentId: mission.agentId, executionRunId: executionRun.id, workspaceRoot,
      tests, workspaceFiles: after, changedFileHashes
    }) : null;
  await require('./localCodeTestScope').enforce({ before: beforeFiles, after, patches: proposal.patches,
    restore: () => restorePatchState(workspaceRoot, patchState), tests, testExecutionReceipt });
  if (tests.some((test) => test.exitCode !== 0)) {
    const retainFailedCandidate = mission?.preserveFailedCodeCandidate === true;
    if (!retainFailedCandidate) await restorePatchState(workspaceRoot, patchState);
    return { proposal: { format: proposal.format, patches: proposal.patches.map(({ path }) => ({ path })), evidence: proposal.evidence }, failedPatchContents: proposal.patches.map(({ path, content }) => ({ path, content })), changedFiles: [], tests, testExecutionReceipt, merged: false, rolledBack: !retainFailedCandidate, testStatus: 'failed' };
  }
  return { proposal: { format: proposal.format, patches: proposal.patches.map(({ path }) => ({ path })), evidence: proposal.evidence },
    changedFiles: changedFileHashes.map((file) => file.path), changedFileHashes, tests,
    testExecutionReceipt, merged: false, testStatus: 'passed' };
}
function responseOptions(options) {
  return Array.isArray(options) ? { allowedCommands: options, requiredPatchPaths: [],
    allowedPatchPaths: [], requiredPatchMarkers: {}, requiredPatchMinimumBytes: {}, forceFullFileReplacement: false }
    : { allowedCommands: options?.allowedCommands || [], requiredPatchPaths: options?.requiredPatchPaths || [],
      allowedPatchPaths: options?.allowedPatchPaths || [],
      requiredPatchMarkers: options?.requiredPatchMarkers || {},
      requiredPatchMinimumBytes: options?.requiredPatchMinimumBytes || {},
      forceFullFileReplacement: options?.forceFullFileReplacement === true };
}

function assertAllowedPatchPaths(proposal, allowedPaths) {
  if (!Array.isArray(allowedPaths) || !allowedPaths.length) return;
  const permitted = new Set(allowedPaths.filter(safePath));
  const rejected = proposal.patches.map(({ path: patchPath }) => patchPath)
    .filter((patchPath) => !permitted.has(patchPath));
  if (rejected.length) throw new Error(`Patch paths are outside the workspace-context allowlist: ${rejected.join(', ')}`);
}

function proposalResponseFormat(options = {}) {
  const resolved = responseOptions(options);
  const commands = [...new Set(resolved.allowedCommands.map(normalizeSandboxCommand)
    .filter(isAllowedSandboxTestCommand))];
  const paths = [...new Set(resolved.requiredPatchPaths.filter(safePath))].slice(0, 12);
  const allowedPaths = [...new Set(resolved.allowedPatchPaths.filter(safePath))].slice(0, 12);
  if (!commands.length && !paths.length && !allowedPaths.length && !resolved.forceFullFileReplacement) return PROPOSAL_RESPONSE_FORMAT;
  const format = JSON.parse(JSON.stringify(PROPOSAL_RESPONSE_FORMAT));
  if (resolved.forceFullFileReplacement) {
    format.schema.properties.format.enum = ['genos.file-replacement/v1'];
    format.schema.properties.patches.items.properties = { path: { type: 'string' }, content: { type: 'string' } };
    delete format.schema.properties.patches.items.oneOf;
    format.schema.properties.patches.items.required = ['path', 'content'];
  }
  if (commands.length) format.schema.properties.tests.items.enum = commands;
  if (allowedPaths.length) format.schema.properties.patches.items.properties.path.enum = allowedPaths;
  if (paths.length) {
    format.schema.properties.patches.minItems = paths.length;
    format.schema.properties.patches.maxItems = paths.length;
    format.schema.properties.patches.items.properties.path.enum = paths;
    format.schema.properties.patches.allOf = paths.map((requiredPath) => {
      const content = { type: 'string', minLength: resolved.requiredPatchMinimumBytes[requiredPath] || 0 };
      const markers = markerPatterns(resolved.requiredPatchMarkers[requiredPath]);
      if (markers.length) content.allOf = markers;
      return { contains: { type: 'object', properties: { path: { const: requiredPath }, content },
        required: ['path'] } };
    });
  }
  return format;
}

function markerPatterns(markers) {
  return (Array.isArray(markers) ? markers : []).map((marker) => ({
    pattern: String(marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }));
}

module.exports = { safePath, parseProposal, executeProposal, assertNoSymlinkPath, capturePatchState,
  restorePatchState, proposalResponseFormat, assertRequiredPatchContract, assertAllowedPatchPaths, resolveTestTempRoot };

function assertProposalSchema(proposal, options = {}) {
  const allowedFormats = options.forceFullFileReplacement
    ? ['genos.file-replacement/v1'] : ['genos.file-replacement/v1', 'genos.file-edits/v1'];
  if (!proposal || Object.keys(proposal).some((key) => !['format', 'patches', 'tests', 'evidence'].includes(key)) || !allowedFormats.includes(proposal.format) || !Array.isArray(proposal.patches) || !Array.isArray(proposal.tests) || typeof proposal.evidence !== 'string') throw new Error('Patch proposal violates the strict schema.');
  assertProposalLists(proposal);
  assertProposalPatches(proposal, options);
}

function assertProposalLists(proposal) {
  if (proposal.patches.length < 1 || proposal.patches.length > 12) throw new Error('Patch proposal must contain 1-12 patches.');
  if (proposal.tests.length < 1 || proposal.tests.length > 2
    || !proposal.tests.every(command => typeof command === 'string')) throw new Error('Patch proposal must contain one or two capsule test commands.');
}

function assertProposalPatches(proposal, options = {}) {
  for (const patch of proposal.patches) {
    if (options.forceFullFileReplacement && (!Object.hasOwn(patch || {}, 'content') || Object.hasOwn(patch || {}, 'edits'))) {
      throw new Error(`Full-file replacement is required for '${patch?.path || '<unknown>'}' after an ambiguous anchor.`);
    }
    if (!patch || Object.keys(patch).some((key) => !['path', 'content', 'edits'].includes(key)) || !safePath(patch.path)) throw new Error(`Unsafe patch proposal for '${patch?.path || '<unknown>'}'.`);
    const hasContent = typeof patch.content === 'string' && !Object.hasOwn(patch, 'edits');
    const hasEdits = Array.isArray(patch.edits) && !Object.hasOwn(patch, 'content')
      && patch.edits.length > 0 && patch.edits.length <= 8
      && patch.edits.every((edit) => edit && Object.keys(edit).every((key) => ['find', 'replace'].includes(key))
        && typeof edit.find === 'string' && edit.find.length > 0 && Buffer.byteLength(edit.find) <= 10000
        && typeof edit.replace === 'string' && Buffer.byteLength(edit.replace) <= 10000);
    if ((!hasContent && !hasEdits) || (hasContent && Buffer.byteLength(patch.content) > 200000)) {
      throw new Error(`Unsafe patch proposal for '${patch.path}'. Provide either full content or bounded exact edits.`);
    }
  }
}

function proposalShapeError(error, text, usage = {}) {
  const detail = error.message || String(error);
  const inputTokens = Number(usage.inputTokens || 0);
  const outputTokens = Number(usage.outputTokens || 0);
  return Object.assign(new Error(`Local code proposal rejected: ${detail}`), {
    code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
    workerArtifactDiagnostics: { error: detail, violations: [detail], outputExcerpt: String(text || '').slice(0, 2048) },
    usage: { inputTokens, outputTokens, tokens: inputTokens + outputTokens }
  });
}

async function materializePatchEdits(workspaceRoot, proposal) {
  for (const patch of proposal.patches) {
    if (!Array.isArray(patch.edits)) continue;
    const target = path.resolve(workspaceRoot, normalizeRelativePath(patch.path, 'patch path'));
    if (!target.startsWith(`${path.resolve(workspaceRoot)}${path.sep}`)) throw new Error('Patch escaped its isolated capsule.');
    await assertNoSymlinkPath(workspaceRoot, target);
    let content = await fs.readFile(target, 'utf8');
    for (const edit of patch.edits) {
      const first = content.indexOf(edit.find);
      if (first < 0 || content.indexOf(edit.find, first + edit.find.length) >= 0) {
        throw new Error(`Exact edit anchor must occur once in '${patch.path}'.`);
      }
      content = content.slice(0, first) + edit.replace + content.slice(first + edit.find.length);
    }
    patch.content = content;
    delete patch.edits;
  }
}

function assertRequiredPatchContract(proposal, requiredPaths = [], requirements = {}) {
  const paths = [...new Set((requiredPaths || []).map((item) => normalizeRelativePath(item, 'required patch path')))];
  const patches = new Map(proposal.patches.map((patch) => [normalizeRelativePath(patch.path, 'patch path'), patch]));
  if (paths.length && (patches.size !== paths.length || paths.some((item) => !patches.has(item)))) {
    throw new Error(`Patch proposal does not match required paths: ${paths.join(', ')}.`);
  }
  assertRequiredMarkers(patches, requirements.markers);
  assertMinimumBytes(patches, requirements.minimumBytes);
}

function assertRequiredMarkers(patches, requiredMarkers = {}) {
  for (const [relative, markers] of Object.entries(requiredMarkers)) {
    const patch = patches.get(normalizeRelativePath(relative, 'required marker path'));
    const missing = (Array.isArray(markers) ? markers : []).filter((marker) => !patch?.content.includes(marker));
    if (missing.length) throw new Error(`Patch '${relative}' is missing required markers: ${missing.join(', ')}.`);
  }
}

function assertMinimumBytes(patches, minimumBytes = {}) {
  for (const [relative, minimum] of Object.entries(minimumBytes)) {
    const patch = patches.get(normalizeRelativePath(relative, 'required size path'));
    if (!Number.isSafeInteger(minimum) || minimum < 0) throw new Error(`Invalid minimum patch size for '${relative}'.`);
    if (!patch || Buffer.byteLength(patch.content, 'utf8') < minimum) {
      throw new Error(`Patch '${relative}' is smaller than the required ${minimum} UTF-8 bytes.`);
    }
  }
}
