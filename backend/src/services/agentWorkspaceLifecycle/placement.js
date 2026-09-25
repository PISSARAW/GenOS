'use strict';

const path = require('path');
const { discoverVolumesFresh } = require('../hostEnvironment');

const DEFAULT_HEADROOM_BYTES = 256 * 1024 * 1024;

function headroomBytes() {
  const configured = Number(process.env.GENOS_WORKSPACE_COPY_HEADROOM_BYTES);
  return Number.isSafeInteger(configured) && configured >= 0
    ? configured : DEFAULT_HEADROOM_BYTES;
}

function chooseCapsuleRoot(requiredBytes, availableVolumes) {
  const neededBytes = requiredBytes + headroomBytes();
  const candidates = (availableVolumes || discoverVolumesFresh())
    .filter((volume) => volume.availableBytes >= neededBytes)
    .sort((left, right) => right.availableBytes - left.availableBytes || right.freeRatio - left.freeRatio);
  if (!candidates.length) {
    const error = new Error(`No local volume has ${neededBytes} bytes available for an isolated agent workspace.`);
    error.code = 'WORKSPACE_DISK_SPACE_INSUFFICIENT';
    error.requiredBytes = neededBytes;
    throw error;
  }
  return path.join(candidates[0].path, 'GenOS', '.genos-agent-worlds');
}

module.exports = { chooseCapsuleRoot, headroomBytes };
