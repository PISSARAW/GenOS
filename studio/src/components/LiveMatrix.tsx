import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface MatrixTopology {
  nodes: Array<{ id: string; label: string; x: number; y: number; status: string }>;
  edges: Array<{ from: string; to: string; type: 'lineage' | 'fleet' | 'workspace' | 'telemetry' }>;
  particles: Array<{ from: string; to: string; eventId: string }>;
}

export const LiveMatrix: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [topology, setTopology] = useState<MatrixTopology | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadTopology = () => {
      api.getSwarmTopology()
        .then((data: MatrixTopology) => { if (mounted) setTopology(data); })
        .catch(() => { if (mounted) setTopology(null); });
    };
    loadTopology();
    const interval = setInterval(loadTopology, 4000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !topology) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
    topology.edges.forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;
      ctx.strokeStyle = edge.type === 'telemetry' ? 'rgba(88, 166, 255, 0.75)' : 'rgba(88, 166, 255, 0.2)';
      ctx.lineWidth = edge.type === 'telemetry' ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    });

    topology.particles.forEach((particle) => {
      const from = nodeById.get(particle.from);
      const to = nodeById.get(particle.to);
      if (!from || !to) return;
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.arc((from.x + to.x) / 2, (from.y + to.y) / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    topology.nodes.forEach((node) => {
      ctx.fillStyle = node.status === 'running' || node.status === 'Active' ? '#238636' : '#8b949e';
      ctx.beginPath(); ctx.arc(node.x, node.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '12px monospace';
      ctx.fillText(node.label, node.x + 12, node.y + 4);
    });
  }, [topology]);

  return (
    <div style={{ width: '100%', height: '100%', padding: '24px', background: 'var(--bg-main)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Live Neural Matrix</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Live topology from registered agents, persisted relationships, and recent telemetry events.
      </p>
      <div style={{ width: '100%', height: 'calc(100% - 100px)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
        {!topology || topology.nodes.length === 0
          ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No topology data available.</div>
          : <canvas ref={canvasRef} width={1200} height={800} style={{ width: '100%', height: '100%', background: '#0d1117' }} />}
      </div>
    </div>
  );
};
