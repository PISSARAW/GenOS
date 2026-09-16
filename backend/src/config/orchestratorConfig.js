function envInt(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envFloat(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  maxWorkers: () => Math.max(1, envInt('GENOS_MAX_WORKERS', envInt('GENOS_MAX_AUTONOMOUS_WORKERS', envInt('GENOS_MAX_ACTIVE_WORKERS', 8)))),
  maxActiveWorkers: () => envInt('GENOS_MAX_ACTIVE_WORKERS', config.maxWorkers()),
  maxActiveWorkersPerProject: () => Math.max(12, envInt('GENOS_MAX_ACTIVE_WORKERS_PER_PROJECT', config.maxActiveWorkers())),
  maxAteamMembers: () => envInt('GENOS_MAX_ATEAM_MEMBERS', config.maxActiveWorkers()),
  maxWorkerDossierEvents: () => Math.max(4, envInt('GENOS_MAX_WORKER_DOSSIER_EVENTS', 32)),
  maxStrictDossierInfluence: () => envInt('GENOS_MAX_STRICT_DOSSIER_INFLUENCE', 12),
  maxDissonance: () => Math.max(1.0, envFloat('GENOS_MAX_DISSONANCE', 50.0)),
  maxWorkspaceCopyBytes: () => envInt('GENOS_MAX_WORKSPACE_COPY_BYTES', 0),
  maxProcessOutputBytes: () => envInt('GENOS_MAX_PROCESS_OUTPUT_BYTES', 1024 * 1024),
  maxSnapshotFiles: () => envInt('GENOS_MAX_SNAPSHOT_FILES', 1000),
  maxSnapshotBytes: () => envInt('GENOS_MAX_SNAPSHOT_BYTES', 100 * 1024 * 1024),
  maxSnapshotFileBytes: () => envInt('GENOS_MAX_SNAPSHOT_FILE_BYTES', 10 * 1024 * 1024),
  maxEpisodeFieldBytes: () => envInt('GENOS_MAX_EPISODE_FIELD_BYTES', 1024 * 1024),
  maxEpisodeBytes: () => envInt('GENOS_MAX_EPISODE_BYTES', 50 * 1024 * 1024),
  maxVfsFileBytes: () => envInt('GENOS_MAX_VFS_FILE_BYTES', 10 * 1024 * 1024),
  maxVfsBytes: () => envInt('GENOS_MAX_VFS_BYTES', 100 * 1024 * 1024),
  maxVfsFiles: () => envInt('GENOS_MAX_VFS_FILES', 5000),
  inProcessWorkers: () => process.env.GENOS_IN_PROCESS_WORKERS === '1',
  allowFileEdits: () => /^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || '')),
};

module.exports = config;