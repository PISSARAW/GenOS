import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Play, Shuffle, GitCommit, Check, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface SolverRating {
  id: string;
  name: string;
  archetype: string;
  elo: number;
  winRate: number;
  matches: number;
  status: 'idle' | 'competing' | 'champion';
}

const KNOWN_STATUSES = ['idle', 'competing', 'champion'];

interface SolverTournamentProps {
  onRunCompleted?: () => void;
}

export const SolverTournament: React.FC<SolverTournamentProps> = ({ onRunCompleted }) => {
  const [solvers, setSolvers] = useState<SolverRating[]>([]);
  const [benchmarkSuite, setBenchmarkSuite] = useState('Local Sorted Search');
  const [rounds, setRounds] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const [genePayload, setGenePayload] = useState('AST Invariant: check strict type assertions before mutation');
  const [sourceSolver, setSourceSolver] = useState('');
  const [targetSolver, setTargetSolver] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  const applyLeaderboard = (leaderboard: any[]) => {
    const mapped = leaderboard.map((s: any) => ({
      id: s.solverKey,
      name: s.solverName,
      archetype: s.archetype,
      elo: s.eloRating,
      winRate: s.adversarialPassRate,
      matches: s.roundsCompleted,
      status: (typeof s.status === 'string' && KNOWN_STATUSES.includes(s.status) ? s.status : 'idle') as SolverRating['status']
    }));
    setSolvers(mapped);
  };

  useEffect(() => {
    if (solvers.length === 0) return;
    setSourceSolver((prev) => prev || solvers[0].name);
    setTargetSolver((prev) => prev || solvers[1]?.name || '');
  }, [solvers]);

  const loadLeaderboard = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api.getSolverTournament()
      .then((result: any) => {
        applyLeaderboard(result?.leaderboard || []);
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load the solver leaderboard.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const handleRunMatch = async () => {
    setIsRunning(true);
    try {
      await api.runSolverTournament({
        benchmarkId: benchmarkSuite,
        solvers: solvers.map((s) => s.id),
        rounds
      });
      showToast('success', 'Tournament Match Concluded', `Benchmark "${benchmarkSuite}" evaluated. Elo updated.`);
      onRunCompleted?.();
      loadLeaderboard();
    } catch (e: any) {
      showToast('error', 'Tournament Error', e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCrossPollinate = async () => {
    if (!sourceSolver || !targetSolver || solvers.length < 2) return;
    try {
      await api.crossPollinateHeuristics({
        sourceSolver,
        targetSolver,
        gene: genePayload
      });
      showToast('success', 'Heuristic Recorded', `Recorded a genome decision for review between ${sourceSolver} and ${targetSolver}.`);
    } catch (e: any) {
      showToast('error', 'Cross-Pollination Failed', e.message);
    }
  };

  const selectStyle = { padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' };
  const inputStyle = { ...selectStyle, width: '220px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>

      {/* Controls Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={18} color="#d29922" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Solver ELO Rating & Tournament Grid</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Execute search strategies against a local benchmark</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={benchmarkSuite}
            onChange={(e) => setBenchmarkSuite(e.target.value)}
            placeholder="Benchmark suite id"
            style={inputStyle}
          />
          <input
            type="number"
            min={1}
            max={10}
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            title="Rounds (1-10)"
            style={{ ...selectStyle, width: '70px' }}
          />
          <button
            onClick={handleRunMatch}
            disabled={isRunning || solvers.length === 0}
            className="gh-btn gh-btn-primary"
            style={{ fontSize: '0.75rem', padding: '4px 12px' }}
          >
            <Play size={12} /> {isRunning ? 'Running...' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: '6px', padding: '10px 16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f85149', fontSize: '0.85rem' }}>
            <AlertTriangle size={14} /> {error}
          </span>
          <button onClick={loadLeaderboard} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Leaderboard Table */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 16px' }}>Rank</th>
              <th style={{ padding: '10px 16px' }}>Solver Name</th>
              <th style={{ padding: '10px 16px' }}>Archetype</th>
              <th style={{ padding: '10px 16px' }}>ELO Rating</th>
              <th style={{ padding: '10px 16px' }}>Win Rate</th>
              <th style={{ padding: '10px 16px' }}>Matches</th>
              <th style={{ padding: '10px 16px' }}>Status</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading leaderboard...</td>
              </tr>
            )}
            {!isLoading && !error && solvers.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>No solvers rated yet. Run a benchmark to seed the grid.</td>
              </tr>
            )}
            {!isLoading && solvers.map((s, idx) => (
              <tr key={s.id} style={{ borderBottom: idx < solvers.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                <td style={{ padding: '10px 16px', fontWeight: 600, color: idx === 0 ? '#d29922' : 'var(--text-secondary)' }}>
                  #{idx + 1}
                </td>
                <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                  {s.name}
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{s.archetype}</td>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{s.elo}</td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '60px', height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.winRate}%`, height: '100%', background: s.winRate > 70 ? 'var(--success)' : 'var(--accent-blue)' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.winRate}%</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{s.matches}</td>
                <td style={{ padding: '10px 16px' }}>
                  {(() => {
                    let label = 'Contender';
                    let color = 'var(--text-secondary)';
                    let border = 'var(--panel-border)';
                    if (s.status === 'champion') {
                      label = 'Champion';
                      color = '#d29922';
                      border = '#d29922';
                    } else if (s.status === 'competing') {
                      label = 'Competing';
                      color = 'var(--accent-blue)';
                      border = 'var(--accent-blue)';
                    } else if (idx === 0) {
                      label = 'Leader';
                      color = '#d29922';
                      border = '#d29922';
                    }
                    return (
                      <span style={{
                        border: `1px solid ${border}`,
                        color,
                        background: label !== 'Contender' ? 'rgba(210, 153, 34, 0.08)' : 'transparent',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: label !== 'Contender' ? 600 : 400
                      }}>
                        {label}
                      </span>
                    );
                  })()}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button
                    onClick={() => setSourceSolver(s.name)}
                    disabled={isRunning}
                    className="gh-btn"
                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    title={`Set ${s.name} as cross-pollination source`}
                  >
                    Pollinate from this
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Heuristic Cross-Pollination Card */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shuffle size={14} color="var(--accent-purple)" /> Heuristic Cross-Pollination Blackboard
          </h4>
          <button onClick={handleCrossPollinate} disabled={!sourceSolver || !targetSolver} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--accent-purple)' }}>
            <GitCommit size={12} /> Record Heuristic Note
          </button>
        </div>
        <input
          type="text"
          value={genePayload}
          onChange={(e) => setGenePayload(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Source:
            <select value={sourceSolver} onChange={(e) => setSourceSolver(e.target.value)} style={selectStyle} disabled={solvers.length === 0}>
              {solvers.length === 0 && <option value="">— none —</option>}
              {solvers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Target:
            <select value={targetSolver} onChange={(e) => setTargetSolver(e.target.value)} style={selectStyle} disabled={solvers.length === 0}>
              {solvers.length === 0 && <option value="">— none —</option>}
              {solvers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Check size={12} color="var(--success)" /> Records the submitted heuristic as a genome decision; it is not automatically injected into another solver.
        </div>
      </div>

    </div>
  );
};
