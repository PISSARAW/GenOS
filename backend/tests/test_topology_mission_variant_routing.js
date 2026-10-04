'use strict';

const assert = require('node:assert/strict');

const CASES = require('./fixtures/topology-missions-48.json');

const SELECTORS = Object.freeze({
  trinity: (mission) => {
    const selected = require('../src/services/trinityVariantService').selectForMission(mission);
    return selected.selectedPreset || selected.variant;
  },
  a_team: (mission) => require('../src/services/aTeam/variants/variantRegistry').selectVariant({ goal: mission }),
  biome: (mission) => require('../src/services/biome/variants/variantPolicyService').select(mission).variant,
  biocenose: (mission) => require('../src/services/biocenose/variants/variantPolicyRouter').recommend(mission).name,
  holobionte: (mission) => require('../src/services/holobionteCoordinationService').composeHolobiont(mission).variant,
  syncytium: (mission) => require('../src/services/syncytium/variants/variantPolicyRegistry').selectPolicy(mission).id,
  rhizome: (mission) => require('../src/services/rhizome/variants/variantPolicyService').selectForMission(mission).selection.variant,
  metapopulation: (mission) => require('../src/services/metapopulation/policy/metapopulationPolicyService').selectVariant(mission).variant
});

function verifyCases() {
  assert.equal(CASES.length, 48);
  for (const { topology, level, mission, expectedVariant } of CASES) {
    assert.equal(SELECTORS[topology](mission), expectedVariant, `${topology}/L${level}: ${mission}`);
  }
}

verifyCases();
console.log('Topology mission variant routing (48 complete mission fixtures): PASS');
