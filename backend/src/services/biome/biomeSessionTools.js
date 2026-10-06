'use strict';

async function cycle(db, sessionId, args) {
  const { BiomeRuntime } = require('./biomeRuntime');
  const runtime = await BiomeRuntime.restore(sessionId, null, db);
  if (runtime.state.maxTicks === undefined) runtime.maxTicks = args.max_ticks ?? runtime.maxTicks;
  runtime.options = { ...runtime.options, expectedRevision: args.expected_revision,
    evidenceRefs: args.evidence_refs || [] };
  return runtime.step(args.variant_input || {});
}

async function run(db, sessionId, args) {
  const record = await require('./biomeSessionStore').load(db, sessionId);
  if (args.expected_revision !== undefined && record?.revision !== args.expected_revision) {
    throw Object.assign(new Error('Biome run revision conflict.'), { code: 'BIOME_SESSION_CONFLICT' });
  }
  const { BiomeRuntime } = require('./biomeRuntime');
  const runtime = await BiomeRuntime.restore(sessionId, null, db);
  const results = await runtime.run(args.variant_input || {}, args.max_ticks ?? 100);
  return { sessionId, cycles: results, tick: runtime.tick,
    stopCondition: runtime.stopCondition, goalVerified: runtime.state.goalVerification?.verified === true };
}

module.exports = { cycle, run };
