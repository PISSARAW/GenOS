'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_EMBEDDING_PROVIDER = 'none';
const assert = require('node:assert/strict');
const http = require('node:http');
const handlers = require('../src/services/primitiveHandlers/memoryDeadEnds');

async function main() {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    request.resume();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ embeddings: [Array(768).fill(0)] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_EMBEDDING_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = { projectId: 'undeclared-organization', query: 'private scoped query' };
    for (const handler of [handlers.searchFailures, handlers.avoidKnownDeadEnds]) {
      await assert.rejects(handler(context), { code: 'FAILURE_MEMORY_SCOPE_INCOMPLETE' });
    }
    assert.equal(requests, 0, 'Invalid scopes must be refused before sending an embedding request.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
  }
  console.log('Failure memory: invalid scope refused before provider request.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
