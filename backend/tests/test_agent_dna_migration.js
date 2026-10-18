const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const agentDna = require('../src/services/agentDna');
const { resolveGenosBin } = require('../src/services/genosCliEnv');

function run() {
  const bin = resolveGenosBin();
  const source = path.resolve(__dirname, '../../agents/biomimetique/ateam_domain_analyzer.agent.json');
  const out = path.join(os.tmpdir(), `genos-migration-${Date.now()}.dna`);
  const compile = spawnSync(bin, ['genome', 'compile', '--input', source, '--output', out, '--force'], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stderr);

  const model = agentDna.decodeFile(out);
  assert.equal(model.format, 'AgentDNA/v1');
  assert.ok(model.meta.name.length > 0);
  assert.ok(Object.keys(model.genes).length > 0);
  assert.equal(model.contentHash.length, 64);

  const validate = spawnSync(bin, ['genome', 'validate', '--file', out], { encoding: 'utf8' });
  assert.equal(validate.status, 0, validate.stderr);

  fs.rmSync(out, { force: true });
  console.log('AgentDNA migration (legacy JSON -> .dna) checks passed.');
}

try { run(); } catch (error) { console.error(error); process.exitCode = 1; }
