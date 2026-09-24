'use strict';
const { latestHeartbeats } = require('../demes/demeHeartbeatStore');
const metapopulationStore = require('../metapopulationStore');
const { classifySilence } = require('./silenceClassifier');
async function inspectRegion(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('Database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const [session, rows] = await Promise.all([
    metapopulationStore.loadSession(options.db, metapopulationId), latestHeartbeats(options.db, metapopulationId)
  ]);
  if (!session) throw Object.assign(new Error('Unknown metapopulation session.'), { code: 'METAPOPULATION_SESSION_UNKNOWN' });
  const indexed = new Map(rows.map((row) => [row.deme_id, row]));
  const demes = session.demes.map((deme) => ({
    demeId: deme.demeId, status: deme.status,
    silence: classifySilence({ heartbeat: indexed.get(deme.demeId), now: options.now, connected: options.connected?.[deme.demeId], runtimeState: options.runtimeStates?.[deme.demeId] })
  }));
  return { metapopulationId, demes, summary: summarize(demes) };
}
function summarize(demes) {
  return demes.reduce((result, deme) => ({ ...result, [deme.silence]: result[deme.silence] + 1 }), {
    HEALTHY_SILENCE: 0, NO_NEW_INFORMATION: 0, DISCONNECTED: 0, STALLED: 0, CRASHED: 0, UNKNOWN: 0
  });
}
module.exports = { inspectRegion };
