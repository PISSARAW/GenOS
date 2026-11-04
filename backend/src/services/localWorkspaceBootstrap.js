'use strict';

const path = require('node:path');
const registry = require('./workspaceRegistry');

function sameRoot(left, right) {
  if (!path.isAbsolute(left || '') || !path.isAbsolute(right || '')) return false;
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

function assertScope(row, config) {
  if (row.organization_id !== config.organizationId || row.project_id !== config.projectId) {
    throw Object.assign(new Error('Configured workspace belongs to another tenant.'), {
      code: 'LOCAL_WORKSPACE_SCOPE_CONFLICT'
    });
  }
  return row;
}

async function ensureTenant(db, config) {
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?) ON CONFLICT(id) DO NOTHING',
    config.organizationId, config.organizationId);
  await db.run(`INSERT INTO projects (id,organization_id,name,status) VALUES (?,?,?,'active')
    ON CONFLICT(id) DO NOTHING`, config.projectId, config.organizationId, config.projectId);
  const project = await db.get('SELECT organization_id FROM projects WHERE id=?', config.projectId);
  if (project.organization_id !== config.organizationId) {
    throw Object.assign(new Error('Configured project belongs to another organization.'), {
      code: 'LOCAL_WORKSPACE_SCOPE_CONFLICT'
    });
  }
}

async function adoptUnscopedLegacy(db, row, config) {
  if (row.id !== 'ws-local' || row.organization_id || row.project_id) return assertScope(row, config);
  await ensureTenant(db, config);
  await db.run(`UPDATE workspaces SET organization_id=?,project_id=? WHERE id='ws-local'
    AND path=? AND organization_id IS NULL AND project_id IS NULL`,
    config.organizationId, config.projectId, row.path);
  return assertScope(await db.get("SELECT * FROM workspaces WHERE id='ws-local'"), config);
}

async function claimLegacy(db, config) {
  await db.run(`INSERT INTO workspaces (id,name,path,visibility,language,description,tags,organization_id,project_id)
    VALUES ('ws-local',?,?,'Private','Mixed',?,'[]',?,?) ON CONFLICT(id) DO NOTHING`,
    config.name, config.workspaceRoot, 'Configured local workspace.', config.organizationId, config.projectId);
  return db.get("SELECT * FROM workspaces WHERE id='ws-local'");
}

async function canonicalWorkspace(db, row, config) {
  const scoped = await adoptUnscopedLegacy(db, row, config);
  if (scoped.path === config.workspaceRoot) return scoped;
  await db.run('UPDATE workspaces SET path=? WHERE id=? AND path=?', config.workspaceRoot, scoped.id, scoped.path);
  return {...scoped, path: config.workspaceRoot};
}

async function ensure(db, config) {
  if (!path.isAbsolute(config.workspaceRoot)) throw new Error('Configured workspace root must be absolute.');
  config = {...config, workspaceRoot: path.resolve(config.workspaceRoot)};
  const rows = await db.all('SELECT * FROM workspaces');
  const existing = rows.find(row => row.path === config.workspaceRoot)
    || rows.find(row => sameRoot(row.path, config.workspaceRoot));
  if (existing) return canonicalWorkspace(db, existing, config);
  await ensureTenant(db, config);
  const legacy = await claimLegacy(db, config);
  if (sameRoot(legacy.path, config.workspaceRoot)) return assertScope(legacy, config);
  return registry.registerWorkspace(db, { workspacePath: config.workspaceRoot,
    organizationId: config.organizationId, projectId: config.projectId, name: config.name });
}

module.exports = { ensure, sameRoot };
