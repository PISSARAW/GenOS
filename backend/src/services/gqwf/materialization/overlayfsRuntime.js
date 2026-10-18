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
  const content = await mountInfo();
  if (content === null) return false;
  return content.split('\n').some((line) => {
    const fields = line.split(' ');
    return fields.length > 4 && decodeMountPath(fields[4]) === target;
  });
}

async function mountInfo() {
  try {
    return await fs.readFile('/proc/self/mountinfo', 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function lowerDirectories(line) {
  const separator = line.indexOf(' - ');
  if (separator < 0) return [];
  const fields = line.slice(separator + 3).split(' ');
  if (fields[0] !== 'overlay' || !fields[2]) return [];
  const option = fields[2].split(',').find((entry) => entry.startsWith('lowerdir='));
  return option ? decodeMountPath(option.slice('lowerdir='.length)).split(':') : [];
}

async function usesLower(target) {
  const content = await mountInfo();
  return content !== null && content.split('\n')
    .some((line) => lowerDirectories(line).includes(target));
}

function createRuntime(overrides = {}) {
  return {
    platform: overrides.platform || process.platform,
    mount: overrides.mount || mount,
    unmount: overrides.unmount || unmount,
    isMounted: overrides.isMounted || isMounted,
    usesLower: overrides.usesLower || usesLower
  };
}

module.exports = { createRuntime, lowerDirectories };
