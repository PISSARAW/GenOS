'use strict';

const assert = require('node:assert/strict');
const probes = require('../src/services/attentionProbeService');
const { applyFocusProbe } = require('../src/services/agentRuntimeAdapter/missionLease');

async function withProbe(probe, check) {
  const original = probes.consumeFocusConstraint;
  probes.consumeFocusConstraint = async () => probe;
  try {
    const mission = { toolLease: ['genos_read', 'genos_write'] };
    await applyFocusProbe({ db: {}, agentId: 'worker-1' }, mission);
    check(mission.toolLease);
  } finally {
    probes.consumeFocusConstraint = original;
  }
}

async function main() {
  await withProbe({ allowedTools: ['genos_unleased'] }, (lease) => assert.deepEqual(lease, []));
  await withProbe({ allowedTools: ['genos_write'] }, (lease) => assert.deepEqual(lease, ['genos_write']));
  console.log('Focus constraints only narrow a tool lease, including an empty intersection.');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
