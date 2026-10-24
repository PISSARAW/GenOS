'use strict';

const SECTION_KEYS = new Set(['schema', 'project', 'provider', 'inherit', 'updates']);

function parseProjectManifest(source) {
  if (typeof source !== 'string' || source.length > 65536) throw manifestError('Manifest must be text under 64 KiB');
  const trimmed = source.trim();
  let manifest;
  if (trimmed.startsWith('{')) {
    try { manifest = JSON.parse(trimmed); } catch { throw manifestError('Manifest JSON is invalid'); }
  } else {
    manifest = parseTomlSubset(trimmed);
  }
  validateManifest(manifest);
  return manifest;
}

function parseTomlSubset(source) {
  const output = { project: {}, provider: {}, inherit: [], updates: {} };
  let section = '';
  let item = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) continue;
    const arraySection = line.match(/^\[\[([a-z]+)\]\]$/);
    const simpleSection = line.match(/^\[([a-z]+)\]$/);
    if (arraySection) {
      section = arraySection[1];
      if (section !== 'inherit') throw manifestError(`Unsupported section: ${section}`);
      item = {};
      output.inherit.push(item);
      continue;
    }
    if (simpleSection) {
      section = simpleSection[1];
      if (!SECTION_KEYS.has(section) || section === 'schema' || section === 'inherit') throw manifestError(`Unsupported section: ${section}`);
      item = output[section];
      continue;
    }
    const assignment = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
    if (!assignment) throw manifestError('Unsupported TOML syntax');
    const [, key, literal] = assignment;
    const target = section === '' ? output : item;
    if (!target) throw manifestError('TOML key is outside a section');
    if (Object.hasOwn(target, key)) throw manifestError(`Duplicate key: ${key}`);
    target[key] = parseLiteral(literal);
  }
  return output;
}

function parseLiteral(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[') && value.endsWith(']')) {
    const content = value.slice(1, -1).trim();
    return content ? content.split(',').map((part) => parseLiteral(part.trim())) : [];
  }
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  throw manifestError('Unsupported TOML value');
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema !== 'genos.gci.project/v1') throw manifestError('Unsupported GCI project schema');
  if (!manifest.project || !manifest.project.id || !manifest.project.environment) throw manifestError('project.id and project.environment are required');
  if (!manifest.provider || !manifest.provider.id || !Array.isArray(manifest.inherit)) throw manifestError('provider.id and inherit are required');
  const seen = new Set();
  rejectUnknownKeys(manifest, ['schema', 'project', 'provider', 'inherit', 'updates'], 'manifest');
  rejectUnknownKeys(manifest.project, ['id', 'environment'], 'project');
  rejectUnknownKeys(manifest.provider, ['id'], 'provider');
  if (manifest.updates) rejectUnknownKeys(manifest.updates, ['policy', 'require_independent_verification', 'auto_merge'], 'updates');
  for (const entry of manifest.inherit) {
    rejectUnknownKeys(entry, ['capability', 'version', 'mode', 'permissions'], 'inherit');
    if (!entry.capability || !entry.version || !['linked', 'embedded', 'managed'].includes(entry.mode) || !Array.isArray(entry.permissions)) throw manifestError('Each inheritance entry needs capability, version, mode, and permissions');
    const key = `${entry.capability}@${entry.version}`;
    if (seen.has(key)) throw manifestError(`Duplicate inheritance entry: ${key}`);
    seen.add(key);
  }
}

function rejectUnknownKeys(value, allowed, section) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw manifestError(`Unsupported ${section} key: ${extra[0]}`);
}

function manifestError(message) {
  const error = new Error(message);
  error.code = 'GCI_INVALID_MANIFEST';
  return error;
}

module.exports = { parseProjectManifest };
