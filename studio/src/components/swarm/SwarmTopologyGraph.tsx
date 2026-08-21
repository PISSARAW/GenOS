import React, { useEffect, useState } from 'react';
import { Activity, Network, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';

interface SwarmNode {
  id: string;
  label: string;
  role?: string;
  status: string;
  x: number;
  y: number;
  tokenBurnRate: number;
}

interface SwarmEdge { from: string; to: string; type?: string; }
interface SwarmTopology {
  timestamp: string;
  nodeCount: number;
  edgeCount: number;
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  particles: Array<{ from: string; to: string; eventId?: string }>;
}

export const SwarmTopologyGraph: React.FC = () => {
  const [topology, setTopology] = useState<SwarmTopology | null>(null);
  const [error, setError] = useState('');
  const [particleTick, setParticleTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = () => api.getSwarmTopology()
      .then((data: SwarmTopology) => {
        if (mounted) { setTopology(data); setError(''); }
      })
      .catch((err: any) => mounted && setError(err?.message || 'Topology unavailable'));
    refresh();
    const refreshTimer = window.setInterval(refresh, 2000);
    const particleTimer = window.setInterval(() => setParticleTick((value) => (value + 0.05) % 1), 50);
    return () => { mounted = false; window.clearInterval(refreshTimer); window.clearInterval(particleTimer); };
  }, []);

  const nodes = topology?.nodes || [];
  const edges = topology?.edges || [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const liveParticles = (topology?.particles || []).slice(0, 24);
  const lastUpdate = topology?.timestamp ? new Date(topology.timestamp).toLocaleTimeString() : '—';

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Network size={14} color="var(--accent-blue)" /> Live Swarm Topology
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: error ? 'var(--danger)' : 'var(--success)' }}>
          {error ? <RefreshCw size={12} /> : <Activity size={12} className="pulse-green" />}
          {error ? 'Disconnected' : `${topology?.nodeCount || 0} nodes · ${topology?.edgeCount || 0} links`}
        </div>
      </div>
      <div style={{ padding: '6px 16px', color: 'var(--text-secondary)', fontSize: '0.7rem', borderBottom: '1px solid var(--panel-border)' }}>
        Backend snapshot: {lastUpdate} · {liveParticles.length} recent message{liveParticles.length === 1 ? '' : 's'}
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: '380px', background: 'var(--bg-main)' }}>
        <svg width="100%" height="100%" viewBox="0 0 600 420" style={{ display: 'block' }}>
          {edges.map((edge, index) => {
            const from = nodeById.get(edge.from); const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--panel-border)" strokeWidth="1.5" strokeDasharray={edge.type === 'telemetry' ? undefined : '4 2'} />;
          })}
          {liveParticles.map((particle, index) => {
            const from = nodeById.get(particle.from); const to = nodeById.get(particle.to);
            if (!from || !to) return null;
            const progress = (particleTick + index / Math.max(liveParticles.length, 1)) % 1;
            return <circle key={`${particle.eventId || index}`} cx={from.x + (to.x - from.x) * progress} cy={from.y + (to.y - from.y) * progress} r="3.5" fill="#58a6ff" stroke="#1f6feb" strokeWidth="1" />;
          })}
          {nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <circle r="18" fill={node.status === 'running' ? '#1f6feb' : '#484f58'} stroke={node.status === 'running' ? '#58a6ff' : '#8b949e'} strokeWidth="2" />
              <text x="0" y="4" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">{(node.role || 'worker').slice(0, 1).toUpperCase()}</text>
              <text x="0" y="32" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="600">{node.label.length > 27 ? `${node.label.slice(0, 24)}…` : node.label}</text>
              <text x="0" y="46" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">{node.tokenBurnRate.toLocaleString()} tok/min</text>
            </g>
          ))}
        </svg>
      </div>
      {error && <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: '0.75rem' }}>{error}</div>}
    </div>
  );
};
