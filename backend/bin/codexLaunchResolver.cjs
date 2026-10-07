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

function resolveWindowsPathCommand(trimmed) {
  if (process.platform !== 'win32' || /[\\/]/.test(trimmed)) return null;
  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';');
  const directories = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const extension of extensions) {
      const command = path.join(directory, `${trimmed}${extension.toLowerCase()}`);
      if (fs.existsSync(command)) return { command, args: [] };
    }
  }
  return null;
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
  const pathCommand = resolveWindowsPathCommand(trimmed);
  if (pathCommand) return pathCommand;
  const ext = path.extname(trimmed).toLowerCase();
  if (statIsFile(trimmed) && (['.js', '.cjs', '.mjs', '.py', '.ts'].includes(ext) || !ext)) {
    return { command: process.execPath, args: [trimmed] };
  }
  return { command: trimmed, args: [] };
}

module.exports = { resolveCodexLaunch };
