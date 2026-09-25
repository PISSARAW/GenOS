'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GIB = 1024 ** 3;
let volumeCache = null;
let volumeRootsCache = null;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function readPressure(resource) {
  if (process.platform !== 'linux') return null;
  try {
    const line = fs.readFileSync(`/proc/pressure/${resource}`, 'utf8').split('\n')[0];
    const match = line.match(/avg10=([\d.]+)/);
    return match ? Number(match[1]) : null;
  } catch (_) {
    return null;
  }
}

function readMemoryLimit() {
  if (process.platform !== 'linux') return null;
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const limit = Number(raw);
    return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
  } catch (_) {
    return null;
  }
}

function readCgroupMemoryAvailable(limit) {
  if (!limit || process.platform !== 'linux') return null;
  try {
    const used = Number(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
    return Number.isSafeInteger(used) ? Math.max(0, limit - used) : null;
  } catch (_) {
    return null;
  }
}

function inspectVolume(directory) {
  try {
    let target = path.resolve(directory);
    while (!fs.existsSync(target)) {
      const parent = path.dirname(target);
      if (parent === target) return null;
      target = parent;
    }
    const resolved = fs.realpathSync(target);
    const stat = fs.statfsSync(resolved);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const availableBytes = Number(stat.bavail) * Number(stat.bsize);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(availableBytes)) return null;
    return {
      path: resolved,
      totalBytes,
      availableBytes,
      freeRatio: Math.max(0, Math.min(1, availableBytes / totalBytes))
    };
  } catch (_) {
    return null;
  }
}

function volumeRoots() {
  if (process.platform === 'win32') {
    try {
      const command = '[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq "Fixed" -and $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName }';
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
        { encoding: 'utf8', timeout: 5000, windowsHide: true }).split(/\r?\n/).filter(Boolean);
    } catch (_) {
      return [path.parse(process.cwd()).root];
    }
  }
  if (process.platform !== 'linux') return [path.parse(process.cwd()).root];
  try {
    return fs.readFileSync('/proc/mounts', 'utf8').split('\n')
      .map((line) => line.split(' '))
      .filter((fields) => fields[0]?.startsWith('/dev/') && fields[1])
      .map((fields) => fields[1]);
  } catch (_) {
    return ['/'];
  }
}

function discoverVolumes() {
  if (volumeCache && Date.now() - volumeCache.observedAt < 60000) return volumeCache.volumes;
  const volumes = cachedVolumeRoots().map(inspectVolume).filter(Boolean);
  volumeCache = { observedAt: Date.now(), volumes };
  return volumes;
}

function discoverVolumesFresh() {
  const volumes = cachedVolumeRoots().map(inspectVolume).filter(Boolean);
  volumeCache = { observedAt: Date.now(), volumes };
  return volumes;
}

function cachedVolumeRoots() {
  if (!volumeRootsCache || Date.now() - volumeRootsCache.observedAt >= 60000) {
    volumeRootsCache = { observedAt: Date.now(), roots: volumeRoots() };
  }
  return volumeRootsCache.roots;
}

function alternativeVolume(current, volumes) {
  const active = volumes.filter((volume) => current &&
    (current.path === volume.path || current.path.startsWith(volume.path + path.sep)))
    .sort((left, right) => right.path.length - left.path.length)[0];
  const alternatives = volumes.filter((volume) =>
    volume.path !== active?.path && volume.availableBytes >= GIB);
  alternatives.sort((left, right) => right.freeRatio - left.freeRatio ||
    right.availableBytes - left.availableBytes);
  return alternatives[0] || null;
}

function readHostEnvironment(options = {}) {
  const memoryLimit = readMemoryLimit();
  const totalMemoryBytes = Math.min(os.totalmem(), memoryLimit || Infinity);
  const freeMemoryBytes = Math.min(os.freemem(), totalMemoryBytes,
    readCgroupMemoryAvailable(memoryLimit) ?? Infinity);
  const cpuCount = positiveInteger(os.availableParallelism?.(), os.cpus().length);
  const volume = inspectVolume(options.dataPath || process.cwd());
  const volumes = discoverVolumes();
  return {
    observedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    cpuCount,
    load1m: process.platform === 'win32' ? null : os.loadavg()[0],
    totalMemoryBytes,
    freeMemoryBytes,
    pressure: {
      cpu: readPressure('cpu'),
      memory: readPressure('memory'),
      io: readPressure('io')
    },
    volume,
    volumes,
    alternativeVolume: alternativeVolume(volume, volumes)
  };
}

function hostSignals(profile) {
  const cpuCount = Math.max(1, positiveInteger(profile.cpuCount, 1));
  return {
    freeMemoryRatio: profile.totalMemoryBytes > 0 ? profile.freeMemoryBytes / profile.totalMemoryBytes : 0,
    diskFreeRatio: profile.volume?.freeRatio ?? null,
    memoryPressure: profile.pressure?.memory ?? 0,
    ioPressure: profile.pressure?.io ?? 0,
    loadRatio: profile.load1m === null ? 0 : profile.load1m / cpuCount
  };
}

function pressureReasons(signals) {
  const reasons = [];
  if (signals.freeMemoryRatio < 0.15) reasons.push('memory_capacity');
  if (signals.memoryPressure >= 10) reasons.push('memory_stall');
  if (signals.ioPressure >= 20) reasons.push('io_stall');
  if (signals.loadRatio >= 0.85) reasons.push('cpu_load');
  return reasons;
}

function diskNeedsRelief(profile, signals, minimumFreeBytes) {
  if (!profile.volume) return true;
  return profile.volume.availableBytes < minimumFreeBytes || signals.diskFreeRatio < 0.05;
}

function deriveAdaptivePolicy(profile, options = {}) {
  const cpuCount = Math.max(1, positiveInteger(profile.cpuCount, 1));
  const signals = hostSignals(profile);
  const reasons = pressureReasons(signals);
  const minimumFreeBytes = positiveInteger(options.minimumFreeBytes, GIB);
  const diskCritical = diskNeedsRelief(profile, signals, minimumFreeBytes);
  if (diskCritical) reasons.unshift(profile.volume ? 'disk_capacity' : 'volume_unknown');
  const constrained = reasons.length > 0;
  const cpuBudget = Math.max(1, cpuCount - 1);
  const normalWorkers = Math.min(4, cpuBudget);
  const maxWorkers = diskCritical || constrained ? 1 : normalWorkers;
  return {
    state: diskCritical ? 'critical' : constrained ? 'constrained' : 'normal',
    maxWorkers,
    allowLocalModel: !constrained && cpuCount >= 4,
    allowBackgroundGrowth: !constrained,
    suggestedDataVolume: diskCritical ? profile.alternativeVolume?.path || null : null,
    signals,
    reasons
  };
}

module.exports = { deriveAdaptivePolicy, discoverVolumes, discoverVolumesFresh, inspectVolume, readHostEnvironment };
