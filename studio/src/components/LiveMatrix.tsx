import React, { useEffect, useRef, useState } from 'react';
import { useGenOSStore } from '../store/useGenOSStore';

export const LiveMatrix: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { clones } = useGenOSStore();
  const [nodes, setNodes] = useState<{id: string, x: number, y: number, vx: number, vy: number, label: string}[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
      
    // Draw Grid
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    setNodes(clones.map((c, i) => ({
      id: c.id,
      label: c.name,
      x: (i * 137) % 800,
      y: (i * 251) % 600,
      vx: ((i % 3) - 1) * 2 || 1,
      vy: ((i % 5) - 2) * 2 || 1
    })));

    // Draw connections
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (dist < 300) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    nodes.forEach(n => {
      ctx.fillStyle = '#238636';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '12px monospace';
      ctx.fillText(n.label, n.x + 12, n.y + 4);
    });
  }, [clones]);

  return (
    <div style={{ width: '100%', height: '100%', padding: '24px', background: 'var(--bg-main)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Live Neural Matrix</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Real-time cognitive mapping of swarm processes. Nodes represent active agents.
      </p>
      <div style={{ width: '100%', height: 'calc(100% - 100px)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
        <canvas ref={canvasRef} width={1200} height={800} style={{ width: '100%', height: '100%', background: '#0d1117' }} />
      </div>
    </div>
  );
};
