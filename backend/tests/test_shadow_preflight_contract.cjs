'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const missionPath = path.resolve(__dirname, '../../benchmarks/topology-morphogenesis/missions/morphogenese-shadow.json');
const mission = JSON.parse(fs.readFileSync(missionPath, 'utf8'));

assert.ok(mission.completionContract.requiredEvidence.includes('evidence_report'));
assert.deepEqual(mission.completionContract.invariants.map((item) => item.id), ['shadow_preflight_evaluated']);
assert.equal(mission.execution_budget.tokens, 32000);
assert.match(mission.mission, /SHADOWED/);
assert.match(mission.mission, /committed=false/);
assert.match(mission.mission, /promotion opérationnelle est autorisée/);
console.log('Shadow preflight contract checks passed.');
