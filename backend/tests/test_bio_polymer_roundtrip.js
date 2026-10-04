const assert = require('assert');
const { packBioPolymer, unpackBioPolymer } = require('../src/services/bioPolymerPersistenceService');

const payload = { semanticType: 'READY', concentration: 0.9, evidence: ['a', 'b'] };
const packed = packBioPolymer(payload);
assert.ok(Buffer.isBuffer(packed));
assert.deepEqual(unpackBioPolymer(packed), payload);
assert.deepEqual(unpackBioPolymer(Buffer.from(JSON.stringify(payload))), payload);
assert.deepEqual(unpackBioPolymer(Buffer.from('[1,2]')), [1, 2]);
assert.equal(unpackBioPolymer(Buffer.from([0xd9])), null);
assert.throws(() => packBioPolymer({ bad: Symbol('unsupported') }),
  (error) => error.code === 'BIOPOLYMER_PACK_FAILED');
console.log('Bio-polymer MsgPack and legacy JSON BLOB round-trip passed.');
