import React, { useState, useEffect } from 'react';
import { Brain, AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';

const SPARKLINE_WINDOW = 60;

export const CognitiveEntropyDrift: React.FC = () => {
  const [entropyHistory, setEntropyHistory] = useState<number[]>([]);
  const [currentEntropy, setCurrentEntropy] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchMetrics = () => {
      api.getEntropyMetrics()
        .then((wave: any) => {
          setError('');
          setMetrics(wave);
          setLastUpdated(new Date());
          if (typeof wave?.rawEntropy === 'number') {
            setCurrentEntropy(wave.rawEntropy);
            setEntropyHistory((prev) => {
              const seed = prev.length === 0 && Array.isArray(wave?.sparkline) ? wave.sparkline.slice(-SPARKLINE_WINDOW - 1) : prev;
              return [...seed, wave.rawEntropy].slice(-SPARKLINE_WINDOW);
            });
          }
        })
        .catch((err: any) => setError(err?.message || 'Unable to load telemetry.'));
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  const isSpike = metrics?.cognitiveDriftState === 'SPIKE_CONFUSION';
  const isCollapse = metrics?.cognitiveDriftState === 'COLLAPSE_DEADLOCK';
  const hasTelemetry = Boolean(metrics?.sampleSize);
  const deadlockDetected = Boolean(metrics?.deadlockSentinel?.deadlockDetected);
  const deadlockStatus = deadlockDetected ? 'Deadlock or chatty loop detected' : hasTelemetry ? 'No deadlock detected' : 'No telemetry';
  const isStale = Boolean(error) && lastUpdated !== null;

  const points = entropyHistory.map((h, i) => {
    const x = (i / Math.max(entropyHistory.length - 1, 1)) * 140;
    const y = 35 - h * 30;
    return `${x},${Math.max(2, Math.min(38, y))}`;
  }).join(' ');

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Brain size={14} color="var(--accent-purple)" /> Shannon Entropy & Cognitive Drift Analyzer
        </div>
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: isSpike || isCollapse ? 'var(--danger)' : 'var(--success)' }}>
          H = {currentEntropy === null ? '—' : `${currentEntropy} bits/action`}
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
              {hasTelemetry ? `${metrics.sampleSize} events · ${metrics.uniqueActionCount} unique actions` : 'Waiting for telemetry events'}
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
              {!hasTelemetry ? 'No telemetry' : isSpike ? 'Spike Detected (Prompt Divergence)' : isCollapse ? 'Collapse Detected' : 'Balanced entropy'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Deadlock & Chatty Loop Sentinel</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: deadlockDetected ? 'var(--danger)' : hasTelemetry ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {deadlockDetected ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} {deadlockStatus}
            </div>
          </div>

        </div>

      </div>

      <div style={{ padding: '6px 16px', borderTop: '1px solid var(--panel-border)', fontSize: '0.7rem', fontFamily: 'monospace', color: error ? 'var(--warning, #d29922)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{isStale ? <span title={error} style={{ color: 'var(--danger)' }}>● stale data</span> : '● live'}</span>
        <span>last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</span>
      </div>

    </div>
  );
};
