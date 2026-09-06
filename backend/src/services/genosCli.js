/**
 * GenOS CLI Bridge Service
 *
 * Spawns the Rust `genos` binary so Studio can operate the real core
 * (snapshots, hallucination analysis, replay, diff) instead of the
 * Node-side reimplementations. All state lives under a dedicated root so
 * bridge operations never mix with the backend's SQLite store.
 */

const { spawn, execFileSync } = require('child_process');
const { appendBounded } = require('./boundedOutput');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');

function resolveGenosBin() {
  const exe = process.platform === 'win32' ? 'genos.exe' : 'genos';
  const repoDebug = path.join(repositoryRoot, 'target', 'debug', exe);
  const repoRelease = path.join(repositoryRoot, 'target', 'release', exe);

  if (process.env.GENOS_BIN && fs.existsSync(process.env.GENOS_BIN)) {
    const isLegacySystemInstall = process.env.GENOS_BIN.toLowerCase().includes('program files');
    if (isLegacySystemInstall && (fs.existsSync(repoDebug) || fs.existsSync(repoRelease))) {
      return fs.existsSync(repoDebug) ? repoDebug : repoRelease;
    }
    return process.env.GENOS_BIN;
  }

  if (fs.existsSync(repoDebug)) return repoDebug;
  if (fs.existsSync(repoRelease)) return repoRelease;
  return repoDebug;
}

function studioBridgeRoot() {
  return process.env.GENOS_STUDIO_ROOT || path.join(repositoryRoot, '.genos-matrix');
}

function ensureRoot() {
  const root = studioBridgeRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function parseCommandLine(commandLine) {
  const args = [];
  let current = '';
  let quote = null;
  let escaping = false;
  for (const char of String(commandLine)) {
    if (escaping) {
      current += char;
      escaping = false;
    } else if (char === '\\' && quote !== "'") {
      escaping = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (escaping) current += '\\';
  if (quote) throw new Error('Unterminated quote in GenOS CLI command.');
  if (current) args.push(current);
  return args;
}

function runGenosSync(commandLine, { timeoutMs = 60000 } = {}) {
  const args = parseCommandLine(commandLine);
  if (args[0] === 'genos') args.shift();
  const bin = resolveGenosBin();
  if (!fs.existsSync(bin)) throw new Error(`genos binary not found at ${bin}.`);
  return execFileSync(bin, args, {
    cwd: ensureRoot(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: Math.max(1, Number(timeoutMs) || 60000),
    killSignal: 'SIGTERM'
  });
}

/**
 * Runs `genos <args>` with cwd pinned to the bridge root. Resolves with a
 * structured result — never rejects — so controllers can surface exit
 * codes and stderr to the operator.
 */
function runGenos(args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolvePromise) => {
    const bin = resolveGenosBin();
    if (!fs.existsSync(bin)) {
      return resolvePromise({
        ok: false,
        code: 'BIN_NOT_FOUND',
        error: `genos binary not found at ${bin}. Build it with: cargo build -p genos-cli`
      });
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(bin, args, {
      cwd: ensureRoot(),
      env: { ...process.env },
      windowsHide: true
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolvePromise({ ok: false, code: 'TIMEOUT', error: `genos ${args[0]} timed out after ${timeoutMs}ms`, stdout, stderr });
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolvePromise({ ok: false, code: 'SPAWN_FAILED', error: err.message });
      }
    });

    child.on('close', (exitCode) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        let json = null;
        try {
          json = JSON.parse(stdout);
        } catch {}
        resolvePromise({ ok: exitCode === 0, exitCode, stdout, stderr, json, data: json });
      }
    });
  });
}

