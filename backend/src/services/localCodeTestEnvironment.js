'use strict';

function build(tempRoot, environment = process.env) {
  const common = {
    PATH: environment.PATH || '/usr/bin:/bin', CI: '1', GENOS_ISOLATED_RUNNER: '1',
    TMPDIR: tempRoot, PYTHONDONTWRITEBYTECODE: '1', PYTEST_ADDOPTS: '-p no:cacheprovider',
    NODE_DISABLE_COMPILE_CACHE: '1'
  };
  if (process.platform !== 'win32') return common;
  return { ...common, SystemRoot: environment.SystemRoot || environment.SYSTEMROOT || 'C:\\Windows',
    SystemDrive: environment.SystemDrive || 'C:', PATHEXT: environment.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    ComSpec: environment.ComSpec || 'cmd.exe', TEMP: tempRoot, TMP: tempRoot };
}

module.exports = { build };
