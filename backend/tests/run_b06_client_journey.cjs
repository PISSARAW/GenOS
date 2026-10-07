'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sources() {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.(js|cjs|json|py|html|css|rs)$/.test(filename)) files.push(filename);
    }
  }
  for (const directory of ['backend/src', 'integrations/studio', 'integrations/ide/vscode',
    'backend/tests/ideHostDriver', 'crates/genos-cli/src', 'crates/genos-simple-cli/src']) visit(directory);
  return Object.fromEntries(files.map(filename => [filename.replaceAll('\\', '/'),
    crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')]));
}

async function safety(spec) {
  const { Client } = require('../../integrations/ide/vscode/client.cjs');
  const client = new Client(spec.settings, spec.token);
  await client.connect('b06-safety-client');
  const id = client.integration.id;
  await client.disconnect();
  client.token = spec.token;
  client.integration = { id };
  await assert.rejects(client.inspect(), /404/);
  await assert.rejects(client.request(`/api/ide/integrations/${id}/heartbeat`, {}), /404/);
  const foreign = new Client({ ...spec.settings, project: 'b06-other' }, spec.token);
  await assert.rejects(foreign.request(`/api/product-proofs/consumer-runs/${spec.run.id}`), /404/);
  const anonymous = await fetch(`${spec.settings.url}/api/product-proofs/consumer-runs/${spec.run.id}`);
  assert.equal(anonymous.status, 401);
  return { anonymousStatus: 401, foreignRunStatus: 404, revokedCommandStatus: 404 };
}

async function waitForFinish(output) {
  console.log('B06_SHARED_RUNTIME_READY');
  const started = Date.now();
  while (!fs.existsSync(path.join(output, 'finish')) && Date.now() - started < 300000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function main() {
  const output = path.resolve(process.argv[2]);
  fs.mkdirSync(output, { recursive: true });
  const before = sources();
  const spec = await require('./helpers/b06ClientFixture.cjs').prepare();
  process.env.GENOS_ALLOWED_ORIGINS = spec.settings.url;
  process.env.GENOS_TRINITY_MONITOR_PORT = '14601';
  process.env.GENOS_TRINITY_MONITOR_TOKEN = crypto.randomBytes(24).toString('hex');
  const app = require('../src/app').createApp();
  const server = app.listen(14600, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const monitor = require('../src/services/trinityMonitorServer');
  monitor.start();
  try {
    const studio = await require('./helpers/b06StudioJourney.cjs').run(spec, output);
    const ide = await require('./helpers/b06IdeJourney.cjs').run(spec, output);
    const cli = await require('./helpers/b06CliJourney.cjs').run(spec, output);
    const boundaries = await safety(spec);
    assert.equal(ide.runId, studio.runId);
    assert.equal(ide.provenance[0].hash, studio.provenance[0].hash);
    assert.equal(cli.provenance[0].hash, studio.provenance[0].hash);
    const effects = await spec.db.get("SELECT count(*) AS n FROM primitive_execution_journal WHERE agent_id = 'consumer-promotion-agent'");
    assert.equal(effects.n, 2);
    await spec.db.run("UPDATE agents SET current_task = ? WHERE id = 'consumer-promotion-agent'", `B06 run ${spec.run.id} completed`);
    const initialMonitor = await monitor.instance.buildSnapshot(spec.run.id);
    const repeatedMonitor = await monitor.instance.buildSnapshot(spec.run.id);
    assert.equal(repeatedMonitor.worlds.length, 1);
    assert.equal(repeatedMonitor.worlds[0].progress, initialMonitor.worlds[0].progress);
    assert.equal(repeatedMonitor.worlds[0].progressKnown, false);
    fs.writeFileSync(path.join(output, 'monitor-session.json'), JSON.stringify({ runId: spec.run.id, port: 14601,
      token: process.env.GENOS_TRINITY_MONITOR_TOKEN }));
    if (process.env.B06_KEEP_SERVER === '1') await waitForFinish(output);
    const after = sources();
    const drift = Object.keys(before).filter(filename => before[filename] !== after[filename]);
    fs.writeFileSync(path.join(output, 'client-results.json'), JSON.stringify({ studio, ide, cli, boundaries,
      committedPrimitiveEffects: effects.n, monitor: repeatedMonitor, before, after, drift }, null, 2));
    console.log(`B06 clients passed on ${spec.run.id}; source drift ${drift.length}`);
  } finally {
    await monitor.stop();
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    await fs.promises.rm(spec.root, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
