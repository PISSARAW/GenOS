import React from 'react';
import { ShieldCheck, ShieldAlert, Lock, Unlock, AlertOctagon } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';
import { getToolAlias } from '../../utils/toolLabels';

export interface McpToolItem {
  id: string;
  name: string;
  category: string;
  risk: string;
  description: string;
  isLocked: boolean;
  circuitState?: string;
  errorCount?: number;
}

export const McpCircuitBreakerTable: React.FC<{ tools: McpToolItem[]; onRefresh: () => void }> = ({ tools, onRefresh }) => {
  const showToast = useToastStore((state) => state.showToast);

  const toggleToolLock = async (tool: McpToolItem) => {
    try {
      await api.toggleCircuitBreaker(tool.name, !tool.isLocked);
      showToast(
        tool.isLocked ? 'success' : 'warning',
        'Circuit Breaker Quarantined',
        `Tool "${getToolAlias(tool.name)}" is now ${!tool.isLocked ? 'LOCKED / QUARANTINED' : 'ACTIVE'}`
      );
      onRefresh();
    } catch (e: any) {
      showToast('error', 'Circuit Breaker Toggle Failed', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
      
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertOctagon size={14} color="var(--danger)" /> Per-Tool Circuit Breaker
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Persisted backend quarantine controls</span>
      </div>

      <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Tool Name</th>
              <th style={{ padding: '8px 12px' }}>Category</th>
              <th style={{ padding: '8px 12px' }}>Risk Rating</th>
              <th style={{ padding: '8px 12px' }}>Circuit Status</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Software Lock</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool, idx) => (
              <tr key={tool.id || tool.name} style={{ borderBottom: idx < tools.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: tool.isLocked ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {getToolAlias(tool.name)}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{tool.category}</td>
                <td style={{ padding: '8px 12px' }}>
                  {tool.risk === 'High' ? (
                    <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={12} /> High</span>
                  ) : (
                    <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Safe</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ 
                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                    background: tool.isLocked ? 'rgba(248, 81, 73, 0.15)' : 'rgba(35, 134, 54, 0.15)',
                    color: tool.isLocked ? 'var(--danger)' : 'var(--success)',
                    border: `1px solid ${tool.isLocked ? 'var(--danger)' : 'var(--success)'}`
                  }}>
                    {tool.isLocked ? 'QUARANTINED' : `${tool.circuitState || 'CLOSED'} (UNLOCKED)`}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <button 
                    onClick={() => toggleToolLock(tool)}
                    className="gh-btn" 
                    style={{ 
                      fontSize: '0.7rem', padding: '2px 8px',
                      color: tool.isLocked ? 'var(--success)' : 'var(--danger)',
                      borderColor: tool.isLocked ? 'var(--success)' : 'var(--danger)'
                    }}
                  >
                    {tool.isLocked ? <><Unlock size={10} /> De-isolate</> : <><Lock size={10} /> Quarantine</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
