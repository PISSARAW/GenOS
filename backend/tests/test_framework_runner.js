const assert = require('assert/strict');
const { body, execute, traceparent } = require('./src/services/frameworkRunner');

async function main() {
  assert.deepEqual(body('langgraph', { question: 'why?' }, { thread: 'a' }), { input: { question: 'why?' }, config: { thread: 'a' } });
  assert.deepEqual(body('autogen', { question: 'why?' }, {}), { task: { question: 'why?' }, config: {} });
  const calls = [];
  const result = await execute('crewai', { goal: 'test' }, { verbose: false }, {
    traceId: 'a'.repeat(32), target: { endpoint: 'https://crew.example.test/run', apiKey: 'key' },
    fetchFn: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, text: async () => '{"result":"ok"}' }; }
  });
  assert.equal(result.output.result, 'ok');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer key');
  assert.match(calls[0].options.headers.traceparent, /^00-a{32}-[a-f0-9]{16}-01$/);
  assert.match(traceparent('abc'), /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  console.log('framework runner checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
