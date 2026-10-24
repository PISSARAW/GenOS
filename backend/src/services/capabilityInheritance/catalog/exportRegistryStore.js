'use strict';

const { createCapabilityDescriptor } = require('./capabilityDescriptor');
const { createExportRegistry } = require('./exportRegistry');

async function publishExport({ db, descriptor, capabilityGraph }) {
  const validated = createCapabilityDescriptor(descriptor);
  createExportRegistry({ descriptors: [validated], capabilityGraph });
  const serialized = JSON.stringify(validated);
  await require('../../../db').withTransaction(db, async (tx) => {
    const existing = await tx.get('SELECT descriptor_json, status FROM gci_capability_exports WHERE capability_id = ? AND version = ?',
      [validated.capabilityId, validated.version]);
    if (existing) {
      if (existing.status === 'active' && existing.descriptor_json === serialized) return;
      throw Object.assign(new Error('GCI export versions are immutable and revoked versions stay revoked'), { code: 'GCI_EXPORT_VERSION_IMMUTABLE' });
    }
    await tx.run(`INSERT INTO gci_capability_exports
      (capability_id, version, provider_id, descriptor_json, status)
      VALUES (?, ?, ?, ?, 'active')`,
    [validated.capabilityId, validated.version, validated.provider.id, serialized]);
  });
  return validated;
}

async function revokeExport({ db, capabilityId, version, reason }) {
  const result = await db.run(`UPDATE gci_capability_exports SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
    WHERE capability_id = ? AND version = ? AND status = 'active'`, [capabilityId, version]);
  if (result.changes !== 1) throw Object.assign(new Error('GCI export is missing or already revoked'), { code: 'GCI_EXPORT_NOT_ACTIVE' });
  return { capabilityId, version, reason: reason || 'unspecified', revoked: true };
}

async function loadExportRegistry({ db, capabilityGraph, accessFor }) {
  const rows = await db.all("SELECT descriptor_json FROM gci_capability_exports WHERE status = 'active' ORDER BY capability_id, version");
  return createExportRegistry({
    descriptors: rows.map((row) => JSON.parse(row.descriptor_json)), capabilityGraph, accessFor
  });
}

module.exports = { publishExport, revokeExport, loadExportRegistry };
