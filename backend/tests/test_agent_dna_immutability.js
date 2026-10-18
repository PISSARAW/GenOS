const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const agentDna = require('../src/services/agentDna');

function run() {
  const source = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');
  const model = agentDna.decodeFile(source);
  assert.equal(model.contentHash, agentDna.decodeFile(source).contentHash);

  const buffer = fs.readFileSync(source);
  const tamperedPath = path.join(os.tmpdir(), `genos-tampered-${Date.now()}.dna`);
  const copy = Buffer.from(buffer);
  copy[copy.length - 1] ^= 0xFF;
  fs.writeFileSync(tamperedPath, copy);
  assert.throws(() => agentDna.decodeFile(tamperedPath), /CRC|mismatch|invalid/i);
  fs.rmSync(tamperedPath, { force: true });

  console.log('AgentDNA immutability checks passed.');
}

try { run(); } catch (error) { console.error(error); process.exitCode = 1; }