/** Resolves a user-supplied snapshot reference inside the bridge root. */
function resolveInRoot(reference) {
  const root = path.resolve(studioBridgeRoot());
  const resolved = path.resolve(root, reference);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

const protobuf = require('protobufjs');
const zlib = require('zlib');
const crypto = require('crypto');

async function phagocytizeExosomes() {
  const exosomeDir = path.join(studioBridgeRoot(), 'extracellular_matrix');
  if (!fs.existsSync(exosomeDir)) return [];
  const exosomes = [];
  const files = fs.readdirSync(exosomeDir);
  const root = await protobuf.load(path.join(__dirname, '../proto/synapse.proto'));
  const Exosome = root.lookupType("synapse.Exosome");

  for (const file of files) {
    if (file.startsWith('exosome_') && file.endsWith('.exosome')) {
      try {
        const fullPath = path.join(exosomeDir, file);
        const compressed = fs.readFileSync(fullPath);
        const buffer = zlib.gunzipSync(compressed);
        const message = Exosome.decode(buffer);
        exosomes.push({ ...Exosome.toObject(message, { arrays: true, keepCase: true }), __sourcePath: fullPath });
      } catch (e) {
        console.error('Failed to phagocytize exosome:', file, e);
      }
    }
  }
  return exosomes;
}

async function runCrossover(options = {}) {
  const parentA = options.parentA || 'PARENT_ALPHA';
  const parentB = options.parentB || 'PARENT_BETA';
  const args = ['evolution', 'crossover', '--parent-a', String(parentA), '--parent-b', String(parentB)];
  if (options.swapProb !== undefined) {
    args.push('--swap-prob', String(options.swapProb));
  }
  if (options.crossoverPoint !== undefined) {
    args.push('--crossover-point', String(options.crossoverPoint));
  }
  if (options.speciationThreshold !== undefined) {
    args.push('--speciation-threshold', String(options.speciationThreshold));
  }
  if (options.seed !== undefined) args.push('--seed', String(options.seed));
  const result = await runGenos(args);
  if (!result.json) return result;
  const replayInput = {
    version: 'genos-crossover-v1',
    parentA,
    parentB,
    swapProb: options.swapProb ?? 0.5,
    crossoverPoint: options.crossoverPoint ?? null,
    seed: options.seed ?? 'genos-default-crossover'
  };
  const reproducibilityKey = crypto.createHash('sha256').update(JSON.stringify(replayInput)).digest('hex');
  return { ...result, json: { ...result.json, reproducibility_key: reproducibilityKey } };
}

async function runCellDivision(options = {}) {
  const agentId = options.agentId || 'cell_division_root';
  const mode = options.mode || 'mitosis';
  const args = ['evolution', 'division', '--agent-id', String(agentId), '--mode', String(mode)];
  if (options.mutationRate !== undefined) args.push('--mutation-rate', String(options.mutationRate));
  if (options.daughterVolume !== undefined) args.push('--daughter-volume', String(options.daughterVolume));
  if (options.merozoiteCount !== undefined) args.push('--merozoite-count', String(options.merozoiteCount));
  if (options.hayflickLimit !== undefined) args.push('--hayflick-limit', String(options.hayflickLimit));
  if (options.seed !== undefined) args.push('--seed', String(options.seed));
  return runGenos(args);
}

async function runPhylogeny(options = {}) {
  const action = options.action || 'divergence';
  const genomeA = options.genomeA || 'GENOME_A';
  const args = ['evolution', 'phylogeny', '--action', String(action), '--genome-a', String(genomeA)];
  if (options.genomeB) args.push('--genome-b', String(options.genomeB));
  if (options.mutationRate !== undefined) args.push('--mutation-rate', String(options.mutationRate));
  if (options.isPlant) args.push('--is-plant');
  return runGenos(args);
}

async function runCryptobiosisFreeze(agentId, options = {}) {
  const args = ['biomimicry', 'cryptobiosis', '--agent-id', String(agentId), '--action', 'freeze'];
  if (options.state) {
    const stateStr = typeof options.state === 'string' ? options.state : JSON.stringify(options.state);
    args.push('--state', stateStr);
  }
  return runGenos(args);
}

async function runCryptobiosisThaw(agentId) {
  const args = ['biomimicry', 'cryptobiosis', '--agent-id', String(agentId), '--action', 'thaw'];
  return runGenos(args);
}

async function runFossilize(lineageId, reason) {
  const args = ['fossil', 'record', '--lineage-id', String(lineageId), '--reason', String(reason || 'Apoptosis / natural pruning')];
  return runGenos(args);
}

async function runListFossils() {
  const args = ['fossil', 'list'];
  return runGenos(args);
}

async function runTelomereFork(agentId, options = {}) {
  const args = ['biomimicry', 'telomere-fork', '--agent-id', String(agentId)];
  if (options.forceTelomerase) args.push('--force-telomerase');
  return runGenos(args);
}

module.exports = {
  runGenos,
  runGenosSync,
  parseCommandLine,
  resolveGenosBin,
  studioBridgeRoot,
  ensureRoot,
  resolveInRoot,
  repositoryRoot,
  phagocytizeExosomes,
  runCrossover,
  runCellDivision,
  runTelomereFork,
  runPhylogeny,
  runCryptobiosisFreeze,
  runCryptobiosisThaw,
  runFossilize,
  runListFossils
};
