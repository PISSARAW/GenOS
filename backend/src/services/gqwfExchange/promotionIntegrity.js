'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const storage = require('../gqwf/storage');
const closure = require('../gqwf/executionClosure');
const { CasAdapter } = require('./casAdapter');
const { uniqueBlobs, validateWorld } = require('./qualification');

async function physicalWorld(db, input) {
  const world = validateWorld(input.world);
  const place = await storage.workspace(db, input.workspaceId);
  if (place.organization_id !== input.scope.organizationId || place.project_id !== input.scope.projectId) {
    throw new Error('GQWF Exchange physical workspace scope mismatch.');
  }
  if (world.workspaceId !== input.workspaceId) throw new Error('GQWF Exchange physical workspace identity mismatch.');
  const cas = new CasAdapter(place.path);
  await cas.prepare();
  for (const blob of uniqueBlobs(world.manifest)) await cas.read(blob);
  if (await cas.readMetadata(world.rootHash) !== world.manifestSerialized ||
      await cas.readMetadata(world.closureHash) !== world.closureSerialized) {
    throw new Error('GQWF Exchange physical root or closure metadata changed.');
  }
  const root = await storage.root(db, input.workspaceId, world.rootHash);
  const storedClosure = await closure.inspectExecutionClosure(db, { workspaceId: input.workspaceId, closureHash: world.closureHash });
  if (digest(root) !== digest(world.manifest) || !storedClosure.registered || digest(storedClosure.manifest) !== digest(world.closure)) {
    throw new Error('GQWF Exchange physical root or closure index changed.');
  }
}

module.exports = { physicalWorld };
