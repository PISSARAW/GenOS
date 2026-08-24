import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';

interface Props { activeAgent: any; }
interface Event { id: string | number; event_type?: string; action?: string; detail?: string; severity?: string; created_at?: string; }

export const AgentProfileHealth: React.FC<Props> = ({ activeAgent }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const isRunning = activeAgent.status === 'running';

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setLoading(true);
    setLoadError(false);
    const load = () => api.getTelemetryEvents(50, activeAgent.id).then((response: any) => {
      if (cancelled) return;
      setEvents(Array.isArray(response?.events) ? response.events : []);
      setLoadError(false);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
    });
    void load();
    if (isRunning) timer = window.setInterval(load, 8000);
    return () => { cancelled = true; if (timer !== undefined) window.clearInterval(timer); };
  }, [activeAgent.id, isRunning]);

  const errors = events.filter((event) => ['error', 'critical'].includes(String(event.severity).toLowerCase())).length;
  const warnings = events.filter((event) => String(event.severity).toLowerCase() === 'warning').length;
  const lastEvent = events[0];
  const tone = errors ? '#f85149' : warnings ? '#d29922' : '#238636';
  const statusLabel = activeAgent.status === 'running' ? 'Agent running' : `Agent ${activeAgent.status || 'unknown'}`;

  const lastActivity = loadError
    ? 'Telemetry events could not be loaded.'
    : lastEvent
      ? `${lastEvent.event_type || lastEvent.action || 'Event'} — ${lastEvent.detail || lastEvent.action || 'No detail'} · ${lastEvent.created_at || 'timestamp unavailable'}`
      : loading ? 'Loading telemetry…' : 'No persisted diagnostic event for this agent.';

  return <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
    <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)' }}>
      <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}><ShieldCheck size={20} color={tone} /> Diagnostics</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Diagnostic telemetry for this agent, read from the persisted event stream.{isRunning ? ' Refreshing every 8 seconds while the agent is running.' : ''}</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '16px' }}>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}><CheckCircle size={16} color={tone} /><div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status</div><div style={{ marginTop: '4px', color: tone, fontWeight: 600 }}>{statusLabel}</div></div>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}><AlertTriangle size={16} color={warnings ? '#d29922' : 'var(--text-muted)'} /><div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Warnings / errors</div><div style={{ marginTop: '4px', color: 'var(--text-primary)', fontWeight: 600 }}>{warnings} / {errors}</div></div>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}><Activity size={16} color="var(--accent-blue)" /><div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Events observed</div><div style={{ marginTop: '4px', color: 'var(--text-primary)', fontWeight: 600 }}>{loading ? '…' : loadError ? '—' : events.length}</div></div>
    </div>
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>Last activity</div>
      <div style={{ border: `1px solid ${loadError ? 'var(--danger)' : 'var(--panel-border)'}`, borderRadius: '6px', padding: '12px', color: loadError ? 'var(--danger)' : 'var(--text-primary)' }}>{lastActivity}</div>
    </div>
  </div>;
};
