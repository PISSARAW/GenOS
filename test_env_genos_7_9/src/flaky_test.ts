// flaky_test.ts - test conçu pour réussir aléatoirement environ 1 fois sur 3.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchProfileData } from './flaky_network';

test('profile data is fetched from the network', () => {
  const data = fetchProfileData();
  assert.equal(data, 'data');
});
