const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { sanitizeString } = require('../middleware/security');

function coalesce(first, second) {
  if (first != null) return first;
  return second;
}

function firstReference(first, second, third) {
  return coalesce(coalesce(first, second), third);
}

function bodyReference(body) {
  return firstReference(body && body.stepNumber, body && body.step, body && body.snapshotId);
}

function queryReference(query) {
  return firstReference(query.step, query.stepNumber, query.snapshotId);
}

function usernameOf(req) {
  return (req.user && req.user.username) || 'studio';
}

function bodyField(body, key, fallback) {
  return (body && body[key]) || fallback;
}

function tenantScope(tenant) {
  if (tenant) {
    return { clause: 'organization_id = ? AND project_id = ?', params: [tenant.organizationId, tenant.projectId] };
  }
  return { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
}

function tenantColumn(tenant, key) {
  if (!tenant) return null;
  return tenant[key] || null;
}

function tenantSuffix(tenant) {
  if (!tenant) return '';
  const key = `${tenant.organizationId}:${tenant.projectId}`;
  return `-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}

function workspacePathFor(root, name, tenant) {
  if (!tenant) return path.join(root, name);
  const organization = tenant.organizationId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const project = tenant.projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(root, '.genos-tenants', organization, project, name);
}

function fieldOr(value, fallback) {
  return value || fallback;
}

function rowCount(row) {
  return (row && row.count) || 0;
}

function requiresTenantScope(headers, tenant) {
  return (headers['x-organization-id'] || headers['x-project-id']) && !tenant;
}

function cleanTextField(value, trim) {
  if (typeof value !== 'string') return value;
  const cleaned = sanitizeString(value);
  return trim ? cleaned.trim() : cleaned;
}

function isValidWorkspaceName(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(name)
    && path.basename(name) === name
    && name !== '.'
    && name !== '..';
}

function hasInvalidWorkspaceFields(language, description, visibility) {
  return typeof language !== 'string'
    || !language
    || language.length > 64
    || typeof description !== 'string'
    || description.length > 10000
    || !['Private', 'Public'].includes(visibility);
}

function buildCleanTags(tags, language) {
  if (!Array.isArray(tags)) return [language.toLowerCase()];
  return tags.map((tag) => (typeof tag === 'string' ? sanitizeString(tag) : String(tag)));
}

function parseTags(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

async function countRows(db, sql, id) {
  const row = await db.get(sql, id);
  return (row && row.count) || 0;
}

function branchIdOf(metadata) {
  return metadata.branchId || metadata.branch_id;
}

function workspaceCategories(workspace) {
  const categories = [];
  if (workspace.is_archived) {
    categories.push('Archived/Sleeping Workspaces');
  } else {
    categories.push('Active Swarms (Supervised)');
  }
  if (workspace.name.includes('-fork') || workspace.name.includes('_fork')) {
    categories.push('Experimental Timelines (Forks)');
  } else {
    categories.push('Root Universes');
  }
  return categories;
}

function prepareWorkspaceDirectory(wsPath) {
  if (!fs.existsSync(wsPath)) {
    fs.mkdirSync(wsPath, { recursive: true });
  }
  const markerPath = path.join(wsPath, '.genos-workspace');
  if (!fs.existsSync(markerPath)) fs.writeFileSync(markerPath, 'GenOS managed workspace\n');
}

function hasHashDiff(baseFiles, targetFiles, file) {
  const base = baseFiles.get(file);
  const target = targetFiles.get(file);
  return (base && base.hash) !== (target && target.hash);
}

function parseDiffLines(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch (_) {
    return [];
  }
}

function lineKind(line) {
  return line.type || line.kind;
}

function lineValue(line) {
  return line.content || line.text || line;
}

function countDiffLines(lines, kind, prefix) {
  return lines.filter((line) => lineKind(line) === kind || String(lineValue(line)).startsWith(prefix)).length;
}

function trajectoryEntry(trajectory) {
  const lines = parseDiffLines(trajectory.diff_lines);
  return {
    file: trajectory.diff_file || 'unknown',
    category: 'Trajectory',
    additions: countDiffLines(lines, 'addition', '+'),
    deletions: countDiffLines(lines, 'deletion', '-'),
    collisionRisk: 'UNKNOWN',
    author: trajectory.author_name,
    notes: trajectory.title
  };
}

function snapshotDiffEntries(snapshots) {
  const entries = [];
  for (const snapshot of snapshots) {
    if (!snapshot.diff_summary) continue;
    entries.push({ file: snapshot.label, category: 'Snapshot', additions: 0, deletions: 0, collisionRisk: 'UNKNOWN', author: snapshot.author, notes: snapshot.diff_summary });
  }
  return entries;
}

function durableHistory(rows) {
  return rows.filter((row) => {
    try {
      const metadata = JSON.parse(row.metadata || '{}');
      return metadata.storage === 'durable-filesystem' && metadata.manifestPath && fs.existsSync(metadata.manifestPath);
    } catch (_) {
      return false;
    }
  });
}

function bisectionTimeout(timeoutMs) {
  return Math.min(Number(timeoutMs) || 30000, 120000);
}

function respondNotFound(res, id) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
}

function respondInvalidName(res) {
  return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workspace name must be 1-128 safe filename characters.' } });
}

function respondInvalidFields(res) {
  return res.status(400).json({ error: { code: 'INVALID_WORKSPACE_FIELDS', message: 'language, description, and visibility are invalid.' } });
}

function respondMissingBranches(res) {
  return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
}

function respondBisectionInput(res) {
  return res.status(400).json({ error: { code: 'BISECTION_INPUT_REQUIRED', message: 'workspaceId and testCommand are required.' } });
}

function respondBisectionCommand(res) {
  return res.status(400).json({ error: { code: 'TEST_COMMAND_NOT_ALLOWED', message: 'testCommand must be one of the allow-listed test commands (npm test, npm run check, pytest, cargo test).' } });
}

function respondHistoryTooLarge(res, max) {
  return res.status(413).json({ error: { code: 'BISECTION_HISTORY_TOO_LARGE', message: `Snapshot history exceeds the ${max}-snapshot bisection limit.` } });
}

function respondNoDurableSnapshots(res) {
  return res.status(409).json({ error: { code: 'NO_DURABLE_SNAPSHOTS', message: 'Capture at least two durable snapshots before running bisection.' } });
}

module.exports = {
  bodyField,
  bodyReference,
  branchIdOf,
  buildCleanTags,
  bisectionTimeout,
  cleanTextField,
  countDiffLines,
  countRows,
  durableHistory,
  fieldOr,
  firstReference,
  hasHashDiff,
  hasInvalidWorkspaceFields,
  isValidWorkspaceName,
  parseDiffLines,
  parseTags,
  prepareWorkspaceDirectory,
  queryReference,
  respondBisectionCommand,
  respondBisectionInput,
  respondHistoryTooLarge,
  respondInvalidFields,
  respondInvalidName,
  respondMissingBranches,
  respondNoDurableSnapshots,
  respondNotFound,
  rowCount,
  requiresTenantScope,
  snapshotDiffEntries,
  tenantColumn,
  tenantScope,
  tenantSuffix,
  trajectoryEntry,
  usernameOf,
  workspaceCategories,
  workspacePathFor
};
