'use strict';

const assert = require('node:assert/strict');
const { inventory } = require('../src/services/ontogenesis/canonicalConceptInventory');
const { resolveConceptReferences } = require('../src/services/ontogenesis/canonicalConceptRegistry');
const { packBioPolymer, unpackBioPolymer } = require('../src/services/bioPolymerPersistenceService');

assert.ok(inventory().interfaces.includes('msgpack'));
const [reference] = resolveConceptReferences(['MsgPack']);
assert.equal(reference.source, 'interface_runtime');
assert.equal(reference.service, 'bioPolymerPersistenceService');
assert.equal(reference.available, true);
assert.equal(reference.executable, false, 'A serialization reference must not grant tool execution');

const payload = { mission: 'p0-msgpack', evidence: ['receipt-1'], budget: 12, eligible: false };
const packed = packBioPolymer(payload);
assert.ok(Buffer.isBuffer(packed));
assert.deepEqual(unpackBioPolymer(packed), payload);
assert.equal(unpackBioPolymer(Buffer.from([0xd9])), null, 'Truncated MsgPack cannot become a valid observation');
console.log('Ontogenesis MsgPack interface resolves to a real codec without execution authority.');
