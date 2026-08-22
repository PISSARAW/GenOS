import React, { useEffect, useState } from 'react';
import { Lock, Key, X } from 'lucide-react';
import { api, ensureTenantScope, getAuthToken, setAuthToken } from '../api/client';
import { useToastStore } from '../store/useToastStore';

interface RBACGateProps {
  children: React.ReactNode;
}

export const RBAC_Gate: React.FC<RBACGateProps> = ({ children }) => {
  const [locked, setLocked] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [key, setKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  // A refreshed Studio must reuse a previously validated local access key.
  // Without this, every reload incorrectly presents the login gate again.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    api.verifyToken(token)
      .then(async (result) => {
        if (result?.valid) {
          await ensureTenantScope();
          setLocked(false);
        }
      })
      .catch(() => {});
  }, []);

  const handleUnlock = async () => {
    setErrorMsg(null);
    try {
      const res = await api.verifyToken(key);
      if (res && (res.valid || res.success || res.role === 'admin' || res.username)) {
        setAuthToken(key);
        await ensureTenantScope();
        setLocked(false);
        setShowModal(false);
        showToast('success', 'Access Granted', `Unlocked with role: ${res.role || 'admin'} and an active project scope.`);
      } else {
        setErrorMsg('Invalid cryptographic token or insufficient privileges.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Verification failed. Connection rejected.');
    }
  };

  return (
    <>
      <div onClick={(e) => {
        if (locked) {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }
      }}>
        {children}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '24px', width: '420px', boxShadow: '0 16px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
                <Lock size={18} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Military RBAC Gate</h3>
              </div>
              <X size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => setShowModal(false)} />
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
              This action requires administrator authentication. <br/>
              Please enter your cryptographic key to unlock high-risk controls.
            </p>

            {errorMsg && (
              <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid var(--danger)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '16px' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input 
                  type="password" 
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder="Enter access token..." 
                  style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
                <Key size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              </div>
              <button onClick={handleUnlock} className="gh-btn gh-btn-primary" style={{ padding: '8px 16px', fontWeight: 600 }}>
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
