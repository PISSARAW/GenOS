'use strict';
const c = require('./common.cjs');
const execution = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/execution.cjs');
function instrument(directory) {
  const original = global.fetch;
  const records = [];
  global.fetch = async (url, options) => {
    const started = performance.now();
    const response = await original(url, options);
    if (String(url).includes('127.0.0.1:11434/api/chat')) {
      const trace = { request: JSON.parse(options.body), status: response.status, startedAt: Date.now() };
      records.push(trace);
      trace.response = await response.clone().text();
      trace.wallMs = performance.now() - started;
      c.write(c.path.join(directory, 'provider-' + records.length + '.json'), trace);
    }
    return response;
  };
  return records;
}
async function collect(input) {
  const { ctx, result, directory } = input;
  const names = ['strategy_execution_runs', 'organism_model_turns', 'local_code_test_execution_receipts',
    'gvx_development_events', 'mission_model_budget_scopes', 'agent_genome_selections'];
  for (const table of names) {
    const exists = await ctx.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table);
    if (exists) c.write(c.path.join(directory, table + '.json'), await ctx.db.all('SELECT * FROM ' + table));
  }
  const run = await ctx.db.get("SELECT * FROM strategy_execution_runs WHERE agent_id='benchmark-worker' ORDER BY rowid DESC LIMIT 1");
  result.nativeRun = run;
  if (run) {
    try { result.authority = await c.service('missionEnvelopeAuthority').read(ctx.db, run.id); }
    catch (error) { result.authorityReadFailure = error.message; }
    result.nativeReceipt = await c.service('biologicalWorkerStore').receipt(ctx.db, run.id);
    c.write(c.path.join(directory, 'native-receipt.json'), result.nativeReceipt);
    c.write(c.path.join(directory, 'native-observations.json'),
      await c.service('biologicalWorkerStore').observations(ctx.db, run.id));
  }
  result.agent = await ctx.db.get("SELECT id,status,current_task FROM agents WHERE id='benchmark-worker'");
  const promotion = await ctx.db.get("SELECT count(*) AS count FROM agent_genome_innovations WHERE status='promoted'");
  result.genomePromotions = promotion.count;
}
async function main() {
  const input = c.read(process.argv[2]);
  const { directory, task, run, genomeFile } = input;
  c.setup(directory);
  const result = { ...run, promotionAllowed: false, usage: null, fullWorkerRuntime: true };
  const traces = instrument(directory);
  let ctx;
  const started = performance.now();
  try {
    const genome = c.service('agentDna').decodeFile(genomeFile);
    ctx = await require('./provision.cjs').provision({ directory, task, run, genome });
    c.write(c.path.join(directory, 'prepared-mission.json'), ctx.mission);
    c.write(c.path.join(directory, 'autonomy-plan.json'), ctx.plan);
    result.runtime = await c.service('agentRuntimeAdapter').startMission(ctx.mission);
  } catch (error) { result.failure = { code: error.code || null, message: error.message, stack: error.stack }; }
  result.endToEndMs = performance.now() - started;
  result.providerCalls = traces.length;
  if (ctx) {
    await collect({ ctx, result, directory });
    const candidate = c.path.join(ctx.workspace, 'module.js');
    result.oracle = execution.executeOracle(candidate, task.id);
    c.write(c.path.join(directory, 'oracle.json'), result.oracle);
  }
  c.write(c.path.join(directory, 'result.json'), result);
  await c.backend('src/db').closeDatabase();
  console.log(JSON.stringify({ runId: run.runId, failure: result.failure, providerCalls: traces.length,
    agent: result.agent, endToEndMs: result.endToEndMs }));
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
