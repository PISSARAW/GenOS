'use strict';

const { treeHash } = require('./canonical');
const { runProbe } = require('./replayProbeRunner.cjs');

function configured() {
  let names;
  let fixtures;
  try {
    names = JSON.parse(process.env.GENOS_AGENT_GIT_MERGE_PROBES || '[]');
    fixtures = JSON.parse(process.env.GENOS_AGENT_GIT_MERGE_FIXTURES || '{}');
  } catch (_) { throw new Error('Invalid merge probe configuration.'); }
  if (!Array.isArray(names) || names.length > 8 || names.some((name) => typeof name !== 'string')) {
    throw new Error('Merge probe configuration must list at most eight registered names.');
  }
  return { names, fixtures };
}

async function verifyFunctionalMerge(state) {
  const { names, fixtures } = configured();
  if (!names.length) {
    return { verified: process.env.GENOS_AGENT_GIT_REQUIRE_MERGE_PROBES === 'true',
      status: 'not_configured', probes: [] };
  }
  const probes = [];
  for (const name of names) {
    try {
      const result = await runProbe({ name, state, fixtures: fixtures[name] || {},
        seed: treeHash(state), now: state.capturedAt || '1970-01-01T00:00:00.000Z' });
      probes.push({ name, ...result });
    } catch (error) { probes.push({ name, pass: false, error: error.message }); }
  }
  return { verified: probes.every((probe) => probe.pass), status: 'executed', probes };
}

module.exports = { verifyFunctionalMerge, configured };
