import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './IntegratedTerminal.css';

interface IntegratedTerminalProps {
  id?: string;
  className?: string;
}

export function IntegratedTerminal({ id, className = '' }: IntegratedTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    term.current = new Terminal({
      theme: {
        background: 'transparent',
        foreground: '#e2e8f0', // Very light grey/white
        cursor: '#007aff', // Apple blue cursor
        selectionBackground: 'rgba(0, 122, 255, 0.3)',
        black: '#000000',
        red: '#ff3b30',
        green: '#34c759',
        yellow: '#ffcc00',
        blue: '#007aff',
        magenta: '#ff2d55',
        cyan: '#32ade6',
        white: '#ffffff',
        brightBlack: '#8e8e93',
      },
      fontFamily: '"Geist Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.current.loadAddon(fitAddon);
    term.current.open(terminalRef.current);
    fitAddon.fit();

    ws.current = new WebSocket('ws://localhost:3002/pty');
    
    ws.current.onopen = () => {
      term.current?.writeln('\x1b[32m[GenOS] Connected to PTY endpoint.\x1b[0m');
    };

    ws.current.onmessage = (event) => {
      term.current?.write(event.data);
    };

    ws.current.onclose = () => {
      term.current?.writeln('\x1b[31m[GenOS] PTY connection closed.\x1b[0m');
    };

    term.current.onData((data) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.current?.close();
      term.current?.dispose();
    };
  }, []);

  return (
    <div className={`integrated-terminal-wrapper ${className}`} id={id}>
      <div className="terminal-header">
        <div className="mac-dots">
          <span className="dot red"></span>
          <span className="dot yellow"></span>
          <span className="dot green"></span>
        </div>
        <div className="terminal-title">GenOS Shell</div>
      </div>
      <div ref={terminalRef} className="integrated-terminal-container" />
    </div>
  );
}
