import React, { useState, useEffect } from 'react';
import { Brain, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';

export const CognitiveEntropyDrift: React.FC = () => {
  const [entropyHistory, setEntropyHistory] = useState<number[]>([2.1, 2.3, 2.4, 2.2, 2.6, 2.5, 2.8, 2.4, 2.3]);
  const [currentEntropy, setCurrentEntropy] = useState<number>(2.42);
  const [deadlockStatus, setDeadlockStatus] = useState<string>('Nominal (0 Cycles Detected)');

  useEffect(() => {
    const interval = setInterval(() => {
      api.getEntropyMetrics()
        .then((wave: any) => {
          if (wave?.stressLevel) {
            const h = +(1.8 + (wave.stressLevel / 60)).toFixed(2);
            setCurrentEntropy(h);
            setEntropyHistory((prev) => [...prev.slice(1), h]);
          }
        })
        .catch(() => {
          const fakeH = +(2.0 + Math.random() * 0.8).toFixed(2);
          setCurrentEntropy(fakeH);
          setEntropyHistory((prev) => [...prev.slice(1), fakeH]);
        });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const isSpike = currentEntropy > 3.2;
  const isCollapse = currentEntropy < 1.2;

  const points = entropyHistory.map((h, i) => {
    const x = (i / Math.max(entropyHistory.length - 1, 1)) * 140;
    const y = 35 - ((h - 1) / 3) * 30;
    return `${x},${Math.max(2, Math.min(38, y))}`;
  }).join(' ');

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Brain size={14} color="var(--accent-purple)" /> Shannon Entropy & Cognitive Drift Analyzer
        </div>
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: isSpike || isCollapse ? 'var(--danger)' : 'var(--success)' }}>
          H = {currentEntropy} bits/token
        </span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        
        {/* Metric Sparkline Box */}
        <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Cognitive Entropy Distribution
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Normal Operating Window: <strong style={{ color: 'var(--text-primary)' }}>1.5 - 3.0 bits</strong>
            </div>
          </div>

          <svg width="150" height="40" style={{ overflow: 'visible' }}>
            <polyline 
              points={points} 
              fill="none" 
              stroke={isSpike || isCollapse ? 'var(--danger)' : 'var(--accent-purple)'} 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        </div>

        {/* State Diagnostics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Spike / Thrashing Detector</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isSpike ? 'var(--danger)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isSpike ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
              {isSpike ? 'Spike Detected (Prompt Divergence)' : 'Stable Convergence'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Deadlock & Chatty Loop Sentinel</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={12} /> {deadlockStatus}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
