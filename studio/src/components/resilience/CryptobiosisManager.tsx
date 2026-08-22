import React from 'react';
import { Snowflake } from 'lucide-react';

export const CryptobiosisManager: React.FC = () => (
  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Snowflake size={16} color="var(--text-muted)" />
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Durable Swarm Hibernation</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Requires durable runtime and context snapshot storage.</span>
        </div>
      </div>
      <button disabled title="Cryptobiosis snapshots are not durable in this deployment." className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
        Unavailable
      </button>
    </div>
    <div style={{ padding: '24px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
      This deployment does not persist the full runtime state required for a safe freeze and resume. Hibernation controls are disabled rather than reporting a lossless snapshot that cannot be restored after a restart.
    </div>
  </div>
);
