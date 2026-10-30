'use strict';

function verifyValue1(__genosValueScope1) {
  return __genosValueScope1.run.system !== __genosValueScope1.system.name || __genosValueScope1.run.version !== __genosValueScope1.system.version || __genosValueScope1.run.tasks?.length !== __genosValueScope1.manifest.tasks.length
      || __genosValueScope1.run.manifestHash !== (0, __genosValueScope1.digest)(__genosValueScope1.manifest.tasks);
}

module.exports = { verifyValue1 };
