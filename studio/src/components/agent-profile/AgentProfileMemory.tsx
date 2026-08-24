import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Book, Database } from 'lucide-react';
import { api } from '../../api/client';

interface AgentProfileMemoryProps { activeAgent: any; traces: any[]; }
interface TelemetryEvent { id: string | number; event_type?: string; action?: string; detail?: string; payload_json?: string; created_at?: string; }
interface MemoryItem { content: string; type: string; time: string; }

function payloadOf(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function timeOf(value?: string | number): string {
  if (!value) return 'just now';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'just now' : date.toLocaleTimeString();
}

export const AgentProfileMemory: React.FC<AgentProfileMemoryProps> = ({ activeAgent, traces }) => {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getTelemetryEvents(50, activeAgent.id).then((response: any) => {
      if (!cancelled) setEvents(Array.isArray(response?.events) ? response.events : []);
    }).catch(() => {
      if (!cancelled) setEvents([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeAgent.id]);

  const memoryStream = useMemo<MemoryItem[]>(() => {
    const traceItems = (traces || []).map((trace: any) => ({
      content: trace.outputs ? `${trace.name}: ${typeof trace.outputs === 'string' ? trace.outputs : JSON.stringify(trace.outputs)}` : `Executed action: ${trace.name}`,
      type: 'Runtime observer span', time: timeOf(trace.startTime)
    }));
    const eventItems = events.map((event) => ({
      content: event.detail || event.action || event.event_type || 'Agent event',
      type: event.event_type || 'Telemetry', time: timeOf(event.created_at)
    }));
    const taskItems = activeAgent.currentTask ? [{ content: activeAgent.currentTask, type: 'Current task', time: 'in progress' }] : [];
    return [...taskItems, ...traceItems, ...eventItems].slice(-50).reverse();
  }, [activeAgent.currentTask, events, traces]);

  const context = useMemo(() => {
    const payloads = events.map((event) => payloadOf(event.payload_json));
    const countBy = (kind: 'conversation' | 'artifacts' | 'tools') => events.filter((event, index) => {
      const text = `${event.event_type || ''} ${event.action || ''}`.toLowerCase();
      const payload = payloads[index];
      if (kind === 'conversation') return text.includes('message') || text.includes('conversation') || payload.message || payload.prompt;
      if (kind === 'artifacts') return text.includes('file') || text.includes('snapshot') || payload.path || payload.file;
      return text.includes('tool') || text.includes('mcp') || payload.toolName || payload.tool;
    }).length;
    const tokenCount = payloads.map((payload) => Number(payload.tokens ?? payload.tokenCount ?? payload.totalTokens)).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
    return { conversation: countBy('conversation'), artifacts: countBy('artifacts'), tools: countBy('tools'), tokenCount };
  }, [events]);

  const observed = context.conversation + context.artifacts + context.tools;
  const value = (number: number) => number || '—';

  return <div style={{ display: 'flex', gap: '24px' }}>
    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}><h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><Book size={16} color="var(--text-muted)"/> Genome Evolution (Learned Rules)</h2></div>
        <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          This agent's learned rules are not edited directly here. They persist through genome decisions recorded by the runtime; when a decision updates a rule, it appears in this agent's genome history. No per-agent rule list is exposed in Studio yet.
        </div>
      </div>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}><h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><Database size={16} color="var(--text-muted)"/> Live Memory & Activity</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>Loading persisted data…</div>}
          {!loading && memoryStream.length === 0 && <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>No memory activity or telemetry recorded for this agent.</div>}
          {memoryStream.map((item, index) => <div key={`${item.type}-${item.time}-${index}`} style={{ padding: '12px 16px', borderBottom: index < memoryStream.length - 1 ? '1px solid var(--panel-border)' : 'none', display: 'flex', gap: '12px' }}><div style={{ paddingTop: '2px' }}><Activity size={14} color="var(--text-muted)" /></div><div style={{ flex: 1 }}><div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{item.content}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}><span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{item.type}</span> · {item.time}</div></div></div>)}
        </div>
      </div>
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Context Window</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Observed events</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{observed || (loading ? '…' : 'None')}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Observed tokens</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{context.tokenCount > 0 ? context.tokenCount.toLocaleString() : (loading ? '…' : 'None')}</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#58a6ff' }}>■</span> Conversation</span><span style={{ color: 'var(--text-primary)' }}>{value(context.conversation)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#238636' }}>■</span> File Artifacts</span><span style={{ color: 'var(--text-primary)' }}>{value(context.artifacts)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#bc8cff' }}>■</span> Tool Results</span><span style={{ color: 'var(--text-primary)' }}>{value(context.tools)}</span></div></div>
      </div>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Agent Identity</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Genome Version</span><span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{activeAgent.agentType || '—'}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Base Model</span><span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{activeAgent.modelTier || 'Not specified'}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Memory Events</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{events.length || '—'}</span></div></div>
      </div>
    </div>
  </div>;
};
