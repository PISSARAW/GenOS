'use strict';

const SECTION_KEYS = new Set(['schema', 'project', 'provider', 'inherit', 'updates']);
const Ajv = require('ajv');
const PROJECT_SCHEMA = require('../../../../../spec/gci/project.schema.json');
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(PROJECT_SCHEMA);

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
  const state = { output: { project: {}, provider: {}, inherit: [], updates: {} }, section: '', item: null };
  for (const rawLine of source.split(/\r?\n/)) {
    parseTomlLine(state, rawLine);
  }
  return state.output;
}

function parseTomlLine(state, rawLine) {
  const line = rawLine.replace(/\s+#.*$/, '').trim();
  if (!line) return;
  if (selectArraySection(state, line) || selectSimpleSection(state, line)) return;
  assignTomlValue(state, line);
}

function selectArraySection(state, line) {
  const match = line.match(/^\[\[([a-z]+)\]\]$/);
  if (!match) return false;
  state.section = match[1];
  if (state.section !== 'inherit') throw manifestError(`Unsupported section: ${state.section}`);
  state.item = {};
  state.output.inherit.push(state.item);
  return true;
}

function selectSimpleSection(state, line) {
  const match = line.match(/^\[([a-z]+)\]$/);
  if (!match) return false;
  state.section = match[1];
  if (!SECTION_KEYS.has(state.section) || ['schema', 'inherit'].includes(state.section)) throw manifestError(`Unsupported section: ${state.section}`);
  state.item = state.output[state.section];
  return true;
}

function assignTomlValue(state, line) {
  const assignment = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
  if (!assignment) throw manifestError('Unsupported TOML syntax');
  const [, key, literal] = assignment;
  const target = state.section === '' ? state.output : state.item;
  if (!target) throw manifestError('TOML key is outside a section');
  if (Object.hasOwn(target, key)) throw manifestError(`Duplicate key: ${key}`);
  target[key] = parseLiteral(literal);
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
  validateManifestShape(manifest);
  validateEntries(manifest.inherit);
  validateProjectSchema(manifest);
}

function validateManifestShape(manifest) {
  if (!manifest.project || !manifest.project.id || !manifest.project.environment) throw manifestError('project.id and project.environment are required');
  if (!manifest.provider || !manifest.provider.id || !Array.isArray(manifest.inherit)) throw manifestError('provider.id and inherit are required');
  rejectUnknownKeys(manifest, ['schema', 'project', 'provider', 'inherit', 'updates'], 'manifest');
  rejectUnknownKeys(manifest.project, ['id', 'environment'], 'project');
  rejectUnknownKeys(manifest.provider, ['id'], 'provider');
  if (manifest.updates) rejectUnknownKeys(manifest.updates, ['policy', 'require_independent_verification', 'auto_merge'], 'updates');
}

function validateEntries(entries) {
  const seen = new Set();
  for (const entry of entries) {
    rejectUnknownKeys(entry, ['capability', 'version', 'mode', 'permissions'], 'inherit');
    if (!entry.capability || !entry.version || !['linked', 'embedded', 'managed'].includes(entry.mode) || !Array.isArray(entry.permissions)) throw manifestError('Each inheritance entry needs capability, version, mode, and permissions');
    const key = `${entry.capability}@${entry.version}`;
    if (seen.has(key)) throw manifestError(`Duplicate inheritance entry: ${key}`);
    seen.add(key);
  }
}

function validateProjectSchema(manifest) {
  if (!validateSchema(manifest)) throw manifestError(`Manifest violates GCI schema: ${validateSchema.errors[0].message}`);
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
