import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Target, Zap, Award } from 'lucide-react';
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

export const ParetoFrontierView: React.FC = () => {
  const [points, setPoints] = useState<SolutionPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SolutionPoint | null>(null);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
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
      })
      .catch(() => setPoints([]));
  }, []);

  const computeKneePoint = () => {
    let bestScore = -1;
    let bestPoint = points[0];
    points.forEach((p) => {
      const score = p.fitness / (p.timeMs * (p.costUsd * 1000));
      if (score > bestScore) {
        bestScore = score;
        bestPoint = p;
      }
    });
    if (bestPoint) {
      setRecommendedId(bestPoint.id);
      setSelectedPoint(bestPoint);
      showToast('success', 'Knee-Point Calculated', `Optimal trade-off: ${bestPoint.solver} (${bestPoint.fitness}% at ${bestPoint.timeMs}ms)`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} color="var(--accent-blue)" /> Multi-Objective Pareto Frontier
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trade-off mapping: Execution Time (ms) vs Solution Fitness (%)</span>
        </div>
        <button onClick={computeKneePoint} disabled={points.length === 0} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
          <Award size={14} /> Calculate Knee-Point
        </button>
      </div>

      <div style={{ flex: 1, minHeight: '260px', background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '16px 8px 8px 0' }}>
        {points.length === 0 && <div style={{ height: '100%', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No executed tournament results available.</div>}
        {points.length > 0 && <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />
            <XAxis type="number" dataKey="timeMs" name="Time" unit="ms" stroke="var(--text-secondary)" fontSize={11} domain={[100, 900]} />
            <YAxis type="number" dataKey="fitness" name="Fitness" unit="%" stroke="var(--text-secondary)" fontSize={11} domain={[70, 100]} />
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
          <button 
            onClick={() => showToast('info', 'Heuristic Grafting', `Extracted AST patterns from ${selectedPoint.solver}`)} 
            className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
          >
            <Zap size={12} /> Graft Heuristics
          </button>
        </div>
      )}
    </div>
  );
};
