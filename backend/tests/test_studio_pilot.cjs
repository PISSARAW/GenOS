'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fixture = require('./helpers/b06ClientFixture.cjs');

function sourceHashes() {
  const files = ['backend/tests/test_studio_pilot.cjs', 'backend/tests/helpers/studioPilotJourney.cjs',
    'integrations/studio/app.mjs', 'integrations/studio/client.mjs', 'integrations/studio/files.mjs'];
  return Object.fromEntries(files.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../..', file))).digest('hex')]));
}

async function main() {
  const spec = await fixture.prepare();
  const server = http.createServer();
  const output = process.env.GENOS_STUDIO_TEST_ARTIFACTS || path.join(__dirname, '../../.genos-tests/studio-pilot-c');
  fs.mkdirSync(output, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    spec.url = spec.settings.url = `http://127.0.0.1:${server.address().port}`;
    process.env.GENOS_ALLOWED_ORIGINS = spec.url;
    const workspace = await spec.db.get("SELECT path FROM workspaces WHERE id = 'consumer-ws'");
    spec.file = path.join(workspace.path, 'a/verify.cjs');
    server.on('request', require('../src/app').createApp());
    const result = await require('./helpers/studioPilotJourney.cjs').run(spec, output);
    const manifest = { scenario: 'P03 bounded Studio pilot', apiInterception: false,
      qualifiedAt: new Date().toISOString(),
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true }).trim(),
      sourceHashes: sourceHashes(), node: process.version, platform: process.platform, ...result,
      limits: ['Seeded awaiting_approval run, not autonomous mission creation',
        'Synthetic local commands, no external LLM', 'Approval signed by isolated harness, not a human review',
        'Legacy execution authority; not a complete native runtime or MCP qualification'] };
    fs.writeFileSync(path.join(output, 'studio-pilot-qualified.json'), JSON.stringify(manifest, null, 2));
    console.log('Studio pilot passed: real HTTP/SQLite/files, CAS conflict, restoration, refusal, verified promotion and purge.');
    console.log('Evidence:', output);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    if (!path.basename(spec.root).startsWith('genos-b06-clients-')) throw new Error('Unexpected fixture cleanup root');
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
