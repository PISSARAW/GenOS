const assert = require('assert');
const genosCli = require('../src/services/genosCli');
const service = require('../src/grpc_services/commandService');

const original = genosCli.runGenos;
const calls = [];
genosCli.runGenos = async (args) => {
  calls.push(args);
  return { ok: true, exitCode: 0, stdout: 'ok\n', stderr: '' };
};

function invoke(request) {
  return new Promise((resolve) => service.ExecuteCommand({ request }, (_error, response) => resolve(response)));
}

(async () => {
  const response = await invoke({ command: 'snapshot', args: ['create', '--out', 'file with spaces.json'] });
  assert.deepStrictEqual(calls[0], ['snapshot', 'create', '--out', 'file with spaces.json']);
  assert.equal(response.success, true);
  assert.equal(response.status, 'completed');
  const rejected = await invoke({ command: 'node -e evil', args: [] });
  assert.equal(rejected.exit_code, 2);
  assert.equal(rejected.status, 'invalid_command');
  console.log('Command service contract checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => { genosCli.runGenos = original; });
