'use strict';

const assert = require('node:assert/strict');
const { parseProjectManifest } = require('../src/services/capabilityInheritance/binding/projectManifestService');

const parsed = parseProjectManifest(`schema = "genos.gci.project/v1"\n[project]\nid = "consumer"\nenvironment = "dev"\n[provider]\nid = "GenOS"\n[[inherit]]\ncapability = "genos.plan"\nmode = "linked"\nversion = "1.0.0"\npermissions = ["plan:read"]`);
assert.equal(parsed.inherit[0].capability, 'genos.plan');
assert.equal(parsed.inherit[0].permissions[0], 'plan:read');
assert.throws(() => parseProjectManifest('schema = "bad"'), { code: 'GCI_INVALID_MANIFEST' });
assert.throws(() => parseProjectManifest(JSON.stringify({ schema: 'genos.gci.project/v1', project: { id: 'x', environment: 'dev', extra: true }, provider: { id: 'GenOS' }, inherit: [] })), /Unsupported project key/);
assert.throws(() => parseProjectManifest(`schema = "genos.gci.project/v1"\n[project]\nid = "consumer"\nenvironment = "dev"\n[provider]\nid = "GenOS"\n[[inherit]]\ncapability = "a"\nmode = "linked"\nversion = "1.0.0"\npermissions = []\n[[inherit]]\ncapability = "a"\nmode = "linked"\nversion = "1.0.0"\npermissions = []`), /Duplicate inheritance/);
console.log('GCI project manifest: ok');
