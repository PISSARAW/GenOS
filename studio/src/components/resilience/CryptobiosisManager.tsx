import React, { useEffect, useState } from 'react';
import { Snowflake, Play, RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface WorkspaceOption {
  id: string;
  name: string;
}

interface FreezeRecord {
  snapshotId: string;
  workspaceId: string;
  note: string;
}

const extractSnapshotId = (payload: any): string | null => {
  if (!payload) return null;
  return payload.snapshotId ?? payload.snapshot_id ?? payload.snapshot?.id ?? payload.id ?? null;
};

export const CryptobiosisManager: React.FC = () => {
  const showToast = useToastStore((state) => state.showToast);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [note, setNote] = useState('');
  const [lastFreeze, setLastFreeze] = useState<FreezeRecord | null>(null);
  const [resumeSnapshotId, setResumeSnapshotId] = useState('');
  const [isFreezing, setIsFreezing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api.listWorkspaces().then((data: any) => {
      const options: WorkspaceOption[] = (Array.isArray(data) ? data : data?.workspaces || []).map((ws: any) => ({
        id: ws.id,
        name: ws.name || ws.id
      }));
      setWorkspaces(options);
      if (!workspaceId && options.length > 0) setWorkspaceId(options[0].id);
    }).catch((e: any) => setWorkspacesError(e?.message || 'Failed to load workspaces.'));
  }, []);

  const handleFreeze = async () => {
    setIsFreezing(true);
    setActionError(null);
    try {
      const result: any = await api.freezeCryptobiosis(workspaceId || undefined);
      const snapshotId = extractSnapshotId(result);
      if (!snapshotId) throw new Error('Backend did not return a snapshot id.');
      const record: FreezeRecord = { snapshotId, workspaceId: workspaceId || 'fleet', note };
      setLastFreeze(record);
      setResumeSnapshotId(snapshotId);
      showToast('success', 'Swarm Frozen', `Snapshot ${snapshotId} captured${note ? ` (${note})` : ''}.`);
    } catch (e: any) {
      const message = e?.message || 'Freeze request failed.';
      setActionError(message);
      showToast('error', 'Cryptobiosis Freeze Failed', message);
    } finally {
      setIsFreezing(false);
    }
  };

  const handleResume = async () => {
    if (!resumeSnapshotId.trim()) {
      setActionError('A snapshot id is required to resume.');
      return;
    }
    setIsResuming(true);
    setActionError(null);
    try {
      await api.resumeCryptobiosis(resumeSnapshotId.trim(), workspaceId || undefined);
      showToast('success', 'Swarm Resumed', `Snapshot ${resumeSnapshotId.trim()} thawed into ${workspaceId || 'fleet'}.`);
    } catch (e: any) {
      const message = e?.message || 'Resume request failed.';
      setActionError(message);
      showToast('error', 'Cryptobiosis Resume Failed', message);
    } finally {
      setIsResuming(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px',
    padding: '6px 10px', fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Snowflake size={16} color="var(--accent-blue)" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Durable Swarm Hibernation</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Freeze swarm runtime state to a snapshot and resume it later.</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        {workspacesError && (
          <div style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.8rem', color: 'var(--danger)' }}>
            Workspace list unavailable: {workspacesError}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Target Workspace</label>
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            disabled={isFreezing || isResuming}
            style={{ ...inputStyle, width: '100%' }}
          >
            {!workspacesError && <option value="">fleet (all)</option>}
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Snapshot Note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is the swarm being frozen? (kept locally)"
            disabled={isFreezing || isResuming}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <button
          onClick={handleFreeze}
          disabled={isFreezing || isResuming}
          className="gh-btn gh-btn-primary"
          style={{ justifyContent: 'center' }}
        >
          <Snowflake size={14} /> {isFreezing ? 'Freezing...' : 'Freeze Swarm'}
        </button>

        {lastFreeze && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', fontSize: '0.78rem' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Last freeze result</div>
            <div style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>Snapshot ID: {lastFreeze.snapshotId}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Workspace: {lastFreeze.workspaceId}</div>
            {lastFreeze.note && <div style={{ color: 'var(--text-secondary)' }}>Note: {lastFreeze.note}</div>}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Resume From Snapshot</label>
          <input
            type="text"
            value={resumeSnapshotId}
            onChange={(e) => setResumeSnapshotId(e.target.value)}
            placeholder="Paste a snapshot id…"
            disabled={isFreezing || isResuming}
            style={inputStyle}
          />
          <button
            onClick={handleResume}
            disabled={isFreezing || isResuming || !resumeSnapshotId.trim()}
            className="gh-btn"
            style={{ justifyContent: 'center' }}
          >
            {isResuming ? <RotateCcw size={14} /> : <Play size={14} />} {isResuming ? 'Resuming...' : 'Resume Swarm'}
          </button>
        </div>

        {actionError && (
          <div style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.8rem', color: 'var(--danger)' }}>
            {actionError}
          </div>
        )}
      </div>
    </div>
  );
};
