/**
 * GenOS Telemetry Observer Service (Rule 7 Compliant)
 * Non-blocking ring buffer event bus, SSE streamer, and disk/DB synchronizer.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { getDatabase } = require('../db');

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
      } catch (err) {
        // Silently catch in observer to never block runtime
      }
    });
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
