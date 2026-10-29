'use strict';
'use strict';

const runtime = require('../runtime');
const id = 'ETT-06';

function build(difficulty, seed) { return runtime.buildCase(id, difficulty, seed); }
function createWorld(difficulty, seed) { return runtime.createWorld(id, difficulty, seed); }
function run(difficulty, seed, actions) {
  const world = createWorld(difficulty, seed);
  const events = (actions || []).map((action) => world.act(action));
  return { caseId: world.caseId, observation: world.observation, events,
    result: world.result(), remaining: world.remaining, terminal: world.terminal };
}

if (require.main === module) {
  const [difficulty = 'simple', seedText = '1001', actionsText = '[]'] = process.argv.slice(2);
  const seed = Number(seedText);
  const actions = JSON.parse(actionsText);
  process.stdout.write(JSON.stringify(run(difficulty, seed, actions), null, 2) + '\n');
}

module.exports = Object.freeze({ id, spec: runtime.SPECS[id], build, createWorld, run });
