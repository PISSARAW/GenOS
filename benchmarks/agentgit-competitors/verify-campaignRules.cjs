'use strict';

function verify(context) {
  return context.run.system !== context.system.name || context.run.version !== context.system.version || context.run.tasks?.length !== context.manifest.tasks.length
      || context.run.manifestHash !== context.digest(context.manifest.tasks);
}

module.exports = { verify };
