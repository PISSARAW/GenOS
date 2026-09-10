/**
 * Trinity Monitor Server — broadcasts structured NDJSON events describing the
 * 3 Trinity "worlds" (thesis/antithesis/synthesis workers) and the evidence
 * barrier so the native `genos-tui` (Rust/ratatui) monitor can render them in
 * real time. Listens on a loopback TCP socket by default, or on a UNIX domain
 * socket when GENOS_TRINITY_MONITOR_SOCKET is set (POSIX only).
 */
const net = require('net');
const os = require('os');
const fs = require('fs');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const { evidenceScore } = require('./agentEvidenceService');
const { readPort } = require('./runtimeConfig');

const SNAPSHOT_INTERVAL_MS = Math.max(100, Number(process.env.GENOS_TRINITY_MONITOR_TICK_MS) || 500);
const AGENT_INDEX_REFRESH_MS = 2000;
const MAX_LOG_LINE_LENGTH = 400;
// Slow/stuck clients are disconnected rather than buffered without limit, and
// the unauthenticated receive buffer is capped so a local process cannot OOM
// the monitor (or slowloris it with partial JSON).
const MAX_CLIENT_BUFFER_BYTES = Math.max(4096, Number(process.env.GENOS_TRINITY_MONITOR_CLIENT_BUFFER) || 1024 * 1024);
const MAX_SUBSCRIBE_BYTES = Math.max(256, Number(process.env.GENOS_TRINITY_MONITOR_INPUT_BYTES) || 64 * 1024);
const MAX_PROGRESS_ENTRIES = Math.max(100, Number(process.env.GENOS_TRINITY_MONITOR_PROGRESS_ENTRIES) || 5000);

const BARRIER_EVENT_TYPES = new Set([
  'WORKER_EVIDENCE_BARRIER_STARTED',
  'WORKER_EVIDENCE_BARRIER_SATISFIED',
  'WORKER_EVIDENCE_BARRIER_PARTIAL',
  'WORKER_EVIDENCE_BARRIER_HALTED',
  'WORKER_EVIDENCE_BARRIER_FAILED'
]);
const WORLD_LOG_EVENT_TYPES = new Set([
  'TRINITY_WORLD_SPAWNED', 'AGENT_STARTED', 'AGENT_PROGRESS', 'EVIDENCE_REPORT',
  'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR',
  'WORKER_TASK_FAILED', 'APOPTOSIS_TRIGGERED', 'CELLULAR_APOPTOSIS'
]);

function deriveMissionId(worldRowId) {
  return String(worldRowId || '').replace(/_world_\d+$/, '');
}

// Escape LIKE metacharacters so a mission id containing `_` or `%` cannot
// match another mission's worlds.
function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function formatLogTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString();
}

function clientTokenMatches(message, expected) {
  if (!expected) return true;
  return typeof message.token === 'string' && message.token === expected;
}

function deriveVerdict(status, score) {
  if (status === 'error' || status === 'terminated' || status === 'apoptosis' || status === 'quarantined') return 'REJECTED';
  if (status !== 'completed' && status !== 'idle') return 'PENDING';
  if (score >= 0.85) return 'STRONG (PROMOTED)';
  if (score >= 0.6) return 'ACCEPTABLE';
  return 'WEAK';
}

function deriveProgress(status, previousProgress = 0) {
  if (status === 'queued') return 0;
  if (status === 'running') return Math.min(95, Math.max(10, previousProgress + 5));
  if (['completed', 'error', 'terminated', 'apoptosis', 'quarantined', 'blocked'].includes(status)) return 100;
  return previousProgress;
}

class TrinityMonitorServer {
  constructor() {
    this.server = null;
    this.clients = new Set(); // { socket, missionId: string|'latest' }
    this.agentIndex = new Map(); // agentId -> { missionId, worldNumber, role }
    this.evidenceByAgent = new Map(); // agentId -> 0..1 score
    this.progressByWorld = new Map(); // `${missionId}:${worldNumber}` -> percent
    this.snapshotTimer = null;
    this.indexTimer = null;
    this.snapshotInFlight = false;
    // Monotone server sequence stamped on every emitted payload so the TUI
    // can drop stale re-deliveries (see trinity_tui/model/live_contract.rs).
    this.monitorSeq = 0;
    this.authToken = process.env.GENOS_TRINITY_MONITOR_TOKEN || null;
    this.telemetryHandler = (event) => this.handleTelemetryEvent(event).catch(() => {});
  }

  async refreshAgentIndex() {
    try {
      const db = await getDatabase();
      const worlds = await db.all('SELECT id, agent_id, world_number FROM trinity_worlds WHERE agent_id IS NOT NULL');
      const orchestrators = await db.all("SELECT id, fleet_id FROM agents WHERE execution_mode = 'orchestrator' AND fleet_id IS NOT NULL");
      const nextIndex = new Map();
      for (const world of worlds) {
        nextIndex.set(world.agent_id, { missionId: deriveMissionId(world.id), worldNumber: world.world_number, role: 'worker' });
      }
      for (const orchestrator of orchestrators) {
        nextIndex.set(orchestrator.id, { missionId: orchestrator.fleet_id, worldNumber: 0, role: 'orchestrator' });
      }
      this.agentIndex = nextIndex;
    } catch (error) {
      console.warn('[TrinityMonitor] Agent index refresh failed:', error.message);
    }
  }

