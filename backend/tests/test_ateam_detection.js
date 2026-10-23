const assert = require('node:assert/strict');
const aTeam = require('../src/services/aTeamService');

// A mathematics mission is now detected (it used to yield zero domains).
const math = aTeam.analyzeMission("Licence de mathématiques : résoudre l'équation différentielle y'' - 3y' + 2y = 0.");
assert.ok(math.detectedDomains.includes('mathematics'), 'mathematics must be detected');
assert.equal(math.members.some((member) => member.role === 'mathematician'), true);

const single = aTeam.analyzeMission('Calculer la dérivée de x^3.');
assert.equal(single.detectedDomains[0], 'mathematics');
assert.equal(single.recommended, false, 'a single domain never recommends an A-Team');

// Non-mathematical wording that merely says "résoudre" is not misclassified.
assert.equal(aTeam.analyzeMission('Résoudre une récurrence de programmation dynamique.').recommended, false);

// The capability analyzer recognizes "accessible" as a security requirement,
// even though the legacy domain detector does not match that wording.
const accessibleBooking = aTeam.analyzeMission('Maintain an accessible booking flow and keep its tests green.');
assert.ok(accessibleBooking.requiredCapabilities.some((item) => item.capability === 'security'));
assert.ok(accessibleBooking.members.some((member) => member.role === 'security_reviewer'),
  'every recognized capability with a registered role must be staffed when capacity allows');
assert.equal(accessibleBooking.capabilityGaps.length, 0);

// All detected needs remain visible; unstaffed needs are explicit gaps.
const rich = aTeam.analyzeMission('Développer le frontend React, le backend Express, la data SQL, la sécurité OAuth, les tests QA, les déploiements DevOps, un agent IA, le produit et la recherche scientifique.');
assert.equal(rich.detectedDomains.length, rich.totalDetected);
assert.equal(rich.overflowDomains.length, rich.totalDetected - aTeam.MAX_MEMBERS);
assert.equal(rich.capabilityGaps.length, rich.capabilityCoverage.uncovered.length);
assert.ok(rich.totalDetected >= rich.detectedDomains.length);

console.log('A-Team detects mathematics and surfaces capability gaps.');
