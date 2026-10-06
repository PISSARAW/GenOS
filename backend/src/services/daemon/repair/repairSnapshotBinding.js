'use strict';

const path = require('node:path');
const fs = require('node:fs');
const snapshots = require('../../workspaceSnapshotStore');
const gate = require('../findings/findingEvidenceGateService');

const contentKey = (files) => JSON.stringify(files.map((file) => [file.path, file.hash, file.size]).sort());

function assertIsolated(episode, territory) {
  const capsule = fs.realpathSync(episode.workspace_path);
  const relative = path.relative(fs.realpathSync(territory.root_path), capsule);
  const outside = relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
  if (!outside) throw new Error('isolated-workspace-required');
  return capsule;
}

async function causalBinding(db, context) {
  const episode = context.episode;
  const error = await gate.transitionError(db, { id: episode.finding_id, toStatus: 'REPAIRABLE' });
  if (error) throw new Error(error);
  const evidence = await db.get(`SELECT p.payload_json FROM daemon_finding_evidence e
    JOIN provenance_records p ON p.id = e.provenance_record_id
    WHERE e.finding_id = ? AND e.evidence_type = 'causal' AND e.side = 'supporting'
      AND p.subject_type = 'daemon_causal_run' ORDER BY e.id DESC LIMIT 1`, episode.finding_id);
  if (!evidence) throw new Error('controlled-causal-receipt-required');
  return JSON.parse(evidence.payload_json);
}

function changedPaths(before, after) {
  const left = new Map(before.files.map((file) => [file.path, file.hash]));
  const right = new Map(after.files.map((file) => [file.path, file.hash]));
  return [...new Set([...left.keys(), ...right.keys()])].filter((file) => left.get(file) !== right.get(file));
}

function withinScope(episode, file) {
  const scope = episode.scope_value.replace(/^[/\\]+|[/\\]+$/g, '').replaceAll('\\', '/');
  if (['file', 'test', 'symbol'].includes(episode.scope_type)) return file === scope;
  if (episode.scope_type === 'cross-cutting') return false;
  return file === scope || file.startsWith(scope + '/');
}

async function assertBound(db, context) {
  const capsule = assertIsolated(context.episode, context.territory);
  if (context.snapshot.workspace_id !== context.territory.workspace_id) throw new Error('repair-snapshot-workspace-mismatch');
  const manifest = await snapshots.readManifest(context.snapshot);
  if (contentKey(await snapshots.collectFiles(capsule)) !== contentKey(manifest.files)) throw new Error('repair-capsule-changed');
  const causal = await causalBinding(db, context);
  if (context.command !== causal.command) throw new Error('repair-command-mismatch');
  const baseline = await snapshots.getSnapshot(db, causal.workspaceId, causal.baselineSnapshotId);
  const paths = changedPaths(await snapshots.readManifest(baseline), manifest);
  if (!paths.length || !paths.every((file) => withinScope(context.episode, file))) throw new Error('repair-scope-mismatch');
  return { capsule, paths };
}

module.exports = { assertBound };
