'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const io = require('../deceptive-patch-bench/io.cjs');
const root = path.resolve(__dirname, '../..');
const metadata = ['runtime-seal.json', 'runtime-source-manifest.json', 'benchmark-qualification.json'];

function git(args) {return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16000000}).trim();}
function freeze() {
  if (git(['status', '--porcelain'])) throw Error('COMMIT_SOURCE_SNAPSHOT_BEFORE_FREEZING');
  const names = git(['ls-files', '-z']).split('\0').filter(name => name && !metadata.includes(name));
  const sources = Object.fromEntries(names.sort().map(name => [name, io.hash(fs.readFileSync(path.join(root, name)))]));
  const manifest = {schema: 'genos.runtime-source-freeze/v2', revision: git(['rev-parse', 'HEAD']), sources};
  io.write(path.join(root, metadata[1]), manifest);
  const binaries = Object.fromEntries(['target/debug/genos.exe', 'target/debug/genos-mcp.exe']
    .map(name => [name, io.hash(fs.readFileSync(path.join(root, name)))]));
  const seal = {schema: 'dpb.native-runtime-seal/v1', status: 'awaiting-controls', node: process.version,
    createdAt: new Date().toISOString(), sourceManifestHash: io.hash(JSON.stringify(manifest)), binaries};
  io.write(path.join(root, metadata[0]), seal);
  return seal;
}
function qualify(directory) {
  const seal = io.json(path.join(root, metadata[0]));
  const arms = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, control(directory, arm)]));
  if (!Object.values(arms).every(item => item.accepted && item.liveQwen)) throw Error('LIVE_CONTROLS_NOT_ACCEPTED');
  io.write(path.join(root, metadata[2]), {schema: 'dpb.native-qualification/v1', arms,
    runtimeManifestHash: seal.sourceManifestHash, binaries: seal.binaries});
  io.write(path.join(root, metadata[0]), {...seal, status: 'sealed', qualifiedAt: new Date().toISOString()});
  return require('./prepare.cjs').verifyRuntime();
}
function control(directory, arm) {
  const trial = path.resolve(directory, arm);
  const usage = require('./accounting.cjs').usage(trial);
  const result = io.json(path.join(trial, arm === 'C' ? 'native-qualification.json' : 'react-result.json'));
  return {directory: trial, accepted: result.accepted === true,
    liveQwen: usage.calls > 0 && usage.complete, usage,
    resultHash: io.hash(JSON.stringify(result))};
}
if (require.main === module) console.log(JSON.stringify(process.argv[2] === 'qualify'
  ? qualify(process.argv[3]) : freeze(), null, 2));
module.exports = {freeze, qualify};
