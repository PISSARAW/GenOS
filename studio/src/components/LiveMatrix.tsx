import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface MatrixTopology {
  nodes: Array<{ id: string; label: string; x: number; y: number; status: string }>;
  edges: Array<{ from: string; to: string; type: 'lineage' | 'fleet' | 'workspace' | 'telemetry' }>;
  particles: Array<{ from: string; to: string; eventId: string }>;
}

interface LiveMatrixProps {
  onSelectAgent?: (agentId: string) => void;
}

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 800;
const NODE_HIT_RADIUS = 14;

export const LiveMatrix: React.FC<LiveMatrixProps> = ({ onSelectAgent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topologyRef = useRef<MatrixTopology | null>(null);
  const [topology, setTopology] = useState<MatrixTopology | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadTopology = () => {
      api.getSwarmTopology()
        .then((data: MatrixTopology) => { if (mounted) { topologyRef.current = data; setTopology(data); } })
        .catch(() => { if (mounted) { topologyRef.current = null; setTopology(null); } });
    };
    loadTopology();
    const interval = setInterval(loadTopology, 4000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let paused = document.hidden;
    let last = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const parent = canvas.parentElement;
      const cssWidth = Math.max(1, parent ? parent.clientWidth : LOGICAL_WIDTH);
      const cssHeight = (cssWidth / LOGICAL_WIDTH) * LOGICAL_HEIGHT;
      const dpr = window.devicePixelRatio || 1;
      const backingWidth = Math.round(cssWidth * dpr);
      const backingHeight = Math.round(cssHeight * dpr);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      const scale = (cssWidth / LOGICAL_WIDTH) * dpr;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      for (let x = 0; x < LOGICAL_WIDTH; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LOGICAL_HEIGHT); ctx.stroke();
      }
      for (let y = 0; y < LOGICAL_HEIGHT; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LOGICAL_WIDTH, y); ctx.stroke();
      }

      const current = topologyRef.current;
      if (!current) return;
      const nodeById = new Map(current.nodes.map((node) => [node.id, node]));

      current.edges.forEach((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return;
        ctx.strokeStyle = edge.type === 'telemetry' ? 'rgba(88, 166, 255, 0.75)' : 'rgba(88, 166, 255, 0.2)';
        ctx.lineWidth = edge.type === 'telemetry' ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      });

      ctx.fillStyle = '#58a6ff';
      current.particles.forEach((particle, index) => {
        const from = nodeById.get(particle.from);
        const to = nodeById.get(particle.to);
        if (!from || !to) return;
        const speed = 0.2 + ((index % 5) * 0.06);
        const offset = (index * 0.137) % 1;
        const t = ((now / 1000) * speed + offset) % 1;
        ctx.beginPath();
        ctx.arc(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      current.nodes.forEach((node) => {
        ctx.fillStyle = node.status === 'running' || node.status === 'Active' ? '#238636' : '#8b949e';
        ctx.beginPath(); ctx.arc(node.x, node.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9d1d9';
        ctx.font = '12px monospace';
        ctx.fillText(node.label, node.x + 12, node.y + 4);
      });
    };

    const loop = (now: number) => {
      drawFrame(now);
      raf = requestAnimationFrame(loop);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(raf);
      } else if (paused) {
        paused = false;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectAgent) return;
    const canvas = canvasRef.current;
    const current = topologyRef.current;
    if (!canvas || !current) return;
    const rect = canvas.getBoundingClientRect();
    const scale = LOGICAL_WIDTH / rect.width;
    const logicalX = (event.clientX - rect.left) * scale;
    const logicalY = (event.clientY - rect.top) * scale;
    let closestId: string | null = null;
    let closestDistance = NODE_HIT_RADIUS;
    for (const node of current.nodes) {
      const distance = Math.hypot(node.x - logicalX, node.y - logicalY);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closestId = node.id;
      }
    }
    if (closestId) onSelectAgent(closestId);
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '24px', background: 'var(--bg-main)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Live Neural Matrix</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Live topology from registered agents, persisted relationships, and recent telemetry events.
      </p>
      <div style={{ width: '100%', height: 'calc(100% - 100px)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'auto' }}>
        {!topology || topology.nodes.length === 0
          ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No topology data available.</div>
          : <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: `${LOGICAL_WIDTH} / ${LOGICAL_HEIGHT}`,
                background: '#0d1117',
                cursor: onSelectAgent ? 'pointer' : 'default'
              }}
            />}
      </div>
    </div>
  );
};
