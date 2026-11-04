import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {openProxy} from './proxy.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = createRequire(root + '/mcp/package.json');
const {Client} = sdk('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = sdk('@modelcontextprotocol/sdk/client/stdio.js');
const config = require('./native-config.cjs');
const protocol = require('./protocol.json');

export function script(name, options) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(options.directory + '/' + name + '.log', 'a');
    const child = spawn(process.execPath, [root + '/benchmarks/deceptive-patch-native/' + name, options.config],
      {cwd: root, env: options.env, windowsHide: true, stdio: ['ignore', fd, fd]});
    fs.closeSync(fd);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(name + ' exited ' + code)));
  });
}

export async function invoke(input) {
  const directory = path.resolve(input.directory);
  const workspace = directory + '/workspace';
  fs.mkdirSync(directory, {recursive: false});
  fs.cpSync(input.fixture, workspace, {recursive: true});
  fs.mkdirSync(directory + '/tmp');
  const proxy = await openProxy({...input, directory});
  const inherited = ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'ProgramFiles',
    'ProgramFiles(x86)', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];
  const base = Object.fromEntries(inherited.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const env = {...base, ...config.environment({directory, workspace, runtimeRoot: root, endpoint: proxy.endpoint})};
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_EXECUTION_MODE', 'GENOS_DB_BOOTSTRAP_SKIP']) delete env[key];
  const privateConfig = directory + '/private-runtime.json';
  fs.writeFileSync(privateConfig, JSON.stringify({directory, workspace, env}));
  let client, transport, log;
  const startedAt = new Date().toISOString();
  try {
    await script('bootstrap.cjs', {directory, config: privateConfig, env});
    env.GENOS_DB_BOOTSTRAP_SKIP = '1';
    const identity = JSON.parse(fs.readFileSync(directory + '/identity.json', 'utf8'));
    client = new Client({name: 'genos-deceptive-patch-native', version: '1.0.0'}, {capabilities: {}});
    transport = new StdioClientTransport({command: process.execPath, args: [root + '/mcp/index.js'],
      cwd: root, env, stderr: 'pipe'});
    log = fs.createWriteStream(directory + '/mcp.log');
    transport.stderr?.on('data', data => log.write(data));
    await client.connect(transport);
    const production = fs.readdirSync(workspace).filter(name => name.endsWith('.cjs') && !name.endsWith('.test.cjs'));
    const verificationContract = {version: 1, kind: 'commonjs_public_tests',
      tests: ['smoke.test.cjs', 'invariants.test.cjs'],
      sources: fs.readdirSync(workspace).filter(name => name.endsWith('.cjs') && name !== 'regression.test.cjs').map(name =>
        ({path: name, mutable: !name.endsWith('.test.cjs'), sha256: require('node:crypto').createHash('sha256')
          .update(fs.readFileSync(workspace + '/' + name)).digest('hex')}))};
    const request = config.request({...input, workspace, identity, production, verificationContract,
      prompt: input.prompt + '\nFor this small workspace, use genos.file-replacement/v1 with complete resulting file contents.'});
    fs.writeFileSync(directory + '/request.json', JSON.stringify(request, null, 2));
    const result = await client.callTool({name: 'genos_orchestrate', arguments: request}, undefined,
      {timeout: protocol.trialTimeoutMs + 60000, maxTotalTimeout: protocol.trialTimeoutMs + 60000});
    fs.writeFileSync(directory + '/mcp-result.json', JSON.stringify(result, null, 2));
    await script('collect.cjs', {directory, config: privateConfig, env});
    return {result, directory};
  } finally {
    await client?.close().catch(() => {});
    log?.end();
    await proxy.close();
    fs.writeFileSync(directory + '/provider-summary.json', JSON.stringify({startedAt,
      finishedAt: new Date().toISOString(), ...proxy.state}, null, 2));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  invoke(options).then(value => console.log(JSON.stringify({directory: value.directory})))
    .catch(error => {console.error(error); process.exitCode = 1;});
}