  async resolveLatestMissionId() {
    try {
      const db = await getDatabase();
      const row = await db.get('SELECT id FROM trinity_worlds ORDER BY created_at DESC LIMIT 1');
      return row ? deriveMissionId(row.id) : null;
    } catch (_) {
      return null;
    }
  }

  async buildSnapshot(missionId) {
    const db = await getDatabase();
    const worlds = await db.all(
      `SELECT tw.id, tw.world_number, tw.name, tw.strategy, tw.status, tw.agent_id, tw.mission, tw.updated_at,
              a.current_task, a.model_tier, a.status AS agent_status
       FROM trinity_worlds tw
       LEFT JOIN agents a ON a.id = tw.agent_id
       WHERE tw.id LIKE ? ESCAPE '\\'
       ORDER BY tw.world_number ASC`,
      `${escapeLikePattern(missionId)}\\_world\\_%`
    );
    if (!worlds.length) return null;
    const prompt = worlds[0].mission;
    const orchestrator = await db.get(
      "SELECT id, status, current_task FROM agents WHERE fleet_id = ? AND execution_mode = 'orchestrator'",
      missionId
    );
    const worldPayload = worlds.map((world) => {
      const status = world.agent_status || world.status;
      const key = `${missionId}:${world.world_number}`;
      const previousProgress = this.progressByWorld.get(key) || 0;
      const progress = deriveProgress(status, previousProgress);
      this.progressByWorld.set(key, progress);
      if (this.progressByWorld.size > MAX_PROGRESS_ENTRIES) {
        this.progressByWorld.delete(this.progressByWorld.keys().next().value);
      }
      const score = this.evidenceByAgent.get(world.agent_id) || 0;
      return {
        worldNumber: world.world_number,
        name: world.name,
        strategy: world.strategy,
        status,
        agentId: world.agent_id,
        hypothesis: world.current_task || '',
        modelTier: world.model_tier || 'Standard',
        progress,
        evidenceScore: score,
        verdict: deriveVerdict(status, score),
        updatedAt: world.updated_at
      };
    });
    return {
      type: 'snapshot',
      missionId,
      prompt,
      worlds: worldPayload,
      barrier: {
        status: orchestrator ? orchestrator.status : 'unknown',
        detail: orchestrator ? (orchestrator.current_task || '') : 'Orchestrator not found'
      }
    };
  }

