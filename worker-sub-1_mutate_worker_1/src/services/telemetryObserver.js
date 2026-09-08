/**
 * GenOS Telemetry Observer Service (Rule 7 Compliant)
 * Non-blocking ring buffer event bus, SSE streamer, and disk/DB synchronizer.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const { getDatabase } = require('../db');
const webhookService = require('./webhookService');
const snapshotStore = require('./workspaceSnapshotStore');

const MAX_RING_BUFFER_SIZE = 10000;
const STREAM_CANDIDATE_FILES = [
  path.resolve(__dirname, '../../../.agents/telemetry_observer_5/telemetry_stream.json'),
  path.resolve(__dirname, '../../../.agents/telemetry_observer/telemetry_stream.json')
];

class TelemetryObserver extends EventEmitter {
  constructor() {
    super();
    this.ringBuffer = [];
    this.sseClients = new Set();
    this.persistQueue = [];
    this.persisting = false;
    this.maxPersistQueue = Math.max(1, Number(process.env.GENOS_TELEMETRY_QUEUE_CAPACITY) || 4096);
    this.persistedEvents = 0;
    this.maxTelemetryRows = Math.max(1000, Number(process.env.GENOS_TELEMETRY_RETENTION_ROWS) || 100000);
    this.maxTraceRows = Math.max(1000, Number(process.env.GENOS_TRACE_RETENTION_ROWS) || 100000);
    this.maxTokenRows = Math.max(1000, Number(process.env.GENOS_TOKEN_RETENTION_ROWS) || 500000);
    this.loadInitialStream();
  }

  loadInitialStream() {
    for (const filePath of STREAM_CANDIDATE_FILES) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.events && Array.isArray(parsed.events)) {
            parsed.events.forEach(e => {
              this.pushToBuffer({
                id: e.event_id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                timestamp: e.timestamp || new Date().toISOString(),
                eventType: e.type || 'SYSTEM_EVENT',
                agentId: e.source || 'system',
                action: e.type || 'INFO',
                detail: e.message || '',
                severity: 'info',
                payload: e
              });
            });
          }
        }
      } catch (err) {
        console.warn('[TelemetryObserver] Could not load stream file:', filePath, err.message);
      }
    }
  }

  pushToBuffer(event) {
    if (this.ringBuffer.length >= MAX_RING_BUFFER_SIZE) {
      this.ringBuffer.shift(); // Evict oldest
    }
    this.ringBuffer.push(event);
  }

  emitEvent(eventData) {
    const { asyncLocalStorage } = require('./asyncContext');
    const store = asyncLocalStorage.getStore();
    const traceId = store ? store.get('traceId') : null;
    const reqId = store ? store.get('requestId') : null;

    const payload = eventData.payload || {};
    if (traceId && !payload.traceId) payload.traceId = traceId;
    if (reqId && !payload.requestId) payload.requestId = reqId;

    const event = {
      id: eventData.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: eventData.timestamp || new Date().toISOString(),
      eventType: eventData.eventType || 'AGENT_EVENT',
      agentId: eventData.agentId || 'system',
      action: eventData.action || 'EXECUTE',
      detail: eventData.detail || eventData.message || '',
      severity: eventData.severity || 'info',
      status: eventData.status || 'SUCCESS',
      payload
    };

    this.pushToBuffer(event);
    this.broadcastSSE(event);
    this.persistAsync(event);
    this.emit('telemetry', event);
    webhookService.dispatch(event);
    return event;
  }

  broadcastSSE(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  addSSEClient(res) {
    this.sseClients.add(res);
    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  persistAsync(event) {
    if (this.persistQueue.length >= this.maxPersistQueue) this.persistQueue.shift();
    this.persistQueue.push(event);
    if (this.persisting) return;
    setImmediate(() => this.drainPersistQueue());
  }

  async drainPersistQueue() {
    this.persisting = true;
    try {
      while (this.persistQueue.length) {
        const queuedEvent = this.persistQueue.shift();
        try {
          const db = await getDatabase();
          await db.run(
          `INSERT OR IGNORE INTO telemetry_events (event_id, session_id, agent_id, event_type, action, detail, payload_json, severity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            queuedEvent.id, queuedEvent.sessionId || 'session_live', queuedEvent.agentId, queuedEvent.eventType,
            queuedEvent.action, queuedEvent.detail, JSON.stringify(queuedEvent.payload), queuedEvent.severity
          );
          this.persistedEvents += 1;
          if (this.persistedEvents % 1000 === 0) await this.pruneHistory(db);
          const provenanceTypes = new Set(['BELIEF_CREATED', 'BELIEF_UPDATED', 'AGENT_COMPLETED', 'AGENT_FAILED', 'TOOL_CALL_COMPLETED', 'MCTS_NODE_PRUNED', 'EVALUATION_COMPLETED']);
          if (provenanceTypes.has(queuedEvent.eventType)) {
            const payloadJson = JSON.stringify({ eventId: queuedEvent.id, eventType: queuedEvent.eventType, agentId: queuedEvent.agentId, action: queuedEvent.action, detail: queuedEvent.detail, payload: queuedEvent.payload });
            const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
            await db.run('INSERT OR IGNORE INTO provenance_records (id, subject_type, subject_id, payload_hash, payload_json) VALUES (?, ?, ?, ?, ?)', `prov-event-${queuedEvent.id}`, queuedEvent.eventType.toLowerCase(), queuedEvent.id, payloadHash, payloadJson);
          }
          await this.persistWorkspaceMilestone(db, queuedEvent);
          if (queuedEvent.eventType === 'AGENT_COMPLETED') await this.generateWorkspaceReadme(db, queuedEvent.agentId);
        } catch (err) {
          // Persistence must not block the live runtime.
        }
      }
    } finally {
      this.persisting = false;
      if (this.persistQueue.length) setImmediate(() => this.drainPersistQueue());
    }
  }

  async pruneHistory(db) {
    await db.run('DELETE FROM telemetry_events WHERE id NOT IN (SELECT id FROM telemetry_events ORDER BY id DESC LIMIT ?)', this.maxTelemetryRows);
    await db.run('DELETE FROM trace_spans WHERE id NOT IN (SELECT id FROM trace_spans ORDER BY created_at DESC LIMIT ?)', this.maxTraceRows);
    await db.run('DELETE FROM model_job_tokens WHERE id NOT IN (SELECT id FROM model_job_tokens ORDER BY id DESC LIMIT ?)', this.maxTokenRows);
  }

  async persistWorkspaceMilestone(db, event) {
    const milestoneTypes = new Set([
      'AGENT_QUEUED', 'AGENT_RUNTIME_STARTED', 'AGENT_PLAN_CREATED',
      'AGENT_STEP', 'TOOL_CALL_COMPLETED', 'AGENT_COMPLETED', 'AGENT_FAILED',
      'AGENT_RUNTIME_ERROR'
    ]);
    if (!event.agentId || !milestoneTypes.has(event.eventType)) return;

    const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', event.agentId);
    if (!agent?.workspace_id) return;
    const workspace = await db.get('SELECT id, name, path FROM workspaces WHERE id = ?', agent.workspace_id);
    if (!workspace) return;

    // Capture the actual workspace payload before indexing the milestone. The
    // previous implementation wrote only a telemetry-shaped metadata row,
    // which made restore and test bisection impossible.
    await snapshotStore.capture({
      db,
      workspace,
      label: `${event.eventType}: ${event.action}`,
      reason: event.detail || 'Agent execution milestone',
      author: event.agentId
    });
  }

  async generateWorkspaceReadme(db, completedAgentId) {
    const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', completedAgentId);
    if (!agent?.workspace_id) return;
    const workspace = await db.get('SELECT id, name, path FROM workspaces WHERE id = ?', agent.workspace_id);
    if (!workspace?.path || !fs.existsSync(workspace.path)) return;

    const allAgents = await db.all('SELECT id, name, about, current_task, status FROM agents WHERE workspace_id = ? ORDER BY name', workspace.id);
    if (!allAgents.length || allAgents.some(item => item.status === 'running')) return;
    const completions = await db.all("SELECT DISTINCT agent_id FROM telemetry_events WHERE event_type = 'AGENT_COMPLETED' AND agent_id IN (SELECT id FROM agents WHERE workspace_id = ?)", workspace.id);
    const completedIds = new Set(completions.map(item => item.agent_id));
    const agents = allAgents.filter(item => completedIds.has(item.id));
    if (!agents.length) return;

    let changedFiles = [];
    try {
      const status = execFileSync('git', ['-C', workspace.path, 'status', '--short'], { encoding: 'utf8', timeout: 5000 });
      changedFiles = status.split('\n').filter(Boolean).map(line => line.slice(3).trim()).filter(file => file && file.toLowerCase() !== 'readme.md' && !file.startsWith('backend/genos.db-'));
    } catch (_) {}

    const summarize = (agentInfo) => {
      const source = agentInfo.about || agentInfo.current_task || 'Tâche d’implémentation GenOS';
      return source.replace(/\s+/g, ' ').trim().slice(0, 420);
    };
    const generatedAt = new Date().toISOString();
    const lines = [
      `# ${workspace.name}`,
      '',
      '> README généré automatiquement à la fin du travail des agents.',
      `> Dernière génération : ${generatedAt}`,
      '',
      '## Travaux effectués',
      '',
      ...agents.map(item => `- **${item.name}** — ${summarize(item)}`),
      '',
      '## Fichiers touchés',
      '',
      ...(changedFiles.length ? changedFiles.map(file => `- \`${file}\``) : ['- Aucun fichier modifié détecté.']),
      '',
      '## État',
      '',
      'Les agents listés ci-dessus ont terminé leur session et sont actuellement inactifs.'
    ];
    const existingReadme = ['README.md', 'readme.md'].some((name) => fs.existsSync(path.join(workspace.path, name)));
    fs.writeFileSync(path.join(workspace.path, existingReadme ? 'GENOS_REPORT.md' : 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  }

  getRecentEvents(limit = 100, filterType = null) {
    let result = [...this.ringBuffer];
    if (filterType) {
      result = result.filter(e => e.eventType === filterType);
    }
    return result.slice(-limit).reverse();
  }
}

const telemetryService = new TelemetryObserver();

module.exports = telemetryService;
