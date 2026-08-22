import React, { useState } from 'react';
import { api } from '../api/client';

export const GodModeTerminal: React.FC = () => {
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState<string[]>([
    '=== GenOS OPERATIONS TERMINAL ===',
    'Type a supported administrative command.',
  ]);
  const [running, setRunning] = useState(false);

  const execute = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value || running) return;
    setCommand('');
    setLines((current) => [...current, `$ ${value}`]);
    setRunning(true);
    try {
      const data = await api.sendTerminalCommand(value);
      setLines((current) => [...current, data.output || '(command completed without output)', '$']);
    } catch (error: any) {
      setLines((current) => [...current, `Error: ${error?.message || 'Execution failed'}`, '$']);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '24px', background: 'var(--bg-main)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: '#f85149' }}>Authenticated Operations Terminal</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Authenticated administrative commands executed by the GenOS backend.
      </p>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', background: '#0d1117', color: '#c9d1d9', fontFamily: 'monospace', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, flex: 1 }}>{lines.join('\n')}</pre>
        <form onSubmit={execute} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <span>$</span>
          <input aria-label="Terminal command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="status" disabled={running} autoFocus style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: 'inherit', font: 'inherit' }} />
        </form>
      </div>
    </div>
  );
};
