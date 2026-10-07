'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

function codePaths() {
  const directory = process.env.B06_CODE_ROOT || path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code');
  const command = fs.readFileSync(path.join(directory, 'bin', 'code.cmd'), 'utf8');
  const match = command.match(/%~dp0\.\.\\([^"\r\n]+cli\.js)/);
  if (!match) throw new Error('VS Code CLI entry not found');
  return { executable: path.join(directory, 'Code.exe'), cli: path.join(directory, match[1]) };
}

async function run(spec, output) {
  const native = codePaths();
  const extensionsDir = path.join(spec.root, 'extensions');
  const userData = path.join(spec.root, 'vscode-profile');
  const vsix = path.join(spec.root, 'genos-runtime.vsix');
  const python = process.env.B06_PYTHON || 'python';
  await execute(python, [path.resolve(__dirname, '../../..', 'integrations/ide/vscode/package_vsix.py'), vsix], { windowsHide: true });
  const common = ['--user-data-dir', userData, '--extensions-dir', extensionsDir];
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  const install = await execute(native.executable, [native.cli, ...common, '--install-extension', vsix], { env, windowsHide: true, timeout: 60000 });
  fs.writeFileSync(path.join(output, 'ide-install.log'), install.stdout + install.stderr);
  const resultPath = path.join(output, 'ide-result.json');
  const configPath = path.join(spec.root, 'ide-config.json');
  fs.writeFileSync(configPath, JSON.stringify({ settings: spec.settings, token: spec.token,
    runId: spec.run.id, extensionsDir, resultPath }));
  const driver = path.resolve(__dirname, '../ideHostDriver');
  const hostEnv = { ...env, B06_IDE_CONFIG: configPath };
  delete hostEnv.ELECTRON_RUN_AS_NODE;
  const launch = await execute(native.executable, [...common, '--new-window', '--skip-welcome', '--disable-updates',
    '--skip-release-notes', '--extensionDevelopmentPath', driver, '--extensionTestsPath', path.join(driver, 'suite.cjs')],
  { env: hostEnv, windowsHide: true, timeout: 150000, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, 'ide-host.log'), launch.stdout + launch.stderr);
  const started = Date.now();
  while (!fs.existsSync(resultPath) && Date.now() - started < 90000) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
}

module.exports = { run };
