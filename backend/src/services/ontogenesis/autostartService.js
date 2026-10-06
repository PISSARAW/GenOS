'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Démarrage automatique Windows de l'Ontogenèse (ADR 0235 §7).
 * Opt-in explicite : désactivé par défaut, même motif que le daemon
 * sentinelle. Relance `run --project` avec l'intention persistée
 * (la pause manuelle reste une pause après redémarrage).
 */

const CONFIG_NAME = 'ontogenesis.json';
const BAT_NAME = 'GenOS_Ontogenesis.bat';

function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function configDir() {
  return process.env.GENOS_CONFIG_DIR || path.join(repoRoot(), '.genos');
}

function configFile() {
  return path.join(configDir(), CONFIG_NAME);
}

function startupDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function defaultConfig() {
  return { enabled: false, projectId: null, updatedAt: null };
}

function getAutostartConfig() {
  try {
    if (fs.existsSync(configFile())) return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) };
  } catch (_) {
    return defaultConfig();
  }
  return defaultConfig();
}

function saveAutostartConfig(values) {
  if (!fs.existsSync(configDir())) fs.mkdirSync(configDir(), { recursive: true });
  const updated = { ...getAutostartConfig(), ...values, updatedAt: new Date().toISOString() };
  const tmp = `${configFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf8');
  fs.renameSync(tmp, configFile());
  return updated;
}

function batContent(projectId) {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error('projectId-invalide');
  const escaped = projectId.replace(/"/g, '""');
  return `@echo off\r\ncd /d "${repoRoot()}"\r\nnode "backend\\bin\\genos-ontogenesis.cjs" status --project "${escaped}" --json > NUL 2>&1\r\nif %errorlevel% neq 0 exit /b 1\r\nfor /f "tokens=2 delims=:" %%a in ('node "backend\\bin\\genos-ontogenesis.cjs" status --project "${escaped}" --json ^| findstr /c:"control"') do set CTRL=%%a\r\nset CTRL=%CTRL:\"=%\r\nset CTRL=%CTRL: =%\r\nset CTRL=%CTRL:,=%\r\nif "%CTRL%"=="paused" exit /b 0\r\nif "%CTRL%"=="stopping" exit /b 0\r\nif "%CTRL%"=="stopped" exit /b 0\r\nstart "" /min "${process.execPath}" "backend\\bin\\genos-ontogenesis.cjs" run --project "${escaped}"\r\n`;
}

function batPath(directory) {
  return path.join(directory || startupDir(), BAT_NAME);
}

function enableAutostart(input) {
  if (!input.projectId) throw new Error('projectId-requis');
  const target = batPath(input.startupDir);
  fs.writeFileSync(target, batContent(input.projectId), 'utf8');
  return { config: saveAutostartConfig({ enabled: true, projectId: input.projectId }), batFile: target };
}

function disableAutostart(input) {
  const target = batPath((input && input.startupDir) || undefined);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  return { config: saveAutostartConfig({ enabled: false }), batFile: target };
}

module.exports = { getAutostartConfig, enableAutostart, disableAutostart, batPath };
