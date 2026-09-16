'use strict';

const fs = require('fs');
const path = require('path');

// On Windows, spawn('codex') without shell fails because Node.js does not
// resolve .exe from PATH the same way as the shell. If the configured
// candidate already names codex.exe (or an absolute path to it), use it
// directly so spawn can find the binary.
function resolveWindowsCodexExe(trimmed) {
  const lower = trimmed.toLowerCase();
  if (process.platform !== 'win32' || !(lower.endsWith('codex.exe') || lower.endsWith('codex'))) return null;
  const withExe = lower.endsWith('.exe') ? trimmed : `${trimmed}.exe`;
  return fs.existsSync(withExe) ? { command: withExe, args: [] } : null;
}

function statIsFile(trimmed) {
  try {
    return fs.existsSync(trimmed) && fs.statSync(trimmed).isFile();
  } catch {
    return false;
  }
}

function resolveCodexLaunch(candidate) {
  if (!candidate || typeof candidate !== 'string') return { command: 'codex', args: [] };
  const trimmed = candidate.trim();
  if (!trimmed) return { command: 'codex', args: [] };
  const windowsExe = resolveWindowsCodexExe(trimmed);
  if (windowsExe) return windowsExe;
  const ext = path.extname(trimmed).toLowerCase();
  if (statIsFile(trimmed) && (['.js', '.cjs', '.mjs', '.py', '.ts'].includes(ext) || !ext)) {
    return { command: process.execPath, args: [trimmed] };
  }
  return { command: trimmed, args: [] };
}

module.exports = { resolveCodexLaunch };
