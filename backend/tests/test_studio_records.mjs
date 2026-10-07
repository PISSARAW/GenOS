import assert from 'node:assert/strict';
import { humanValue, recordFields, recordTitle, collectionGroups } from '../../integrations/studio/records.mjs';

assert.equal(humanValue(null), 'Inconnu');
assert.equal(humanValue(0), '0');
assert.equal(humanValue(false), 'Non');
assert.equal(humanValue([1, 2]), '2 éléments');
assert.deepEqual(recordFields({ status: 'completed', qualityGuarantee: false, costUsd: 0, secret: 'never-show' }),
  [['État observé', 'completed'], ['Garantie de qualité', 'Non'], ['Coût observé (USD)', '0']]);
assert.equal(recordTitle({ title: '<script>not HTML</script>' }), '<script>not HTML</script>');
assert.deepEqual(collectionGroups(null), []);
assert.deepEqual(collectionGroups({ jobs: [] }), [['jobs', []]]);
assert.deepEqual(collectionGroups({ status: 'queued' }), [['Dossier', [{ status: 'queued' }]]]);
const restored = { success: true, restoredSnapshot: { id: 'target' }, safetySnapshot: { id: 'backup' } };
assert.deepEqual(collectionGroups(restored).map(([title]) => title), ['Dossier', 'restoredSnapshot', 'safetySnapshot']);
assert.deepEqual(recordFields({ affectedFilesCount: 0, durable: false, privateToken: 'never-show' }),
  [['Payload durable', 'Non'], ['Fichiers concernés', '0']]);
const comparison = { sameCapturedInputs: true, jobs: [] };
assert.deepEqual(collectionGroups(comparison), [['Dossier', [comparison]], ['jobs', []]]);
assert.deepEqual(recordFields({ confirmed: true }), [['Arrêt confirmé', 'Oui']]);
const diagnosisFields = recordFields({ confirmed: true, diagnosisScope: 'agent_model_thresholds' });
assert.ok(diagnosisFields.some(([label, value]) => label === 'Classification confirmée par seuils' && value === 'Oui'));
assert.equal(diagnosisFields.some(([label]) => label === 'Arrêt confirmé'), false);
console.log('Studio records: unknowns, zero costs, false guarantees and allowlisted fields passed.');
