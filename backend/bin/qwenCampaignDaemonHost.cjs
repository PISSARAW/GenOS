'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const territories = require('../src/services/daemon/daemonTerritoryService');
const handoffs = require('../src/services/daemon/handoff/handoffCompilerService');
const { migrateDaemonEvents } = require('../src/db/migrations/migrateDaemonEvents');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');

async function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  process.env.GENOS_DB_PATH = filename;
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  const priorPassword = process.env.GENOS_ADMIN_PASSWORD;
  if (!priorPassword) process.env.GENOS_ADMIN_PASSWORD = crypto.randomBytes(32).toString('base64url');
  try {
    const db = await require('../src/db').getDatabase(filename);
    await migrateGvxLedger(db);
    return db;
  } finally {
    if (!priorPassword) delete process.env.GENOS_ADMIN_PASSWORD;
  }
}

async function closeDatabase() {
  await require('../src/db').closeDatabase();
}

function scratchRoot() {
  if (process.env.OPENCODE_TMP_DIR) return process.env.OPENCODE_TMP_DIR;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode');
  return path.join(os.tmpdir(), 'opencode');
}

function worktreePath(campaignId) {
  const safe = campaignId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64);
  return path.join(scratchRoot(), `${safe}-daemon-worktree`);
}

function createReadOnlyWorktree(options) {
  const target = worktreePath(options.campaignId);
  if (fs.existsSync(target)) throw new Error(`Qwen campaign worktree already exists: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync('git', ['worktree', 'add', '--detach', target, options.headSha], { cwd: ROOT, stdio: 'ignore' });
  return target;
}

function removeReadOnlyWorktree(target) {
  if (target && fs.existsSync(target)) {
    execFileSync('git', ['worktree', 'remove', target], { cwd: ROOT, stdio: 'ignore' });
  }
}

function territoryInput(config, rootPath, armName) {
  const arm = config.armScopes[armName];
  return { id: `territory.${config.territorySlug}-${armName}`,
    organizationId: arm.organizationId, projectId: arm.projectId, workspaceId: arm.workspaceId,
    repoIdentity: `genos-head-${config.headSha}`, rootPath, scopePath: 'backend/src/services/shev',
    ref: config.headSha, headSha: config.headSha,
    state: armName === 'treatment' ? 'BOOTSTRAPPING' : 'ACTIVE' };
}

async function registerTerritories(db, config, rootPath) {
  await migrateDaemonEvents(db);
  const cold = await territories.createTerritory(db, territoryInput(config, rootPath, 'control'));
  const warm = await territories.createTerritory(db, territoryInput(config, rootPath, 'treatment'));
  if (!cold.found || !warm.found) throw new Error('Daemon campaign territories could not be registered.');
  return { cold: cold.territory, warm: warm.territory };
}

function daemonEnvironment(dbPath) {
  const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'COMSPEC'];
  const environment = Object.fromEntries(allowed.filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]));
  return { ...environment, GENOS_DB_PATH: dbPath, GENOS_DB_BOOTSTRAP_SKIP: '1',
    GENOS_DB_BACKUP_SKIP: '1', GENOS_DISABLE_DOTENV: '1', GENOS_STORAGE_BACKEND: 'sqlite' };
}

function appendDaemonLog(daemon, channel, chunk) {
  daemon.output = `${daemon.output}\n${channel}: ${chunk.toString()}`.slice(-6000);
}

function spawnDaemonHost(config, territory) {
  const script = path.join(ROOT, 'backend', 'bin', 'genos-daemon.cjs');
  const child = spawn(process.execPath, [script, '--territory', territory.id,
    '--daemon-id', config.daemonId], { cwd: ROOT, env: daemonEnvironment(config.dbPath),
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const daemon = { child, daemonId: config.daemonId, output: '', exit: null, spawnError: null };
  child.on('error', (error) => { daemon.spawnError = error; });
  child.stdout.on('data', (chunk) => appendDaemonLog(daemon, 'stdout', chunk));
  child.stderr.on('data', (chunk) => appendDaemonLog(daemon, 'stderr', chunk));
  daemon.exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => {
    daemon.exit = { code, signal };
    resolve(daemon.exit);
  }));
  return daemon;
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitForDaemonIndex(options) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (options.daemon.spawnError) throw options.daemon.spawnError;
    const state = await options.db.get(`SELECT activity FROM daemon_runtime_state WHERE daemon_id = ?`,
      options.daemon.daemonId);
    const stored = await territories.getTerritory(options.db, { id: options.territoryId });
    if (state?.activity === 'DORMANT' && stored.territory?.indexedHeadSha === options.expectedHeadSha) {
      return { cycle: 'daemon-host-bootstrap', indexedHeadSha: stored.territory.indexedHeadSha };
    }
    if (options.daemon.exit) throw new Error(`Resident daemon exited before indexing: ${options.daemon.output}`);
    await delay(500);
  }
  throw new Error(`Resident daemon indexing timed out: ${options.daemon.output}`);
}

function safeBrief(brief) {
  return { briefId: brief.briefId, territoryId: brief.territoryId, headSha: brief.headSha,
    relevanceClass: brief.relevanceClass, summary: brief.summary,
    activePhenotypes: brief.activePhenotypes,
    architecturePaths: (brief.relevantArchitectureRefs || []).map((item) => item.path),
    testPaths: brief.relevantTests || [], stalenessWarnings: brief.stalenessWarnings || [] };
}

async function startResidentDaemon(db, config, rootPath) {
  const { cold, warm } = await registerTerritories(db, config, rootPath);
  const daemon = spawnDaemonHost(config, warm);
  try {
    const cycle = await waitForDaemonIndex({ db, daemon, territoryId: warm.id,
      expectedHeadSha: warm.headSha });
    const compiled = await handoffs.compileBrief(db, { territoryId: warm.id,
      mission: 'Inspect SHEV developmental pressure and held-out progress contracts.' });
    if (compiled.compiled !== true) throw new Error(`Resident daemon handoff failed: ${compiled.reason || 'unknown'}`);
    return { ...daemon, context: safeBrief(compiled.brief),
      receipt: { daemonId: config.daemonId, coldTerritoryId: cold.id,
        warmTerritoryId: warm.id, headSha: warm.headSha,
        cycle: cycle.cycle, indexedHeadSha: cycle.indexedHeadSha,
        indexedFiles: compiled.brief.summary.files, briefId: compiled.brief.briefId } };
  } catch (error) {
    await stopDaemon(daemon);
    throw error;
  }
}

async function stopDaemon(daemon) {
  if (!daemon?.child || daemon.exit) return;
  daemon.child.kill('SIGINT');
  const stopped = await Promise.race([daemon.exitPromise.then(() => true), delay(12000).then(() => false)]);
  if (!stopped) daemon.child.kill('SIGTERM');
  if (!stopped) await Promise.race([daemon.exitPromise, delay(3000)]);
}

module.exports = { openDatabase, closeDatabase, createReadOnlyWorktree,
  removeReadOnlyWorktree, startResidentDaemon, stopDaemon };
