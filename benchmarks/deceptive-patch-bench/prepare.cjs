'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const io = require('./io.cjs');
require('./worlds.cjs');
require('./gate.cjs');
const protocol = require('./protocol.json');
const repo = path.resolve(__dirname, '../..');
function sources() {
  const own = io.files(__dirname, ['results']);
  const native = Object.keys(require.cache).filter(file => file.startsWith(path.join(repo, 'backend')));
  return Object.fromEntries([...new Set([...own, ...native])].sort().map(file => [
    path.relative(repo, file).replaceAll('\\', '/'), io.hash(fs.readFileSync(file))
  ]));
}
function plan() {
  return protocol.tasks.flatMap((task, taskIndex) => protocol.seeds.flatMap((seed, seedIndex) => {
    const offset = (seedIndex + taskIndex) % 3;
    const order = [...protocol.arms.slice(offset), ...protocol.arms.slice(0, offset)];
    return order.map(arm => ({ id: `${task}__${seed}__${arm}`, task, seed, arm }));
  })).map((run, sequence) => ({ ...run, sequence }));
}
function prepare(directory) {
  fs.mkdirSync(directory, { recursive: false });
  const campaign = { schema: 1, createdAt: new Date().toISOString(), protocol,
    protocolHash: io.hash(JSON.stringify(protocol)), sources: sources(), runs: plan(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    node: process.version, scope: protocol.scope };
  io.write(path.join(directory, 'campaign.json'), campaign);
  fs.writeFileSync(path.join(directory, 'campaign.sha256'), io.hash(fs.readFileSync(path.join(directory, 'campaign.json'))) + '\n');
  return campaign;
}
function verify(directory) {
  const file = path.join(directory, 'campaign.json');
  if (io.hash(fs.readFileSync(file)) !== fs.readFileSync(path.join(directory, 'campaign.sha256'), 'utf8').trim()) throw Error('CAMPAIGN_HASH_INVALID');
  const campaign = io.json(file);
  for (const [name, expected] of Object.entries(campaign.sources)) {
    if (io.hash(fs.readFileSync(path.join(repo, name))) !== expected) throw Error(`SOURCE_CHANGED:${name}`);
  }
  if (campaign.node !== process.version) throw Error('NODE_VERSION_CHANGED');
  return campaign;
}
if (require.main === module) {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, 'results', new Date().toISOString().replaceAll(':', '-')));
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const campaign = prepare(directory);
  console.log(JSON.stringify({ directory, trials: campaign.runs.length, modelCalls: 'not started' }, null, 2));
}
module.exports = { prepare, verify, plan, sources };
