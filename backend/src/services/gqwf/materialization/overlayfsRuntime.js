'use strict';

const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);

function decodeMountPath(value) {
  return value.replace(/\\([0-7]{3})/g, (_, digits) =>
    String.fromCharCode(Number.parseInt(digits, 8)));
}

async function mount(input) {
  const options = `lowerdir=${input.lower},upperdir=${input.upper},workdir=${input.work}`;
  await run('mount', ['-t', 'overlay', 'overlay', '-o', options, input.merged], {
    windowsHide: true
  });
}

async function unmount(target) {
  await run('umount', [target], { windowsHide: true });
}

async function isMounted(target) {
  let content;
  try {
    content = await fs.readFile('/proc/self/mountinfo', 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return content.split('\n').some((line) => {
    const fields = line.split(' ');
    return fields.length > 4 && decodeMountPath(fields[4]) === target;
  });
}

function createRuntime(overrides = {}) {
  return {
    platform: overrides.platform || process.platform,
    mount: overrides.mount || mount,
    unmount: overrides.unmount || unmount,
    isMounted: overrides.isMounted || isMounted
  };
}

module.exports = { createRuntime };
