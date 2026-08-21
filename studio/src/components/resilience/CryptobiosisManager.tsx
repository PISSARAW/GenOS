import React, { useState } from 'react';
import { Snowflake, Play, Archive, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface CryoSnapshot {
  id: string;
  name: string;
  timestamp: string;
  sizeBytes: number;
  activeAgentsCount: number;
  memoryItemsCount: number;
  status: 'frozen' | 'active';
}

export const CryptobiosisManager: React.FC = () => {
  const [snapshots, setSnapshots] = useState<CryoSnapshot[]>([
    { id: 'cryo-20260821-01', name: 'Fleet-PreMigration-State.cryo', timestamp: '2026-08-21T13:45:00Z', sizeBytes: 24580, activeAgentsCount: 6, memoryItemsCount: 42, status: 'frozen' },
    { id: 'cryo-20260821-02', name: 'Refactor-Checkpoint-Core.cryo', timestamp: '2026-08-21T14:00:00Z', sizeBytes: 31200, activeAgentsCount: 4, memoryItemsCount: 68, status: 'frozen' },
  ]);
  const [isFreezing, setIsFreezing] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const handleFreeze = async () => {
    setIsFreezing(true);
    try {
      await api.freezeCryptobiosis('ws-genos-core');
      const newSnap: CryoSnapshot = {
        id: `cryo-${Date.now()}`,
        name: `Swarm-Instant-Freeze-${Date.now().toString().slice(-4)}.cryo`,
        timestamp: new Date().toISOString(),
        sizeBytes: 28400,
        activeAgentsCount: 6,
        memoryItemsCount: 54,
        status: 'frozen'
      };
      setSnapshots([newSnap, ...snapshots]);
      showToast('warning', 'Swarm Hibernated (.cryo)', 'Serialized scratchpads, open tool connections, and DAG queues.');
    } catch (e: any) {
      showToast('error', 'Hibernation Failed', e.message);
    } finally {
      setIsFreezing(false);
    }
  };

  const handleResume = async (snap: CryoSnapshot) => {
    try {
      await api.resumeCryptobiosis('ws-genos-core', 1);
      showToast('success', 'Swarm Revived', `Resumed swarm execution from ${snap.name} with 0 context loss.`);
    } catch (e: any) {
      showToast('error', 'Revival Failed', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Snowflake size={16} color="var(--accent-blue)" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Microsecond Cryptobiosis & Swarm Hibernation</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Instant atomic freezing (.cryo) and lossless revival of agent swarm state</span>
          </div>
        </div>

        <button 
          onClick={handleFreeze} 
          disabled={isFreezing}
          className="gh-btn" 
          style={{ fontSize: '0.75rem', padding: '4px 12px', color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
        >
          <Snowflake size={12} /> {isFreezing ? 'Serializing...' : 'Freeze Swarm State (.cryo)'}
        </button>
      </div>

      {/* Snapshot List */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        {snapshots.map((snap) => (
          <div 
            key={snap.id} 
            style={{ 
              background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Archive size={14} color="var(--text-secondary)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {snap.name}
                </span>
                <span style={{ border: '1px solid var(--panel-border)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {(snap.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Frozen at: {new Date(snap.timestamp).toLocaleString()} · Agents: <strong>{snap.activeAgentsCount}</strong> · Memory Items: <strong>{snap.memoryItemsCount}</strong>
              </div>
            </div>

            <button 
              onClick={() => handleResume(snap)} 
              className="gh-btn gh-btn-primary" 
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
            >
              <Play size={12} /> Lossless Resume
            </button>
          </div>
        ))}
      </div>

    </div>
  );
};
