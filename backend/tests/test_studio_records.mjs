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
console.log('Studio records: unknowns, zero costs, false guarantees and allowlisted fields passed.');
