import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const allowed = new Set(['genos_diagnose', 'genos_analyze_trajectory',
  'genos_record_decision', 'genos_record_experience', 'genos_compile_memory']);

async function main() {
  const [directory, factsPath] = process.argv.slice(2);
  if (!/^D:[/\\]/i.test(directory)) throw Error('ANALYSIS_RUNTIME_MUST_BE_ON_D');
  if (!fs.existsSync(directory + '/control-result.json') && !fs.existsSync(directory + '/report.json')) {
    throw Error('POSTHOC_ANALYSIS_REQUIRES_FINISHED_RESULT');
  }
  const options = JSON.parse(fs.readFileSync(directory + '/private-runtime.json', 'utf8'));
  const identity = JSON.parse(fs.readFileSync(directory + '/identity.json', 'utf8'));
  const requests = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
  if (!requests.every(row => allowed.has(row.name))) throw Error('ANALYSIS_TOOL_NOT_ALLOWED');
  const tag = crypto.createHash('sha256').update(fs.readFileSync(factsPath)).digest('hex').slice(0, 12);
  const resultPath = directory + '/posthoc-' + tag + '.json';
  if (fs.existsSync(resultPath)) throw Error('POSTHOC_OUTPUT_ALREADY_EXISTS');
  const require = createRequire(options.runtimeRoot + '/mcp/package.json');
  const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
  const {StdioClientTransport} = require('@modelcontextprotocol/sdk/client/stdio.js');
  const env = {...process.env, ...options.env, GENOS_DB_BOOTSTRAP_SKIP: '1'};
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_EXECUTION_MODE']) delete env[key];
  const client = new Client({name: 'genos-competence-posthoc', version: '1'}, {capabilities: {}});
  const transport = new StdioClientTransport({command: process.execPath,
    args: [options.runtimeRoot + '/mcp/index.js'], cwd: options.runtimeRoot, env, stderr: 'pipe'});
  const errors = fs.createWriteStream(directory + '/posthoc-mcp.log', {flags: 'a'});
  transport.stderr?.on('data', buffer => errors.write(buffer));
  const output = [];
  try {
    await client.connect(transport);
    for (const row of requests) {
      const request = {...row, arguments: {...row.arguments, agentId: identity.agentId,
        organizationId: identity.workspace.organization_id, projectId: identity.workspace.project_id}};
      const result = await client.callTool(request, undefined, {timeout: 120000});
      output.push({request, result});
      fs.writeFileSync(resultPath, JSON.stringify(output, null, 2));
      if (result.isError) throw Error('POSTHOC_GENOS_TOOL_REFUSED: ' + row.name);
      const value = JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
      if (value.success !== true) throw Error('POSTHOC_GENOS_TOOL_DID_NOT_ATTEST_SUCCESS: ' + row.name);
      console.log(JSON.stringify({tool: row.name, resultSaved: resultPath}));
    }
  } finally {await client.close(); errors.end();}
}

main().catch(error => {console.error(error); process.exitCode = 1;});
