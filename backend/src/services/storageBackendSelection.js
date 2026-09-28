'use strict';

function assertControlPlaneBackendSelection(backendName = process.env.GENOS_STORAGE_BACKEND) {
  const selected = String(backendName || 'sqlite').trim().toLowerCase();
  if (selected === 'sqlite') return;
  const postgresSelected = selected === 'postgres' || selected === 'postgresql';
  const code = postgresSelected ? 'STORAGE_BACKEND_MIGRATION_REQUIRED' : 'STORAGE_BACKEND_UNSUPPORTED';
  const message = postgresSelected
    ? 'The GenOS control plane is not PostgreSQL-conformant; refusing to open a partial storage backend.'
    : `Unsupported GenOS control-plane storage backend '${selected}'.`;
  throw Object.assign(new Error(message), { code });
}

module.exports = { assertControlPlaneBackendSelection };
