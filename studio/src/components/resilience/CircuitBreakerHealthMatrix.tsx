import React, { useCallback, useEffect, useState } from 'react';
import { Zap, RefreshCw, Lock, Unlock, AlertOctagon } from 'lucide-react';
import { api } from '../../api/client';
import { getToolAlias } from '../../utils/toolLabels';
import { useToastStore } from '../../store/useToastStore';

type BreakerStatus = 'closed' | 'open' | 'half_open';

interface BreakerNode {
  id: string;
  toolName: string;
  name: string;
  type: 'mcp_tool' | 'network_bridge' | 'agent_process';
  status: BreakerStatus;
  locked: boolean;
  failureCount: number;
  dependentSwarmNodes: string[];
}

const STATUS_META: Record<BreakerStatus, { label: string; color: string; background: string }> = {
  closed: { label: 'HEALTHY', color: 'var(--success)', background: 'rgba(35, 134, 54, 0.15)' },
  open: { label: 'TRIPPED', color: 'var(--danger)', background: 'rgba(248, 81, 73, 0.15)' },
  half_open: { label: 'HALF-OPEN', color: '#d29922', background: 'rgba(210, 153, 34, 0.15)' }
};

const deriveStatus = (tool: any): BreakerStatus => {
  const circuitState = typeof tool.circuitState === 'string' ? tool.circuitState.toLowerCase() : '';
  if (circuitState === 'half_open') return 'half_open';
  if (circuitState === 'open') return 'open';
  if (circuitState === 'closed') return 'closed';
  return tool.is_locked ? 'open' : 'closed';
};

const mapToolToNode = (tool: any): BreakerNode => ({
  id: tool.id || tool.name,
  toolName: tool.name,
  name: getToolAlias(tool.name),
  type: 'mcp_tool' as const,
  status: deriveStatus(tool),
  locked: !!tool.is_locked,
  failureCount: tool.failure_count || 0,
  dependentSwarmNodes: tool.equipped_agents || []
});

export const CircuitBreakerHealthMatrix: React.FC = () => {
  const [nodes, setNodes] = useState<BreakerNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [togglingToolName, setTogglingToolName] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  const fetchTools = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    api.listTools().then((tools: any[]) => setNodes((tools || []).map(mapToolToNode))).catch((e: any) => {
      setNodes([]);
      setLoadError(e?.message || 'Failed to load MCP tools.');
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleToggleLock = async (node: BreakerNode) => {
    setTogglingToolName(node.toolName);
    try {
      await api.toggleCircuitBreaker(node.toolName, !node.locked);
      showToast(
        node.locked ? 'success' : 'warning',
        'Circuit Breaker Quarantined',
        `Tool "${node.name}" is now ${!node.locked ? 'LOCKED / QUARANTINED' : 'ACTIVE'}`
      );
      fetchTools();
    } catch (e: any) {
      showToast('error', 'Circuit Breaker Toggle Failed', e.message);
    } finally {
      setTogglingToolName(null);
    }
  };

  const handleResetAll = async () => {
    try {
      await api.resetKillSwitch();
      showToast('success', 'Global Halt Reset', 'The backend kill switch was reset. Tool locks are managed in MCP Sandbox.');
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
          <RefreshCw size={12} /> Reset Global Halt
        </button>
      </div>

      {loadError && (
        <div style={{ margin: '16px', padding: '16px', border: '1px solid var(--danger)', borderRadius: '6px', background: 'rgba(248, 81, 73, 0.1)', fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <AlertOctagon size={14} /> Tool matrix unavailable: {loadError}
          </span>
          <button onClick={fetchTools} className="gh-btn" style={{ fontSize: '0.72rem', padding: '4px 10px', flexShrink: 0 }}>
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {!loadError && isLoading && (
        <div style={{ padding: '24px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading tool health matrix…</div>
      )}

      {!loadError && !isLoading && nodes.length === 0 && (
        <div style={{ padding: '24px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No MCP tools are registered.</div>
      )}

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', flex: 1, overflowY: 'auto', alignContent: 'start' }}>
        {nodes.map((node) => {
          const meta = STATUS_META[node.status];
          const isExpanded = expandedNodeId === node.id;

          return (
            <div
              key={node.id}
              onClick={() => setExpandedNodeId(isExpanded ? null : node.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedNodeId(isExpanded ? null : node.id); }}
              style={{
                background: 'var(--bg-main)', border: `1px solid ${isExpanded ? 'var(--accent-blue)' : 'var(--panel-border)'}`, borderRadius: '6px',
                padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {node.name}
                </span>
                <span style={{
                  padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 600,
                  background: meta.background, color: meta.color, border: `1px solid ${meta.color}`
                }}>
                  {meta.label}
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Type: <strong>{node.type}</strong> · Failures: <strong>{node.failureCount}</strong>
              </div>

              {node.dependentSwarmNodes.length > 0 && (
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Blast Radius ({node.dependentSwarmNodes.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {node.dependentSwarmNodes.map((agentId) => (
                      <span key={agentId} title={agentId} style={{
                        padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem',
                        background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)',
                        color: 'var(--text-secondary)', fontFamily: 'monospace',
                        maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {agentId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div onClick={(e) => e.stopPropagation()} style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '8px', display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleToggleLock(node)}
                    disabled={togglingToolName === node.toolName}
                    className="gh-btn"
                    style={{
                      flex: 1, justifyContent: 'center', fontSize: '0.7rem', padding: '4px 8px',
                      color: node.locked ? 'var(--success)' : 'var(--danger)',
                      borderColor: node.locked ? 'var(--success)' : 'var(--danger)'
                    }}
                  >
                    {node.locked ? <><Unlock size={10} /> De-isolate</> : <><Lock size={10} /> Quarantine</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
