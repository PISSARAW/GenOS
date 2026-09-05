/**
 * Daemon Agent Autostart Service
 * Configures the proactive GenOS Sentinel Agent to launch at Windows startup,
 * manage its custom identity/personality, and coordinate autonomous GitHub auditing.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { runFullAudit } = require('./proactiveGitHubAnalyst');

const repoRoot = path.resolve(__dirname, '../../..');
const configDir = path.join(repoRoot, '.genos');
const configFile = path.join(configDir, 'daemon_agent.json');

const DEFAULT_CONFIG = {
  name: 'Sekou',
  personality: "Analyste architectural proactif et gardien vigilant de l'écosystème GitHub. Précis, méthodique et prévenant.",
  role: 'Autonomous GitHub Auditor & Sentinel',
  githubDir: '',
  openTerminalOnStartup: true,
  enabled: true,
  checkIntervalMinutes: 60,
  lastRun: null
};

function getDaemonConfig() {
  try {
    if (fs.existsSync(configFile)) {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.warn(`[Daemon Config] Impossible de lire ${configFile}, utilisation des valeurs par défaut: ${err.message}`);
  }
  return { ...DEFAULT_CONFIG };
}

function saveDaemonConfig(updates = {}) {
  try {
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    const current = getDaemonConfig();
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error(`[Daemon Config] Erreur de sauvegarde de ${configFile}: ${err.message}`);
    throw err;
  }
}

function getStartupDirectory() {
  if (process.platform !== 'win32') return null;
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
  );
}

function getAutostartStatus() {
  const startupDir = getStartupDirectory();
  if (!startupDir || !fs.existsSync(startupDir)) {
    return { platformSupported: false, enabled: false, autostartFile: null, config: getDaemonConfig() };
  }

  const newFile = path.join(startupDir, 'GenOS_Sentinel_Daemon.bat');
  const legacyFile = path.join(startupDir, 'Griot_Daemon.bat');

  const newExists = fs.existsSync(newFile);
  const legacyExists = fs.existsSync(legacyFile);

  return {
    platformSupported: true,
    enabled: newExists || legacyExists,
    autostartFile: newExists ? newFile : (legacyExists ? legacyFile : newFile),
    legacyFound: legacyExists,
    config: getDaemonConfig()
  };
}

function enableAutostart(customConfig = {}) {
  if (process.platform !== 'win32') {
    return { success: false, reason: 'PLATFORM_NOT_SUPPORTED', platform: process.platform };
  }

  const startupDir = getStartupDirectory();
  if (!startupDir) {
    return { success: false, reason: 'STARTUP_DIR_NOT_FOUND' };
  }

  try {
    if (!fs.existsSync(startupDir)) fs.mkdirSync(startupDir, { recursive: true });

    // Nettoyage de l'ancien script Griot si présent
    const legacyFile = path.join(startupDir, 'Griot_Daemon.bat');
    if (fs.existsSync(legacyFile)) {
      try { fs.unlinkSync(legacyFile); } catch (_) {}
    }

    const autostartFile = path.join(startupDir, 'GenOS_Sentinel_Daemon.bat');
    const runnerScript = path.join(repoRoot, 'backend/bin/genos-daemon.cjs');

    // Le script .bat lance le daemon Node avec ouverture de terminal interactif
    const batchContent = [
      '@echo off',
      `title GenOS Sentinel Daemon`,
      `cd /d "${repoRoot}"`,
      `start "GenOS Sentinel" cmd.exe /k "node backend\\bin\\genos-daemon.cjs --interactive"`,
      ''
    ].join('\r\n');

    fs.writeFileSync(autostartFile, batchContent, 'utf8');

    const config = saveDaemonConfig({ ...customConfig, enabled: true });
    console.log(`✅ [GenOS Daemon] Auto-démarrage Windows activé : ${autostartFile}`);
    return { success: true, autostartFile, config };
  } catch (err) {
    console.error(`❌ [GenOS Daemon] Erreur lors de l'activation de l'auto-démarrage : ${err.message}`);
    throw err;
  }
}

function disableAutostart() {
  const startupDir = getStartupDirectory();
  if (!startupDir) return { success: false, reason: 'STARTUP_DIR_NOT_FOUND' };

  try {
    const files = [
      path.join(startupDir, 'GenOS_Sentinel_Daemon.bat'),
      path.join(startupDir, 'Griot_Daemon.bat')
    ];
    let removed = 0;
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        removed += 1;
      }
    }
    const config = saveDaemonConfig({ enabled: false });
    console.log(`ℹ️ [GenOS Daemon] Auto-démarrage Windows désactivé (${removed} script(s) supprimé(s)).`);
    return { success: true, removedCount: removed, config };
  } catch (err) {
    console.error(`❌ [GenOS Daemon] Erreur lors de la désactivation : ${err.message}`);
    throw err;
  }
}

function enableAutostartIfConfigured() {
  const config = getDaemonConfig();
  if (config.enabled && process.platform === 'win32') {
    enableAutostart(config);
  }
}

function runProactiveCycle(options = {}) {
  const config = getDaemonConfig();
  const agentConfig = {
    name: options.name || config.name,
    personality: options.personality || config.personality,
    role: options.role || config.role
  };
  const githubDir = options.githubDir || config.githubDir || null;
  const auditResult = runFullAudit(agentConfig, githubDir);

  saveDaemonConfig({ lastRun: new Date().toISOString() });
  return { config: { ...config, ...agentConfig }, audit: auditResult };
}

module.exports = {
  getDaemonConfig,
  saveDaemonConfig,
  getStartupDirectory,
  getAutostartStatus,
  enableAutostart,
  disableAutostart,
  enableAutostartIfConfigured,
  runProactiveCycle
};
