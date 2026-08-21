import React, { useState } from 'react';
import { CircleDot } from 'lucide-react';

interface TraceItem {
  type?: string;
  name?: string;
  time?: string;
  startTime?: number;
  content?: string;
  outputs?: any;
}

interface AgentProfileTasksProps {
  traces: TraceItem[];
}

export const AgentProfileTasks: React.FC<AgentProfileTasksProps> = ({ traces }) => {
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  const displayTraces = traces;

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}>
        <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CircleDot size={16} color="var(--text-muted)"/> Tasks & Operations
        </h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayTraces.map((trace, i) => {
          const actionType = trace.type || trace.name || 'TASK_EXECUTION';
          const contentText = typeof trace.content === 'string' ? trace.content : typeof trace.outputs === 'string' ? trace.outputs : JSON.stringify(trace.outputs || trace.content || 'Task completed');
          const timeText = trace.time || (trace.startTime ? new Date(trace.startTime).toLocaleTimeString() : 'Just now');

          return (
            <div key={i} style={{ borderBottom: i < displayTraces.length - 1 ? '1px solid var(--panel-border)' : 'none' }}>
              <div 
                onClick={() => setExpandedTask(expandedTask === i ? null : i)}
                style={{ padding: '16px', display: 'flex', gap: '12px', cursor: 'pointer' }} 
                className="hover-bg-gray"
              >
                <div style={{ paddingTop: '2px' }}><CircleDot size={16} color="var(--success)" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }} className="hover-blue">{actionType}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                    {contentText.substring(0, 150)}{contentText.length > 150 ? '...' : ''}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeText}</div>
              </div>
              {expandedTask === i && (
                <div style={{ padding: '16px 16px 16px 44px', background: 'var(--bg-main)', borderTop: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Task Execution Details</div>
                  <pre style={{ margin: 0, padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflowX: 'auto', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
{JSON.stringify({
  action: actionType,
  timestamp: timeText,
  payload: contentText,
  status: "Completed successfully"
}, null, 2)}
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
