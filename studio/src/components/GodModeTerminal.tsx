import React, { useRef, useState } from 'react';
import { api } from '../api/client';

const HISTORY_KEY = 'genos.terminalHistory';
const HISTORY_LIMIT = 50;

const HELP_LINES = [
  'GenOS terminal help (client-side):',
  '  help        Show this message.',
  '',
  'All other input is forwarded to the GenOS backend, which defines the',
  'supported verbs. Common examples include:',
  '  status      Report fleet/system status.',
  '  inspect     Inspect agent or system state.',
  '',
  'Unknown commands return an error from the backend.',
];

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export const GodModeTerminal: React.FC = () => {
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState<string[]>([
    '=== GenOS OPERATIONS TERMINAL ===',
    'Type a supported administrative command.',
  ]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const historyIndexRef = useRef<number | null>(null);
  const draftRef = useRef('');

  const navigateHistory = (direction: -1 | 1) => {
    if (history.length === 0) return;
    if (historyIndexRef.current === null) {
      if (direction === 1) return;
      draftRef.current = command;
      historyIndexRef.current = history.length - 1;
    } else {
      const next = historyIndexRef.current + direction;
      if (next >= history.length) return;
      if (next < 0) {
        historyIndexRef.current = null;
        setCommand(draftRef.current);
        return;
      }
      historyIndexRef.current = next;
    }
    setCommand(history[historyIndexRef.current]);
  };

  const execute = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value || running) return;
    setCommand('');
    historyIndexRef.current = null;
    draftRef.current = '';
    setLines((current) => [...current, `$ ${value}`]);
    setHistory((current) => {
      const next = [...current.filter((entry) => entry !== value), value].slice(-HISTORY_LIMIT);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (value.toLowerCase() === 'help') {
      setLines((current) => [...current, ...HELP_LINES, '$']);
      return;
    }
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
          <input
            aria-label="Terminal command"
            value={command}
            onChange={(event) => { setCommand(event.target.value); historyIndexRef.current = null; }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') { event.preventDefault(); navigateHistory(-1); }
              else if (event.key === 'ArrowDown') { event.preventDefault(); navigateHistory(1); }
            }}
            placeholder="status"
            disabled={running}
            autoFocus
            style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: 'inherit', font: 'inherit' }}
          />
        </form>
      </div>
    </div>
  );
};
