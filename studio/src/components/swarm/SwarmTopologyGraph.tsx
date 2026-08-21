import React, { useState, useEffect } from 'react';
import { Network, Activity, Cpu } from 'lucide-react';

interface SwarmNode {
  id: string;
  label: string;
  role: 'supervisor' | 'worker' | 'observer' | 'tool';
  x: number;
  y: number;
  tokensBurned: number;
  status: 'active' | 'idle' | 'blocked';
}

interface SwarmLink {
  from: string;
  to: string;
  particles: number[];
}

export const SwarmTopologyGraph: React.FC = () => {
  const [nodes] = useState<SwarmNode[]>([
    { id: 'sup-1', label: 'Swarm Supervisor', role: 'supervisor', x: 300, y: 80, tokensBurned: 1420, status: 'active' },
    { id: 'w-1', label: 'Backend Worker 1', role: 'worker', x: 120, y: 220, tokensBurned: 3800, status: 'active' },
    { id: 'w-2', label: 'Frontend Worker 2', role: 'worker', x: 300, y: 240, tokensBurned: 4100, status: 'active' },
    { id: 'w-3', label: 'QA / Auditor 3', role: 'worker', x: 480, y: 220, tokensBurned: 2900, status: 'active' },
    { id: 'obs-1', label: 'Telemetry Observer (Rule 7)', role: 'observer', x: 140, y: 360, tokensBurned: 650, status: 'active' },
    { id: 'tool-mcp', label: 'MCP Execution Bridge', role: 'tool', x: 460, y: 360, tokensBurned: 1800, status: 'active' }
  ]);

  const [links] = useState<SwarmLink[]>([
    { from: 'sup-1', to: 'w-1', particles: [0.1, 0.6] },
    { from: 'sup-1', to: 'w-2', particles: [0.3, 0.8] },
    { from: 'sup-1', to: 'w-3', particles: [0.4] },
    { from: 'w-1', to: 'obs-1', particles: [0.2, 0.7] },
    { from: 'w-2', to: 'obs-1', particles: [0.5] },
    { from: 'w-3', to: 'tool-mcp', particles: [0.3, 0.9] },
    { from: 'w-1', to: 'w-2', particles: [0.2] }
  ]);

  const [particleTick, setParticleTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setParticleTick((prev) => (prev + 0.05) % 1);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Network size={14} color="var(--accent-blue)" /> Dynamic Swarm Topology & Live Particle Stream
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--success)' }}>
          <Activity size={12} className="pulse-green" /> 6 Connected Nodes
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: '380px', background: 'var(--bg-main)' }}>
        <svg width="100%" height="100%" viewBox="0 0 600 420" style={{ display: 'block' }}>
          
          {/* Links and animated particles */}
          {links.map((link, idx) => {
            const src = nodes.find((n) => n.id === link.from);
            const dst = nodes.find((n) => n.id === link.to);
            if (!src || !dst) return null;

            return (
              <g key={idx}>
                {/* Edge line */}
                <line 
                  x1={src.x} y1={src.y} 
                  x2={dst.x} y2={dst.y} 
                  stroke="var(--panel-border)" 
                  strokeWidth="1.5" 
                  strokeDasharray="4 2"
                />

                {/* Particle packets */}
                {link.particles.map((pOffset, pIdx) => {
                  const progress = (particleTick + pOffset) % 1;
                  const px = src.x + (dst.x - src.x) * progress;
                  const py = src.y + (dst.y - src.y) * progress;
                  return (
                    <circle 
                      key={pIdx} 
                      cx={px} cy={py} 
                      r="3.5" 
                      fill="#58a6ff" 
                      stroke="#1f6feb" 
                      strokeWidth="1" 
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            let fill = '#1f6feb';
            let stroke = '#58a6ff';
            if (node.role === 'supervisor') { fill = '#8250df'; stroke = '#bc8cff'; }
            if (node.role === 'observer') { fill = '#238636'; stroke = '#3fb950'; }
            if (node.role === 'tool') { fill = '#d29922'; stroke = '#e3b341'; }

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} style={{ cursor: 'pointer' }}>
                <circle r="18" fill={fill} stroke={stroke} strokeWidth="2" />
                <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                  {node.role.slice(0, 1).toUpperCase()}
                </text>
                
                <text x="0" y="30" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="600">
                  {node.label}
                </text>
                <text x="0" y="44" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
                  {node.tokensBurned.toLocaleString()} tok
                </text>
              </g>
            );
          })}

        </svg>
      </div>

    </div>
  );
};
