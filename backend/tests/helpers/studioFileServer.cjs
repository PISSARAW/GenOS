'use strict';
const { getDatabase, closeDatabase } = require('../../src/db');

async function main() {
  await getDatabase();
  const server = require('../../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  process.send({ ready: true, url: `http://127.0.0.1:${server.address().port}` });
  process.once('message', async message => {
    if (message?.type !== 'close') return;
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
    process.exit(0);
  });
}
main().catch(error => { console.error(error); process.exit(1); });
