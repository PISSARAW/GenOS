import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface AtomicRollbackPreviewProps {
  workspaces: any[];
  workspaceId: string;
  onWorkspaceChange: (id: string) => void;
  presetStep?: number | null;
}

interface SnapshotOption {
  step: number;
  label: string;
}

const normalizeSnapshots = (payload: any): SnapshotOption[] => {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.snapshots) ? payload.snapshots : [];
  return rows
    .map((row: any, index: number): SnapshotOption | null => {
      const step = Number(row?.stepNumber ?? row?.step ?? row?.number ?? index + 1);
      if (!Number.isFinite(step)) return null;
      return { step, label: String(row?.label ?? row?.reason ?? `Step #${step}`) };
    })
    .filter((row: SnapshotOption | null): row is SnapshotOption => row !== null);
};

export const AtomicRollbackPreview: React.FC<AtomicRollbackPreviewProps> = ({ workspaces, workspaceId, onWorkspaceChange, presetStep }) => {
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [targetStep, setTargetStep] = useState(1);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewedStep, setPreviewedStep] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const refetchSnapshots = async (id: string) => {
    try {
      setSnapshots(normalizeSnapshots(await api.getSnapshots(id)));
    } catch {
      setSnapshots([]);
    }
  };

  useEffect(() => {
    if (!workspaceId) return;
    setPreviewData(null);
    setPreviewedStep(null);
    api.getSnapshots(workspaceId)
      .then((payload: any) => {
        const normalized = normalizeSnapshots(payload);
        setSnapshots(normalized);
        if (normalized.length > 0) {
          setTargetStep(Math.max(...normalized.map((s) => s.step)));
        } else {
          setTargetStep(1);
        }
      })
      .catch(() => {
        setSnapshots([]);
        setTargetStep(1);
      });
  }, [workspaceId]);

  useEffect(() => {
    if (presetStep == null || !Number.isFinite(presetStep)) return;
    setTargetStep(presetStep);
  }, [presetStep]);

  const handlePreview = async () => {
    try {
      const data = await api.previewAtomicRollback(workspaceId, targetStep);
      setPreviewData(data);
      setPreviewedStep(targetStep);
      showToast('info', 'Rollback Preview Computed', 'Analyzed surgical reverse patch impact.');
    } catch (e: any) {
      showToast('error', 'Preview Failed', e.message);
    }
  };

  const handleApply = async () => {
    if (!window.confirm(`Revert workspace to Step #${targetStep}? This creates a safety snapshot first.`)) return;
    setIsApplying(true);
    try {
      await api.applyAtomicRollback(workspaceId, targetStep);
      showToast('warning', 'Atomic Rollback Executed', `Workspace ${workspaceId} successfully reverted to Step #${targetStep}`);
      setPreviewData(null);
      setPreviewedStep(null);
      await refetchSnapshots(workspaceId);
    } catch (e: any) {
      showToast('error', 'Rollback Error', e.message);
    } finally {
      setIsApplying(false);
    }
  };

  const handleManualStepChange = (raw: string) => {
    const parsed = parseInt(raw, 10);
    setTargetStep(Number.isNaN(parsed) ? 0 : Math.max(parsed, 0));
  };

  const previewIsCurrent = previewData !== null && previewedStep === targetStep;

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RotateCcw size={16} color="var(--warning)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Invariant-Preserving Atomic Rollback Engine</span>
        </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Durable filesystem snapshots</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Target Workspace</label>
            <select
              value={workspaceId}
              onChange={(e) => onWorkspaceChange(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            >
              {!workspaces.length && <option value="">No workspaces available</option>}
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div style={{ width: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Snapshot Step #</label>
            {snapshots.length > 0 ? (
              <select
                value={targetStep}
                onChange={(e) => setTargetStep(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              >
                {snapshots.map((s) => <option key={s.step} value={s.step}>{s.label}</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={targetStep}
                onChange={(e) => handleManualStepChange(e.target.value)}
                disabled={!workspaceId}
                min={0}
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              />
            )}
          </div>

          <button onClick={handlePreview} disabled={!workspaceId || isApplying || targetStep < 1} className="gh-btn" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            Preview rollback
          </button>
        </div>

        {previewData && !previewIsCurrent && (
          <div style={{ background: 'var(--bg-main)', border: '1px dashed var(--panel-border)', borderRadius: '6px', padding: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Preview is for Step #{previewedStep} — re-run the preview for the currently selected Step #{targetStep}.
          </div>
        )}

        {previewData && previewIsCurrent && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Target Snapshot: {previewData.targetSnapshot?.label || `Step #${targetStep}`}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Affected Files: {previewData.affectedFiles?.join(', ')}
              </span>
            </div>

            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Generated Reverse Patch:</div>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--warning)', lineHeight: 1.4 }}>
                {previewData.reversePatch}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="gh-btn gh-btn-danger"
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                <RotateCcw size={12} /> {isApplying ? 'Reverting...' : 'Confirm Atomic Rollback'}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
