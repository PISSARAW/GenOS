'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const fixture = require('./helpers/b06ClientFixture.cjs');

async function main() {
  const spec = await fixture.prepare();
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  spec.settings.url = `http://127.0.0.1:${server.address().port}`;
  process.env.GENOS_ALLOWED_ORIGINS = spec.settings.url;
  const output = process.env.GENOS_STUDIO_TEST_ARTIFACTS || path.join(spec.root, 'browser');
  fs.mkdirSync(output, { recursive: true });
  try {
    server.on('request', require('../src/app').createApp());
    await require('./helpers/b06StudioJourney.cjs').run(spec, output);
    const result = await require('./helpers/studioViewsJourney.cjs').run(spec, output);
    fs.writeFileSync(path.join(output, 'studio-qualified.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    console.log('Studio browser: real approval, provenance, snapshot, tenant refusal and disconnect passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
