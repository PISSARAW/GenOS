'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {resolveContainedPathNoSymlinkSync} = require('../pathSafety');

async function activeRoots(input) {
  const {db, owner, agentId} = input;
  if (!owner.workspace_id) return [];
  const exists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='gqwf_execution_sessions'");
  if (!exists) return [];
  const rows = await db.all(`SELECT s.materialized_path, l.id, l.execution_path
    FROM gqwf_execution_sessions s JOIN gqwf_leases l ON l.id=s.lease_id
    JOIN strategy_execution_runs r ON r.id=s.execution_run_id
    WHERE s.agent_id=? AND s.workspace_id=? AND l.workspace_id=s.workspace_id
      AND r.agent_id=s.agent_id AND r.status='running'
      AND s.status='materialized' AND l.status='open'`, agentId, owner.workspace_id);
  const roots = [];
  for (const row of rows) {
    const root = await ownedRoot(owner.path, row);
    if (root) roots.push(root);
  }
  return roots;
}

async function ownedRoot(workspace, row) {
  if (!/^[a-f0-9-]{36}$/.test(row.id)) return null;
  try {
    const relative = '.genos/gqwf/materialized/lease-' + row.id;
    const root = resolveContainedPathNoSymlinkSync(workspace, relative + '/root', 'worker replay root');
    if (path.resolve(row.materialized_path) !== root || path.resolve(row.execution_path) !== root) return null;
    const marker = resolveContainedPathNoSymlinkSync(workspace, relative + '/.genos-gqwf-lease', 'worker replay lease');
    const stat = await fs.lstat(marker);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== row.id.length) return null;
    return await fs.readFile(marker, 'utf8') === row.id ? root : null;
  } catch (_) {return null;}
}

module.exports = {activeRoots};
