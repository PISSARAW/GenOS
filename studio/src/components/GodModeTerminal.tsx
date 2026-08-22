import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { api } from '../api/client';

export const GodModeTerminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#f85149',
      },
      fontFamily: 'monospace',
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    const fit = () => {
      if (!terminalRef.current || !term.element) return;
      if (terminalRef.current.clientWidth === 0 || terminalRef.current.clientHeight === 0) return;
      fitAddon.fit();
    };
    const frame = window.requestAnimationFrame(fit);
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(terminalRef.current);
    xtermRef.current = term;

    term.writeln('\x1b[1;31m=== GenOS OPERATIONS TERMINAL ===\x1b[0m');
    term.writeln('Type a supported administrative command.');
    term.write('\r\n$ ');

    let currentCommand = '';

    term.onData(async (e) => {
      switch (e) {
        case '\r': // Enter
          term.write('\r\n');
          if (currentCommand.trim() !== '') {
            try {
              const data = await api.sendTerminalCommand(currentCommand.trim());
              if (data.output) term.writeln(data.output);
            } catch (err: any) {
              term.writeln(`\x1b[31mError: ${err.message || 'Execution failed'}\x1b[0m`);
            }
          }
          currentCommand = '';
          term.write('\r\n$ ');
          break;
        case '\u007F': // Backspace
          if (term.buffer.active.cursorX > 2) {
            term.write('\b \b');
            currentCommand = currentCommand.slice(0, -1);
          }
          break;
        default:
          if ((e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E)) || e >= '\u00a0') {
            currentCommand += e;
            term.write(e);
          }
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', padding: '24px', background: 'var(--bg-main)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: '#f85149' }}>Authenticated Operations Terminal</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Authenticated administrative commands executed by the GenOS backend.
      </p>
      <div 
        ref={terminalRef} 
        style={{ width: '100%', height: '600px', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '8px', background: '#0d1117' }} 
      />
    </div>
  );
};
