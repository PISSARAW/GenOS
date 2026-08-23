const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const modelRouter = require('./src/services/modelRouter');
const runtimeAdapter = require('./src/services/agentRuntimeAdapter');

async function main() {
  const policyDb = {
    async get(sql, ...args) {
      if (sql.includes('agent_model_routing_policies')) {
        return { policy_json: JSON.stringify({
          primary: 'openai://frontier',
          fallbacks: ['ollama://configured-local'],
          mode: 'fallback',
          preferLocal: true
        }) };
      }
      if (sql.includes('provider_configs')) {
        return { endpoint: args[1] === 'configured-local' ? 'http://local.test/first' : 'http://local.test/second' };
      }
      return null;
    }
  };

  const policy = await modelRouter.localRoutingPolicy(policyDb, { agentId: 'orchestrator-a' }, [
    'ollama://discovered-local',
    'openai://must-not-enter-local-route'
  ]);
  assert.equal(policy.primary, 'ollama://configured-local');
  assert.deepEqual(policy.fallbacks, ['ollama://discovered-local']);
  assert.equal(policy.configured, true);

  const previousFetch = global.fetch;
  global.fetch = async (url) => url.endsWith('/first')
    ? { ok: false, status: 503, async json() { return {}; } }
    : { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'fallback worked' } }], usage: { prompt_tokens: 2, completion_tokens: 2 } }; } };
  try {
    const result = await modelRouter.generate({ db: policyDb, agentId: 'orchestrator-a', policy, prompt: 'review' });
    assert.equal(result.model, 'ollama://discovered-local');
    assert.equal(result.text, 'fallback worked');
    assert.equal(result.route.attempts[0].model, 'ollama://configured-local');
  } finally { global.fetch = previousFetch; }

  const models = [
    { model: 'small:0.5b', uri: 'ollama://small:0.5b', size: 400_000_000 },
    { model: 'large:14b', uri: 'ollama://large:14b', size: 9_000_000_000 }
  ];
  assert.equal(runtimeAdapter.rankLocalModels(models, 'Flash')[0].uri, 'ollama://small:0.5b');
  assert.equal(runtimeAdapter.rankLocalModels(models, 'Pro')[0].uri, 'ollama://large:14b');
  assert.deepEqual(runtimeAdapter.modelUsage({ inputTokens: 13, outputTokens: 5 }), {
    inputTokens: 13, outputTokens: 5, totalTokens: 18
  });

  const runtimeSource = fs.readFileSync(path.resolve(__dirname, 'bin/genos-agent-runtime.cjs'), 'utf8');
  assert.match(runtimeSource, /localModelReview: plan\.localModelReview/);
  assert.match(runtimeSource, /accepted or rejected recommendations/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-local-review-runtime-'));
  try {
    const capture = path.join(directory, 'prompt.txt');
    const fakeCodex = path.join(directory, 'fake-codex');
    fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const fs = require('fs'); let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { fs.writeFileSync(process.env.PROMPT_CAPTURE, input); process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({outcome:'success',claims:[{statement:'done',evidence:['captured prompt']}],uncertainties:[],tests:[]})}})+'\\n'); process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n'); });
`, { mode: 0o700 });
    const runtime = spawnSync(process.execPath, [path.resolve(__dirname, 'bin/genos-agent-runtime.cjs')], {
      cwd: directory,
      input: JSON.stringify({
        agentId: 'orchestrator-local-review-test', executionMode: 'orchestrator', prompt: 'audit local advice',
        strategyContractJson: '{}', executionPolicyJson: '{}', toolLeaseJson: '[]', genosCapsuleJson: '{}',
        autonomyPlanJson: JSON.stringify({ schema: 'test', localModelReview: { consulted: true, selectedModel: 'ollama://test', provider: 'ollama', advice: 'USE_THIS_LOCAL_EVIDENCE' } })
      }),
      env: { ...process.env, CODEX_EXECUTABLE: fakeCodex, PROMPT_CAPTURE: capture, GENOS_BIN: path.join(directory, 'missing-genos'), GENOS_MCP_BIN: path.join(directory, 'missing-mcp'), GENOS_WORKSPACE_ROOT: directory },
      timeout: 10000
    });
    assert.equal(runtime.status, 0, runtime.stderr.toString());
    const capturedPrompt = fs.readFileSync(capture, 'utf8');
    assert.match(capturedPrompt, /USE_THIS_LOCAL_EVIDENCE/);
    assert.match(capturedPrompt, /accepted or rejected recommendations/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('Orchestrator local-model routing: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
