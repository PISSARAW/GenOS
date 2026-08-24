import React, { useState } from 'react';
import { CircleDot } from 'lucide-react';

interface TraceItem {
  type?: string;
  name?: string;
  time?: string;
  startTime?: number;
  content?: string;
  error?: any;
  outputs?: any;
}

interface AgentProfileTasksProps {
  traces: TraceItem[];
}

const hasPayload = (trace: TraceItem) =>
  trace.outputs != null || (typeof trace.content === 'string' && trace.content.length > 0);

const isFailed = (trace: TraceItem) => {
  if (trace.error) return true;
  const outputs = trace.outputs && typeof trace.outputs === 'object' ? trace.outputs : null;
  if (!outputs) return false;
  return Boolean(outputs.error) || String(outputs.status || '').toLowerCase() === 'failed';
};

export const AgentProfileTasks: React.FC<AgentProfileTasksProps> = ({ traces }) => {
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}>
        <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CircleDot size={16} color="var(--text-muted)"/> Tasks & Operations
        </h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {traces.length === 0 && (
          <div style={{ padding: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tasks recorded</div>
        )}
        {traces.map((trace, i) => {
          const actionType = trace.type || trace.name || 'TASK_EXECUTION';
          const contentText = typeof trace.content === 'string' ? trace.content : typeof trace.outputs === 'string' ? trace.outputs : JSON.stringify(trace.outputs || trace.content || 'No payload recorded');
          const timeText = trace.time || (trace.startTime ? new Date(trace.startTime).toLocaleTimeString() : 'Timestamp unavailable');
          const expandable = hasPayload(trace);
          const failed = isFailed(trace);

          return (
            <div key={i} style={{ borderBottom: i < traces.length - 1 ? '1px solid var(--panel-border)' : 'none' }}>
              <div
                onClick={expandable ? () => setExpandedTask(expandedTask === i ? null : i) : undefined}
                style={{ padding: '16px', display: 'flex', gap: '12px', cursor: expandable ? 'pointer' : 'default' }}
                className="hover-bg-gray"
              >
                <div style={{ paddingTop: '2px' }}><CircleDot size={16} color={failed ? 'var(--danger)' : 'var(--success)'} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }} className="hover-blue">{actionType}{failed ? ' · failed' : ''}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                    {contentText.substring(0, 150)}{contentText.length > 150 ? '...' : ''}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeText}</div>
              </div>
              {expandable && expandedTask === i && (
                <div style={{ padding: '16px 16px 16px 44px', background: 'var(--bg-main)', borderTop: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Payload</div>
                  <pre style={{ margin: 0, padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflowX: 'auto', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
{typeof trace.outputs === 'object' && trace.outputs !== null
  ? JSON.stringify(trace.outputs, null, 2)
  : String(trace.outputs ?? trace.content)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
