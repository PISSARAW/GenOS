import React from 'react';
import { Activity, Ghost } from 'lucide-react';

export type HistoryFilter = 'all' | 'running' | 'completed' | 'failed';

export const normalizeStatus = (status: any): HistoryFilter | 'other' => {
  const s = String(status || '').toLowerCase();
  if (s === 'active' || s === 'running') return 'running';
  if (s === 'completed' || s === 'done') return 'completed';
  if (s === 'error' || s === 'failed') return 'failed';
  return 'other';
};

interface SubagentHistoryProps {
  history: any[];
  filter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  onSelectAgent: (agentId: string) => void;
}

export const SubagentHistory: React.FC<SubagentHistoryProps> = ({ history, filter, onFilterChange, onSelectAgent }) => {
  const filteredHistory = history.filter((agent) => filter === 'all' || normalizeStatus(agent.status) === filter);

  return (
    <div style={{ padding: '0 16px', flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
        Subagent History
      </div>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {(['all', 'running', 'completed', 'failed'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onFilterChange(option)}
            style={{
              padding: '2px 8px', fontSize: '0.7rem', borderRadius: '12px', cursor: 'pointer',
              border: `1px solid ${filter === option ? 'var(--accent-blue)' : 'var(--panel-border)'}`,
              background: filter === option ? 'rgba(31, 111, 235, 0.15)' : 'transparent',
              color: filter === option ? 'var(--accent-blue)' : 'var(--text-secondary)',
              textTransform: 'capitalize'
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {history.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No subagent history recorded yet.
          </div>
        ) : filteredHistory.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No {filter} subagents.
          </div>
        ) : (
          filteredHistory.map((agent, idx) => (
            <button
              key={agent.id || idx}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              title={`Open ${agent.name}'s profile`}
              style={{ padding: '8px', border: 0, borderRadius: '6px', display: 'flex', gap: '8px', width: '100%', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
              className="hover-bg-gray"
            >
              <div style={{ paddingTop: '2px' }}>
                {agent.status === 'Active' || agent.status === 'running'
                  ? <Activity size={14} color="var(--success)" className="pulse-green" />
                  : <Ghost size={14} color="var(--danger)" />}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{agent.name}</div>
                <div style={{ fontSize: '0.75rem', color: agent.status === 'Active' || agent.status === 'running' ? 'var(--text-secondary)' : 'var(--danger)' }}>
                  {agent.status} · {agent.id}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
