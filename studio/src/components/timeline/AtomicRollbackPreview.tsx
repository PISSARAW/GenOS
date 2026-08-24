import React, { useEffect, useState } from 'react';
import { RotateCcw, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

export const AtomicRollbackPreview: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState('');
  const [targetStep, setTargetStep] = useState(1);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isApplying, setIsApplying] = useState(false);
  const showToast = useToastStore((state) => state.showToast);
  useEffect(() => { api.listWorkspaces().then((items: any[]) => items?.[0] && setWorkspaceId(items[0].id)).catch((e: any) => console.warn('[Studio] workspace preload failed:', e)); }, []);

  const handlePreview = async () => {
    try {
      const data = await api.previewAtomicRollback(workspaceId, targetStep);
      setPreviewData(data);
      showToast('info', 'Rollback Preview Computed', 'Analyzed surgical reverse patch impact.');
    } catch (e: any) {
      showToast('error', 'Preview Failed', e.message);
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await api.applyAtomicRollback(workspaceId, targetStep);
      showToast('warning', 'Atomic Rollback Executed', `Workspace ${workspaceId} successfully reverted to Step #${targetStep}`);
    } catch (e: any) {
      showToast('error', 'Rollback Error', e.message);
    } finally {
      setIsApplying(false);
    }
  };

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
            <input 
              type="text" 
              value={workspaceId} 
              onChange={(e) => setWorkspaceId(e.target.value)} 
              disabled={!workspaceId}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>

          <div style={{ width: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Snapshot Step #</label>
            <input 
              type="number" 
              value={targetStep} 
              onChange={(e) => setTargetStep(parseInt(e.target.value))} 
              disabled={!workspaceId}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>

          <button onClick={handlePreview} disabled={!workspaceId || isApplying} className="gh-btn" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            Preview rollback
          </button>
        </div>

        {previewData && (
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
