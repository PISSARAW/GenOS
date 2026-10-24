'use strict';

const { createCapabilityDescriptor } = require('./capabilityDescriptor');
const { createExportRegistry } = require('./exportRegistry');

async function publishExport({ db, descriptor, capabilityGraph }) {
  const validated = createCapabilityDescriptor(descriptor);
  createExportRegistry({ descriptors: [validated], capabilityGraph });
  await db.run(`INSERT INTO gci_capability_exports
    (capability_id, version, provider_id, descriptor_json, status, revoked_at)
    VALUES (?, ?, ?, ?, 'active', NULL)
    ON CONFLICT(capability_id, version) DO UPDATE SET
    provider_id = excluded.provider_id, descriptor_json = excluded.descriptor_json,
    status = 'active', revoked_at = NULL`,
  [validated.capabilityId, validated.version, validated.provider.id, JSON.stringify(validated)]);
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
