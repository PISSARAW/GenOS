import assert from 'node:assert/strict';
import { onboardingSteps } from '../../integrations/studio/onboardingSteps.mjs';

const initial = onboardingSteps({});
assert.equal(initial.length, 4);
assert.ok(initial.every(([, status]) => status === 'À faire'));
const selected = onboardingSteps({ scoped: true, agentSelected: true });
assert.equal(selected[0][1], 'À faire');
assert.equal(selected[1][1], 'Renseignés');
assert.equal(selected[3][1], 'À faire');
const ready = onboardingSteps({ authenticated: true, scoped: true, agentSelected: true, runRead: true });
assert.equal(ready[3][1], 'Dossier chargé');
assert.match(ready[3][2], /ne vaut pas promotion/);
console.log('Studio onboarding: selected IDs are not authority; read receipt is not promotion.');
