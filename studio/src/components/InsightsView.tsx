import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useGenOSStore } from '../store/useGenOSStore';

export const InsightsView: React.FC = () => {
  const { evaluations } = useGenOSStore();

  const formattedData = useMemo(() => {
    return evaluations.map(e => ({
      time: new Date(e.timestamp).toLocaleTimeString(),
      metricName: e.metricName,
      score: e.score
    })).reverse();
  }, [evaluations]);

  const ampkData = formattedData.filter(d => d.metricName === 'ampk' || d.metricName === 'energy');
  const dpoData = formattedData.filter(d => d.metricName === 'dpo' || d.metricName === 'coherence');

  return (
    <div className="mac-panel flex-col" style={{ flexGrow: 1, overflow: 'hidden' }}>
      <div className="p-4" style={{ borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-main)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Performance Insights</h3>
      </div>
      <div className="p-6" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div style={{ flexGrow: 1, minHeight: '200px' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>AMPK Energy Level</h4>
          {ampkData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ampkData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-grid)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--panel-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="score" stroke="var(--warning)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Awaiting AMPK telemetry data...</div>
          )}
        </div>

        <div style={{ flexGrow: 1, minHeight: '200px' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>DPO Evaluation Score</h4>
          {dpoData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dpoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-grid)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--panel-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="score" stroke="var(--accent-blue)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
             <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Awaiting DPO telemetry data...</div>
          )}
        </div>

      </div>
    </div>
  );
};
