'use strict';

const bridge = require('./runtimeBridge');
const { RegulationJournal } = require('./regulationJournal');
const sensors = require('./garageSensor');
const policies = require('./regulationPolicy');
const controls = require('./admissionControl');
const verification = require('./regulationVerification');
const cursors = new WeakMap();
const inflight = new WeakMap();
const stats = { sampled: 0, failures: 0, executed: 0 };

async function consume(input, sample) {
  const event = sensors.eventOf(sample);
  const graph = await require('./graphContext').loadGraph({ db: input.db, event, scope: sample.scope });
  const result = await input.runtime.ingest(event, sample.scope,
    { graph, regulationForecast: sample.forecast, regulationPolicy: sample.regulationPolicy, nativeSampleId: sample.id });
  await input.journal.processed(sample.id, result.signalId);
  return result;
}

async function sampleManager(db, managerId) {
  if (!bridge.enabled()) return { status: 'DISABLED' };
  const runtime = await bridge.getRuntime(db);
  const journal = await new RegulationJournal(runtime.store).initialize();
  const scope = await policies.managerScope(db, managerId);
  for (const row of await journal.pending(scope, managerId)) await consume({ db, runtime, journal }, JSON.parse(row.body_json));
  const previous = await journal.samples(scope, managerId);
  if (previous[0] && Date.now() - previous[0].observedAt < 1000) return { status: 'THROTTLED' };
  const sample = await sensors.sample(db, managerId);
  const policy = await optionalPolicy(db, managerId);
  if (!await journal.append(sample, policy)) return { status: 'THROTTLED' };
  const result = await consume({ db, runtime, journal }, sample);
  stats.sampled += 1;
  const input = { db, runtime, journal, sample, samples: await journal.samples(scope, managerId) };
  const episodes = await journal.episodes(scope, managerId);
  for (const row of episodes) await verification.reconcile(input, row);
  if (controls.enabled() && policy) await act({ ...input, policy, result });
  return { status: 'SAMPLED', sample, result };
}

async function act(input) {
  const episodes = await input.journal.episodes(input.policy.scope, input.sample.managerId);
  if (blockedByHistory(episodes, input.policy)) return;
  if (!require('./regulationEvidence').supportsInhibition(input.sample, input.policy)) return;
  const rows = await input.runtime.store.effects(input.policy.scope);
  const row = rows.find(item => {
    const proposal = JSON.parse(item.body);
    return proposal.signalId === input.result.signalId && proposal.action === 'INHIBIT_DISPATCH'
      && proposal.target === input.sample.managerId;
  });
  if (!row) return;
  const prepared = await input.journal.prepare({ effectId: row.id, baseline: input.sample, policy: input.policy });
  if (!prepared) return;
  const outcome = await require('./effectGate').dispatch(input.runtime.store,
    { id: row.id, scope: input.policy.scope }, {
      mode: 'guarded', authorize: proposal => policies.authorize(input.db, { proposal, policy: input.policy }),
      handlers: { INHIBIT_DISPATCH: (proposal, context) => controls.apply(input.db, proposal, { ...context, policy: input.policy }) }
    });
  await input.journal.verdict(row.id, { ...outcome, status: executionStatus(outcome.status), automaticRetry: false });
  if (outcome.status === 'EXECUTED_UNVERIFIED') stats.executed += 1;
}

function blockedByHistory(episodes, policy) {
  return episodes.some(row => !verification.TERMINAL.has(row.status)
    || (row.status === 'REGRESSED' && JSON.parse(row.body_json).policy.version === policy.version));
}

function executionStatus(status) {
  if (['EXECUTED_UNVERIFIED','UNCERTAIN','EXPIRED'].includes(status)) return status;
  return 'DENIED';
}

async function optionalPolicy(db, managerId) {
  try { return await policies.observationPolicy(db, managerId); }
  catch (_) { stats.failures += 1; return null; }
}

async function managers(db) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='garage_domains'");
  if (!table) return [];
  const cursor = cursors.get(db) || '';
  let rows = await db.all('SELECT manager_id FROM garage_domains WHERE manager_id>? ORDER BY manager_id LIMIT 32', cursor);
  if (!rows.length) rows = await db.all('SELECT manager_id FROM garage_domains ORDER BY manager_id LIMIT 32');
  cursors.set(db, rows.at(-1)?.manager_id || '');
  return rows;
}

async function run(db) {
  const results = [];
  for (const row of await managers(db)) {
    try { results.push(await sampleManager(db, row.manager_id)); }
    catch (error) { stats.failures += 1; results.push({ status: 'UNAVAILABLE', managerId: row.manager_id, reason: error.message }); }
  }
  return results;
}

async function tick(input) {
  if (!bridge.enabled()) return { status: 'DISABLED' };
  if (inflight.has(input.db)) return inflight.get(input.db);
  const operation = run(input.db).finally(() => inflight.delete(input.db));
  inflight.set(input.db, operation);
  return operation;
}

module.exports = { tick, sampleManager, stats };
