#!/usr/bin/env node
/**
 * GenOS Agent World — autonomous end-to-end construction of a card games site.
 *
 * Runs a full A-to-Z project with GenOS's own cognitive stack:
 *   modelRouter (routing)  + immuneSystem (validated retries / pain signals)
 *   agentIdentityService (agent identities) + aTeamService (team composition)
 *   [ARTIFACT: path] extraction -> real files written to disk.
 *
 * The run is resumable: completed artifacts are kept and skipped on re-run.
 */
'use strict';

process.env.GENOS_DEFAULT_MODEL = process.env.GENOS_DEFAULT_MODEL || 'ollama://qwen2.5:14b';

const { runWorld } = require('../src/services/cardGames/runWorld');

runWorld().catch((e) => {
  console.error(`FATAL: ${e.stack || e.message}`);
  process.exit(1);
});