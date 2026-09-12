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
const { terminateChild } = require('./processTermination');
const fs = require('fs');
const path = require('path');

const {
  repositoryRoot,
  SAFE_GENOS_ENV,
  genosEnvironment,
  resolveGenosBin,
  studioBridgeRoot,
  ensureRoot,
  parseCommandLine
} = require('./genosCliEnv');

function runGenosSync(commandLine, options = {}) {
  const { timeoutMs = 60000, ...rest } = options;
  const args = parseCommandLine(commandLine);
  if (args[0] === 'genos') args.shift();
  const bin = resolveGenosBin();
  if (!fs.existsSync(bin)) throw new Error(`genos binary not found at ${bin}.`);
  const root = ensureRoot();
  return execFileSync(bin, args, {
    cwd: root,
    env: genosEnvironment(root),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: Math.max(1, Number(timeoutMs) || 60000),
    killSignal: 'SIGTERM',
    ...rest
  });
}

/**
 * Runs `genos <args>` with cwd pinned to the bridge root. Resolves with a
 * structured result — never rejects — so controllers can surface exit
 * codes and stderr to the operator.
 */
function runGenos(args, { timeoutMs = 60000, root: rootOverride = null } = {}) {
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
    const root = ensureRoot(rootOverride);
    const child = spawn(bin, args, {
      cwd: root,
      env: genosEnvironment(root),
      windowsHide: true,
      detached: process.platform !== 'win32'
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        terminateChild(child);
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
function resolveInRoot(reference, rootOverride = null) {
  const root = path.resolve(studioBridgeRoot(rootOverride));
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
  if (options.genesA) {
    args.push('--genes-a', typeof options.genesA === 'string' ? options.genesA : JSON.stringify(options.genesA));
  }
  if (options.genesB) {
    args.push('--genes-b', typeof options.genesB === 'string' ? options.genesB : JSON.stringify(options.genesB));
  }
  if (options.seed !== undefined) args.push('--seed', String(options.seed));
  const result = await runGenos(args);
  if (!result.json) return result;
  const replayInput = {
    version: 'genos-crossover-v1',
    parentA,
    parentB,
    genesA: options.genesA ?? null,
    genesB: options.genesB ?? null,
    swapProb: options.swapProb ?? 0.5,
    crossoverPoint: options.crossoverPoint ?? null,
    speciationThreshold: options.speciationThreshold ?? null,
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
  const res = await runGenos(args);
  if (res.ok && res.json) {
    try {
      const { getDatabase } = require('../db');
      const db = await getDatabase();
      const isApoptotic = res.json.mother_lysed ? 1 : 0;
      const isSenescent = res.json.is_senescent || (res.json.remaining_buds === 0);
      const mother = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId).catch(() => null);
      const workspaceId = mother?.workspace_id || 'workspace-default';
      const reproductionMode = String(res.json.division_mode || mode).toLowerCase();
      const parentGenomeId = res.json.parent_genome_id || res.json.mother_genome_id;
      const lineageNodeType = reproductionMode === 'schizogony' ? 'speculative_merozoite' : reproductionMode;
      const progenyIds = reproductionMode === 'mitosis'
        ? [res.json.clone_genome_id]
        : reproductionMode === 'binary_fission'
          ? [res.json.daughter_b_id || res.json.child_genome_id]
          : reproductionMode === 'budding'
            ? [res.json.daughter_genome_id]
            : reproductionMode === 'schizogony'
              ? (Array.isArray(res.json.progeny_genome_ids) ? res.json.progeny_genome_ids : [])
              : reproductionMode === 'meiosis'
                ? (Array.isArray(res.json.gamete_genome_ids) ? res.json.gamete_genome_ids : [])
                : [];
      if (parentGenomeId && progenyIds.length) {
        await db.run(
          `INSERT OR IGNORE INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
           VALUES (?, ?, ?, ?, 'agent', 'Reproduction parent')`,
          agentId,
          workspaceId,
          agentId,
          `Reproduction parent ${agentId}`
        );
        for (const [index, progenyId] of progenyIds.filter(Boolean).filter((id) => id !== parentGenomeId).entries()) {
          await db.run(
            `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, state_summary, metadata)
             VALUES (?, ?, ?, ?, 0.5, 0, 'Reproduction descendant', ?)
             ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, node_type = excluded.node_type, state_summary = excluded.state_summary, metadata = excluded.metadata`,
            progenyId,
            workspaceId,
            `${reproductionMode} descendant ${index + 1} of ${agentId}`,
            lineageNodeType,
            JSON.stringify({ parentAgentId: agentId, motherAgentId: reproductionMode === 'schizogony' ? agentId : undefined, parentGenomeId, branchIndex: index, reproductionMode, seed: res.json.seed })
          );
          await db.run(
            `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, metadata)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
            `edge_${agentId}_${progenyId}`,
            workspaceId,
            agentId,
            progenyId,
            reproductionMode,
            JSON.stringify({ reproductionMode, branchIndex: index })
          );
        }
      }
      if (isApoptotic) {
        await db.run(
          `UPDATE agents SET is_apoptotic = 1, status = 'apoptosis', cognitive_budget = 0, current_task = 'Lysed following schizogony', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          agentId
        ).catch(() => {});
        await db.run(
          `UPDATE lineage_nodes SET state_summary = 'Lysed mother cell (schizogony burst)' WHERE id = ? OR agent_id = ?`,
          agentId, agentId
        ).catch(() => {});
      } else if (isSenescent) {
        await db.run(
          `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Hayflick limit)' WHERE id = ? OR agent_id = ?`,
          agentId, agentId
        ).catch(() => {});
      }
    } catch (_) {}
  }
  return res;
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
  const res = await runGenos(args);
  if (res.ok && res.json) {
    try {
      const { getDatabase } = require('../db');
      const db = await getDatabase();
      const remaining = res.json.remaining_divisions;
      if (remaining === 0) {
        await db.run(
          `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Telomere exhaustion)' WHERE id = ? OR agent_id = ?`,
          agentId, agentId
        ).catch(() => {});
      }
    } catch (_) {}
  }
  return res;
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