  async handleTelemetryEvent(event) {
    const info = this.agentIndex.get(event.agentId);
    if (!info) return;

    if (info.role === 'worker' && WORLD_LOG_EVENT_TYPES.has(event.eventType)) {
      // Evidence must be tracked even when nobody is watching, otherwise
      // snapshots fetched later report a score of 0.
      if (['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'EVIDENCE_REPORT'].includes(event.eventType)) {
        // A null score means "no evidence in this event" and must NOT overwrite
        // a previously good score with 0.
        const rawScore = evidenceScore(event.payload || {});
        if (rawScore !== null) this.evidenceByAgent.set(event.agentId, Math.max(0, Math.min(1, rawScore / 100)));
      }
      if (!this.clients.size) return;
      const line = String(event.detail || event.eventType).slice(0, MAX_LOG_LINE_LENGTH);
      this.broadcast(info.missionId, {
        type: 'log',
        missionId: info.missionId,
        worldNumber: info.worldNumber,
        line: `[${formatLogTimestamp(event.timestamp)}] ${line}`,
        severity: event.severity || 'info',
        timestamp: event.timestamp
      });
      return;
    }

    if (info.role === 'orchestrator' && BARRIER_EVENT_TYPES.has(event.eventType)) {
      if (!this.clients.size) return;
      const statusMap = {
        WORKER_EVIDENCE_BARRIER_STARTED: 'WAITING',
        WORKER_EVIDENCE_BARRIER_SATISFIED: 'SATISFIED',
        WORKER_EVIDENCE_BARRIER_PARTIAL: 'PARTIAL',
        WORKER_EVIDENCE_BARRIER_HALTED: 'HALTED',
        WORKER_EVIDENCE_BARRIER_FAILED: 'FAILED'
      };
      this.broadcast(info.missionId, {
        type: 'barrier',
        missionId: info.missionId,
        status: statusMap[event.eventType] || 'WAITING',
        detail: String(event.detail || '').slice(0, MAX_LOG_LINE_LENGTH)
      });
    }
  }

  writeToClient(client, line) {
    const socket = client.socket;
    if (!client.authenticated || socket.destroyed) {
      if (socket.destroyed) this.clients.delete(client);
      return;
    }
    if (socket.writableLength > MAX_CLIENT_BUFFER_BYTES) {
      socket.destroy();
      this.clients.delete(client);
      return;
    }
    socket.write(line);
  }

  stamp(payload) {
    this.monitorSeq += 1;
    payload.seq = this.monitorSeq;
    return payload;
  }

  broadcast(missionId, payload) {
    const line = `${JSON.stringify(this.stamp(payload))}\n`;
    for (const client of this.clients) {
      if (client.missionId === 'latest' || client.missionId === missionId) {
        this.writeToClient(client, line);
      }
    }
  }

  // `snapshotInFlight` prevents a slow 500ms tick from overlapping the next one.
  async broadcastSnapshots() {
    if (this.snapshotInFlight || !this.clients.size) return;
    this.snapshotInFlight = true;
    try {
      const latestMissionId = await this.resolveLatestMissionId();
      const missionIds = new Set();
      for (const client of this.clients) {
        if (!client.authenticated) continue;
        missionIds.add(client.missionId === 'latest' ? latestMissionId : client.missionId);
      }
      for (const missionId of missionIds) {
        if (!missionId) continue;
        const snapshot = await this.buildSnapshot(missionId).catch(() => null);
        if (!snapshot) continue;
        const line = `${JSON.stringify(this.stamp(snapshot))}\n`;
        for (const client of this.clients) {
          const resolved = client.missionId === 'latest' ? latestMissionId : client.missionId;
          if (resolved === missionId) this.writeToClient(client, line);
        }
      }
    } finally {
      this.snapshotInFlight = false;
    }
  }

  handleClientMessage(client, raw) {
    let message;
    try { message = JSON.parse(raw); } catch (_) { return; }
    if (!message || typeof message !== 'object') return;
    if (!client.authenticated) {
      if (!clientTokenMatches(message, this.authToken)) {
        client.socket.destroy();
        this.clients.delete(client);
        return;
      }
      client.authenticated = true;
    }
    if (typeof message.subscribe === 'string' && message.subscribe.length <= 200) {
      client.missionId = message.subscribe;
    }
  }

  consumeClientLines(client, buffer) {
    let remaining = buffer;
    let newlineIndex;
    // eslint-disable-next-line no-cond-assign
    while ((newlineIndex = remaining.indexOf('\n')) >= 0) {
      const raw = remaining.slice(0, newlineIndex).trim();
      remaining = remaining.slice(newlineIndex + 1);
      if (raw) this.handleClientMessage(client, raw);
    }
    return remaining;
  }

  handleConnection(socket) {
    const client = { socket, missionId: 'latest', authenticated: !this.authToken };
    this.clients.add(client);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > MAX_SUBSCRIBE_BYTES) {
        socket.destroy();
        this.clients.delete(client);
        return;
      }
      buffer = this.consumeClientLines(client, buffer);
    });
    socket.on('error', () => this.clients.delete(client));
    socket.on('close', () => this.clients.delete(client));
  }

  start() {
    if (this.server) return this;
    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.on('error', (error) => {
      console.warn('[TrinityMonitor] Server error:', error.message);
    });

    const socketPath = process.env.GENOS_TRINITY_MONITOR_SOCKET;
    if (socketPath && os.platform() !== 'win32') {
      this.server.listen(socketPath, () => {
        try { fs.chmodSync(socketPath, 0o600); } catch (_) {}
        console.log(`[TrinityMonitor] Listening on UNIX socket ${socketPath}`);
      });
    } else {
      const port = readPort('GENOS_TRINITY_MONITOR_PORT', process.env.GENOS_TRINITY_MONITOR_PORT, 4590);
      this.server.listen(port, '127.0.0.1', () => {
        console.log(`[TrinityMonitor] Listening on 127.0.0.1:${port}`);
      });
    }

    telemetry.on('telemetry', this.telemetryHandler);
    this.indexTimer = setInterval(() => this.refreshAgentIndex(), AGENT_INDEX_REFRESH_MS);
    this.snapshotTimer = setInterval(() => this.broadcastSnapshots().catch(() => {}), SNAPSHOT_INTERVAL_MS);
    // Timers must not, on their own, keep a shutting-down process alive.
    if (typeof this.indexTimer.unref === 'function') this.indexTimer.unref();
    if (typeof this.snapshotTimer.unref === 'function') this.snapshotTimer.unref();
    this.refreshAgentIndex();
    return this;
  }

  stop() {
    clearInterval(this.snapshotTimer);
    clearInterval(this.indexTimer);
    this.snapshotTimer = null;
    this.indexTimer = null;
    telemetry.removeListener('telemetry', this.telemetryHandler);
    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();
    this.progressByWorld.clear();
    this.snapshotInFlight = false;
    const server = this.server;
    this.server = null;
    return new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
  }
}

const instance = new TrinityMonitorServer();

module.exports = {
  start: () => instance.start(),
  stop: () => instance.stop(),
  instance,
  escapeLikePattern,
  formatLogTimestamp
};
