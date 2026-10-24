'use strict';

const fs = require('node:fs/promises');
const { getDatabase, closeDatabase } = require('../src/db');
const { getAllConcepts } = require('../src/services/capabilityGraphService');
const { accessFor } = require('../src/services/capabilityAccessMatrix');
const { publishExport, loadExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');
const { parseProjectManifest } = require('../src/services/capabilityInheritance/binding/projectManifestService');
const API_COMMANDS = new Set(['link', 'plan', 'adopt', 'status', 'revoke', 'upgrade']);

async function main(args) {
  const [command, ...options] = args;
  if (command === 'validate') return validateManifest(options);
  if (command === 'publish') return publishLocalExport(options);
  if (API_COMMANDS.has(command)) return runApiCommand(command, options);
  if (!['discover', 'inspect'].includes(command)) throw new Error('Usage: genos-gci.cjs <discover|inspect <capability-id> --version <semver>|validate|publish --descriptor <path>|link|plan|adopt|status|revoke|upgrade --dry-run>');
  const db = await getDatabase();
  try {
    const registry = await loadExportRegistry({ db, capabilityGraph: getAllConcepts(), accessFor });
    if (command === 'discover') process.stdout.write(`${JSON.stringify(registry.listExports(), null, 2)}\n`);
    else await inspectCapability(registry, options);
  } finally {
    await closeDatabase();
  }
}

async function publishLocalExport(options, dependencies = {}) {
  const descriptorPath = optionValue(options, '--descriptor');
  if (!descriptorPath) throw new Error('publish requires --descriptor <path>');
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
  const getDb = dependencies.getDatabase || getDatabase;
  const closeDb = dependencies.closeDatabase || closeDatabase;
  const getGraph = dependencies.getCapabilityGraph || getAllConcepts;
  const saveExport = dependencies.publishExport || publishExport;
  const writeOutput = dependencies.writeOutput || ((value) => process.stdout.write(value));
  const db = await getDb();
  try {
    const result = await saveExport({ db, descriptor, capabilityGraph: getGraph() });
    writeOutput(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await closeDb();
  }
}

async function runApiCommand(command, options) {
  const organizationId = optionValue(options, '--organization');
  const projectId = optionValue(options, '--project');
  const baseUrl = process.env.GENOS_API_URL;
  const token = process.env.GENOS_API_TOKEN;
  if (!organizationId || !projectId || !baseUrl || !token) {
    throw new Error('Remote GCI commands require --organization, --project, GENOS_API_URL, and GENOS_API_TOKEN');
  }
  const url = safeApiUrl(baseUrl);
  const request = await apiRequest({ command, options, url, token, organizationId, projectId });
  const response = await fetch(request.url, request.init);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { message: text.slice(0, 2000) }; }
  if (!response.ok) throw Object.assign(new Error(JSON.stringify(payload)), { code: `GCI_HTTP_${response.status}` });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function apiRequest(input) {
  const root = `/api/gci/v1`;
  const headers = { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json',
    'X-Organization-Id': input.organizationId, 'X-Project-Id': input.projectId };
  const body = await apiBody(input.command, input.options);
  const path = apiPath(input.command, input.projectId);
  return { url: new URL(`${root}${path}`, input.url).toString(),
    init: { method: body === null ? 'GET' : 'POST', headers, ...(body === null ? {} : { body: JSON.stringify(body) }) } };
}

async function apiBody(command, options) {
  if (command === 'status') return null;
  if (command === 'revoke') return revocationBody(options);
  return manifestCommandBody(command, options);
}

async function manifestCommandBody(command, options) {
  const manifestPath = optionValue(options, '--manifest');
  if (!manifestPath) throw new Error(`${command} requires --manifest <path>`);
  const manifest = await parseProjectManifest(await fs.readFile(manifestPath, 'utf8'));
  if (command === 'link') return { manifest, expectedRevision: numericOption(options, '--expected-revision', 0) };
  if (command === 'adopt') return { manifest,
    expectedBindingRevision: numericOption(options, '--expected-binding-revision', 0),
    expectedInstallationRevision: numericOption(options, '--expected-installation-revision', 0) };
  if (command === 'upgrade') return upgradeBody(options, manifest);
  if (command === 'plan') return { manifest };
  throw new Error(`Unsupported GCI API command: ${command}`);
}

function revocationBody(options) {
  return { capabilityId: optionValue(options, '--capability'), version: optionValue(options, '--version'),
    environment: optionValue(options, '--environment'), reason: optionValue(options, '--reason'),
    expectedRevision: numericOption(options, '--expected-revision', 0) };
}

function apiPath(command, projectId) {
  const id = encodeURIComponent(projectId);
  if (command === 'plan') return '/resolve';
  if (command === 'adopt') return '/adoptions';
  if (command === 'link') return `/projects/${id}/link`;
  if (command === 'status') return `/projects/${id}`;
  if (command === 'upgrade') return `/projects/${id}/upgrades/plan`;
  return `/projects/${id}/revocations`;
}

function upgradeBody(options, manifest) {
  if (!options.includes('--dry-run')) throw new Error('upgrade requires --dry-run');
  if (optionValue(options, '--expected-revision') === null) throw new Error('upgrade requires --expected-revision <revision>');
  return { manifest, expectedRevision: numericOption(options, '--expected-revision', 0) };
}

function safeApiUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('GENOS_API_URL must be an HTTP(S) origin');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function numericOption(options, name, fallback) {
  const value = optionValue(options, name);
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} must be a non-negative integer`);
  return Number(value);
}

async function validateManifest(options) {
  const manifestPath = optionValue(options, '--manifest');
  if (!manifestPath) throw new Error('validate requires --manifest <path>');
  const source = await fs.readFile(manifestPath, 'utf8');
  process.stdout.write(`${JSON.stringify(parseProjectManifest(source), null, 2)}\n`);
}

async function inspectCapability(registry, options) {
  const capabilityId = options[0];
  const version = optionValue(options, '--version');
  if (!capabilityId || !version) throw new Error('inspect requires <capability-id> --version <semver>');
  const result = registry.inspect(capabilityId, version);
  if (!result) throw Object.assign(new Error(`No export for ${capabilityId}@${version}`), { code: 'GCI_EXPORT_NOT_FOUND' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function optionValue(options, name) {
  const index = options.indexOf(name);
  return index >= 0 ? options[index + 1] : null;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.code || 'GCI_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, safeApiUrl, apiPath, publishLocalExport };
