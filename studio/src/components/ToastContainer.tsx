import React from 'react';
import { useToastStore } from '../store/useToastStore';
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '380px',
      pointerEvents: 'none'
    }}>
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        const borderColor = isSuccess ? '#238636' : isError ? '#da3633' : isWarning ? '#d29922' : '#30363d';
        const iconColor = isSuccess ? '#3fb950' : isError ? '#f85149' : isWarning ? '#d29922' : '#58a6ff';

        return (
          <div
            key={toast.id}
            style={{
              background: '#161b22',
              border: `1px solid ${borderColor}`,
              borderRadius: '6px',
              padding: '12px 16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              color: '#c9d1d9',
              fontSize: '0.85rem',
              pointerEvents: 'auto',
              animation: 'slideDown 0.15s ease-out'
            }}
          >
            <div style={{ paddingTop: '2px' }}>
              {isSuccess && <CheckCircle2 size={16} color={iconColor} />}
              {isError && <AlertOctagon size={16} color={iconColor} />}
              {isWarning && <AlertTriangle size={16} color={iconColor} />}
              {!isSuccess && !isError && !isWarning && <Info size={16} color={iconColor} />}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#c9d1d9', marginBottom: toast.message ? '2px' : 0 }}>
                {toast.title}
              </div>
              {toast.message && (
                <div style={{ color: '#8b949e', fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {toast.message}
                </div>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: '#8b949e'
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
