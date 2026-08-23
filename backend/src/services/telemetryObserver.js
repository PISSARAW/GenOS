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
    const event = {
      id: eventData.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: eventData.timestamp || new Date().toISOString(),
      eventType: eventData.eventType || 'AGENT_EVENT',
      agentId: eventData.agentId || 'system',
      action: eventData.action || 'EXECUTE',
      detail: eventData.detail || eventData.message || '',
      severity: eventData.severity || 'info',
      status: eventData.status || 'SUCCESS',
      payload: eventData.payload || {}
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

  async persistAsync(event) {
    setImmediate(async () => {
      try {
        const db = await getDatabase();
        await db.run(
          `INSERT INTO telemetry_events (session_id, agent_id, event_type, action, detail, payload_json, severity) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          event.sessionId || 'session_live',
          event.agentId,
          event.eventType,
          event.action,
          event.detail,
          JSON.stringify(event.payload),
          event.severity
        );
        const provenanceTypes = new Set(['BELIEF_CREATED', 'BELIEF_UPDATED', 'AGENT_COMPLETED', 'AGENT_FAILED', 'TOOL_CALL_COMPLETED', 'MCTS_NODE_PRUNED', 'EVALUATION_COMPLETED']);
        if (provenanceTypes.has(event.eventType)) {
          const payloadJson = JSON.stringify({ eventId: event.id, eventType: event.eventType, agentId: event.agentId, action: event.action, detail: event.detail, payload: event.payload });
          const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
          await db.run('INSERT OR IGNORE INTO provenance_records (id, subject_type, subject_id, payload_hash, payload_json) VALUES (?, ?, ?, ?, ?)', `prov-event-${event.id}`, event.eventType.toLowerCase(), event.id, payloadHash, payloadJson);
        }
        await this.persistWorkspaceMilestone(db, event);
        if (event.eventType === 'AGENT_COMPLETED') {
          await this.generateWorkspaceReadme(db, event.agentId);
        }
      } catch (err) {
        // Silently catch in observer to never block runtime
      }
    });
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
