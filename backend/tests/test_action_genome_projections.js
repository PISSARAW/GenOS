const assert = require('assert/strict');
const { getActionGenome, listActionGenomes } = require('../src/services/actionGenome/actionGenomeCatalog');
const { projectActionGenome } = require('../src/services/actionGenome/surfaceProjection');

const genome = getActionGenome('syncytium.session.events', '1.0.0');
const projection = projectActionGenome(genome);
const surfaces = Object.fromEntries(projection.surfaces.map((surface) => [surface.surface, surface]));

assert.equal(listActionGenomes().length, 1);
assert.equal(surfaces.mcp.wired, true);
assert.equal(surfaces.mcp.target, 'genos_topology_session');
assert.deepEqual(surfaces.mcp.fixedArguments, { operation: 'events' });
assert.equal(surfaces.rest.wired, false);
assert.equal(surfaces.rest.mode, 'describe_only');
assert.equal(surfaces.cli.wired, false);
assert.equal(projection.surfaces.some((surface) => surface.surface === 'a2a'), false);

assert.throws(
  () => getActionGenome('syncytium.session.write', '1.0.0'),
  { code: 'ACTION_GENOME_UNKNOWN', status: 404 }
);

console.log('ActionGenome surface projections passed.');
