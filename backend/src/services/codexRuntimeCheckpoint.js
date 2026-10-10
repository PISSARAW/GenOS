const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vault = require('./secretVault');
const { snapshotRoot, isSafeRelative, assertNoSymlinkPath } = require('./workspaceSnapshotPaths');

const KIND = 'genos-codex-session';
const VERSION = 1;
const MAX_BYTES = 8 * 1024 * 1024;

function invalid(message) {
  return Object.assign(new Error(message), { code: 'CODEX_RUNTIME_CHECKPOINT_INVALID', status: 409 });
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parse(row) {
  if (!row || row.reason !== 'codex-runtime-checkpoint') return null;
  let checkpoint;
  try { checkpoint = JSON.parse(row.state_json || '{}').checkpoint; }
  catch (_) { throw invalid('Codex session checkpoint JSON is invalid.'); }
  assertShape(checkpoint);
  return checkpoint;
}

function assertShape(checkpoint) {
  if (!validIdentity(checkpoint) || !validArchive(checkpoint)) {
    throw invalid('Codex session checkpoint contract is invalid.');
  }
}

function validIdentity(checkpoint) {
  return checkpoint?.kind === KIND && checkpoint.version === VERSION
    && /^[a-f0-9-]{36}$/.test(checkpoint.threadId || '');
}

function validArchive(checkpoint) {
  return /^[a-f0-9]{64}$/.test(checkpoint.hash || '')
    && /^[a-f0-9-]{36}$/.test(checkpoint.archiveId || '')
    && isSafeRelative(checkpoint.sessionPath || '')
    && checkpoint.sessionPath.endsWith(`${checkpoint.threadId}.jsonl`);
}

async function archivePath(workspace, agentId, archiveId) {
  const agentKey = digest(agentId);
  const root = snapshotRoot(workspace.path, workspace.id);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return assertNoSymlinkPath(root, path.join('codex-runtime', agentKey, `${archiveId}.json`));
}

async function workspaceFor(db, workspaceId) {
  const workspace = await db.get('SELECT id, path FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace?.path) throw invalid('Codex session workspace is unavailable.');
  return workspace;
}

function findSession(home, threadId) {
  const root = path.join(home, 'sessions');
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.endsWith(`${threadId}.jsonl`)) {
        return { file, relative: path.relative(root, file) };
      }
    }
  }
  throw invalid('Codex did not persist its completed session.');
}

function readSession(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_BYTES) {
    throw invalid('Codex session exceeds the checkpoint limit.');
  }
  return fs.readFileSync(file, 'utf8');
}

async function save(state) {
  if (!state.db || !state.hasAgentInDb || !state.codexThreadId || !state.codexTurnCompleted
    || !process.env.GENOS_SECRET_KEY || !state.mission.workspaceId) return null;
  const workspace = await workspaceFor(state.db, state.mission.workspaceId);
  const session = findSession(state.isolatedCodexHome, state.codexThreadId);
  const content = readSession(session.file);
  const archiveId = crypto.randomUUID();
  const location = await archivePath(workspace, state.mission.agentId, archiveId);
  fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  fs.writeFileSync(location, JSON.stringify(vault.encrypt(content)), { flag: 'wx', mode: 0o600 });
  const checkpoint = { kind: KIND, version: VERSION, threadId: state.codexThreadId,
    sessionPath: session.relative.split(path.sep).join('/'), archiveId, hash: digest(content) };
  try {
    return await require('./resilienceService').persistIntermediateState(state.db,
      state.mission.agentId, { workspaceId: workspace.id, status: 'completed', checkpoint },
      'codex-runtime-checkpoint');
  } catch (error) {
    fs.rmSync(location, { force: true });
    throw error;
  }
}

async function materialize(db, row, options) {
  const { agentId, home } = options;
  if (row?.agent_id !== agentId) throw invalid('Codex checkpoint agent mismatch.');
  const checkpoint = parse(row);
  if (!checkpoint) return null;
  const workspace = await workspaceFor(db, row.workspace_id);
  const location = await archivePath(workspace, agentId, checkpoint.archiveId);
  let stat;
  try { stat = fs.statSync(location); }
  catch (_) { throw invalid('Codex archive is missing.'); }
  if (!stat.isFile() || stat.size > MAX_BYTES * 2) throw invalid('Codex archive is invalid.');
  let content;
  try { content = vault.decrypt(JSON.parse(fs.readFileSync(location, 'utf8'))); }
  catch (_) { throw invalid('Codex archive cannot be decrypted.'); }
  if (digest(content) !== checkpoint.hash) throw invalid('Codex archive hash does not match.');
  if (home) {
    const destination = path.join(home, 'sessions', checkpoint.sessionPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  }
  return checkpoint;
}

async function captured(db, row, agentId) {
  if (!parse(row)) return null;
  return materialize(db, row, { agentId });
}

async function assertResumeRequest(db, input) {
  if (!input.checkpointId || !input.codexRuntime) throw invalid('Codex runtime adapter is required.');
  const row = await db.get('SELECT * FROM agent_runtime_state WHERE id = ? AND agent_id = ?',
    input.checkpointId, input.agentId);
  if (!row || row.workspace_id !== input.workspaceId) throw invalid('Codex checkpoint owner mismatch.');
  return captured(db, row, input.agentId);
}

async function load(state) {
  const row = await state.db.get('SELECT * FROM agent_runtime_state WHERE id = ? AND agent_id = ?',
    state.mission.resumeCheckpointId, state.mission.agentId);
  if (!row || row.workspace_id !== state.mission.workspaceId) throw invalid('Codex checkpoint owner mismatch.');
  return { row, checkpoint: await materialize(state.db, row, { agentId: state.mission.agentId }) };
}

module.exports = { parse, save, captured, assertResumeRequest, load, materialize };
