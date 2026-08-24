import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('View crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '12px', width: '100%', height: '100%', padding: '24px',
        background: 'var(--bg-panel)', border: '1px solid var(--danger)', borderRadius: '8px'
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--danger)' }}>
          This view crashed
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '480px', textAlign: 'center' }}>
          {this.state.error.message || String(this.state.error)}
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
            fontWeight: 600, background: 'transparent', border: '1px solid var(--danger)',
            color: 'var(--danger)'
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
