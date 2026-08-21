import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Zap, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface BreakerNode {
  id: string;
  name: string;
  type: 'mcp_tool' | 'network_bridge' | 'agent_process';
  status: 'closed' | 'open' | 'half_open';
  failureRate: number;
  dependentSwarmNodes: string[];
}

export const CircuitBreakerHealthMatrix: React.FC = () => {
  const [nodes, setNodes] = useState<BreakerNode[]>([
    { id: 'b1', name: 'genos_restore', type: 'mcp_tool', status: 'closed', failureRate: 0, dependentSwarmNodes: ['Worker 1', 'Worker 2'] },
    { id: 'b2', name: 'genos_resilience_apoptosis', type: 'mcp_tool', status: 'closed', failureRate: 4, dependentSwarmNodes: ['Supervisor'] },
    { id: 'b3', name: 'HTTP / API Proxy Bridge', type: 'network_bridge', status: 'closed', failureRate: 0, dependentSwarmNodes: ['All Swarms'] },
    { id: 'b4', name: 'VFS Disk Writer Sandbox', type: 'agent_process', status: 'closed', failureRate: 1, dependentSwarmNodes: ['Backend Worker'] },
    { id: 'b5', name: 'genos_security_coevolution', type: 'mcp_tool', status: 'closed', failureRate: 0, dependentSwarmNodes: ['Auditor 3'] },
    { id: 'b6', name: 'SQLite Embedding Vector Storage', type: 'agent_process', status: 'closed', failureRate: 0, dependentSwarmNodes: ['Memory Engine'] }
  ]);
  const showToast = useToastStore((state) => state.showToast);

  const handleResetAll = async () => {
    try {
      await api.resetKillSwitch();
      setNodes((prev) => prev.map((n) => ({ ...n, status: 'closed', failureRate: 0 })));
      showToast('success', 'Circuit Breakers Reset', 'All quarantined tools and bridges re-enabled.');
    } catch (e: any) {
      showToast('error', 'Reset Failed', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} color="var(--success)" /> Circuit Breaker & Blast-Radius Health Matrix
        </div>
        <button onClick={handleResetAll} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
          <RefreshCw size={12} /> Reset All Breakers
        </button>
      </div>

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', flex: 1, overflowY: 'auto' }}>
        {nodes.map((node) => {
          const isClosed = node.status === 'closed';

          return (
            <div 
              key={node.id}
              style={{ 
                background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
                padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {node.name}
                </span>
                <span style={{ 
                  padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 600,
                  background: isClosed ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                  color: isClosed ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${isClosed ? 'var(--success)' : 'var(--danger)'}`
                }}>
                  {isClosed ? 'HEALTHY' : 'TRIPPED'}
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Type: <strong>{node.type}</strong> · Failure Rate: <strong>{node.failureRate}%</strong>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--panel-border)', paddingTop: '6px' }}>
                Blast Radius: {node.dependentSwarmNodes.join(', ')}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
