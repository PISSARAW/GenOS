import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Target, Award, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { api } from '../../api/client';

interface SolutionPoint {
  id: string;
  solver: string;
  timeMs: number;
  costUsd: number;
  fitness: number;
  isParetoOptimal: boolean;
}

interface ParetoFrontierViewProps {
  refreshKey?: number;
}

export const ParetoFrontierView: React.FC<ParetoFrontierViewProps> = ({ refreshKey = 0 }) => {
  const [points, setPoints] = useState<SolutionPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SolutionPoint | null>(null);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [axisMode, setAxisMode] = useState<'time' | 'cost'>('time');
  const showToast = useToastStore((state) => state.showToast);

  const loadFrontier = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    api.getParetoFrontier()
      .then((result: any) => {
        const frontierIds = new Set((result?.paretoFront || []).map((p: any) => p.solverKey));
        const mapped = [...(result?.paretoFront || []), ...(result?.dominatedSolutions || [])].map((p: any) => ({
          id: p.solverKey,
          solver: p.solverName,
          timeMs: p.executionTimeMs,
          costUsd: p.tokenCostUSD,
          fitness: p.fitnessScore,
          isParetoOptimal: frontierIds.has(p.solverKey)
        }));
        setPoints(mapped);
        setRecommendedId(result?.kneePointRecommendation?.solverKey || null);
      })
      .catch((e: any) => {
        setPoints([]);
        setRecommendedId(null);
        setError(e?.message || 'Failed to load the Pareto frontier.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadFrontier();
  }, [loadFrontier, refreshKey]);

  const showKneePoint = () => {
    const bestPoint = points.find((point) => point.id === recommendedId);
    if (!bestPoint) return;
    setSelectedPoint(bestPoint);
    showToast('success', 'Backend Recommendation', `Optimal trade-off: ${bestPoint.solver} (${bestPoint.fitness}% at ${bestPoint.timeMs}ms)`);
  };

  const axisLabel = axisMode === 'time' ? 'Execution Time (ms)' : 'Token Cost (USD)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} color="var(--accent-blue)" /> Multi-Objective Pareto Frontier
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trade-off mapping: {axisLabel} vs Solution Fitness (%)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={axisMode}
            onChange={(e) => setAxisMode(e.target.value as 'time' | 'cost')}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            <option value="time">Time vs Fitness</option>
            <option value="cost">Cost vs Fitness</option>
          </select>
          <button onClick={loadFrontier} disabled={isLoading} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={showKneePoint} disabled={!recommendedId} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            <Award size={14} /> Show backend recommendation
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '260px', background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '16px 8px 8px 0' }}>
        {error && (
          <div style={{ height: '100%', minHeight: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f85149', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} /> {error}
            </div>
            <button onClick={loadFrontier} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
              Retry
            </button>
          </div>
        )}
        {!error && isLoading && (
          <div style={{ height: '100%', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading frontier data...</div>
        )}
        {!error && !isLoading && points.length === 0 && (
          <div style={{ height: '100%', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No executed tournament results available.</div>
        )}
        {!error && !isLoading && points.length > 0 && <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />
            <XAxis type="number" dataKey={axisMode === 'time' ? 'timeMs' : 'costUsd'} name={axisMode === 'time' ? 'Time' : 'Cost'} unit={axisMode === 'time' ? 'ms' : '$'} stroke="var(--text-secondary)" fontSize={11} domain={['auto', 'auto']} />
            <YAxis type="number" dataKey="fitness" name="Fitness" unit="%" stroke="var(--text-secondary)" fontSize={11} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data: SolutionPoint = payload[0].payload;
                  return (
                    <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '4px' }}>{data.solver}</div>
                      <div>Fitness: <strong style={{ color: 'var(--success)' }}>{data.fitness}%</strong></div>
                      <div>Latency: {data.timeMs} ms</div>
                      <div>Cost: ${data.costUsd}</div>
                      <div>Pareto Optimal: {data.isParetoOptimal ? 'Yes (Frontier)' : 'Sub-dominated'}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              data={points}
              onClick={(node: any) => setSelectedPoint(node.payload)}
              cursor="pointer"
            >
              {points.map((entry) => {
                const isKnee = entry.id === recommendedId;
                const isSelected = entry.id === selectedPoint?.id;
                let fill = '#58a6ff';
                if (entry.isParetoOptimal) fill = '#3fb950';
                if (isKnee) fill = '#d29922';
                if (isSelected) fill = '#bc8cff';
                return <Cell key={entry.id} fill={fill} stroke={isSelected ? '#ffffff' : 'none'} strokeWidth={2} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>}
      </div>

      {selectedPoint && (
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Selected: {selectedPoint.solver}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
              Latency: <strong>{selectedPoint.timeMs}ms</strong> · Cost: <strong>${selectedPoint.costUsd}</strong> · Fitness: <strong style={{ color: 'var(--success)' }}>{selectedPoint.fitness}%</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
