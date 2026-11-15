'use strict';

/**
 * Git-backed territorial observer for ResidentDaemon hosts.
 * It turns real HEAD and worktree changes into durable daemon events.
 * The event log stores the last fingerprint so a host restart does not
 * replay an unchanged dirty worktree.
 */

const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const eventBridge = require('./daemonEventBridgeService');
const territoryService = require('./daemonTerritoryService');
const { migrateDaemonEvents } = require('../../db/migrations/migrateDaemonEvents');
const { migrateDaemonEventPayload } = require('../../db/migrations/migrateDaemonEventPayload');

const execFileAsync = promisify(execFile);
const MAX_CHANGED_FILES = 200;
const GIT_TIMEOUT_MS = 10000;

async function execGit(rootPath, args) {
  const result = await execFileAsync('git', ['-C', rootPath, ...args], {
    encoding: 'utf8', timeout: GIT_TIMEOUT_MS, windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return result.stdout || '';
}

function safePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/')) return null;
  if (/^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) return null;
  return normalized;
}

function parseStatus(output) {
  const tokens = String(output || '').split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const status = token.slice(0, 2);
    const file = safePath(token.slice(3));
    if (file) entries.push({ status, file });
    if (/[RC]/.test(status)) {
      const previous = safePath(tokens[index + 1]);
      if (previous) entries.push({ status: `${status}:source`, file: previous });
      index += 1;
    }
  }
  return entries;
}

function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    headSha: snapshot.headSha, entries: snapshot.entries
  })).digest('hex');
}

async function repositorySnapshot(rootPath) {
  const [head, status] = await Promise.all([
    execGit(rootPath, ['rev-parse', 'HEAD']),
    execGit(rootPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  ]);
  const headSha = head.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error('Repository HEAD is unavailable');
  const entries = parseStatus(status);
  const snapshot = { headSha, entries, files: [...new Set(entries.map((entry) => entry.file))] };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

async function filesBetween(rootPath, heads) {
  if (!/^[a-f0-9]{40}$/.test(heads.oldHead || '') || !/^[a-f0-9]{40}$/.test(heads.newHead || '')) return null;
  try {
    const output = await execGit(rootPath, ['diff', '--name-only', '-z', '--no-renames',
      `${heads.oldHead}..${heads.newHead}`]);
    const files = output.split('\0').map(safePath).filter(Boolean);
    return files.length <= MAX_CHANGED_FILES ? files : null;
  } catch (_) {
    return null;
  }
}

async function latestFingerprint(db, territoryId) {
  await migrateDaemonEvents(db);
  await migrateDaemonEventPayload(db);
  const rows = await db.all(`SELECT payload_json FROM daemon_events
    WHERE territory_id = ? AND event_type = 'TERRITORY_FILE_CHANGED'
    ORDER BY id DESC LIMIT 20`, territoryId);
  for (const row of rows || []) {
    try {
      const value = JSON.parse(row.payload_json || '{}').observerFingerprint;
      if (/^[a-f0-9]{64}$/.test(value || '')) return value;
    } catch (_) {}
  }
  return null;
}

async function createObserver(input) {
  if (!input?.db || !input.territoryId || !input.rootPath) throw new Error('Repository observer context is incomplete');
  return {
    db: input.db,
    territoryId: input.territoryId,
    rootPath: input.rootPath,
    bridge: eventBridge.createBridge({ db: input.db }),
    lastFingerprint: await latestFingerprint(input.db, input.territoryId)
  };
}

async function observeHead(observer, snapshot) {
  const stored = await territoryService.getTerritory(observer.db, { id: observer.territoryId });
  if (!stored.found || stored.territory.headSha === snapshot.headSha) return null;
  const changedFiles = await filesBetween(observer.rootPath, {
    oldHead: stored.territory.headSha, newHead: snapshot.headSha
  });
  return eventBridge.ingestEvent(observer.bridge, {
    type: 'TERRITORY_COMMIT', territoryId: observer.territoryId,
    rootPath: observer.rootPath, headSha: snapshot.headSha,
    payload: { changedFiles, source: 'repository-observer' }
  });
}

async function observeWorktree(observer, snapshot) {
  const changed = observer.lastFingerprint !== snapshot.fingerprint;
  observer.lastFingerprint = snapshot.fingerprint;
  if (!changed || snapshot.files.length === 0) return null;
  const bounded = snapshot.files.length <= MAX_CHANGED_FILES ? snapshot.files : [];
  return eventBridge.ingestEvent(observer.bridge, {
    type: 'TERRITORY_FILE_CHANGED', territoryId: observer.territoryId,
    rootPath: observer.rootPath,
    payload: {
      files: bounded,
      observerFingerprint: snapshot.fingerprint,
      source: 'repository-observer',
      truncated: snapshot.files.length > MAX_CHANGED_FILES
    }
  });
}

async function observeRepository(observer) {
  const snapshot = await repositorySnapshot(observer.rootPath);
  const head = await observeHead(observer, snapshot);
  const worktree = await observeWorktree(observer, snapshot);
  return { observed: true, head, worktree, snapshot };
}

module.exports = {
  MAX_CHANGED_FILES,
  createObserver,
  observeRepository,
  parseStatus,
  repositorySnapshot
};
