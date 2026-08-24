import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, RefreshCw, Plus, ScanSearch, FlaskConical, Play, GitCompare } from 'lucide-react';
import { rustCoreApi, type RustCoreStatus, type RustBridgeResponse } from '../api/rustCore';

const panel: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: 16 };
const btn: React.CSSProperties = { padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem' };

export const RustCoreConsole: React.FC = () => {
  const [status, setStatus] = useState<RustCoreStatus | null>(null);
  const [snapshots, setSnapshots] = useState<Array<{ reference: string; file: string; sizeBytes: number }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('studio-agent');
  const [agentRole, setAgentRole] = useState('worker');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<RustBridgeResponse | null>(null);
  const [diffA, setDiffA] = useState('');
  const [diffB, setDiffB] = useState('');

  const load = useCallback(async () => {
    try {
      const statusData = await rustCoreApi.getStatus();
      setStatus(statusData);
      if (statusData.available) {
        const list = await rustCoreApi.listSnapshots();
        setSnapshots(list.snapshots || []);
      }
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Rust bridge unreachable.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: () => Promise<RustBridgeResponse>, title: string) => {
    setBusy(true);
    try {
      const result = await action();
      setLastResult(result);
    } catch (e: any) {
      setLastResult({ operation: title, exitCode: -1, result: null, stderr: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setBusy(true);
    try {
      await rustCoreApi.createSnapshot(agentName, agentRole);
      await load();
    } catch (e: any) {
      setLastResult({ operation: 'snapshot_create', exitCode: -1, result: null, stderr: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: 32, background: 'var(--bg-main)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Cpu size={22} color="var(--accent-purple)" /> Rust Core Console
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: '8px 0 20px', fontSize: '0.9rem' }}>
          Direct operations on the real genos-cli: snapshots, hallucination analysis, replay and diffing.
          Bridge state lives under a dedicated root and never mixes with the Studio SQLite store.
        </p>

        {loadError && (
          <div style={{ ...panel, borderColor: 'var(--danger)', marginBottom: 16, color: 'var(--danger)', fontSize: '0.85rem' }}>
            {loadError}
          </div>
        )}

        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>CLI status</strong>
            <button className="gh-btn" onClick={() => void load()} style={btn}><RefreshCw size={13} /> Refresh</button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: status?.available ? 'var(--success)' : 'var(--danger)' }}>
            {status
              ? status.available
                ? `Available · ${status.version || 'version unknown'}`
                : `Binary not found — ${status.hint}`
              : 'Checking…'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Root: {status?.root || '—'}</p>
        </div>

        <div style={{ ...panel, marginTop: 16 }}>
          <strong>Create snapshot</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="agent name" style={inputStyle} />
            <input value={agentRole} onChange={(e) => setAgentRole(e.target.value)} placeholder="role" style={inputStyle} />
            <button className="gh-btn gh-btn-primary" disabled={busy || !status?.available} onClick={handleCreateSnapshot} style={btn}>
              <Plus size={14} /> Create genome + snapshot
            </button>
          </div>
        </div>

        <div style={{ ...panel, marginTop: 16 }}>
          <strong>Snapshots in bridge root ({snapshots.length})</strong>
          {snapshots.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No snapshots yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {snapshots.map((snapshot) => (
              <div key={snapshot.reference} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '0.78rem' }}>{snapshot.file}</code>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="gh-btn" disabled={busy} onClick={() => runAction(() => rustCoreApi.hallucination('detect', snapshot.reference), 'detect')} style={btn}><ScanSearch size={13} /> Detect</button>
                  <button className="gh-btn" disabled={busy} onClick={() => runAction(() => rustCoreApi.hallucination('analyze', snapshot.reference), 'analyze')} style={btn}><FlaskConical size={13} /> Analyze</button>
                  <button className="gh-btn" disabled={busy} onClick={() => runAction(() => rustCoreApi.simulate(snapshot.reference, 'studio-simulation'), 'simulate')} style={btn}><Play size={13} /> Simulate</button>
                  <button className="gh-btn" disabled={busy} onClick={() => runAction(() => rustCoreApi.replay(snapshot.reference), 'replay')} style={btn}><Play size={13} /> Replay</button>
                  <button className="gh-btn" disabled={busy}
                    onClick={() => {
                      if (!diffA) setDiffA(snapshot.reference);
                      else setDiffB(diffB || snapshot.reference);
                      runAction(() => Promise.resolve({ operation: 'diff-pending', exitCode: 0, result: `staged ${snapshot.reference}` }), 'stage');
                    }}
                    style={btn}>
                    <GitCompare size={13} /> Stage diff
                  </button>
                </div>
              </div>
            ))}
          </div>
          {diffA && diffB && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>diff staged: A={diffA} B={diffB}</span>
              <button className="gh-btn gh-btn-primary" disabled={busy}
                onClick={() => runAction(() => rustCoreApi.diff(diffA, diffB), 'diff')}
                style={btn}>
                Run diff
              </button>
            </div>
          )}
        </div>

        {lastResult && (
          <div style={{ ...panel, marginTop: 16 }}>
            <strong>Last operation</strong>
            <pre style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: 12, overflowX: 'auto', fontSize: '0.75rem', maxHeight: 360, overflowY: 'auto' }}>
              {JSON.stringify(lastResult, null, 2)}
            </pre>
            {lastResult.specValidation && (
              <p style={{ fontSize: '0.78rem', margin: '8px 0 0', color: lastResult.specValidation.valid ? 'var(--success)' : 'var(--danger)' }}>
                spec/{lastResult.specValidation.schema}: {lastResult.specValidation.valid ? 'valid against the official contract' : `INVALID — ${lastResult.specValidation.errors.join('; ')}`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
