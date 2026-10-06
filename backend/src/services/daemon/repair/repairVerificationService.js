'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const snapshots = require('../../workspaceSnapshotStore');
const { ensureStore } = require('../verification/observationReceiptService');
const binding = require('./repairSnapshotBinding');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function loadContext(db, input) {
  const episode = await db.get('SELECT * FROM daemon_repair_episodes WHERE id = ?', input.id);
  if (episode?.status !== 'CLAIMED' || episode.worker_id !== input.workerId) throw new Error('claimed-worker-required');
  if (Date.parse(episode.expires_at) <= Date.now()) throw new Error('lease-expired');
  const territory = await db.get('SELECT * FROM daemon_territories WHERE id = ?', episode.territory_id);
  if (territory.head_sha !== episode.head_sha) throw new Error('repair-head-stale');
  const reference = await db.get('SELECT workspace_id FROM workspace_snapshots WHERE id = ?', input.snapshotId);
  if (!reference) throw new Error('repair-snapshot-required');
  const snapshot = await snapshots.getSnapshot(db, reference.workspace_id, input.snapshotId);
  await binding.assertBound(db, { episode, territory, snapshot, command: input.command });
  return { episode, territory, snapshot };
}

async function verifyRepair(db, input) {
  if (!input?.id || !input.workerId || !input.snapshotId || !input.command) return { verified: false, reason: 'verification-input-required' };
  const context = await loadContext(db, input);
  const runs = [];
  for (let repeat = 0; repeat < 2; repeat += 1) {
    const run = await snapshots.runInSnapshot({ snapshot: context.snapshot, command: input.command,
      workspacePath: context.snapshot.workspace_path });
    runs.push({ exitCode: run.exitCode, truncated: run.truncated, outputHash: digest(run.stdout + run.stderr) });
  }
  if (!runs.every((run) => run.exitCode === 0 && run.truncated === false)) return { verified: false, reason: 'post-repair-check-failed', runs };
  const payload = { apiVersion: 'genos.daemon-repair-verification/v1', episodeId: input.id,
    workerId: input.workerId, headSha: context.episode.head_sha, snapshotId: context.snapshot.id,
    snapshotHash: context.snapshot.snapshot_hash, workspacePath: path.resolve(context.episode.workspace_path),
    command: input.command, verifiedAt: new Date().toISOString(), runs };
  const json = JSON.stringify(payload);
  const verificationId = `daemon-repair-${digest(json)}`;
  await ensureStore(db);
  await db.run(`INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, payload_json)
    VALUES (?, 'daemon_repair_verification', ?, ?, ?)`, verificationId, input.id, digest(json), json);
  return { verified: true, verificationId, runs };
}

async function verifiedReceipt(db, query) {
  if (!query.verificationId) return false;
  await ensureStore(db);
  const row = await db.get('SELECT * FROM provenance_records WHERE id = ?', query.verificationId);
  if (row?.subject_type !== 'daemon_repair_verification' || row.subject_id !== query.episode.id) return false;
  if (digest(row.payload_json) !== row.payload_hash) return false;
  const payload = JSON.parse(row.payload_json);
  const matches = matchesEpisode(payload, query.episode);
  if (!matches) return false;
  const snapshot = await db.get('SELECT snapshot_hash FROM workspace_snapshots WHERE id = ?', payload.snapshotId);
  if (snapshot?.snapshot_hash !== payload.snapshotHash) return false;
  const territory = await db.get('SELECT head_sha FROM daemon_territories WHERE id = ?', query.episode.territoryId);
  if (territory?.head_sha !== payload.headSha) return false;
  const episode = await db.get('SELECT * FROM daemon_repair_episodes WHERE id = ?', query.episode.id);
  const fullTerritory = await db.get('SELECT * FROM daemon_territories WHERE id = ?', query.episode.territoryId);
  const storedSnapshot = await snapshots.getSnapshot(db, fullTerritory.workspace_id, payload.snapshotId);
  try { await binding.assertBound(db, { episode, territory: fullTerritory, snapshot: storedSnapshot, command: payload.command }); return true; }
  catch (_) { return false; }
}

function episodeIdentityMatches(payload, episode) {
  return payload.apiVersion === 'genos.daemon-repair-verification/v1' && payload.episodeId === episode.id
    && payload.workerId === episode.workerId && payload.headSha === episode.headSha
    && payload.workspacePath === path.resolve(episode.workspacePath || '');
}

function matchesEpisode(payload, episode) {
  const createdAt = String(episode.createdAt).replace(' ', 'T').replace(/Z?$/, 'Z');
  return episodeIdentityMatches(payload, episode) && Date.parse(payload.verifiedAt) >= Date.parse(createdAt)
    && Array.isArray(payload.runs) && payload.runs.length >= 2
    && payload.runs.every((run) => run.exitCode === 0 && run.truncated === false);
}

module.exports = { verifyRepair, verifiedReceipt };
